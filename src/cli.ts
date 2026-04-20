#!/usr/bin/env node
/**
 * capability-lint CLI
 *
 * 用法:
 *   capability-lint [options] [tsconfig.json]
 *
 * Options:
 *   --json     JSON 输出
 *   --pretty   终端输出（默认）
 */

import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { scanProject } from "./scanner.js";
import { analyze } from "./analyzer.js";
import { computeScores, formatPretty, formatJSON } from "./reporter.js";

const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith("--"));
const positional = args.filter(a => !a.startsWith("--"));

const format = flags.includes("--json") ? "json" : "pretty";

// 查找 tsconfig
let tsConfigPath = positional[0] ?? "tsconfig.json";
tsConfigPath = resolve(tsConfigPath);

if (!existsSync(tsConfigPath)) {
  console.error(`tsconfig not found: ${tsConfigPath}`);
  process.exit(1);
}

const cwd = resolve(tsConfigPath, "..");

console.error(`[capability-lint] Scanning project: ${tsConfigPath}`);
const t0 = Date.now();

const scan = scanProject(tsConfigPath);
const t1 = Date.now();
console.error(`[capability-lint] Scanned ${scan.functions.size} functions in ${t1 - t0}ms`);

const result = analyze(scan);
const scores = computeScores(scan, result.effectiveCaps);
const t2 = Date.now();
console.error(`[capability-lint] Analyzed in ${t2 - t1}ms, found ${result.diagnostics.length} diagnostics`);

if (format === "json") {
  console.log(formatJSON(result, scores, cwd));
} else {
  console.log(formatPretty(result, scores, cwd));
}

const hasErrors = result.diagnostics.some(d => d.kind !== "absorbed");
process.exit(hasErrors ? 1 : 0);
