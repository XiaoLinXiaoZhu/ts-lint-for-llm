import type { Contract } from "./contract.js";
import type { Effect } from "./effect.js";

export interface CallEdge {
  targetId: string | null;
  targetName: string;
  line: number;
}

export interface ParameterFact {
  name: string;
  line: number;
  typeText: string;
  isReadonly: boolean;
  isReference: boolean;
  writes: number;
  forwardedTo: { callee: string; line: number }[];
  localUses: number;
}

export interface FunctionFact {
  id: string;
  name: string;
  filePath: string;
  line: number;
  exported: boolean;
  parameters: ParameterFact[];
  calls: CallEdge[];
  ownEffects: Effect[];
  contract: Contract | null;
  bodyText?: string;
}

export interface ProjectSnapshot {
  tsconfigPath: string;
  filesScanned: number;
  functions: Map<string, FunctionFact>;
  externalEffects: Map<string, import("./effect.js").Effect[]>;
  files: { filePath: string; text: string }[];
}
