/**
 * 调用图构建 — 扫描项目中所有函数，建立调用关系
 *
 * 每个函数用 filePath:offset 唯一标识。
 * 两次遍历：第一次发现所有函数声明，第二次解析调用关系。
 */

import { Project, SyntaxKind, Node, type SourceFile } from "ts-morph";
import type { Capability } from "./capabilities.js";
import { ASSERTION_PROPERTIES, type AssertionProperty } from "./capabilities.js";

export interface CallSite {
  targetId: string | null;    // 已解析：函数 ID；null = 未解析
  targetName: string;         // 裸函数名
  qualifiedName?: string;     // symbol.getFullyQualifiedName()
  line: number;
}

export interface Assertion {
  properties: AssertionProperty[];
  forbiddenCaps: Set<Capability>;
}

export interface FunctionInfo {
  id: string;
  name: string;
  filePath: string;
  line: number;
  calls: CallSite[];
  assertion: Assertion | null;
  // 从类型自动检测的能力
  autoDetected: Set<Capability>;
}

export interface ProjectGraph {
  functions: Map<string, FunctionInfo>;
}

export type FunctionNode =
  | import("ts-morph").FunctionDeclaration
  | import("ts-morph").ArrowFunction
  | import("ts-morph").FunctionExpression
  | import("ts-morph").MethodDeclaration;

export function buildGraph(tsConfigPath: string): ProjectGraph {
  const project = new Project({ tsConfigFilePath: tsConfigPath });
  const functions = new Map<string, FunctionInfo>();

  // Pass 1: discover all functions
  for (const sf of project.getSourceFiles()) {
    if (sf.getFilePath().includes("node_modules") || sf.getFilePath().endsWith(".cap.ts")) continue;
    discoverFunctions(sf, functions);
  }

  // Pass 2: resolve calls
  for (const sf of project.getSourceFiles()) {
    if (sf.getFilePath().includes("node_modules") || sf.getFilePath().endsWith(".cap.ts")) continue;
    resolveCalls(sf, functions);
  }

  // Pass 3: scan re-export assertions
  for (const sf of project.getSourceFiles()) {
    if (sf.getFilePath().includes("node_modules") || sf.getFilePath().endsWith(".cap.ts")) continue;
    scanReexportAssertions(sf, functions, project);
  }

  return { functions };
}

// ── Pass 1 ──

function discoverFunctions(sf: SourceFile, functions: Map<string, FunctionInfo>) {
  const filePath = sf.getFilePath();

  function register(name: string, fnNode: FunctionNode, posNode: Node) {
    const id = makeId(filePath, posNode.getStart());
    const assertion = parseAssertion(posNode) ?? parseAssertion(fnNode);
    const autoDetected = detectFromType(fnNode);

    functions.set(id, {
      id, name, filePath,
      line: posNode.getStartLineNumber(),
      calls: [],
      assertion,
      autoDetected,
    });
  }

  // Top-level function declarations
  for (const fn of sf.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;
    register(name, fn, fn);
  }

  // Variable declarations: const foo = () => {}
  for (const varDecl of sf.getVariableDeclarations()) {
    const init = varDecl.getInitializer();
    if (!init || (!Node.isArrowFunction(init) && !Node.isFunctionExpression(init))) continue;
    register(varDecl.getName(), init, varDecl);
  }

  // Class methods
  for (const cls of sf.getClasses()) {
    for (const method of cls.getMethods()) {
      register(method.getName(), method, method);
    }
  }

  // Nested functions and object literal methods
  sf.forEachDescendant(node => {
    if (Node.isFunctionDeclaration(node) && node.getName()) {
      const parent = node.getParent();
      if (parent && !Node.isSourceFile(parent)) register(node.getName()!, node, node);
    }
    if (Node.isMethodDeclaration(node) && node.getParent() && Node.isObjectLiteralExpression(node.getParent()!)) {
      register(node.getName(), node, node);
    }
    if (Node.isPropertyAssignment(node) && node.getParent() && Node.isObjectLiteralExpression(node.getParent()!)) {
      const init = node.getInitializer();
      if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
        register(node.getName(), init, node);
      }
    }
    if (Node.isVariableDeclaration(node)) {
      const init = node.getInitializer();
      if (!init || (!Node.isArrowFunction(init) && !Node.isFunctionExpression(init))) return;
      const stmt = node.getVariableStatement?.();
      if (!stmt) return;
      const parent = stmt.getParent();
      if (parent && !Node.isSourceFile(parent)) register(node.getName(), init, node);
    }
  });
}

// ── Pass 2 ──

function resolveCalls(sf: SourceFile, functions: Map<string, FunctionInfo>) {
  const filePath = sf.getFilePath();

  sf.forEachDescendant(node => {
    if (!Node.isCallExpression(node)) return;

    const owner = findOwner(node, filePath, functions);
    if (!owner) return;

    const expr = node.getExpression();
    const callName = getCallName(node);
    const line = node.getStartLineNumber();

    // Try to resolve via symbol
    try {
      const symbol = expr.getSymbol();
      if (symbol) {
        const qualifiedName = symbol.getFullyQualifiedName().replace(/^"[^"]*"\./, "");
        const decls = symbol.getDeclarations();
        if (decls.length > 0) {
          let decl = decls[0];
          // Follow imports
          if (Node.isImportSpecifier(decl)) {
            try {
              const moduleSf = decl.getImportDeclaration().getModuleSpecifierSourceFile();
              if (moduleSf) {
                const exported = moduleSf.getExportedDeclarations().get(decl.getName());
                if (exported && exported.length > 0) decl = exported[0];
              }
            } catch { /* fall through */ }
          }
          const declFile = decl.getSourceFile().getFilePath();
          if (!declFile.includes("node_modules") && !declFile.match(/\/typescript\/lib\//)) {
            const id = makeId(declFile, decl.getStart());
            if (functions.has(id)) {
              owner.calls.push({ targetId: id, targetName: callName ?? qualifiedName, qualifiedName, line });
              return;
            }
            // Variable declaration case
            if (Node.isVariableDeclaration(decl)) {
              const varId = makeId(declFile, decl.getStart());
              if (functions.has(varId)) {
                owner.calls.push({ targetId: varId, targetName: callName ?? qualifiedName, qualifiedName, line });
                return;
              }
            }
          }
        }
        owner.calls.push({ targetId: null, targetName: callName ?? qualifiedName, qualifiedName, line });
        return;
      }
    } catch { /* fall through */ }

    owner.calls.push({ targetId: null, targetName: callName ?? "unknown", line });
  });
}

// ── Helpers ──

function makeId(filePath: string, pos: number): string {
  return `${filePath}:${pos}`;
}

function getCallName(call: import("ts-morph").CallExpression): string | null {
  const expr = call.getExpression();
  if (Node.isIdentifier(expr)) return expr.getText();
  if (Node.isPropertyAccessExpression(expr)) return expr.getName();
  return null;
}

function findOwner(node: Node, filePath: string, functions: Map<string, FunctionInfo>): FunctionInfo | null {
  let current = node.getParent();
  while (current) {
    if (Node.isFunctionDeclaration(current) || Node.isArrowFunction(current) ||
        Node.isFunctionExpression(current) || Node.isMethodDeclaration(current)) {
      const id = makeId(filePath, current.getStart());
      const fn = functions.get(id);
      if (fn) return fn;
      const parent = current.getParent();
      if (parent && Node.isVariableDeclaration(parent)) {
        const varFn = functions.get(makeId(filePath, parent.getStart()));
        if (varFn) return varFn;
      }
      if (parent && Node.isPropertyAssignment(parent)) {
        const propFn = functions.get(makeId(filePath, parent.getStart()));
        if (propFn) return propFn;
      }
    }
    current = current.getParent();
  }
  return null;
}

function parseAssertion(node: Node): Assertion | null {
  const comments = getLeadingComments(node);
  for (const text of comments) {
    const match = text.match(/@assert\s+([^\n*]+)/);
    if (match) {
      const properties: AssertionProperty[] = [];
      const forbidden = new Set<Capability>();
      for (const word of match[1].trim().split(/[\s,]+/)) {
        const prop = word.toLowerCase() as AssertionProperty;
        if (prop in ASSERTION_PROPERTIES) {
          properties.push(prop);
          for (const cap of ASSERTION_PROPERTIES[prop]) forbidden.add(cap);
        }
      }
      if (properties.length > 0) return { properties, forbiddenCaps: forbidden };
    }
  }
  return null;
}

function detectFromType(fnNode: FunctionNode): Set<Capability> {
  const caps = new Set<Capability>();

  // Async detection
  if ("isAsync" in fnNode && fnNode.isAsync()) {
    caps.add("Async");
  } else {
    const returnText = fnNode.getReturnType().getText();
    if (/^(Promise|AsyncIterable|AsyncGenerator|AsyncIterableIterator)</.test(returnText)) {
      caps.add("Async");
    }
  }

  // Fallible: returns nullable
  const returnType = fnNode.getReturnType();
  if (typeIsNullable(returnType)) {
    caps.add("Fallible");
  }

  // Mutable: non-readonly reference params
  for (const param of fnNode.getParameters()) {
    if (isNonReadonlyRefParam(param)) {
      caps.add("Mutable");
      break;
    }
  }

  return caps;
}

function typeIsNullable(type: import("ts-morph").Type): boolean {
  if (type.isNull() || type.isUndefined()) return true;
  if (type.isUnion()) return type.getUnionTypes().some(t => t.isNull() || t.isUndefined());
  for (const arg of type.getTypeArguments()) {
    if (typeIsNullable(arg)) return true;
  }
  return false;
}

function isNonReadonlyRefParam(param: import("ts-morph").ParameterDeclaration): boolean {
  const type = param.getType();
  if (isPrimitive(type)) return false;
  if (type.getCallSignatures().length > 0 && !type.getProperties().length) return false;
  const typeNode = param.getTypeNode();
  if (typeNode) {
    const text = typeNode.getText();
    if (/^(readonly\s|Readonly<|ReadonlyArray<|ReadonlyMap<|ReadonlySet<)/.test(text)) return false;
    if (/^(Async)?(Iterable|Iterator|IterableIterator|Generator)</.test(text)) return false;
    if (/^ReadableStream/.test(text)) return false;
  }
  return isRefType(type);
}

function isPrimitive(type: import("ts-morph").Type): boolean {
  return type.isString() || type.isNumber() || type.isBoolean() ||
    type.isStringLiteral() || type.isNumberLiteral() || type.isBooleanLiteral() ||
    type.isUndefined() || type.isNull() || type.isVoid() || type.isEnum() || type.isEnumLiteral();
}

function isRefType(type: import("ts-morph").Type): boolean {
  if (isPrimitive(type)) return false;
  if (type.isUnion()) return type.getUnionTypes().some(t => isRefType(t));
  return type.isObject() || type.isArray() || type.isInterface() || type.isIntersection();
}

function getLeadingComments(node: Node): string[] {
  const results: string[] = [];
  for (const range of node.getLeadingCommentRanges()) results.push(range.getText());
  if (Node.isVariableDeclaration(node)) {
    const stmt = node.getVariableStatement?.();
    if (stmt) for (const range of stmt.getLeadingCommentRanges()) results.push(range.getText());
  }
  return results;
}

// ── Pass 3: re-export assertions ──

function scanReexportAssertions(sf: SourceFile, functions: Map<string, FunctionInfo>, project: Project) {
  for (const exportDecl of sf.getExportDeclarations()) {
    const assertion = parseAssertion(exportDecl);
    if (!assertion) continue;

    // Named exports: export { fn1, fn2 } from "./module"
    for (const namedExport of exportDecl.getNamedExports()) {
      const targetFn = resolveExportTarget(namedExport, functions);
      if (targetFn) {
        // Merge assertion (re-export assertion takes precedence if function has none)
        if (!targetFn.assertion) {
          targetFn.assertion = assertion;
        } else {
          // Combine: add any new forbidden caps
          for (const prop of assertion.properties) {
            if (!targetFn.assertion.properties.includes(prop)) {
              targetFn.assertion.properties.push(prop);
            }
          }
          for (const cap of assertion.forbiddenCaps) {
            targetFn.assertion.forbiddenCaps.add(cap);
          }
        }
      }
    }

    // Namespace export: export * from "./module" — apply to all exported functions from that module
    if (exportDecl.getNamedExports().length === 0 && exportDecl.getModuleSpecifier()) {
      const moduleSf = exportDecl.getModuleSpecifierSourceFile();
      if (!moduleSf) continue;
      const modulePath = moduleSf.getFilePath();
      for (const [, fn] of functions) {
        if (fn.filePath === modulePath) {
          if (!fn.assertion) {
            fn.assertion = { properties: [...assertion.properties], forbiddenCaps: new Set(assertion.forbiddenCaps) };
          } else {
            for (const prop of assertion.properties) {
              if (!fn.assertion.properties.includes(prop)) fn.assertion.properties.push(prop);
            }
            for (const cap of assertion.forbiddenCaps) fn.assertion.forbiddenCaps.add(cap);
          }
        }
      }
    }
  }
}

function resolveExportTarget(namedExport: import("ts-morph").ExportSpecifier, functions: Map<string, FunctionInfo>): FunctionInfo | null {
  try {
    const symbol = namedExport.getNameNode().getSymbol();
    if (!symbol) return null;
    const decls = symbol.getDeclarations();
    for (const decl of decls) {
      if (Node.isExportSpecifier(decl)) {
        // Follow the chain: get the local symbol
        const localSymbol = decl.getLocalTargetSymbol?.();
        if (localSymbol) {
          const localDecls = localSymbol.getDeclarations();
          for (const ld of localDecls) {
            const id = makeId(ld.getSourceFile().getFilePath(), ld.getStart());
            if (functions.has(id)) return functions.get(id)!;
          }
        }
        continue;
      }
      const sf = decl.getSourceFile();
      if (sf.getFilePath().includes("node_modules")) continue;
      const id = makeId(sf.getFilePath(), decl.getStart());
      if (functions.has(id)) return functions.get(id)!;
    }
  } catch { /* symbol resolution can fail for external modules */ }
  return null;
}
