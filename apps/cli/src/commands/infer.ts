/**
 * infer 子命令 — 显示所有函数的推断能力集
 */

import { dirname } from "node:path";
import { buildGraph, inferAll, loadCapFiles } from "@lm-linter/core";
import { formatInferred } from "../format.js";
import { resolveTsConfig } from "../helpers.js";
import type { CliOptions } from "../args.js";

export function runInfer(opts: CliOptions) {
  const tsConfigPath = resolveTsConfig(opts.tsconfig);
  const cwd = dirname(tsConfigPath);

  console.error(`[lm-linter infer] Scanning: ${tsConfigPath}`);

  const graph = buildGraph(tsConfigPath);
  const capEntries = loadCapFiles(cwd);
  const externalCaps = new Map(capEntries.map(e => [e.name, e]));
  const inferred = inferAll(graph, externalCaps);

  const output = formatInferred(graph, inferred, cwd, opts.paths);
  console.log(output);
}
