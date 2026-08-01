import type { Effect, Guarantee } from "./effect.js";

export type DiagnosticKind =
  | "contract-violation"
  | "effect-source"
  | "effect-propagation"
  | "unproven-handling"
  | "pass-through-parameter"
  | "unused-parameter"
  | "type-looseness"
  | "multi-responsibility-candidate";

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  kind: DiagnosticKind;
  severity: DiagnosticSeverity;
  message: string;
  filePath: string;
  line: number;
  functionName?: string;
  effect?: Effect;
  guarantee?: Guarantee;
  evidence: Evidence[];
  advice?: Advice[];
}

export interface Evidence {
  kind: string;
  message: string;
  filePath?: string;
  line?: number;
  functionName?: string;
}

export interface Advice {
  code: string;
  message: string;
  confidence: "high" | "medium" | "low";
}
