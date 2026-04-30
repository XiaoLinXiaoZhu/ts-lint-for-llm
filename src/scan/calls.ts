/**
 * 调用解析 — 在已发现函数的 Map 中解析调用目标
 */
import { Node, type CallExpression } from "ts-morph";
import type { FunctionInfo } from "./types.js";

/** @capability */
export function makeFnId(filePath: string, pos: number): string {
  return `${filePath}:${pos}`;
}

/** @capability IO Impure */
export function resolveCallTarget(
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
        if (Node.isImportSpecifier(decl)) {
          try {
            const importDecl = decl.getImportDeclaration();
            const moduleSf = importDecl.getModuleSpecifierSourceFile();
            if (moduleSf) {
              const exportedSymbol = moduleSf.getExportedDeclarations().get(decl.getName());
              if (exportedSymbol && exportedSymbol.length > 0) decl = exportedSymbol[0];
            }
          } catch { /* fall through */ }
        }
        const sf = decl.getSourceFile();
        const filePath = sf.getFilePath();
        if (!filePath.includes("node_modules") && !filePath.match(/\/typescript\/lib\//)) {
          const pos = decl.getStart();
          const id = makeFnId(filePath, pos);
          if (functions.has(id)) return { id };
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

/** @capability IO Impure */
export function getCallName(call: CallExpression): string | null {
  const expr = call.getExpression();
  if (Node.isIdentifier(expr)) return expr.getText();
  if (Node.isPropertyAccessExpression(expr)) return expr.getName();
  return null;
}

/** @capability IO Impure */
export function findOwnerFunction(
  node: Node, filePath: string, functions: Map<string, FunctionInfo>,
): FunctionInfo | null {
  let current = node.getParent();
  while (current) {
    if (Node.isFunctionDeclaration(current) || Node.isArrowFunction(current) ||
        Node.isFunctionExpression(current) || Node.isMethodDeclaration(current)) {
      const pos = current.getStart();
      const id = makeFnId(filePath, pos);
      const fn = functions.get(id);
      if (fn) return fn;
      const parent = current.getParent();
      if (parent && Node.isVariableDeclaration(parent)) {
        const varId = makeFnId(filePath, parent.getStart());
        const varFn = functions.get(varId);
        if (varFn) return varFn;
      }
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
