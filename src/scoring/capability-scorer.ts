/**
 * 能力负担评分器
 *
 * 基于 AST 语句节点计数，按函数+能力聚合得分。
 * score = Σ weighted_statements(fn) × capability_count(fn)
 *
 * 每个语句节点的权重 = 1 + nesting_depth + (is_branch ? 0.5 : 0)
 * 使用 AST 语句而非物理行，消除代码压行对评分的影响。
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

// 每个语句节点计为一个计分单元
const STATEMENT_TYPES = new Set([
  "ExpressionStatement", "VariableDeclaration", "ReturnStatement",
  "ThrowStatement",
  "IfStatement", "ForStatement", "ForInStatement", "ForOfStatement",
  "WhileStatement", "DoWhileStatement", "SwitchStatement",
  "BreakStatement", "ContinueStatement", "TryStatement",
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

/** 遍历函数体，按 AST 语句节点计算加权总量 */
function computeWeightedStatements(funcBody: ASTNode): { count: number; weighted: number } {
  let count = 0;
  let weighted = 0;

  function walk(node: ASTNode, nestDepth: number) {
    if (!node || typeof node !== "object") return;

    if (STATEMENT_TYPES.has(node.type)) {
      count++;
      const branchBonus = COMPLEXITY_TYPES.has(node.type) ? 0.5 : 0;
      weighted += 1 + nestDepth + branchBonus;
    }

    const newDepth = NESTING_TYPES.has(node.type) ? nestDepth + 1 : nestDepth;

    for (const key of Object.keys(node)) {
      if (key === "parent" || key === "loc" || key === "range") continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof (item as ASTNode).type === "string") {
            walk(item as ASTNode, newDepth);
          }
        }
      } else if (child && typeof (child as ASTNode).type === "string") {
        walk(child as ASTNode, newDepth);
      }
    }
  }

  walk(funcBody, 0);
  return { count, weighted };
}

export interface FunctionScore {
  name: string;
  line: number;
  statements: number;
  weightedStatements: number;
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

    const body = (node as any).body;
    const { count, weighted } = body ? computeWeightedStatements(body) : { count: 0, weighted: 0 };

    functions.push({
      name, line: start,
      statements: count,
      weightedStatements: Math.round(weighted * 10) / 10,
      caps: caps.sort() as Capability[], declared,
    });
  });

  const capScores: Partial<Record<Capability, number>> = {};
  for (const fn of functions) {
    const assignCaps = fn.declared ? fn.caps : ALL_CAPABILITIES;
    for (const c of assignCaps) {
      capScores[c] = (capScores[c] || 0) + fn.weightedStatements;
    }
  }
  for (const k of Object.keys(capScores) as Capability[]) {
    capScores[k] = Math.round(capScores[k]! * 10) / 10;
  }
  const total = Math.round(Object.values(capScores).reduce((a, b) => a + (b || 0), 0) * 10) / 10;

  return { functions, capScores, total };
}
