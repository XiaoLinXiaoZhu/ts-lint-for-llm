#!/usr/bin/env node
/**
 * fts-compile CLI
 *
 * 将 .fts / .type.fts 目录编译为标准 TypeScript 模块（index.ts）。
 * 支持 --all 自动发现、--watch 文件监听。
 *
 * import 提取：各文件中的 import 行被提取、去重后合并到产物顶部。
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { watch } from "node:fs";
import { join, basename, relative, resolve } from "node:path";

// ── Types ──

type FileKind = "fn" | "type" | "index";

type FtsFile = {
  stem: string;
  camel: string;
  pascal: string;
  capLine: string;
  imports: string[];
  body: string;
  kind: FileKind;
  isPrivate: boolean;
};

// ── Name conversion ──

function kebabToCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function kebabToPascal(s: string): string {
  const c = kebabToCamel(s);
  return c[0].toUpperCase() + c.slice(1);
}

// ── Import extraction ──

function splitImports(content: string): { imports: string[]; body: string } {
  const lines = content.split("\n");
  const imports: string[] = [];
  const bodyLines: string[] = [];
  let inImport = false;
  let currentImport: string[] = [];

  for (const line of lines) {
    const t = line.trimStart();
    if (inImport) {
      currentImport.push(line);
      if (/\bfrom\s+["']/.test(line)) {
        imports.push(currentImport.join("\n"));
        currentImport = [];
        inImport = false;
      }
    } else if (t.startsWith("import ") || t.startsWith("import{")) {
      if (/\bfrom\s+["']/.test(line)) {
        imports.push(line);
      } else {
        inImport = true;
        currentImport = [line];
      }
    } else {
      bodyLines.push(line);
    }
  }

  if (currentImport.length > 0) bodyLines.unshift(...currentImport);
  return { imports, body: bodyLines.join("\n").trim() };
}

// ── Parse a single .fts / .type.fts file ──

function parseFile(fileName: string, content: string, ext: ".fts" | ".type.fts"): FtsFile {
  const stem = fileName.replace(/\.type\.fts$/, "").replace(/\.fts$/, "");
  const clean = stem.replace(/^_/, "");
  const trimmed = content.trimEnd();

  if (stem === "index") {
    const { imports, body } = splitImports(trimmed);
    return { stem, camel: "", pascal: "", capLine: "", imports, body, kind: "index", isPrivate: false };
  }

  const { imports, body } = splitImports(trimmed);

  if (ext === ".type.fts") {
    return { stem, camel: kebabToCamel(clean), pascal: kebabToPascal(clean), capLine: "", imports, body, kind: "type", isPrivate: stem.startsWith("_") };
  }

  // .fts — 首行 JSDoc = 能力声明
  const lines = body.split("\n");
  const first = lines[0]?.trim() ?? "";
  if (first.startsWith("/**") && first.includes("@capability")) {
    return { stem, camel: kebabToCamel(clean), pascal: "", capLine: first, imports, body: lines.slice(1).join("\n").trim(), kind: "fn", isPrivate: stem.startsWith("_") };
  }
  return { stem, camel: kebabToCamel(clean), pascal: "", capLine: "", imports, body, kind: "fn", isPrivate: stem.startsWith("_") };
}

// ── Emit a single declaration ──

function emit(f: FtsFile): string {
  const exp = f.isPrivate ? "" : "export ";
  const cap = f.capLine ? f.capLine + "\n" : "";
  if (f.kind === "type") return `${exp}type ${f.pascal} = ${f.body}`;
  return `${cap}${exp}const ${f.camel} = ${f.body}`;
}

// ── Compile one directory → index.ts ──

async function compileDir(dir: string): Promise<{ target: string; types: number; fns: number } | null> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: FtsFile[] = [];

  for (const e of entries) {
    if (!e.isFile()) continue;
    const ext: ".fts" | ".type.fts" | null =
      e.name.endsWith(".type.fts") ? ".type.fts" :
      e.name.endsWith(".fts") ? ".fts" : null;
    if (!ext) continue;
    const content = await readFile(join(dir, e.name), "utf8");
    files.push(parseFile(e.name, content, ext));
  }

  if (files.length === 0) return null;

  // Collect and deduplicate imports from all files
  const importSet = new Set<string>();
  for (const f of files) {
    for (const imp of f.imports) importSet.add(imp);
  }

  const idx = files.find(f => f.kind === "index");
  const rest = files.filter(f => f.kind !== "index").sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "type" ? -1 : 1;
    if (a.isPrivate !== b.isPrivate) return a.isPrivate ? -1 : 1;
    return a.stem.localeCompare(b.stem);
  });

  const parts: string[] = [];
  parts.push(`// AUTO-GENERATED from ${basename(dir)}/`);
  parts.push(`// Do not edit — modify the .fts/.type.fts sources instead.\n`);

  if (importSet.size > 0) {
    parts.push([...importSet].join("\n"));
    parts.push("");
  }

  // index.fts non-import content (constants, type aliases, re-exports)
  if (idx && idx.body) {
    parts.push(idx.body);
    parts.push("");
  }

  for (const f of rest) {
    parts.push(`// ── ${f.stem} ──\n`);
    parts.push(emit(f));
    parts.push("");
  }

  const target = join(dir, "index.ts");
  await mkdir(dir, { recursive: true });
  await writeFile(target, parts.join("\n"), "utf8");

  const types = rest.filter(f => f.kind === "type").length;
  const fns = rest.filter(f => f.kind === "fn").length;
  return { target, types, fns };
}

// ── Discover all fts directories under a root ──

async function discoverFtsDirs(root: string): Promise<string[]> {
  const result: string[] = [];
  const SKIP = new Set(["node_modules", "dist", ".git", ".temp"]);

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    let hasFts = false;
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP.has(e.name) && !e.name.startsWith(".")) {
          await walk(join(dir, e.name));
        }
      } else if (e.isFile() && e.name !== "index.ts") {
        if (e.name.endsWith(".fts")) hasFts = true;
      }
    }
    if (hasFts) result.push(dir);
  }

  await walk(root);
  return result;
}

// ── Compile and log result for one directory ──

async function compileAndLog(dir: string, cwd: string): Promise<boolean> {
  try {
    const r = await compileDir(dir);
    if (r) {
      const rel = relative(cwd, r.target);
      console.log(`✓ ${rel} (${r.types} types + ${r.fns} functions)`);
      return true;
    }
    return false;
  } catch (e: any) {
    console.error(`✗ ${relative(cwd, dir)}: ${e.message}`);
    return false;
  }
}

// ── Watch mode ──

function watchDirs(dirs: string[], cwd: string) {
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  for (const dir of dirs) {
    watch(dir, (_eventType, filename) => {
      if (!filename) return;
      if (!filename.endsWith(".fts")) return;
      if (filename === "index.ts") return;

      const existing = debounceTimers.get(dir);
      if (existing) clearTimeout(existing);
      debounceTimers.set(dir, setTimeout(async () => {
        debounceTimers.delete(dir);
        const rel = relative(cwd, dir);
        console.log(`\n[watch] ${rel}/${filename} changed`);
        await compileAndLog(dir, cwd);
      }, 50));
    });
  }

  console.log(`\n[watch] Watching ${dirs.length} directories for .fts changes... (Ctrl+C to stop)`);
}

// ── CLI ──

const HELP = `fts-compile — Compile .fts/.type.fts directories to TypeScript modules

Usage:
  fts-compile <dir> [<dir> ...]    Compile specific directories
  fts-compile --all                Discover and compile all fts directories
  fts-compile --all --watch        Compile and watch for changes

Options:
  --all        Auto-discover all directories containing .fts files
  --watch      Watch mode: recompile on file changes (use with --all or dirs)
  --help       Show help
`;

async function main() {
  const args = process.argv.slice(2);
  const dirs: string[] = [];
  let all = false;
  let watchMode = false;

  for (const a of args) {
    if (a === "--help" || a === "-h") { console.log(HELP); process.exit(0); }
    if (a === "--all") { all = true; continue; }
    if (a === "--watch" || a === "-w") { watchMode = true; continue; }
    if (!a.startsWith("--")) { dirs.push(resolve(a)); continue; }
    console.error(`Unknown option: ${a}`);
    process.exit(1);
  }

  if (!all && dirs.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  const cwd = process.cwd();

  let targetDirs: string[];
  if (all) {
    console.error(`[fts-compile] Scanning for .fts directories...`);
    targetDirs = await discoverFtsDirs(cwd);
    if (targetDirs.length === 0) {
      console.error(`[fts-compile] No .fts directories found`);
      process.exit(0);
    }
    console.error(`[fts-compile] Found ${targetDirs.length} fts directories`);
  } else {
    targetDirs = dirs;
  }

  let ok = 0;
  let fail = 0;
  for (const d of targetDirs) {
    const success = await compileAndLog(d, cwd);
    if (success) ok++; else fail++;
  }

  if (fail > 0) {
    console.error(`\n[fts-compile] ${ok} compiled, ${fail} failed`);
  }

  if (watchMode) {
    watchDirs(targetDirs, cwd);
  } else {
    process.exit(fail > 0 ? 1 : 0);
  }
}

main();
