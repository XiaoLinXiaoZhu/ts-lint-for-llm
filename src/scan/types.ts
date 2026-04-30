/**
 * 扫描器共享类型
 */

import type { Capability } from "../capabilities.js";
import type { ExternalCapEntry } from "../cap-file.js";

export interface CallSite {
  target: string;
  qualifiedName?: string;
  line: number;
}

export interface FunctionInfo {
  id: string;
  name: string;
  filePath: string;
  line: number;
  declaredCaps: Set<Capability>;
  isDeclared: boolean;
  returnsAsync: boolean;
  returnsNullable: boolean;
  mutableParams: string[];
  resolvedCalls: CallSite[];
  unresolvedCalls: CallSite[];
  weightedStatements: number;
  statementCount: number;
}

export interface ProjectScan {
  functions: Map<string, FunctionInfo>;
  externalCaps: Map<string, ExternalCapEntry>;
}

import type {
  FunctionDeclaration, ArrowFunction, FunctionExpression, MethodDeclaration,
} from "ts-morph";
export type FnNode = FunctionDeclaration | ArrowFunction | FunctionExpression | MethodDeclaration;
