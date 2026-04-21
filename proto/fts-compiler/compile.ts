/**
 * .fts / .type.fts → .ts 预处理器 v4
 *
 * 核心语义——文件名是唯一的名字来源（SSOT）：
 *   .type.fts  →  type  {filename} = {content}
 *   .fts       →  const {filename} = {content}
 *
 * import 提取：各文件中的 import 行被提取、去重后合并到产物顶部。
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename, dirname, relative } from "node:path";

type FileKind = "fn" | "type" | "index";

type FtsFile = {
  name: string;
  camel: string;
  pascal: string;
  capLine: string;
  imports: string[];
  body: string;
  kind: FileKind;
  isPrivate: boolean;
};

function kebabToCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function kebabToPascal(s: string): string {
  const c = kebabToCamel(s);
  return c[0].toUpperCase() + c.slice(1);
}

function isImportLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith("import ") || t.startsWith("import{");
}

function splitImports(content: string): { imports: string[]; body: string } {
  const lines = content.split("\n");
  const imports: string[] = [];
  const bodyLines: string[] = [];
  for (const line of lines) {
    if (isImportLine(line)) imports.push(line);
    else bodyLines.push(line);
  }
  return { imports, body: bodyLines.join("\n").trim() };
}

function parseFile(name: string, content: string, ext: string): FtsFile {
  const stem = name.replace(/\.type\.fts$/, "").replace(/\.fts$/, "");
  const clean = stem.replace(/^_/, "");
  const trimmed = content.trimEnd();

  if (stem === "index") {
    const { imports, body } = splitImports(trimmed);
    return { name: stem, camel: "", pascal: "", capLine: "", imports, body, kind: "index", isPrivate: false };
  }

  const { imports, body } = splitImports(trimmed);

  if (ext === ".type.fts") {
    return { name: stem, camel: kebabToCamel(clean), pascal: kebabToPascal(clean), capLine: "", imports, body, kind: "type", isPrivate: stem.startsWith("_") };
  }

  const lines = body.split("\n");
  const first = lines[0]?.trim() ?? "";
  if (first.startsWith("/**") && first.includes("@capability")) {
    return { name: stem, camel: kebabToCamel(clean), pascal: "", capLine: first, imports, body: lines.slice(1).join("\n").trim(), kind: "fn", isPrivate: stem.startsWith("_") };
  }
  return { name: stem, camel: kebabToCamel(clean), pascal: "", capLine: "", imports, body, kind: "fn", isPrivate: stem.startsWith("_") };
}

function emit(f: FtsFile): string {
  const exp = f.isPrivate ? "" : "export ";
  const cap = f.capLine ? f.capLine + "\n" : "";
  if (f.kind === "type") return `${exp}type ${f.pascal} = ${f.body}`;
  return `${cap}${exp}const ${f.camel} = ${f.body}`;
}

async function compileDir(dir: string, outFile?: string): Promise<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: FtsFile[] = [];

  for (const e of entries) {
    if (!e.isFile()) continue;
    const ext = e.name.endsWith(".type.fts") ? ".type.fts" : e.name.endsWith(".fts") ? ".fts" : null;
    if (!ext) continue;
    const content = await readFile(join(dir, e.name), "utf8");
    files.push(parseFile(e.name, content, ext));
  }

  if (files.length === 0) throw new Error(`No .fts/.type.fts files in ${dir}`);

  const importSet = new Set<string>();
  for (const f of files) for (const imp of f.imports) importSet.add(imp);

  const idx = files.find(f => f.kind === "index");
  const rest = files.filter(f => f.kind !== "index").sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "type" ? -1 : 1;
    if (a.isPrivate !== b.isPrivate) return a.isPrivate ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const parts: string[] = [];
  parts.push(`// AUTO-GENERATED from ${basename(dir)}/`);
  parts.push(`// Do not edit — modify the .fts/.type.fts sources instead.\n`);

  if (importSet.size > 0) { parts.push([...importSet].join("\n")); parts.push(""); }
  if (idx && idx.body) { parts.push(idx.body); parts.push(""); }

  for (const f of rest) {
    parts.push(`// ── ${f.name} ──\n`);
    parts.push(emit(f));
    parts.push("");
  }

  const output = parts.join("\n");
  const target = outFile ?? join(dir, "index.ts");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, output, "utf8");

  const types = rest.filter(f => f.kind === "type").length;
  const fns = rest.filter(f => f.kind === "fn").length;
  console.log(`✓ ${relative(process.cwd(), target)} (${types} types + ${fns} functions)`);
  return target;
}

const dir = process.argv[2];
const out = process.argv[3];
if (!dir) { console.log("Usage: bun compile.ts <fts-dir> [output.ts]"); process.exit(1); }
await compileDir(dir, out);
