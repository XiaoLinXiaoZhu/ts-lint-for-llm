#!/usr/bin/env node
/**
 * lm-linter — TypeScript 副作用追踪与类型松散度检测
 *
 *   lm-linter cap  [options]   能力分析（效应追踪 + 递归评分）
 *   lm-linter type [options]   类型松散度检测
 */

import { resolve, dirname, relative } from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";
import { Project } from "ts-morph";
import { scanProject } from "./scanner.js";
import { analyze, DiagnosticKind } from "./analyzer.js";
import { scoreLooseness } from "./looseness.js";
import { computeScores } from "./score.js";
import { generateTips, formatJSON } from "./reporter.js";
import { applyFixes } from "./fixer.js";

const HELP = `lm-linter — TypeScript code quality toolkit

Usage:
  lm-linter cap  [file.ts | dir/ ...] [options]
  lm-linter type [file.ts | dir/ ...] [options]

Commands:
  cap    能力效应追踪 — 函数副作用传播分析 + 递归组合评分
  type   类型松散度检测 — any / unknown / as any / @ts-ignore 等

Common options:
  --tsconfig <path>  Specify tsconfig.json (default: cwd/tsconfig.json)
  --help             Show this help
  --version          Show version

Cap options:
  --fix              Auto-fix @capability declarations
  --dry-run          Preview --fix changes (requires --fix)
  --summary          Only output scores (no diagnostics/functions)
  --hint <keyword>   Filter optimization tips
                     Keywords: undeclared, split, thin-delegate, merge,
                               refactor, purity, priority, duplicate

Type options:
  --summary          Only output scores (no signal list)

═══ Cap: Capabilities (8) ═══

  Propagate (5) — callee 的能力向 caller 传播，计入评分
  ─────────────────────────────────────────────────────────
  IO          读写外部系统（网络、文件、数据库）
  Impure      依赖隐式环境（时间、随机数、全局变量）
  Fallible    返回类型含 null/undefined
  Async       返回 Promise/AsyncIterable
  Mutable     参数含非 readonly 引用类型

  Block (3) — 阻断对应能力向上传播
  ─────────────────────────────────────────────────────────
  HandleFallible / HandleAsync / HandleMutable
  阻断能力不计入评分，不自动检测，只能手动声明。

═══ Cap: Scoring ═══

  ownScore = 加权语句数 × 自身传播能力数
  score    = ownScore + Σ(callee.score × 0.5)    ← DECAY=0.5
  totalCap = 所有函数 score 之和（越低越好）

═══ Type: Signals ═══

  any(10)  as-any(8)  unknown(3)  object(5)
  Object(8)  Function(6)  {}(5)  non-null-assert(2)
  bool-param(2)  optional-field(1)
  @ts-ignore(10)  @ts-expect-error(10)
  Record<string,any>(8)  Record<string,unknown>(5)

═══ Examples ═══

  lm-linter cap                                              # 完整能力分析
  lm-linter cap --summary                                    # 只看分数
  lm-linter cap --fix --dry-run                              # 预览修复
  lm-linter cap --hint merge                                 # 合并建议
  lm-linter type                                             # 类型松散度
  lm-linter type --summary                                   # 只看分数
  lm-linter cap | jq '.scores.totalCap'                      # 提取总分
`;

// ── Arg parsing ──

const args = process.argv.slice(2);
const flags: Record<string, string | boolean> = {};
const positional: string[] = [];
let subcommand: "cap" | "type" | null = null;

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
  if (a === "cap" || a === "type") { subcommand = a; continue; }
  if (a === "--tsconfig" && i + 1 < args.length) { flags.tsconfig = args[++i]; continue; }
  if (a === "--hint" && i + 1 < args.length) { flags.hint = args[++i]; continue; }
  if (a === "--fix") { flags.fix = true; continue; }
  if (a === "--dry-run") { flags.dryRun = true; continue; }
  if (a === "--summary") { flags.summary = true; continue; }
  if (!a.startsWith("--")) { positional.push(a); continue; }
}

// Default to cap
if (!subcommand) subcommand = "cap";

// ── Common setup ──

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

const focusPaths: string[] = positional.map(p => resolve(p));
/** @capability IO Impure */
function isInScope(filePath: string): boolean {
  if (focusPaths.length === 0) return true;
  return focusPaths.some(fp => {
    const stat = statSync(fp, { throwIfNoEntry: false });
    if (stat?.isDirectory()) return filePath.startsWith(fp);
    return filePath === fp;
  });
}

// ── Cap pipeline ──

/** @capability IO Impure */
function runCap() {
  const doFix = !!flags.fix;
  const dryRun = !!flags.dryRun;
  const summaryMode = !!flags.summary;
  const hintKeyword = typeof flags.hint === "string" ? flags.hint : undefined;

  /** @capability IO Impure */
  function runPipeline() {
    console.error(`[lm-linter cap] Scanning: ${tsConfigPath}`);
    const t0 = Date.now();
    const scan = scanProject(tsConfigPath);
    const t1 = Date.now();
    console.error(`[lm-linter cap] Scanned ${scan.functions.size} functions in ${t1 - t0}ms`);

    const result = analyze(scan);
    const project = new Project({ tsConfigFilePath: tsConfigPath });
    const loosenessResults = new Map<string, ReturnType<typeof scoreLooseness>>();
    for (const sf of project.getSourceFiles()) {
      if (sf.getFilePath().includes("node_modules") || sf.getFilePath().endsWith(".cap.ts")) continue;
      loosenessResults.set(sf.getFilePath(), scoreLooseness(sf));
    }
    const scores = computeScores(scan, result, loosenessResults);
    const t2 = Date.now();
    console.error(`[lm-linter cap] Analyzed in ${t2 - t1}ms, ${result.diagnostics.length} diagnostics`);
    return { scan, result, scores };
  }

  let { scan, result, scores } = runPipeline();

  if (doFix) {
    if (dryRun) {
      const fixResult = applyFixes(scan, result, true);
      console.error(`[lm-linter cap] Dry run: ${fixResult.changes.length} changes (+${fixResult.capsAdded} -${fixResult.capsRemoved})`);
      for (const c of fixResult.changes) {
        const rel = relative(cwd, c.filePath);
        const parts: string[] = [];
        if (c.added.length) parts.push(`+${c.added.join(",")}`);
        if (c.removed.length) parts.push(`-${c.removed.join(",")}`);
        console.error(`  ${rel}:${c.line} ${c.functionName} ${parts.join(" ")}`);
      }
    } else {
      for (let round = 1; round <= 10; round++) {
        const fixResult = applyFixes(scan, result, false);
        if (fixResult.filesModified === 0) {
          if (round === 1) console.error(`[lm-linter cap] No fixes needed`);
          break;
        }
        console.error(`[lm-linter cap] Fix round ${round}: ${fixResult.filesModified} files (+${fixResult.capsAdded} -${fixResult.capsRemoved})`);
        ({ scan, result, scores } = runPipeline());
      }
    }
  }

  if (hintKeyword) scores.tips = generateTips(scores, cwd, hintKeyword);

  let diagnostics = result.diagnostics;
  if (focusPaths.length > 0) diagnostics = diagnostics.filter(d => isInScope(d.filePath));
  const filteredResult = { ...result, diagnostics };

  console.log(formatJSON(filteredResult, scores, cwd, { summary: summaryMode }));

  const errorKinds = new Set([DiagnosticKind.MissingCapability, DiagnosticKind.Undeclared, DiagnosticKind.Unregistered]);
  process.exitCode = diagnostics.some(d => errorKinds.has(d.kind)) ? 1 : 0;
}

// ── Type pipeline ──

/** @capability IO Impure */
function runType() {
  const summaryMode = !!flags.summary;

  console.error(`[lm-linter type] Scanning: ${tsConfigPath}`);
  const project = new Project({ tsConfigFilePath: tsConfigPath });

  const results: Array<{ filePath: string; signals: ReturnType<typeof scoreLooseness>["signals"]; total: number }> = [];
  let grandTotal = 0;

  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (fp.includes("node_modules") || fp.endsWith(".cap.ts")) continue;
    if (focusPaths.length > 0 && !isInScope(fp)) continue;

    const lr = scoreLooseness(sf);
    grandTotal += lr.total;
    results.push({ filePath: relative(cwd, fp), signals: lr.signals, total: lr.total });
  }

  results.sort((a, b) => b.total - a.total);

  if (summaryMode) {
    console.log(JSON.stringify({ totalLoose: grandTotal, files: results.length }, null, 2));
  } else {
    console.log(JSON.stringify({
      totalLoose: grandTotal,
      files: results.map(r => ({
        filePath: r.filePath,
        total: r.total,
        signals: r.signals,
      })),
    }, null, 2));
  }

  process.exitCode = grandTotal > 0 ? 1 : 0;
}

// ── Dispatch ──

if (subcommand === "cap") runCap();
else if (subcommand === "type") runType();
