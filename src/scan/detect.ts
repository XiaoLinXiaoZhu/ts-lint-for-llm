/**
 * 能力检测 + 类型推断 + 加权语句
 *
 * 纯 AST 操作函数——不涉及 I/O，不涉及调用图。
 */
import {
  SyntaxKind, Node,
  type FunctionDeclaration, type ArrowFunction,
  type FunctionExpression, type MethodDeclaration,
  type ParameterDeclaration,
} from "ts-morph";
import { VALID_CAPABILITY_NAMES, PROPAGATE_CAPS, type Capability } from "../capabilities.js";
import type { FnNode } from "./types.js";

// ── Capability parsing ──

/** @capability */
export function extractCapsFromSuffix(name: string): Set<Capability> | null {
  const parts = name.split("_");
  const caps = new Set<Capability>();
  let found = false;
  for (const part of parts) {
    if (VALID_CAPABILITY_NAMES.has(part as Capability)) {
      caps.add(part as Capability);
      found = true;
    }
  }
  return found ? caps : null;
}

/** @capability IO Impure */
export function extractCapsFromJSDoc(node: Node): { caps: Set<Capability>; found: boolean } {
  const jsDocs = getLeadingJSDoc(node);
  for (const text of jsDocs) {
    const match = text.match(/@capability(?:\s+(.+))?/);
    if (match) {
      const caps = new Set<Capability>();
      if (match[1]) {
        for (const word of match[1].trim().replace(/\*\/.*$/, "").trim().split(/[\s,]+/)) {
          if (VALID_CAPABILITY_NAMES.has(word as Capability)) caps.add(word as Capability);
        }
      }
      return { caps, found: true };
    }
  }
  return { caps: new Set(), found: false };
}

/** @capability IO Impure */
export function getLeadingJSDoc(node: Node): string[] {
  const results: string[] = [];
  for (const range of node.getLeadingCommentRanges()) results.push(range.getText());
  if (Node.isVariableDeclaration(node)) {
    const stmt = node.getVariableStatement();
    if (stmt) for (const range of stmt.getLeadingCommentRanges()) results.push(range.getText());
  }
  return results;
}

/** @capability IO Impure */
export function resolveCaps(name: string, node: Node): { caps: Set<Capability>; isDeclared: boolean } {
  const fromSuffix = extractCapsFromSuffix(name);
  if (fromSuffix) return { caps: fromSuffix, isDeclared: true };
  const fromJSDoc = extractCapsFromJSDoc(node);
  if (fromJSDoc.found) return { caps: fromJSDoc.caps, isDeclared: true };
  return { caps: new Set<Capability>(PROPAGATE_CAPS), isDeclared: false };
}

// ── Return type detection ──

/** @capability IO Impure */
export function checkReturnsAsync(node: FnNode): boolean {
  if (node.isAsync()) return true;
  const text = node.getReturnType().getText();
  return /^(Promise|AsyncIterable|AsyncGenerator|AsyncIterableIterator)</.test(text);
}

/** @capability IO Impure */
export function checkReturnsNullable(node: FnNode): boolean {
  return typeIsNullable(node.getReturnType());
}

/** @capability IO Impure */
export function typeIsNullable(type: import("ts-morph").Type): boolean {
  if (type.isNull() || type.isUndefined()) return true;
  if (type.isUnion()) return type.getUnionTypes().some(t => t.isNull() || t.isUndefined());
  for (const arg of type.getTypeArguments()) { if (typeIsNullable(arg)) return true; }
  return false;
}

// ── Mutable param detection ──

/** @capability IO Impure */
export function detectMutableParams(params: ParameterDeclaration[]): string[] {
  const result: string[] = [];
  for (const param of params) { if (isNonReadonlyRefParam(param)) result.push(param.getName()); }
  return result;
}

/** @capability IO Impure */
export function isNonReadonlyRefParam(param: ParameterDeclaration): boolean {
  const type = param.getType();
  if (isPrimitive(type)) return false;
  if (type.isUnion()) {
    return type.getUnionTypes().some(t => {
      if (!isRefType(t)) return false;
      return !t.getText().startsWith("Readonly<");
    });
  }
  if (type.getCallSignatures().length > 0 && !type.getProperties().length) return false;
  const typeNode = param.getTypeNode();
  if (typeNode) {
    const text = typeNode.getText();
    if (/^(readonly\s|Readonly<|ReadonlyArray<|ReadonlyMap<|ReadonlySet<)/.test(text)) return false;
    if (/^(Async)?(Iterable|Iterator|IterableIterator|Generator)</.test(text) || /^ReadableStream/.test(text)) return false;
  }
  return isRefType(type);
}

/** @capability IO Impure */
export function isPrimitive(type: import("ts-morph").Type): boolean {
  return type.isString() || type.isNumber() || type.isBoolean() ||
    type.isStringLiteral() || type.isNumberLiteral() || type.isBooleanLiteral() ||
    type.isUndefined() || type.isNull() || type.isVoid() || type.isEnum() || type.isEnumLiteral();
}

/** @capability IO Impure */
export function isRefType(type: import("ts-morph").Type): boolean {
  if (isPrimitive(type)) return false;
  if (type.isUnion()) return type.getUnionTypes().some(t => isRefType(t));
  return type.isObject() || type.isArray() || type.isInterface() || type.isIntersection();
}

// ── Weighted statements ──

const NESTING_KINDS = new Set([
  SyntaxKind.IfStatement, SyntaxKind.ForStatement, SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement, SyntaxKind.WhileStatement, SyntaxKind.DoStatement,
  SyntaxKind.SwitchStatement, SyntaxKind.TryStatement, SyntaxKind.CatchClause,
]);
const STATEMENT_KINDS = new Set([
  SyntaxKind.ExpressionStatement, SyntaxKind.VariableStatement, SyntaxKind.ReturnStatement,
  SyntaxKind.ThrowStatement,
  SyntaxKind.IfStatement, SyntaxKind.ForStatement, SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement, SyntaxKind.WhileStatement, SyntaxKind.DoStatement,
  SyntaxKind.SwitchStatement, SyntaxKind.TryStatement,
  SyntaxKind.BreakStatement, SyntaxKind.ContinueStatement,
]);
const BRANCH_KINDS = new Set([
  SyntaxKind.IfStatement, SyntaxKind.ForStatement, SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement, SyntaxKind.WhileStatement, SyntaxKind.DoStatement,
  SyntaxKind.CaseClause, SyntaxKind.CatchClause, SyntaxKind.ConditionalExpression,
]);

/** @capability IO Impure */
export function computeWeightedStatements(body: Node): { count: number; weighted: number } {
  let count = 0, weighted = 0;
  /** @capability */
  function walk(node: Node, depth: number) {
    const kind = node.getKind();
    if (STATEMENT_KINDS.has(kind)) {
      count++;
      weighted += 1 + depth + (BRANCH_KINDS.has(kind) ? 0.5 : 0);
    }
    node.forEachChild(child => walk(child, NESTING_KINDS.has(kind) ? depth + 1 : depth));
  }
  walk(body, 0);
  return { count, weighted: Math.round(weighted * 10) / 10 };
}
