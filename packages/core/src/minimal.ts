/**
 * 接口最小化检测 — 穿透参数分析
 *
 * 对每个函数的每个参数，判断它是否只被转发而从未被自身逻辑使用。
 *
 * 穿透定义：参数在函数体中的所有出现，都仅作为另一个 CallExpression 的实参。
 */

import { Node, SyntaxKind, type SourceFile, type ParameterDeclaration } from "ts-morph";
import type { FunctionNode } from "./graph.js";

export interface PassThroughParam {
  name: string;
  line: number;
  /** 该参数被转发给了哪些函数 */
  forwardedTo: Array<{ callee: string; line: number }>;
}

export interface MinimalViolation {
  functionName: string;
  filePath: string;
  line: number;
  passThroughParams: PassThroughParam[];
}

export interface MinimalResult {
  violations: MinimalViolation[];
}

/**
 * 扫描一个源文件中所有函数的穿透参数
 * @param onlyAsserted 为 true 时，只检查有 @assert minimal 的函数；false 时检查所有函数
 */
export function scanMinimal(sf: SourceFile, onlyAsserted: boolean): MinimalResult {
  const violations: MinimalViolation[] = [];

  // Collect all function-like nodes
  const fnNodes: Array<{ name: string; node: FunctionNode; posNode: Node }> = [];

  for (const fn of sf.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;
    fnNodes.push({ name, node: fn, posNode: fn });
  }

  for (const varDecl of sf.getVariableDeclarations()) {
    const init = varDecl.getInitializer();
    if (!init || (!Node.isArrowFunction(init) && !Node.isFunctionExpression(init))) continue;
    fnNodes.push({ name: varDecl.getName(), node: init, posNode: varDecl });
  }

  for (const cls of sf.getClasses()) {
    for (const method of cls.getMethods()) {
      fnNodes.push({ name: method.getName(), node: method, posNode: method });
    }
  }

  // Also scan object literal methods
  sf.forEachDescendant(node => {
    if (Node.isMethodDeclaration(node) && node.getParent() && Node.isObjectLiteralExpression(node.getParent()!)) {
      fnNodes.push({ name: node.getName(), node, posNode: node });
    }
    if (Node.isPropertyAssignment(node) && node.getParent() && Node.isObjectLiteralExpression(node.getParent()!)) {
      const init = node.getInitializer();
      if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
        fnNodes.push({ name: node.getName(), node: init, posNode: node });
      }
    }
  });

  for (const { name, node, posNode } of fnNodes) {
    if (onlyAsserted && !hasMinimalAssertion(posNode) && !hasMinimalAssertion(node)) continue;

    const params = node.getParameters();
    if (params.length === 0) continue;

    const passThroughParams = analyzeParams(params, node);
    if (passThroughParams.length > 0) {
      violations.push({
        functionName: name,
        filePath: sf.getFilePath(),
        line: posNode.getStartLineNumber(),
        passThroughParams,
      });
    }
  }

  return { violations };
}

function hasMinimalAssertion(node: Node): boolean {
  for (const range of node.getLeadingCommentRanges()) {
    const text = range.getText();
    if (/@assert\b/.test(text) && /\bminimal\b/.test(text)) return true;
  }
  // Check variable statement for variable declarations
  if (Node.isVariableDeclaration(node)) {
    const stmt = node.getVariableStatement?.();
    if (stmt) {
      for (const range of stmt.getLeadingCommentRanges()) {
        const text = range.getText();
        if (/@assert\b/.test(text) && /\bminimal\b/.test(text)) return true;
      }
    }
  }
  return false;
}

function analyzeParams(params: ParameterDeclaration[], fnNode: FunctionNode): PassThroughParam[] {
  const result: PassThroughParam[] = [];

  for (const param of params) {
    const paramName = param.getName();

    // Skip rest params and destructured params
    if (param.isRestParameter()) continue;
    if (param.getNameNode().getKind() === SyntaxKind.ObjectBindingPattern ||
        param.getNameNode().getKind() === SyntaxKind.ArrayBindingPattern) {
      // For destructured params, analyze individual bindings
      const bindings = analyzeDestructuredParam(param, fnNode);
      result.push(...bindings);
      continue;
    }

    const analysis = analyzeParamUsage(param, fnNode);
    if (analysis.isPassThrough) {
      result.push({
        name: paramName,
        line: param.getStartLineNumber(),
        forwardedTo: analysis.forwardedTo,
      });
    }
  }

  return result;
}

interface UsageAnalysis {
  isPassThrough: boolean;
  forwardedTo: Array<{ callee: string; line: number }>;
}

function analyzeParamUsage(param: ParameterDeclaration, fnNode: FunctionNode): UsageAnalysis {
  const forwardedTo: Array<{ callee: string; line: number }> = [];
  let hasNonForwardUse = false;

  const body = getBody(fnNode);
  if (!body) return { isPassThrough: false, forwardedTo: [] };

  const paramName = param.getName();
  const paramSymbol = param.getNameNode().getSymbol();
  if (!paramSymbol) return { isPassThrough: false, forwardedTo: [] };

  // Find all references to this param within the function body
  const refs = findRefsInBody(paramName, body);
  if (refs.length === 0) {
    // Completely unused — also a minimal violation but different from pass-through
    // We still report it as pass-through with empty forwardedTo
    return { isPassThrough: true, forwardedTo: [] };
  }

  for (const ref of refs) {
    const usage = classifyUsage(ref);
    if (usage.type === "call-arg") {
      forwardedTo.push({ callee: usage.callee, line: usage.line });
    } else {
      hasNonForwardUse = true;
      break;
    }
  }

  return { isPassThrough: !hasNonForwardUse, forwardedTo };
}

function analyzeDestructuredParam(param: ParameterDeclaration, fnNode: FunctionNode): PassThroughParam[] {
  // For destructured params like { model, temp, repeatPenalty }
  // check each binding element individually
  const result: PassThroughParam[] = [];
  const nameNode = param.getNameNode();
  if (!Node.isObjectBindingPattern(nameNode)) return result;

  const body = getBody(fnNode);
  if (!body) return result;

  for (const element of nameNode.getElements()) {
    const bindingName = element.getName();
    const refs = findRefsInBody(bindingName, body);

    if (refs.length === 0) {
      result.push({ name: bindingName, line: element.getStartLineNumber(), forwardedTo: [] });
      continue;
    }

    let hasNonForwardUse = false;
    const forwardedTo: Array<{ callee: string; line: number }> = [];

    for (const ref of refs) {
      const usage = classifyUsage(ref);
      if (usage.type === "call-arg") {
        forwardedTo.push({ callee: usage.callee, line: usage.line });
      } else {
        hasNonForwardUse = true;
        break;
      }
    }

    if (!hasNonForwardUse && forwardedTo.length > 0) {
      result.push({ name: bindingName, line: element.getStartLineNumber(), forwardedTo });
    }
  }

  return result;
}

type UsageClassification =
  | { type: "call-arg"; callee: string; line: number }
  | { type: "self-use" };

function classifyUsage(ref: Node): UsageClassification {
  // Walk up from the reference to find how it's used
  let current: Node = ref;
  let parent = current.getParent();

  while (parent) {
    // If we hit a property access on the param, keep going up
    // e.g., param.x — the "param" ref's parent is PropertyAccessExpression
    if (Node.isPropertyAccessExpression(parent) && parent.getExpression() === current) {
      current = parent;
      parent = current.getParent();
      continue;
    }

    // If we hit an element access, keep going up
    if (Node.isElementAccessExpression(parent) && parent.getExpression() === current) {
      current = parent;
      parent = current.getParent();
      continue;
    }

    // If we're a call argument
    if (Node.isCallExpression(parent)) {
      const args = parent.getArguments();
      if (args.some(arg => arg === current)) {
        const callee = getCalleeName(parent);
        return { type: "call-arg", callee, line: parent.getStartLineNumber() };
      }
      // We're the callee expression itself (param is being called) — self-use
      return { type: "self-use" };
    }

    // If we're in a spread within a call argument
    if (Node.isSpreadElement(parent)) {
      const grandParent = parent.getParent();
      if (grandParent && Node.isCallExpression(grandParent)) {
        const callee = getCalleeName(grandParent);
        return { type: "call-arg", callee, line: grandParent.getStartLineNumber() };
      }
    }

    // Any other parent means it's used by the function's own logic
    return { type: "self-use" };
  }

  return { type: "self-use" };
}

function getCalleeName(call: import("ts-morph").CallExpression): string {
  const expr = call.getExpression();
  if (Node.isIdentifier(expr)) return expr.getText();
  if (Node.isPropertyAccessExpression(expr)) return expr.getName();
  return expr.getText().slice(0, 30);
}

function findRefsInBody(name: string, body: Node): Node[] {
  const refs: Node[] = [];
  body.forEachDescendant(node => {
    if (Node.isIdentifier(node) && node.getText() === name) {
      // Make sure it's not a property name in an object literal or declaration
      const parent = node.getParent();
      if (parent && Node.isPropertyAssignment(parent) && parent.getNameNode() === node) return;
      if (parent && Node.isPropertyAccessExpression(parent) && parent.getNameNode() === node) return;
      if (parent && Node.isParameterDeclaration(parent)) return;
      if (parent && Node.isVariableDeclaration(parent) && parent.getNameNode() === node) return;
      refs.push(node);
    }
  });
  return refs;
}

function getBody(fnNode: FunctionNode): Node | undefined {
  if (Node.isArrowFunction(fnNode)) return fnNode.getBody();
  if (Node.isFunctionDeclaration(fnNode) || Node.isFunctionExpression(fnNode) || Node.isMethodDeclaration(fnNode)) {
    return fnNode.getBody();
  }
  return undefined;
}
