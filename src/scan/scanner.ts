/**
 * 项目扫描器入口
 *
 * 两次遍历源文件：
 *   Pass 1: 发现所有函数声明，解析能力
 *   Pass 2: 解析调用关系
 */
import {
  Project, SyntaxKind, Node,
  type SourceFile,
} from "ts-morph";
import { resolve } from "node:path";
import { loadCapFiles, type ExternalCapEntry } from "../cap-file.js";
import { VALID_CAPABILITY_NAMES, PROPAGATE_CAPS, type Capability } from "../capabilities.js";
import type { FunctionInfo, ProjectScan, FnNode } from "./types.js";
import { resolveCaps, checkReturnsAsync, checkReturnsNullable, detectMutableParams, computeWeightedStatements } from "./detect.js";
import { makeFnId, resolveCallTarget, findOwnerFunction } from "./calls.js";

// ── Project scan ──

/** @capability IO Impure */
export function scanProject(tsConfigPath: string): ProjectScan {
  const project = new Project({ tsConfigFilePath: tsConfigPath });
  const functions = new Map<string, FunctionInfo>();
  const capEntries = loadCapFiles(resolve(tsConfigPath, ".."));
  const externalCaps = new Map<string, ExternalCapEntry>();
  for (const entry of capEntries) externalCaps.set(entry.name, entry);
  if (capEntries.length > 0) {
    console.error(`[lm-linter] Loaded ${capEntries.length} external declarations from .cap.ts files`);
  }

  for (const sf of project.getSourceFiles()) {
    if (sf.getFilePath().includes("node_modules") || sf.getFilePath().endsWith(".cap.ts")) continue;
    scanFileDeclarations(sf, functions);
  }
  for (const sf of project.getSourceFiles()) {
    if (sf.getFilePath().includes("node_modules") || sf.getFilePath().endsWith(".cap.ts")) continue;
    resolveFileCalls(sf, functions);
  }

  return { functions, externalCaps };
}

// ── Pass 1: function discovery ──

/** @capability IO Impure */
function scanFileDeclarations(sf: SourceFile, functions: Map<string, FunctionInfo>) {
  const filePath = sf.getFilePath();

  /** @capability */
  function registerFn(name: string, capsNode: Node, fnNode: FnNode, bodyNode: Node | undefined, posNode: Node) {
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
    if (!init || (!Node.isArrowFunction(init) && !Node.isFunctionExpression(init))) continue;
    registerFn(varDecl.getName(), varDecl, init, init.getBody(), varDecl);
  }

  // Object literal methods and arrow-function properties
  sf.forEachDescendant(node => {
    if (Node.isMethodDeclaration(node) && node.getParent() && Node.isObjectLiteralExpression(node.getParent()!)) {
      registerFn(node.getName(), node, node, node.getBody(), node);
      return;
    }
    if (Node.isPropertyAssignment(node) && node.getParent() && Node.isObjectLiteralExpression(node.getParent()!)) {
      const init = node.getInitializer();
      if (!init || (!Node.isArrowFunction(init) && !Node.isFunctionExpression(init))) return;
      registerFn(node.getName(), node, init, init.getBody(), node);
    }
  });

  // Nested functions
  sf.forEachDescendant(node => {
    if (Node.isFunctionDeclaration(node) && node.getName()) {
      const parent = node.getParent();
      if (parent && !Node.isSourceFile(parent)) registerFn(node.getName()!, node, node, node.getBody(), node);
    }
    if (Node.isVariableDeclaration(node)) {
      const init = node.getInitializer();
      if (!init || (!Node.isArrowFunction(init) && !Node.isFunctionExpression(init))) return;
      const stmt = node.getVariableStatement();
      if (!stmt) return;
      const parent = stmt.getParent();
      if (parent && !Node.isSourceFile(parent)) registerFn(node.getName(), node, init, init.getBody(), node);
    }
  });

  // Class methods
  for (const cls of sf.getClasses()) {
    for (const method of cls.getMethods()) registerFn(method.getName(), method, method, method.getBody(), method);
  }
}

// ── Pass 2: call resolution ──

/** @capability IO Impure */
function resolveFileCalls(sf: SourceFile, functions: Map<string, FunctionInfo>) {
  const filePath = sf.getFilePath();
  sf.forEachDescendant(node => {
    if (!Node.isCallExpression(node)) return;
    const owner = findOwnerFunction(node, filePath, functions);
    if (!owner) return;
    const result = resolveCallTarget(node, functions);
    const callLine = node.getStartLineNumber();
    if ("id" in result) {
      owner.resolvedCalls.push({ target: result.id, line: callLine });
    } else {
      owner.unresolvedCalls.push({ target: result.name, qualifiedName: result.qualifiedName, line: callLine });
    }
  });
}
