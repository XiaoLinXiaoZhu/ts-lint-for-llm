#!/usr/bin/env node
/**
 * capability-lint CLI
 *
 * 固定 JSON 输出，支持 --summary / --hint / --fix / --dry-run
 */

import { resolve, dirname, relative } from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";
import { Project } from "ts-morph";
import { scanProject } from "./scanner.js";
import { analyze, DiagnosticKind } from "./analyzer.js";
import { scoreLooseness } from "./looseness.js";
import { computeScores, generateTips, formatJSON } from "./reporter.js";
import { applyFixes } from "./fixer.js";

const HELP = `capability-lint — Capability-based effect tracking for TypeScript

Usage:
  capability-lint [file.ts | dir/ ...] [options]

Options:
  --tsconfig <path>  Specify tsconfig.json (default: cwd/tsconfig.json)
  --fix              Auto-fix @capability declarations
  --dry-run          Preview --fix changes (requires --fix)
  --summary          Only output scores (no diagnostics/functions)
  --hint <keyword>   Filter optimization tips by keyword
  --help             Show help
  --version          Show version

Exit codes:
  0  No error-level diagnostics
  1  Error-level diagnostics found
`;

// ── Arg parsing ──

const args = process.argv.slice(2);
const flags: Record<string, string | boolean> = {};
const positional: string[] = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--help") { console.log(HELP); process.exit(0); }
  if (a === "--version") {
    try {
      const pkgPath = new URL("../package.json", import.meta.url);
      console.log(JSON.parse(readFileSync(pkgPath, "utf8")).version);
    } catch { console.log("unknown"); }
    process.exit(0);
  }
  if (a === "--tsconfig" && i + 1 < args.length) { flags.tsconfig = args[++i]; continue; }
  if (a === "--hint" && i + 1 < args.length) { flags.hint = args[++i]; continue; }
  if (a === "--fix") { flags.fix = true; continue; }
  if (a === "--dry-run") { flags.dryRun = true; continue; }
  if (a === "--summary") { flags.summary = true; continue; }
  if (!a.startsWith("--")) { positional.push(a); continue; }
}

const doFix = !!flags.fix;
const dryRun = !!flags.dryRun;
const summaryMode = !!flags.summary;
const hintKeyword = typeof flags.hint === "string" ? flags.hint : undefined;

// ── Find tsconfig ──

let tsConfigPath: string;
if (flags.tsconfig) {
  tsConfigPath = resolve(flags.tsconfig as string);
} else {
  tsConfigPath = resolve("tsconfig.json");
}

if (!existsSync(tsConfigPath)) {
  console.error(`tsconfig not found: ${tsConfigPath}`);
  process.exit(1);
}

const cwd = dirname(tsConfigPath);

// ── Resolve focus paths ──

const focusPaths: string[] = positional.map(p => resolve(p));

function isInScope(filePath: string): boolean {
  if (focusPaths.length === 0) return true;
  return focusPaths.some(fp => {
    const stat = statSync(fp, { throwIfNoEntry: false });
    if (stat?.isDirectory()) return filePath.startsWith(fp);
    return filePath === fp;
  });
}

// ── Scan & Analyze ──

function runPipeline() {
  console.error(`[capability-lint] Scanning: ${tsConfigPath}`);
  const t0 = Date.now();

  const scan = scanProject(tsConfigPath);
  const t1 = Date.now();
  console.error(`[capability-lint] Scanned ${scan.functions.size} functions in ${t1 - t0}ms`);

  const result = analyze(scan);

  // Looseness
  const project = new Project({ tsConfigFilePath: tsConfigPath });
  const loosenessResults = new Map<string, ReturnType<typeof scoreLooseness>>();
  for (const sf of project.getSourceFiles()) {
    if (sf.getFilePath().includes("node_modules") || sf.getFilePath().endsWith(".cap.ts")) continue;
    loosenessResults.set(sf.getFilePath(), scoreLooseness(sf));
  }

  const scores = computeScores(scan, result, loosenessResults);
  const t2 = Date.now();
  console.error(`[capability-lint] Analyzed in ${t2 - t1}ms, ${result.diagnostics.length} diagnostics`);

  return { scan, result, scores, loosenessResults };
}

let { scan, result, scores } = runPipeline();

// ── Fix ──

if (doFix) {
  const fixResult = applyFixes(scan, result, dryRun);
  if (dryRun) {
    console.error(`[capability-lint] Dry run: ${fixResult.changes.length} changes (+${fixResult.capsAdded} -${fixResult.capsRemoved})`);
    for (const c of fixResult.changes) {
      const rel = relative(cwd, c.filePath);
      const parts: string[] = [];
      if (c.added.length) parts.push(`+${c.added.join(",")}`);
      if (c.removed.length) parts.push(`-${c.removed.join(",")}`);
      console.error(`  ${rel}:${c.line} ${c.functionName} ${parts.join(" ")}`);
    }
  } else if (fixResult.filesModified > 0) {
    console.error(`[capability-lint] Fixed ${fixResult.filesModified} files (+${fixResult.capsAdded} -${fixResult.capsRemoved}), re-scanning...`);
    ({ scan, result, scores } = runPipeline());
  } else {
    console.error(`[capability-lint] No fixes needed`);
  }
}

// ── Tips ──

if (hintKeyword) {
  scores.tips = generateTips(scores, cwd, hintKeyword);
} else {
  // No --hint → no tips in output
}

// ── Filter scope ──

let diagnostics = result.diagnostics;
if (focusPaths.length > 0) {
  diagnostics = diagnostics.filter(d => isInScope(d.filePath));
}
const filteredResult = { ...result, diagnostics };

// ── Output ──

console.log(formatJSON(filteredResult, scores, cwd, { summary: summaryMode }));

// ── Exit code ──

const errorKinds = new Set([
  DiagnosticKind.MissingCapability,
  DiagnosticKind.Undeclared,
  DiagnosticKind.Unregistered,
]);
const hasErrors = diagnostics.some(d => errorKinds.has(d.kind));
process.exitCode = hasErrors ? 1 : 0;
