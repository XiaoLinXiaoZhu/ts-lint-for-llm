import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { loadProject } from "@lm-linter/engine";
import { analyzeProject } from "@lm-linter/rules";
import { toJson, toSummary } from "@lm-linter/report";
import type { CliOptions } from "../args.js";

export function runAnalysis(options: CliOptions) {
  const mode = options.command === "check"
    ? "check"
    : options.auditAspect === "all" ? "audit" : options.auditAspect;
  const tsconfig = resolve(options.tsconfig ?? "tsconfig.json");
  if (!existsSync(tsconfig)) {
    console.error(`tsconfig not found: ${tsconfig}`);
    process.exitCode = 3;
    return;
  }

  console.error(`[lm-linter ${mode}] Scanning: ${tsconfig}`);
  const snapshot = loadProject(tsconfig);
  const scoped = options.paths.length === 0
    ? snapshot
    : {
        ...snapshot,
        functions: new Map([...snapshot.functions].filter(([, fn]) =>
          options.paths.some(path => fn.filePath.includes(resolve(path)) || fn.filePath.endsWith(path)),
        )),
      };
  const result = analyzeProject(snapshot, mode);
  const diagnostics = options.paths.length === 0
    ? result.diagnostics
    : result.diagnostics.filter(diagnostic =>
        options.paths.some(path => diagnostic.filePath.includes(resolve(path)) || diagnostic.filePath.endsWith(path)),
      );
  console.log(options.summary ? toSummary({ mode, snapshot: scoped, diagnostics })
    : toJson({ mode, snapshot: scoped, diagnostics }));
  process.exitCode = mode === "check"
    ? (diagnostics.some(d => d.severity === "error") ? 1 : 0)
    : (diagnostics.length > 0 ? 1 : 0);
}
