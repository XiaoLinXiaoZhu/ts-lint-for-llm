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
                     Tip: 用排除了测试文件的 tsconfig（如 tsconfig.build.json）
                     可避免扫描 *.test.ts / *.spec.ts
  --fix              Auto-fix @capability declarations
  --dry-run          Preview --fix changes (requires --fix)
  --summary          Only output scores (no diagnostics/functions)
  --hint <keyword>   Filter optimization tips by keyword
  --help             Show help
  --version          Show version

Output: JSON to stdout. Progress/logs to stderr.
Exit codes: 0 = no errors, 1 = error-level diagnostics found.

═══ Capabilities (8) ═══

  Propagate (5) — callee 的能力向 caller 传播，计入评分
  ─────────────────────────────────────────────────────────
  IO          读写外部系统（网络、文件、数据库）
              不可阻断，只能传播。手动声明，无自动检测。
              降低：缩小携带面积——把 IO 集中到更少的函数，提取纯逻辑。

  Impure      依赖隐式环境（时间、随机数、全局变量）
              不可阻断，只能传播。手动声明，无自动检测。
              降低：参数注入——Date.now() → 传入 now 参数，
                    Math.random() → 传入 seed/rng，全局变量 → 参数化。

  Fallible    返回类型含 null/undefined，函数可能失败
              可阻断（HandleFallible）。自动检测。
              降低：① 补上标记并传播（声明 Fallible）
                    ② 提供回退值（?? fallback → 声明 HandleFallible）
                    ③ parse 为确定类型（Result<T,E> / { ok, error }）
                    ④ try-catch 兜底 → 声明 HandleFallible
                    ⑤ 改返回类型不含 null → 自动检测不再触发

  Async       返回 Promise/AsyncIterable，调用方需要 await
              可阻断（HandleAsync）。自动检测（async 关键字 / Promise 返回类型）。
              降低：① 补上标记并传播（声明 Async）
                    ② await 后同步返回 → 声明 HandleAsync
                    ③ fire-and-forget + .catch() → 声明 HandleAsync
                    ④ 转为回调/事件模式 → 声明 HandleAsync

  Mutable     参数含非 readonly 引用类型，可能修改调用方数据
              可阻断（HandleMutable）。自动检测（参数类型判定）。
              降低：① 参数加 readonly → 自动检测不再触发
                    ② 传入拷贝（[...arr] / {...obj}）→ 声明 HandleMutable
                    ③ 改为返回新值而非修改参数

  Block (3) — 声明"已处理 callee 的对应能力"，阻断向上传播
  ─────────────────────────────────────────────────────────
  HandleFallible   阻断 Fallible。函数处理了 callee 的空值/失败。
  HandleAsync      阻断 Async。函数消化了 callee 的异步性。
  HandleMutable    阻断 Mutable。函数传入拷贝，隔离了变异。

  阻断能力不计入评分，不自动检测，只能手动声明。

═══ Declaration ═══

  JSDoc:    /** @capability IO Async HandleFallible */
  Suffix:   function fetchUser_IO_Async() {}
  Pure:     /** @capability */   (空 = 零能力)
  None:     未声明 → 按全能力(×5)计分，产生 undeclared 诊断

═══ Diagnostics ═══

  missing_capability    caller 缺少 callee 传播的能力（error）
  undeclared            函数无任何声明（error）
  unregistered          调用了未注册的外部函数（error）
  implicit_capability   自动检测注入了未声明的能力（info，不影响退出码）

═══ Scoring ═══

  函数得分 = 加权语句数 × 传播能力数（阻断能力不计入）
  未声明函数按 5 个传播能力计算（最大惩罚）
  纯函数得分 = 0
  能力负担分 = 所有函数得分之和（越低越好）

═══ Workflow ═══

  每次修改后对比分数，分数没降 = 无效修改，应撤回。
  1. capability-lint --summary   → 记录 totalCap 基线
  2. 修改代码，再跑一次
  3. 分数降了 → git add
  4. 没降或升了 → git checkout
  拆分函数只在提取出「能力更少」的部分时才有效。

═══ Examples ═══

  capability-lint                                # 扫描整个项目
  capability-lint src/api.ts                     # 只看单文件诊断
  capability-lint --fix --dry-run                # 预览修复
  capability-lint --summary --hint undeclared     # 只看分数+未声明建议
  capability-lint | jq '.scores.totalCap'        # 提取总分
  capability-lint | jq '.diagnostics[] | select(.kind == "missing_capability")'
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
  if (dryRun) {
    const fixResult = applyFixes(scan, result, true);
    console.error(`[capability-lint] Dry run: ${fixResult.changes.length} changes (+${fixResult.capsAdded} -${fixResult.capsRemoved})`);
    for (const c of fixResult.changes) {
      const rel = relative(cwd, c.filePath);
      const parts: string[] = [];
      if (c.added.length) parts.push(`+${c.added.join(",")}`);
      if (c.removed.length) parts.push(`-${c.removed.join(",")}`);
      console.error(`  ${rel}:${c.line} ${c.functionName} ${parts.join(" ")}`);
    }
  } else {
    const MAX_ROUNDS = 10;
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const fixResult = applyFixes(scan, result, false);
      if (fixResult.filesModified === 0) {
        if (round === 1) console.error(`[capability-lint] No fixes needed`);
        break;
      }
      console.error(`[capability-lint] Fix round ${round}: ${fixResult.filesModified} files (+${fixResult.capsAdded} -${fixResult.capsRemoved})`);
      // Recompile fts directories if .fts files were modified
      const ftsDirs = new Set<string>();
      for (const c of fixResult.changes) {
        if (c.filePath.endsWith(".fts") && !c.filePath.endsWith(".type.fts")) {
          ftsDirs.add(dirname(c.filePath));
        }
      }
      if (ftsDirs.size > 0) {
        const { execSync } = await import("node:child_process");
        for (const dir of ftsDirs) {
          try {
            execSync(`bun ${resolve(dirname(import.meta.url.replace("file://", "")), "fts-compile.ts")} ${dir}`, { stdio: "pipe" });
          } catch {}
        }
      }
      ({ scan, result, scores } = runPipeline());
    }
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
