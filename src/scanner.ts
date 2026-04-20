/**
 * 项目扫描器
 *
 * 使用 ts-morph 加载整个 TypeScript 项目，提取每个函数的：
 * - @capability 声明（JSDoc / 后缀命名）
 * - 返回类型特征（async / nullable）
 * - 函数体内的所有调用（含跨文件解析）
 */

import { Project, SyntaxKind, Node, type SourceFile, type FunctionDeclaration, type ArrowFunction, type FunctionExpression, type VariableDeclaration, type CallExpression } from "ts-morph";
import { VALID_CAPABILITY_NAMES, ALL_CAPABILITIES, type Capability } from "./capabilities.js";

// ── 类型 ──

export interface FunctionInfo {
  /** 全局唯一 ID: filePath#name 或 filePath#anonymous_line */
  id: string;
  name: string;
  filePath: string;
  line: number;
  /** 声明的能力 */
  declaredCaps: Set<Capability>;
  /** 是否有显式声明（@capability 或后缀命名） */
  isDeclared: boolean;
  /** 返回类型是否含 Promise/AsyncIterable */
  returnsAsync: boolean;
  /** 返回类型是否含 null/undefined */
  returnsNullable: boolean;
  /** 函数体内调用的函数 ID 列表（已解析的）+ 未解析的方法名列表 */
  resolvedCalls: string[];
  unresolvedCalls: string[];
  /** 加权语句数（用于评分） */
  weightedStatements: number;
  statementCount: number;
}

export interface ProjectScan {
  functions: Map<string, FunctionInfo>;
  /** 按函数名索引（可能一对多） */
  byName: Map<string, FunctionInfo[]>;
}

// ── 能力解析 ──

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
  // 对于 variable declaration 里的箭头函数，也检查 variable statement 的注释
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
  return { caps: new Set(ALL_CAPABILITIES), isDeclared: false };
}

// ── 返回类型检测 ──

function checkReturnsAsync(node: FunctionDeclaration | ArrowFunction | FunctionExpression): boolean {
  if (node.isAsync()) return true;
  const retType = node.getReturnType();
  const text = retType.getText();
  return /^(Promise|AsyncIterable|AsyncGenerator|AsyncIterableIterator)</.test(text);
}

function checkReturnsNullable(node: FunctionDeclaration | ArrowFunction | FunctionExpression): boolean {
  const retType = node.getReturnType();
  if (retType.isNull() || retType.isUndefined()) return true;
  if (retType.isUnion()) {
    return retType.getUnionTypes().some(t => t.isNull() || t.isUndefined());
  }
  return false;
}

// ── 语句权重计算 ──

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
  SyntaxKind.ConditionalExpression, SyntaxKind.BinaryExpression,
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

// ── 调用解析 ──

function resolveCallTarget(call: CallExpression, functionMap: Map<string, FunctionInfo[]>): string | null {
  const expr = call.getExpression();

  // 尝试通过 ts-morph 的类型系统解析到定义处
  try {
    const symbol = expr.getSymbol();
    if (symbol) {
      const decls = symbol.getDeclarations();
      for (const decl of decls) {
        const sf = decl.getSourceFile();
        const filePath = sf.getFilePath();
        let name: string | null = null;

        if (Node.isFunctionDeclaration(decl)) {
          name = decl.getName() ?? null;
        } else if (Node.isVariableDeclaration(decl)) {
          name = decl.getName();
        } else if (Node.isMethodDeclaration(decl) || Node.isMethodSignature(decl)) {
          name = decl.getName();
        } else if (Node.isParameterDeclaration(decl)) {
          name = decl.getName();
        } else if (Node.isImportSpecifier(decl)) {
          // 追踪 import { X } from "..." 到源定义
          const importedName = decl.getName();
          try {
            const importDecl = decl.getImportDeclaration();
            const moduleSourceFile = importDecl.getModuleSpecifierSourceFile();
            if (moduleSourceFile) {
              const sourceFilePath = moduleSourceFile.getFilePath();
              const id = `${sourceFilePath}#${importedName}`;
              if (functionMap.has(importedName)) {
                const matches = functionMap.get(importedName)!;
                const exact = matches.find(f => f.filePath === sourceFilePath);
                if (exact) return exact.id;
              }
            }
          } catch {}
          // fallback: 按名字匹配
          name = importedName;
        }

        if (name) {
          const id = `${filePath}#${name}`;
          if (functionMap.has(name)) {
            const matches = functionMap.get(name)!;
            // 精确匹配文件路径
            const exact = matches.find(f => f.filePath === filePath);
            if (exact) return exact.id;
            // 退而求其次：同名函数（跨文件）
            return matches[0].id;
          }
        }
      }
    }
  } catch {
    // 类型解析失败，回退到名字匹配
  }

  return null;
}

function getCallName(call: CallExpression): string | null {
  const expr = call.getExpression();
  if (Node.isIdentifier(expr)) return expr.getText();
  if (Node.isPropertyAccessExpression(expr)) return expr.getName();
  return null;
}

// ── 项目扫描 ──

export function scanProject(tsConfigPath: string): ProjectScan {
  const project = new Project({ tsConfigFilePath: tsConfigPath });
  const functions = new Map<string, FunctionInfo>();
  const byName = new Map<string, FunctionInfo[]>();

  function register(info: FunctionInfo) {
    functions.set(info.id, info);
    const list = byName.get(info.name) || [];
    list.push(info);
    byName.set(info.name, list);
  }

  // 第一遍：收集所有函数声明
  for (const sf of project.getSourceFiles()) {
    if (sf.getFilePath().includes("node_modules")) continue;
    scanFileDeclarations(sf, register);
  }

  // 第二遍：解析调用目标
  for (const sf of project.getSourceFiles()) {
    if (sf.getFilePath().includes("node_modules")) continue;
    resolveFileCalls(sf, functions, byName);
  }

  return { functions, byName };
}

function scanFileDeclarations(sf: SourceFile, register: (info: FunctionInfo) => void) {
  const filePath = sf.getFilePath();

  // 顶层 function declarations
  for (const fn of sf.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;
    const { caps, isDeclared } = resolveCaps(name, fn);
    const body = fn.getBody();
    const { count, weighted } = body ? computeWeightedStatements(body) : { count: 0, weighted: 0 };

    register({
      id: `${filePath}#${name}`,
      name, filePath,
      line: fn.getStartLineNumber(),
      declaredCaps: caps, isDeclared,
      returnsAsync: checkReturnsAsync(fn),
      returnsNullable: checkReturnsNullable(fn),
      resolvedCalls: [], unresolvedCalls: [],
      weightedStatements: weighted, statementCount: count,
    });
  }

  // variable declarations with arrow/function expression
  for (const varDecl of sf.getVariableDeclarations()) {
    const init = varDecl.getInitializer();
    if (!init) continue;
    if (!Node.isArrowFunction(init) && !Node.isFunctionExpression(init)) continue;

    const name = varDecl.getName();
    const { caps, isDeclared } = resolveCaps(name, varDecl);
    const body = init.getBody();
    const { count, weighted } = body ? computeWeightedStatements(body) : { count: 0, weighted: 0 };

    register({
      id: `${filePath}#${name}`,
      name, filePath,
      line: varDecl.getStartLineNumber(),
      declaredCaps: caps, isDeclared,
      returnsAsync: checkReturnsAsync(init),
      returnsNullable: checkReturnsNullable(init),
      resolvedCalls: [], unresolvedCalls: [],
      weightedStatements: weighted, statementCount: count,
    });
  }
}

function resolveFileCalls(sf: SourceFile, functions: Map<string, FunctionInfo>, byName: Map<string, FunctionInfo[]>) {
  const filePath = sf.getFilePath();

  // 遍历所有函数体内的 CallExpression
  sf.forEachDescendant(node => {
    if (!Node.isCallExpression(node)) return;

    // 找到所属函数
    const ownerFn = node.getFirstAncestor(ancestor =>
      Node.isFunctionDeclaration(ancestor) ||
      Node.isArrowFunction(ancestor) ||
      Node.isFunctionExpression(ancestor)
    );
    if (!ownerFn) return;

    let ownerName: string | null = null;
    if (Node.isFunctionDeclaration(ownerFn)) {
      ownerName = ownerFn.getName() ?? null;
    } else if (ownerFn.getParent() && Node.isVariableDeclaration(ownerFn.getParent()!)) {
      ownerName = (ownerFn.getParent() as VariableDeclaration).getName();
    }
    if (!ownerName) return;

    const ownerId = `${filePath}#${ownerName}`;
    const owner = functions.get(ownerId);
    if (!owner) return;

    // 解析调用目标
    const resolved = resolveCallTarget(node, byName);
    if (resolved) {
      if (!owner.resolvedCalls.includes(resolved)) {
        owner.resolvedCalls.push(resolved);
      }
    } else {
      const callName = getCallName(node);
      if (callName && !owner.unresolvedCalls.includes(callName)) {
        owner.unresolvedCalls.push(callName);
      }
    }
  });
}
