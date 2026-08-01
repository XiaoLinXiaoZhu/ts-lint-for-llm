import type { Diagnostic, ProjectSnapshot } from "@lm-linter/model";

export interface ReportInput {
  mode: "check" | "audit" | "effects" | "pass-through" | "looseness";
  snapshot: ProjectSnapshot;
  diagnostics: Diagnostic[];
}

function hasFindings(input: ReportInput) {
  return input.mode === "check"
    ? input.diagnostics.some(d => d.severity === "error")
    : input.diagnostics.length > 0;
}

export function toJson(input: ReportInput): string {
  const diagnostics = input.diagnostics.map(diagnostic => ({
    ...diagnostic,
    filePath: diagnostic.filePath,
  }));
  return JSON.stringify({
    status: hasFindings(input) ? "fail" : "pass",
    mode: input.mode,
    filesScanned: input.snapshot.filesScanned,
    functionsDiscovered: input.snapshot.functions.size,
    functionsAnalyzed: input.snapshot.functions.size,
    diagnostics,
  }, null, 2);
}

export function toSummary(input: ReportInput): string {
  const counts = new Map<string, number>();
  for (const diagnostic of input.diagnostics) {
    counts.set(diagnostic.kind, (counts.get(diagnostic.kind) ?? 0) + 1);
  }
  return JSON.stringify({
    status: hasFindings(input) ? "fail" : "pass",
    mode: input.mode,
    filesScanned: input.snapshot.filesScanned,
    functionsDiscovered: input.snapshot.functions.size,
    diagnostics: input.diagnostics.length,
    byKind: Object.fromEntries(counts),
  }, null, 2);
}
