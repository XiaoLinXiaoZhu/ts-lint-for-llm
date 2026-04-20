#!/usr/bin/env node
/**
 * capability-lint CLI
 *
 * 用法:
 *   capability-lint [options] [tsconfig.json | file.ts]
 *
 * Options:
 *   --json     JSON 输出
 *   --llm      LLM 友好的 Markdown 输出
 *   --pretty   终端输出（默认）
 *   --fix      自动修复 @capability 声明（补全缺失、移除多余）
 *   --filter <path>  只显示匹配路径的文件的诊断
 */

import { resolve, dirname } from "node:path";
import { existsSync, statSync } from "node:fs";
import { Project } from "ts-morph";
import { scanProject } from "./scanner.js";
import { analyze } from "./analyzer.js";
import { scoreLooseness } from "./looseness.js";
import { computeScores, formatPretty, formatJSON, formatLLM } from "./reporter.js";
import { applyFixes } from "./fixer.js";

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith("--")));
const positional = args.filter(a => !a.startsWith("--"));

// 解析 --filter
let filterPath: string | null = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--filter" && args[i + 1]) {
    filterPath = args[i + 1];
    flags.delete("--filter");
    positional.splice(positional.indexOf(args[i + 1]), 1);
  }
}

const format = flags.has("--json") ? "json" : flags.has("--llm") ? "llm" : "pretty";
const doFix = flags.has("--fix");

// 找 tsconfig
let input = positional[0] ?? "tsconfig.json";
input = resolve(input);

let tsConfigPath: string;
if (input.endsWith(".json")) {
  tsConfigPath = input;
} else if (statSync(input, { throwIfNoEntry: false })?.isDirectory()) {
  tsConfigPath = resolve(input, "tsconfig.json");
} else if (input.endsWith(".ts")) {
  // 单文件：向上查找 tsconfig.json
  let dir = dirname(input);
  while (dir !== dirname(dir)) {
    const candidate = resolve(dir, "tsconfig.json");
    if (existsSync(candidate)) { tsConfigPath = candidate; break; }
    dir = dirname(dir);
  }
  tsConfigPath ??= resolve("tsconfig.json");
  filterPath ??= input;
} else {
  tsConfigPath = resolve("tsconfig.json");
}

if (!existsSync(tsConfigPath)) {
  console.error(`tsconfig not found: ${tsConfigPath}`);
  process.exit(1);
}

const cwd = dirname(tsConfigPath);

console.error(`[capability-lint] Scanning: ${tsConfigPath}`);
const t0 = Date.now();

const scan = scanProject(tsConfigPath);
const t1 = Date.now();
console.error(`[capability-lint] Scanned ${scan.functions.size} functions in ${t1 - t0}ms`);

const result = analyze(scan);

// Looseness 评分
const project = new Project({ tsConfigFilePath: tsConfigPath });
const loosenessResults = new Map<string, ReturnType<typeof scoreLooseness>>();
for (const sf of project.getSourceFiles()) {
  if (sf.getFilePath().includes("node_modules")) continue;
  loosenessResults.set(sf.getFilePath(), scoreLooseness(sf));
}

const scores = computeScores(scan, result, loosenessResults);
const t2 = Date.now();
console.error(`[capability-lint] Analyzed in ${t2 - t1}ms, ${result.diagnostics.length} diagnostics`);

// --fix
if (doFix) {
  const fixResult = applyFixes(scan, result);
  console.error(`[capability-lint] Fixed ${fixResult.filesModified} files (+${fixResult.capsAdded} caps, -${fixResult.capsRemoved} caps)`);
}

// 过滤
let diagnostics = result.diagnostics;
if (filterPath) {
  const fp = resolve(filterPath);
  diagnostics = diagnostics.filter(d => d.filePath.includes(fp) || d.filePath === fp);
  // 也过滤评分
  // （评分总是全项目的，但诊断可以过滤）
}

const filteredResult = { ...result, diagnostics };

if (format === "json") {
  console.log(formatJSON(filteredResult, scores, cwd));
} else if (format === "llm") {
  console.log(formatLLM(filteredResult, scores, cwd));
} else {
  console.log(formatPretty(filteredResult, scores, cwd));
}

const hasErrors = diagnostics.some(d => d.kind !== "absorbed");
process.exit(hasErrors ? 1 : 0);
