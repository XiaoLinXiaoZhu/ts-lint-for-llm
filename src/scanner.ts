/**
 * 项目扫描器
 *
 * 函数 ID = filePath:pos（声明节点的 getStart()）
 * 调用解析走 symbol → declaration → pos
 */

import {
  Project, SyntaxKind, Node,
  type SourceFile, type FunctionDeclaration, type ArrowFunction,
  type FunctionExpression, type MethodDeclaration,
  type CallExpression, type ParameterDeclaration,
} from "ts-morph";
import { resolve } from "node:path";
import { loadCapFiles, type ExternalCapEntry } from "./cap-file.js";
import { VALID_CAPABILITY_NAMES, PROPAGATE_CAPS, type Capability } from "./capabilities.js";

// ── Types ──

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

// ── Capability parsing ──

function extractCapsFromSuffix(name: string): Set<Capability> | null {
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

function extractCapsFromJSDoc(node: Node): { caps: Set<Capability>; found: boolean } {
  const jsDocs = getLeadingJSDoc(node);
  for (const text of jsDocs) {
    const match = text.match(/@capability(?:\s+(.+))?/);
    if (match) {
      const caps = new Set<Capability>();
      if (match[1]) {
        for (const word of match[1].trim().replace(/\*\/.*$/, "").trim().split(/[\s,]+/)) {
          if (VALID_CAPABILITY_NAMES.has(word as Capability)) {
            caps.add(word as Capability);
          }
        }
      }
      return { caps, found: true };
    }
  }
  return { caps: new Set(), found: false };
}

function getLeadingJSDoc(node: Node): string[] {
  const results: string[] = [];
  for (const range of node.getLeadingCommentRanges()) {
    results.push(range.getText());
  }
  if (Node.isVariableDeclaration(node)) {
    const stmt = node.getVariableStatement();
    if (stmt) {
      for (const range of stmt.getLeadingCommentRanges()) {
        results.push(range.getText());
      }
    }
  }
  return results;
}

function resolveCaps(name: string, node: Node): { caps: Set<Capability>; isDeclared: boolean } {
  const fromSuffix = extractCapsFromSuffix(name);
  if (fromSuffix) return { caps: fromSuffix, isDeclared: true };
  const fromJSDoc = extractCapsFromJSDoc(node);
  if (fromJSDoc.found) return { caps: fromJSDoc.caps, isDeclared: true };
  return { caps: new Set<Capability>(PROPAGATE_CAPS), isDeclared: false };
}

// ── Return type detection ──

type FnNode = FunctionDeclaration | ArrowFunction | FunctionExpression | MethodDeclaration;

function checkReturnsAsync(node: FnNode): boolean {
  if (node.isAsync()) return true;
  const text = node.getReturnType().getText();
  return /^(Promise|AsyncIterable|AsyncGenerator|AsyncIterableIterator)</.test(text);
}

function checkReturnsNullable(node: FnNode): boolean {
  return typeIsNullable(node.getReturnType());
}

function typeIsNullable(type: import("ts-morph").Type): boolean {
  if (type.isNull() || type.isUndefined()) return true;
  if (type.isUnion()) {
    return type.getUnionTypes().some(t => t.isNull() || t.isUndefined());
  }
  for (const arg of type.getTypeArguments()) {
    if (typeIsNullable(arg)) return true;
  }
  return false;
}

// ── Mutable param detection ──

function detectMutableParams(params: ParameterDeclaration[]): string[] {
  const result: string[] = [];
  for (const param of params) {
    if (isNonReadonlyRefParam(param)) result.push(param.getName());
  }
  return result;
}

function isNonReadonlyRefParam(param: ParameterDeclaration): boolean {
  const type = param.getType();
  if (isPrimitive(type)) return false;

  if (type.isUnion()) {
    return type.getUnionTypes().some(t => {
      if (!isRefType(t)) return false;
      return !t.getText().startsWith("Readonly<");
    });
  }

  if (type.getCallSignatures().length > 0 && !type.getProperties().length) {
    return false;
  }

  const typeNode = param.getTypeNode();
  if (typeNode) {
    const text = typeNode.getText();
    if (/^(readonly\s|Readonly<|ReadonlyArray<|ReadonlyMap<|ReadonlySet<)/.test(text)) return false;
    if (/^(Async)?(Iterable|Iterator|IterableIterator|Generator)</.test(text) ||
        /^ReadableStream/.test(text)) return false;
  }

  return isRefType(type);
}

function isPrimitive(type: import("ts-morph").Type): boolean {
  return type.isString() || type.isNumber() || type.isBoolean() ||
    type.isStringLiteral() || type.isNumberLiteral() || type.isBooleanLiteral() ||
    type.isUndefined() || type.isNull() || type.isVoid() ||
    type.isEnum() || type.isEnumLiteral();
}

function isRefType(type: import("ts-morph").Type): boolean {
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
  SyntaxKind.CaseClause, SyntaxKind.CatchClause,
  SyntaxKind.ConditionalExpression,
]);

function computeWeightedStatements(body: Node): { count: number; weighted: number } {
  let count = 0;
  let weighted = 0;

  function walk(node: Node, depth: number) {
    const kind = node.getKind();
    if (STATEMENT_KINDS.has(kind)) {
      count++;
      const branchBonus = BRANCH_KINDS.has(kind) ? 0.5 : 0;
      weighted += 1 + depth + branchBonus;
    }
    const newDepth = NESTING_KINDS.has(kind) ? depth + 1 : depth;
    node.forEachChild(child => walk(child, newDepth));
  }

  walk(body, 0);
  return { count, weighted: Math.round(weighted * 10) / 10 };
}

// ── Call resolution ──

function makeFnId(filePath: string, pos: number): string {
  return `${filePath}:${pos}`;
}

function resolveCallTarget(
  call: CallExpression,
  functions: Map<string, FunctionInfo>,
): { id: string } | { unresolved: true; name: string; qualifiedName?: string } {
  const expr = call.getExpression();
  const callName = getCallName(call);

  try {
    const symbol = expr.getSymbol();
    if (symbol) {
      const qualifiedName = symbol.getFullyQualifiedName().replace(/^"[^"]*"\./, "");
      const decls = symbol.getDeclarations();
      if (decls.length > 0) {
        let decl = decls[0];

        // ImportSpecifier → trace to source export
        if (Node.isImportSpecifier(decl)) {
          try {
            const importDecl = decl.getImportDeclaration();
            const moduleSf = importDecl.getModuleSpecifierSourceFile();
            if (moduleSf) {
              const exportedSymbol = moduleSf.getExportedDeclarations().get(decl.getName());
              if (exportedSymbol && exportedSymbol.length > 0) {
                decl = exportedSymbol[0];
              }
            }
          } catch { /* fall through to pos-based check */ }
        }

        const sf = decl.getSourceFile();
        const filePath = sf.getFilePath();

        // Skip node_modules / lib declarations
        if (!filePath.includes("node_modules") && !filePath.match(/\/typescript\/lib\//)) {
          const pos = decl.getStart();
          const id = makeFnId(filePath, pos);
          if (functions.has(id)) return { id };

          // For variable declarations, the function info uses the variable's start
          // but the exported declaration might be the initializer (arrow fn)
          if (Node.isVariableDeclaration(decl)) {
            const varId = makeFnId(filePath, decl.getStart());
            if (functions.has(varId)) return { id: varId };
          }
        }
      }
      return { unresolved: true, name: callName ?? qualifiedName, qualifiedName };
    }
  } catch { /* fall through */ }

  return { unresolved: true, name: callName ?? "unknown" };
}

function getCallName(call: CallExpression): string | null {
  const expr = call.getExpression();
  if (Node.isIdentifier(expr)) return expr.getText();
  if (Node.isPropertyAccessExpression(expr)) return expr.getName();
  return null;
}

function findOwnerFunction(
  node: Node,
  filePath: string,
  functions: Map<string, FunctionInfo>,
): FunctionInfo | null {
  let current = node.getParent();
  while (current) {
    if (Node.isFunctionDeclaration(current) ||
        Node.isArrowFunction(current) ||
        Node.isFunctionExpression(current) ||
        Node.isMethodDeclaration(current)) {
      const pos = current.getStart();
      const id = makeFnId(filePath, pos);
      const fn = functions.get(id);
      if (fn) return fn;

      // For arrow/function expression inside VariableDeclaration
      const parent = current.getParent();
      if (parent && Node.isVariableDeclaration(parent)) {
        const varId = makeFnId(filePath, parent.getStart());
        const varFn = functions.get(varId);
        if (varFn) return varFn;
      }
      // For arrow/function expression inside PropertyAssignment
      if (parent && Node.isPropertyAssignment(parent)) {
        const propId = makeFnId(filePath, parent.getStart());
        const propFn = functions.get(propId);
        if (propFn) return propFn;
      }
    }
    current = current.getParent();
  }
  return null;
}

// ── Project scan ──

export function scanProject(tsConfigPath: string): ProjectScan {
  const project = new Project({ tsConfigFilePath: tsConfigPath });
  const functions = new Map<string, FunctionInfo>();
  const capEntries = loadCapFiles(resolve(tsConfigPath, ".."));
  const externalCaps = new Map<string, ExternalCapEntry>();
  for (const entry of capEntries) {
    externalCaps.set(entry.name, entry);
  }
  if (capEntries.length > 0) {
    console.error(`[capability-lint] Loaded ${capEntries.length} external declarations from .cap.ts files`);
  }

  // Pass 1: collect all function declarations
  for (const sf of project.getSourceFiles()) {
    if (sf.getFilePath().includes("node_modules") || sf.getFilePath().endsWith(".cap.ts")) continue;
    scanFileDeclarations(sf, functions);
  }

  // Pass 2: resolve calls
  for (const sf of project.getSourceFiles()) {
    if (sf.getFilePath().includes("node_modules") || sf.getFilePath().endsWith(".cap.ts")) continue;
    resolveFileCalls(sf, functions);
  }

  return { functions, externalCaps };
}

function scanFileDeclarations(sf: SourceFile, functions: Map<string, FunctionInfo>) {
  const filePath = sf.getFilePath();

  function registerFn(
    name: string,
    capsNode: Node,
    fnNode: FnNode,
    bodyNode: Node | undefined,
    posNode: Node,
  ) {
    const pos = posNode.getStart();
    const id = makeFnId(filePath, pos);
    const { caps, isDeclared } = resolveCaps(name, capsNode);
    const { count, weighted } = bodyNode ? computeWeightedStatements(bodyNode) : { count: 0, weighted: 0 };
    functions.set(id, {
      id, name, filePath, line: posNode.getStartLineNumber(),
      declaredCaps: caps, isDeclared,
      returnsAsync: checkReturnsAsync(fnNode),
      returnsNullable: checkReturnsNullable(fnNode),
      mutableParams: detectMutableParams(fnNode.getParameters()),
      resolvedCalls: [], unresolvedCalls: [],
      weightedStatements: weighted, statementCount: count,
    });
  }

  // Top-level function declarations
  for (const fn of sf.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;
    registerFn(name, fn, fn, fn.getBody(), fn);
  }

  // Variable declarations with arrow/function expression
  for (const varDecl of sf.getVariableDeclarations()) {
    const init = varDecl.getInitializer();
    if (!init) continue;
    if (!Node.isArrowFunction(init) && !Node.isFunctionExpression(init)) continue;
    const name = varDecl.getName();
    registerFn(name, varDecl, init, init.getBody(), varDecl);
  }

  // Object literal methods and arrow-function properties
  sf.forEachDescendant(node => {
    if (Node.isMethodDeclaration(node) && node.getParent() && Node.isObjectLiteralExpression(node.getParent()!)) {
      const name = node.getName();
      registerFn(name, node, node, node.getBody(), node);
      return;
    }
    if (Node.isPropertyAssignment(node) && node.getParent() && Node.isObjectLiteralExpression(node.getParent()!)) {
      const init = node.getInitializer();
      if (!init || (!Node.isArrowFunction(init) && !Node.isFunctionExpression(init))) return;
      const name = node.getName();
      registerFn(name, node, init, init.getBody(), node);
      return;
    }
  });

  // Class methods
  for (const cls of sf.getClasses()) {
    for (const method of cls.getMethods()) {
      const name = method.getName();
      registerFn(name, method, method, method.getBody(), method);
    }
  }
}

function resolveFileCalls(sf: SourceFile, functions: Map<string, FunctionInfo>) {
  const filePath = sf.getFilePath();

  sf.forEachDescendant(node => {
    if (!Node.isCallExpression(node)) return;

    const owner = findOwnerFunction(node, filePath, functions);
    if (!owner) return;

    const result = resolveCallTarget(node, functions);
    const callLine = node.getStartLineNumber();

    if ("id" in result) {
      if (!owner.resolvedCalls.some(c => c.target === result.id)) {
        owner.resolvedCalls.push({ target: result.id, line: callLine });
      }
    } else {
      if (!owner.unresolvedCalls.some(c => c.target === result.name)) {
        owner.unresolvedCalls.push({
          target: result.name,
          qualifiedName: result.qualifiedName,
          line: callLine,
        });
      }
    }
  });
}
