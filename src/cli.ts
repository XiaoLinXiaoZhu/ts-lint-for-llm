#!/usr/bin/env node
/**
 * capability-lint CLI
 *
 * Capability-based effect tracking for TypeScript projects.
 * Designed for LLM agents — JSON output is the default.
 */

import { resolve, dirname, relative } from "node:path";
import { existsSync, statSync, readFileSync } from "node:fs";
import { Project } from "ts-morph";
import { scanProject } from "./scanner.js";
import { analyze } from "./analyzer.js";
import { scoreLooseness } from "./looseness.js";
import { computeScores, formatPretty, formatJSON, formatLLM } from "./reporter.js";
import { applyFixes } from "./fixer.js";

// ── JSON output schema（嵌入 --help，供 AI agent 了解如何用 jq 取数据）──

const OUTPUT_SCHEMA = `{
  "diagnostics": [{
    "kind": "escalation | async_mismatch | fallible_mismatch | absorbed | unregistered | undeclared",
    "functionName": "string",
    "filePath": "string (relative)",
    "line": "number",
    "message": "string",
    "callee?": "string",
    "missingCaps?": ["IO", "Mutable", "Impure"],
    "absorbedCaps?": ["Fallible", "Async"]
  }],
  "functions": [{
    "name": "string",
    "filePath": "string (relative)",
    "line": "number",
    "caps": ["IO", "Async", ...],
    "isDeclared": "boolean",
    "weightedStatements": "number",
    "score": "number"
  }],
  "scores": {
    "totalCap": "number (lower is better)",
    "totalLoose": "number (lower is better)",
    "totalFunctions": "number",
    "totalPure": "number",
    "totalUndeclared": "number",
    "capScores": { "IO": "number", "Async": "number", ... },
    "looseByType": { "any": { "count": "number", "penalty": "number" }, ... },
    "topFunctions": [{ "name": "string", "score": "number", ... }],
    "fileScores": [{ "filePath": "string", "capScore": "number", "looseScore": "number", ... }],
    "tips": ["string"]
  }
}`;

const HELP = `capability-lint — Capability-based effect tracking for TypeScript

Usage:
  capability-lint [options] [file.ts | dir/ | tsconfig.json]

  Positional argument is a .ts file, directory, or tsconfig.json.
  If a .ts file is given, the project is loaded from the nearest tsconfig.json,
  but only diagnostics for that file are shown.
  If a directory is given, tsconfig.json in that directory is used.
  Default: tsconfig.json in the current directory.

Options:
  --json       JSON output (default) — pipe to jq for structured queries
  --llm        LLM-friendly Markdown output
  --pretty     Human-readable terminal output
  --fix        Auto-fix @capability declarations (add missing, remove excess)
  --dry-run    Preview --fix changes without writing files (requires --fix)
  --help       Show this help
  --version    Show version

JSON output schema:
${OUTPUT_SCHEMA}

Examples:
  capability-lint src/                         # scan project, JSON output
  capability-lint src/api.ts                   # single file diagnostics
  capability-lint --fix --dry-run src/         # preview fixes
  capability-lint src/ | jq '.scores.totalCap' # query total capability burden
  capability-lint src/ | jq '[.diagnostics[] | select(.kind == "escalation")]'

Exit codes:
  0  No errors (absorbed warnings are OK)
  1  Errors found (escalation, mismatch, undeclared, unregistered)

Capability detection rules:
  IO        Declared by user or propagated via call chain (non-wrappable)
  Fallible  Auto-detected from return type containing null/undefined
  Mutable   Auto-detected from non-readonly reference type parameters
            (e.g. items: string[] triggers Mutable; items: readonly string[] does not)
            Local push/sort/splice does NOT trigger Mutable — only parameter types matter
            Fix: add readonly to params that aren't modified → removes Mutable → lowers score
  Async     Auto-detected from return type containing Promise/AsyncIterable
  Impure    Declared by user or propagated via call chain (non-wrappable)

Workflow tip:
  Every change should be verified by score diff. Do NOT assume a refactor lowers the score.
  1. Run capability-lint, note totalCap + totalLoose as baseline
  2. Make a change, run again, compare scores
  3. Score dropped → git add (stage the win)
  4. Score unchanged or rose → git checkout (revert, the change was ineffective)
  Splitting a function only helps if the extracted part has FEWER capabilities.
  Moving code between functions without reducing capabilities per function changes nothing.
`;

// ── 参数解析 ──

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith("--")));
const positional = args.filter(a => !a.startsWith("--"));

if (flags.has("--help")) {
  console.log(HELP);
  process.exit(0);
}

if (flags.has("--version")) {
  try {
    const pkgPath = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    console.log(pkg.version);
  } catch {
    console.log("unknown");
  }
  process.exit(0);
}

const format = flags.has("--pretty") ? "pretty" : flags.has("--llm") ? "llm" : "json";
const doFix = flags.has("--fix");
const dryRun = flags.has("--dry-run");

// ── 找 tsconfig ──

let input = positional[0] ?? "tsconfig.json";
input = resolve(input);

let tsConfigPath!: string;
let focusFile: string | null = null;

if (input.endsWith(".json")) {
  tsConfigPath = input;
} else if (statSync(input, { throwIfNoEntry: false })?.isDirectory()) {
  tsConfigPath = resolve(input, "tsconfig.json");
} else if (input.endsWith(".ts")) {
  // 单文件：向上查找 tsconfig.json，聚焦该文件的诊断
  let dir = dirname(input);
  while (dir !== dirname(dir)) {
    const candidate = resolve(dir, "tsconfig.json");
    if (existsSync(candidate)) { tsConfigPath = candidate; break; }
    dir = dirname(dir);
  }
  tsConfigPath ??= resolve("tsconfig.json");
  focusFile = input;
} else {
  tsConfigPath = resolve("tsconfig.json");
}

if (!existsSync(tsConfigPath)) {
  console.error(`tsconfig not found: ${tsConfigPath}`);
  process.exit(1);
}

const cwd = dirname(tsConfigPath);

// ── 扫描 & 分析 ──

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
  if (sf.getFilePath().includes("node_modules") || sf.getFilePath().endsWith(".cap.ts")) continue;
  loosenessResults.set(sf.getFilePath(), scoreLooseness(sf));
}

const scores = computeScores(scan, result, loosenessResults);
const t2 = Date.now();
console.error(`[capability-lint] Analyzed in ${t2 - t1}ms, ${result.diagnostics.length} diagnostics`);

// ── --fix / --dry-run ──

if (doFix) {
  const fixResult = applyFixes(scan, result, dryRun);
  if (dryRun) {
    console.error(`[capability-lint] Dry run: ${fixResult.changes.length} changes in ${new Set(fixResult.changes.map(c => c.filePath)).size} files (+${fixResult.capsAdded} caps, -${fixResult.capsRemoved} caps)`);
    for (const c of fixResult.changes) {
      const rel = relative(cwd, c.filePath);
      const parts: string[] = [];
      if (c.added.length) parts.push(`+${c.added.join(",")}`);
      if (c.removed.length) parts.push(`-${c.removed.join(",")}`);
      console.error(`  ${rel}:${c.line} ${c.functionName} ${parts.join(" ")}`);
    }
  } else {
    console.error(`[capability-lint] Fixed ${fixResult.filesModified} files (+${fixResult.capsAdded} caps, -${fixResult.capsRemoved} caps)`);
  }
}

// ── 聚焦单文件 ──

let diagnostics = result.diagnostics;
if (focusFile) {
  const fp = resolve(focusFile);
  diagnostics = diagnostics.filter(d => d.filePath === fp || d.filePath.includes(fp));
}

const filteredResult = { ...result, diagnostics };

// ── 输出 ──

if (format === "json") {
  console.log(formatJSON(filteredResult, scores, cwd));
} else if (format === "llm") {
  console.log(formatLLM(filteredResult, scores, cwd));
} else {
  console.log(formatPretty(filteredResult, scores, cwd));
}

const hasErrors = diagnostics.some(d => d.kind !== "absorbed" && d.kind !== "mutable_param");
process.exitCode = hasErrors ? 1 : 0;
