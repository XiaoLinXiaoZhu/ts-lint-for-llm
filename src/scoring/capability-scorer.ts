/**
 * 能力负担评分器
 *
 * 逐行计算嵌套深度加权，按函数+能力聚合得分。
 * score = Σ weighted_lines(fn) for all fn carrying capability C
 */

import { ALL_CAPABILITIES, VALID_CAPABILITY_NAMES, type Capability } from "../capabilities.js";

interface ASTNode {
  type: string;
  loc?: { start: { line: number }; end: { line: number } };
  [key: string]: unknown;
}

const NESTING_TYPES = new Set([
  "IfStatement", "ForStatement", "ForInStatement", "ForOfStatement",
  "WhileStatement", "DoWhileStatement", "SwitchStatement",
  "TryStatement", "CatchClause",
]);

const COMPLEXITY_TYPES = new Set([
  "IfStatement", "ForStatement", "ForInStatement", "ForOfStatement",
  "WhileStatement", "DoWhileStatement", "SwitchCase", "CatchClause",
  "ConditionalExpression", "LogicalExpression",
]);

const FUNCTION_TYPES = new Set([
  "FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression",
]);

const CAP_SUFFIX = /_((?:IO|Async|Fallible|Mutable|Impure)(?:_(?:IO|Async|Fallible|Mutable|Impure))*)$/;
const JSDOC_CAP = /@capability(?:\s+(.*))?/;

function walkAST(node: ASTNode, visitor: (n: ASTNode) => void) {
  if (!node || typeof node !== "object") return;
  visitor(node);
  for (const key of Object.keys(node)) {
    if (key === "parent" || key === "loc" || key === "range") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof (item as ASTNode).type === "string") walkAST(item as ASTNode, visitor);
      }
    } else if (child && typeof (child as ASTNode).type === "string") {
      walkAST(child as ASTNode, visitor);
    }
  }
}

export interface FunctionScore {
  name: string;
  line: number;
  rawLines: number;
  weightedLines: number;
  caps: Capability[];
  declared: boolean;
}

export interface CapabilityResult {
  functions: FunctionScore[];
  capScores: Partial<Record<Capability, number>>;
  total: number;
}

export function scoreCapability(source: string, ast: ASTNode): CapabilityResult {
  const lines = source.split("\n");
  const totalLines = lines.length;

  const depths = new Array(totalLines + 1).fill(0);
  const branches = new Array(totalLines + 1).fill(false);
  walkAST(ast, (node) => {
    if (!node.loc) return;
    if (NESTING_TYPES.has(node.type)) {
      for (let l = node.loc.start.line; l <= node.loc.end.line; l++) depths[l]++;
    }
    if (COMPLEXITY_TYPES.has(node.type)) branches[node.loc.start.line] = true;
  });

  const lineWeights: number[] = [0];
  for (let i = 1; i <= totalLines; i++) {
    const trimmed = lines[i - 1].trim();
    const isEmpty = !trimmed || trimmed === "{" || trimmed === "}" || trimmed.startsWith("//");
    lineWeights.push(isEmpty ? 0 : 1 + depths[i] + (branches[i] ? 0.5 : 0));
  }

  const functions: FunctionScore[] = [];
  walkAST(ast, (node) => {
    if (!FUNCTION_TYPES.has(node.type) || !node.loc) return;
    let name: string | null = null;
    if (node.type === "FunctionDeclaration") {
      name = (node as any).id?.name ?? null;
    } else {
      const line = lines[node.loc.start.line - 1];
      const m = line.match(/(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
      if (m) name = m[1];
    }
    if (!name) return;

    const start = node.loc.start.line;
    const end = node.loc.end.line;

    const fromSuffix = name.match(CAP_SUFFIX);
    let caps: Capability[] = [];
    let declared = false;
    if (fromSuffix) {
      caps = fromSuffix[1].split("_").filter(c => VALID_CAPABILITY_NAMES.has(c as Capability)) as Capability[];
      declared = true;
    } else {
      for (let j = Math.max(0, start - 6); j < start - 1; j++) {
        const m = lines[j].match(JSDOC_CAP);
        if (m) {
          declared = true;
          if (m[1]) {
            const cleaned = m[1].replace(/\*\/.*$/, "").trim();
            if (cleaned) caps = cleaned.split(/[\s,]+/).filter(c => VALID_CAPABILITY_NAMES.has(c as Capability)) as Capability[];
          }
          break;
        }
      }
    }

    let rawLines = 0, weightedLines = 0;
    for (let i = start; i <= end; i++) {
      if (lineWeights[i] > 0) rawLines++;
      weightedLines += lineWeights[i];
    }

    functions.push({
      name, line: start, rawLines,
      weightedLines: Math.round(weightedLines * 10) / 10,
      caps: caps.sort() as Capability[], declared,
    });
  });

  const capScores: Partial<Record<Capability, number>> = {};
  for (const fn of functions) {
    const assignCaps = fn.declared ? fn.caps : ALL_CAPABILITIES;
    for (const c of assignCaps) {
      capScores[c] = (capScores[c] || 0) + fn.weightedLines;
    }
  }
  for (const k of Object.keys(capScores) as Capability[]) {
    capScores[k] = Math.round(capScores[k]! * 10) / 10;
  }
  const total = Math.round(Object.values(capScores).reduce((a, b) => a + (b || 0), 0) * 10) / 10;

  return { functions, capScores, total };
}
