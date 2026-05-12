/**
 * assert 子命令 — 效果断言验证
 *
 * 检查函数是否满足 @assert 声明的属性，违规时输出完整污染链。
 * 对 Fallible/Async/Mutable 违规，在链中间节点提示可通过 Handle 标记阻断传递。
 */

import { dirname } from "node:path";
import { buildGraph, inferAll, checkAssertions, loadCapFiles } from "@lm-linter/core";
import type { AssertionViolation } from "@lm-linter/core";
import { formatAssertViolations } from "../format.js";
import { resolveTsConfig, filterByScope } from "../helpers.js";
import type { CliOptions } from "../args.js";

export function runAssert(opts: CliOptions) {
  const tsConfigPath = resolveTsConfig(opts.tsconfig);
  const cwd = dirname(tsConfigPath);

  console.error(`[lm-linter assert] Scanning: ${tsConfigPath}`);
  const t0 = Date.now();

  const graph = buildGraph(tsConfigPath);
  const capEntries = loadCapFiles(cwd);
  const externalCaps = new Map(capEntries.map(e => [e.name, e]));

  if (capEntries.length > 0) {
    console.error(`[lm-linter assert] Loaded ${capEntries.length} external declarations`);
  }

  const t1 = Date.now();
  console.error(`[lm-linter assert] Graph: ${graph.functions.size} functions (${t1 - t0}ms)`);

  const inferred = inferAll(graph, externalCaps);
  const violations = checkAssertions(graph, inferred, externalCaps);

  const t2 = Date.now();
  console.error(`[lm-linter assert] Inferred + checked in ${t2 - t1}ms`);

  const filtered = filterByScope(violations, opts.paths);
  const output = formatAssertViolations(filtered, cwd, opts.summary);
  console.log(output);

  process.exitCode = filtered.length > 0 ? 1 : 0;
}
