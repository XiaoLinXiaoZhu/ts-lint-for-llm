#!/usr/bin/env bun
/**
 * lm-linter CLI — 断言式效果追踪与类型松散度检测
 *
 *   lm-linter assert [options]   效果断言验证（推断 + 断言检查 + 污染链）
 *   lm-linter type   [options]   类型松散度检测
 *   lm-linter infer  [options]   显示所有函数的推断能力（辅助）
 */

import { resolve, dirname, relative } from "node:path";
import { existsSync, statSync } from "node:fs";
import { buildGraph, inferAll, checkAssertions, loadCapFiles, scanMinimal } from "@lm-linter/core";
import { formatViolations, formatInferred, formatLooseness } from "./format.js";
import { parseArgs, type CliOptions } from "./args.js";
import { Project } from "ts-morph";
import { scoreLooseness } from "@lm-linter/looseness";

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

const tsConfigPath = resolveTsConfig(options.tsconfig);
const cwd = dirname(tsConfigPath);

switch (options.command) {
  case "assert": runAssert(options); break;
  case "type": runType(options); break;
  case "minimal": runMinimal(options); break;
  case "infer": runInfer(options); break;
  default: printHelp(); break;
}

function runAssert(opts: CliOptions) {
  console.error(`[lm-linter] Scanning: ${tsConfigPath}`);
  const t0 = Date.now();

  const graph = buildGraph(tsConfigPath);
  const capEntries = loadCapFiles(cwd);
  const externalCaps = new Map(capEntries.map(e => [e.name, e]));

  if (capEntries.length > 0) {
    console.error(`[lm-linter] Loaded ${capEntries.length} external declarations`);
  }

  const t1 = Date.now();
  console.error(`[lm-linter] Graph: ${graph.functions.size} functions (${t1 - t0}ms)`);

  const inferred = inferAll(graph, externalCaps);
  const violations = checkAssertions(graph, inferred, externalCaps);

  const t2 = Date.now();
  console.error(`[lm-linter] Inferred + checked in ${t2 - t1}ms`);

  const filtered = filterByScope(violations, opts.paths);
  const output = formatViolations(filtered, cwd, opts.summary);
  console.log(output);

  process.exitCode = filtered.length > 0 ? 1 : 0;
}

function runType(opts: CliOptions) {
  console.error(`[lm-linter type] Scanning: ${tsConfigPath}`);
  const project = new Project({ tsConfigFilePath: tsConfigPath });

  const results: Array<{ filePath: string; signals: Array<{ type: string; line: number; desc: string }> }> = [];

  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (fp.includes("node_modules") || fp.endsWith(".cap.ts")) continue;
    if (opts.paths.length > 0 && !isInScope(fp, opts.paths)) continue;

    const lr = scoreLooseness(sf);
    results.push({ filePath: relative(cwd, fp), signals: lr.signals });
  }

  results.sort((a, b) => b.signals.length - a.signals.length);
  const output = formatLooseness(results, opts.summary);
  console.log(output);

  const hasIssues = results.some(r => r.signals.length > 0);
  process.exitCode = hasIssues ? 1 : 0;
}

function runInfer(opts: CliOptions) {
  console.error(`[lm-linter infer] Scanning: ${tsConfigPath}`);

  const graph = buildGraph(tsConfigPath);
  const capEntries = loadCapFiles(cwd);
  const externalCaps = new Map(capEntries.map(e => [e.name, e]));
  const inferred = inferAll(graph, externalCaps);

  const output = formatInferred(graph, inferred, cwd, opts.paths);
  console.log(output);
}

function runMinimal(opts: CliOptions) {
  console.error(`[lm-linter minimal] Scanning: ${tsConfigPath}`);
  const project = new Project({ tsConfigFilePath: tsConfigPath });

  const allViolations: Array<{ functionName: string; file: string; line: number; passThroughParams: any[] }> = [];
  const onlyAsserted = !opts.all;

  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (fp.includes("node_modules") || fp.endsWith(".cap.ts")) continue;
    if (opts.paths.length > 0 && !isInScope(fp, opts.paths)) continue;

    const result = scanMinimal(sf, onlyAsserted);
    for (const v of result.violations) {
      allViolations.push({
        functionName: v.functionName,
        file: relative(cwd, v.filePath),
        line: v.line,
        passThroughParams: v.passThroughParams,
      });
    }
  }

  if (allViolations.length === 0) {
    console.log(JSON.stringify({ status: "pass", issues: 0 }, null, 2));
    process.exitCode = 0;
  } else {
    console.log(JSON.stringify({
      status: "fail",
      functions: allViolations,
    }, null, 2));
    process.exitCode = 1;
  }
}

// ── Helpers ──

function resolveTsConfig(flag?: string): string {
  const path = flag ? resolve(flag) : resolve("tsconfig.json");
  if (!existsSync(path)) {
    console.error(`tsconfig not found: ${path}`);
    process.exit(1);
  }
  return path;
}

function filterByScope(violations: any[], paths: string[]): any[] {
  if (paths.length === 0) return violations;
  return violations.filter(v => isInScope(v.assertion.filePath, paths));
}

function isInScope(filePath: string, paths: string[]): boolean {
  return paths.some(p => {
    const resolved = resolve(p);
    const stat = statSync(resolved, { throwIfNoEntry: false });
    if (stat?.isDirectory()) return filePath.startsWith(resolved);
    return filePath === resolved;
  });
}

function printHelp() {
  console.log(`lm-linter — 断言式 TypeScript 效果追踪

Usage:
  lm-linter assert [file|dir ...] [options]   验证 @assert 断言
  lm-linter type   [file|dir ...] [options]   类型松散度检测
  lm-linter infer  [file|dir ...] [options]   显示推断的能力集
  lm-linter minimal [file|dir ...] [options]   穿透参数检测

Options:
  --tsconfig <path>   指定 tsconfig.json (默认: ./tsconfig.json)
  --summary           只输出汇总（不输出详细信息）
  --all               扫描所有函数（不限于有 @assert minimal 的）
  --help              显示帮助

═══ 断言词汇 ═══

  @assert pure            完全纯函数 (无 IO/Impure/Fallible/Async/Mutable)
  @assert infallible      不可失败 (无 Fallible)
  @assert immutable       不修改状态 (无 Mutable)
  @assert sync            同步 (无 Async)
  @assert deterministic   确定性 (无 Impure)
  @assert local           不与外部交互 (无 IO)

  属性可组合: @assert infallible immutable sync

═══ 工作流 ═══

  1. 在关键函数上标记 @assert
  2. 运行 lm-linter assert
  3. 断言不满足 → 输出污染链 → AI/人按链修复
  4. 断言满足 → 无输出 → 代码质量已验证

═══ 外部声明 ═══

  创建 .cap.ts 文件声明外部函数的 IO/Impure 能力。
  Async/Fallible/Mutable 从 .d.ts 类型自动推断。

═══ 示例 ═══

  lm-linter assert                      完整断言验证
  lm-linter assert src/core/            只检查 src/core/
  lm-linter assert --summary            只看汇总
  lm-linter infer                       查看所有函数的推断能力
  lm-linter type                        类型松散度
  lm-linter type --summary              只看总分
`);
}
