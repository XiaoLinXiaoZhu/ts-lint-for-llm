/**
 * .fts / .tts → .ts 预处理器 v3
 *
 * 核心语义——文件名是唯一的名字来源（SSOT）：
 *   .fts  →  const {filename} = {content}      （函数）
 *   .tts  →  type  {filename} = {content}      （类型）
 *
 * 约定：
 *   - 首行 // 注释 = 能力声明（仅 .fts）
 *   - index.fts = 外部 import 声明
 *   - _ 前缀 = 私有（不 export）
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename, dirname, relative } from "node:path";

type FileKind = "fn" | "type" | "index";

type FtsFile = {
  name: string;
  camel: string;
  pascal: string;
  capability: string;
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

function parseFile(name: string, content: string, ext: string): FtsFile {
  const stem = name.replace(/\.\w+$/, "");
  const clean = stem.replace(/^_/, "");
  const trimmed = content.trimEnd();

  if (stem === "index") {
    return { name: stem, camel: "", pascal: "", capability: "", body: trimmed, kind: "index", isPrivate: false };
  }

  if (ext === ".tts") {
    return { name: stem, camel: kebabToCamel(clean), pascal: kebabToPascal(clean), capability: "", body: trimmed, kind: "type", isPrivate: stem.startsWith("_") };
  }

  // .fts — 首行注释 = 能力
  const lines = trimmed.split("\n");
  const first = lines[0]?.trim() ?? "";
  if (first.startsWith("//")) {
    const cap = first.slice(2).trim();
    return { name: stem, camel: kebabToCamel(clean), pascal: "", capability: cap === "pure" ? "" : cap, body: lines.slice(1).join("\n").trim(), kind: "fn", isPrivate: stem.startsWith("_") };
  }
  return { name: stem, camel: kebabToCamel(clean), pascal: "", capability: "", body: trimmed, kind: "fn", isPrivate: stem.startsWith("_") };
}

function emit(f: FtsFile): string {
  const exp = f.isPrivate ? "" : "export ";
  const cap = f.capability ? `/** @capability ${f.capability} */\n` : "";

  if (f.kind === "type") return `${exp}type ${f.pascal} = ${f.body}`;
  return `${cap}${exp}const ${f.camel} = ${f.body}`;
}

async function compileDir(dir: string, outFile?: string): Promise<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: FtsFile[] = [];

  for (const e of entries) {
    if (!e.isFile()) continue;
    const ext = e.name.endsWith(".fts") ? ".fts" : e.name.endsWith(".tts") ? ".tts" : null;
    if (!ext) continue;
    const content = await readFile(join(dir, e.name), "utf8");
    files.push(parseFile(e.name, content, ext));
  }

  if (files.length === 0) throw new Error(`No .fts/.tts files in ${dir}`);

  const idx = files.find(f => f.kind === "index");
  const rest = files.filter(f => f.kind !== "index").sort((a, b) => {
    // 类型先，私有先，字母序
    if (a.kind !== b.kind) return a.kind === "type" ? -1 : 1;
    if (a.isPrivate !== b.isPrivate) return a.isPrivate ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const parts: string[] = [];
  parts.push(`// AUTO-GENERATED from ${basename(dir)}/`);
  parts.push(`// Do not edit — modify the .fts/.tts sources instead.\n`);

  if (idx) { parts.push(idx.body); parts.push(""); }

  for (const f of rest) {
    parts.push(`// ── ${f.name} ──\n`);
    parts.push(emit(f));
    parts.push("");
  }

  const output = parts.join("\n");
  const target = outFile ?? join(dirname(dir), basename(dir) + ".gen.ts");
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
