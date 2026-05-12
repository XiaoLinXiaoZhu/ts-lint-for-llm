/**
 * type 子命令 — 类型松散度检测
 */

import { dirname, relative } from "node:path";
import { Project } from "ts-morph";
import { scoreLooseness } from "@lm-linter/looseness";
import { formatLooseness } from "../format.js";
import { resolveTsConfig, isInScope } from "../helpers.js";
import type { CliOptions } from "../args.js";

export function runType(opts: CliOptions) {
  const tsConfigPath = resolveTsConfig(opts.tsconfig);
  const cwd = dirname(tsConfigPath);

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
