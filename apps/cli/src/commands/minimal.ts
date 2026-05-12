/**
 * minimal 子命令 — 穿透参数检测
 */

import { dirname, relative } from "node:path";
import { Project } from "ts-morph";
import { scanMinimal } from "@lm-linter/core";
import { resolveTsConfig, isInScope } from "../helpers.js";
import type { CliOptions } from "../args.js";

export function runMinimal(opts: CliOptions) {
  const tsConfigPath = resolveTsConfig(opts.tsconfig);
  const cwd = dirname(tsConfigPath);

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
