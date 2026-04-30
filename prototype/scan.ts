/**
 * 共享扫描器 — 为原型生成调用图 + 能力数据
 *
 * 输出 scan-result.json，包含：
 *   functions: 所有函数及其能力
 *   edges:     调用边（含屏障标记）
 *
 * Usage: bun prototype/scan.ts
 */

import { Project, SyntaxKind, Node } from "ts-morph";
import { resolve, relative, dirname, join } from "node:path";
import { writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";

// ── Types ──

const CAPS = ["IO","Impure","Fallible","Async","Mutable","HandleFallible","HandleAsync","HandleMutable"] as const;
type Cap = typeof CAPS[number];

interface FuncNode {
  id: string;
  name: string;
  filePath: string;
  pkg: string;
  line: number;
  declaredCaps: Cap[];
  effectiveCaps: Cap[];  // after auto-detect
  isDeclared: boolean;
  weightedStatements: number;
  statementCount: number;
}

interface CallEdge {
  from: string;
  to: string | null;       // null = unresolved
  targetName: string;
  qualifiedName?: string;
  line: number;
  isResolved: boolean;
  // barrier flags
  isDIBarrier: boolean;
  isCrossPackage: boolean;
  isTypeOnly: boolean;
}

interface CapEntry {
  name: string;
  caps: Cap[];
}

// ── Config ──

const TSCONFIG = "E:/_Project/QQBot/ChatFrame-v11/tsconfig.json";
const ROOT = resolve(dirname(TSCONFIG));
const OUT = "prototype/scan-result.json";

// ── Helpers ──

function extractPkg(filePath: string): string {
  const rel = relative(ROOT, filePath).replace(/\\/g, "/");
  const parts = rel.split("/");
  if (parts[0] === "packages" || parts[0] === "apps") {
    return parts.slice(0, 2).join("/"); // e.g., "packages/core"
  }
  return parts[0] || "(root)";
}

// ── Capability detection ──

function extractCapsFromSuffix(name: string): Cap[] | null {
  const parts = name.split("_");
  const caps: Cap[] = [];
  let found = false;
  for (const part of parts) {
    if ((CAPS as readonly string[]).includes(part)) {
      caps.push(part as Cap);
      found = true;
    }
  }
  return found ? caps : null;
}

function extractCapsFromJSDoc(node: Node): { caps: Cap[]; found: boolean } {
  const texts: string[] = [];
  for (const range of node.getLeadingCommentRanges()) {
    texts.push(range.getText());
  }
  if (Node.isVariableDeclaration(node)) {
    const stmt = node.getVariableStatement();
    if (stmt) {
      for (const range of stmt.getLeadingCommentRanges()) {
        texts.push(range.getText());
      }
    }
  }
  for (const text of texts) {
    const match = text.match(/@capability(?:\s+(.+))?/);
    if (match) {
      const caps: Cap[] = [];
      if (match[1]) {
        for (const word of match[1].trim().replace(/\*\/.*$/, "").trim().split(/[\s,]+/)) {
          if ((CAPS as readonly string[]).includes(word)) caps.push(word as Cap);
        }
      }
      return { caps, found: true };
    }
  }
  return { caps: [], found: false };
}

function resolveCaps(name: string, node: Node): { caps: Cap[]; isDeclared: boolean } {
  const fromSuffix = extractCapsFromSuffix(name);
  if (fromSuffix) return { caps: fromSuffix, isDeclared: true };
  const fromJSDoc = extractCapsFromJSDoc(node);
  if (fromJSDoc.found) return { caps: fromJSDoc.caps, isDeclared: true };
  // undeclared → assume all propagate caps
  return { caps: ["IO","Impure","Fallible","Async","Mutable"], isDeclared: false };
}

// ── Auto-detect ──

type FnNode = import("ts-morph").FunctionDeclaration | import("ts-morph").ArrowFunction |
              import("ts-morph").FunctionExpression | import("ts-morph").MethodDeclaration;

function autoDetect(fn: FnNode): Cap[] {
  const extra: Cap[] = [];
  if (fn.isAsync()) extra.push("Async");
  const retText = fn.getReturnType().getText();
  if (/^Promise/.test(retText)) extra.push("Async");
  if (typeIsNullable(fn.getReturnType())) extra.push("Fallible");
  if (detectMutableParams(fn.getParameters())) extra.push("Mutable");
  return extra;
}

function typeIsNullable(type: import("ts-morph").Type): boolean {
  if (type.isNull() || type.isUndefined()) return true;
  if (type.isUnion()) return type.getUnionTypes().some(t => t.isNull() || t.isUndefined());
  for (const arg of type.getTypeArguments()) {
    if (typeIsNullable(arg)) return true;
  }
  return false;
}

function detectMutableParams(params: import("ts-morph").ParameterDeclaration[]): boolean {
  return params.some(p => {
    const type = p.getType();
    if (type.isString() || type.isNumber() || type.isBoolean() ||
        type.isUndefined() || type.isNull() || type.isVoid() ||
        type.isEnum() || type.isEnumLiteral() ||
        type.isStringLiteral() || type.isNumberLiteral() || type.isBooleanLiteral()) return false;
    const typeNode = p.getTypeNode();
    if (typeNode) {
      const text = typeNode.getText();
      if (/^(readonly\s|Readonly<|ReadonlyArray<|ReadonlyMap<|ReadonlySet<)/.test(text)) return false;
      if (/^(Async)?(Iterable|Iterator|IterableIterator|Generator)</.test(text) || /^ReadableStream/.test(text)) return false;
    }
    return type.isObject() || type.isArray() || type.isInterface() || type.isIntersection();
  });
}

// ── Weighted statements ──

const NESTING_KINDS = new Set([
  SyntaxKind.IfStatement, SyntaxKind.ForStatement, SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement, SyntaxKind.WhileStatement, SyntaxKind.DoStatement,
  SyntaxKind.SwitchStatement, SyntaxKind.TryStatement, SyntaxKind.CatchClause,
]);
const STATEMENT_KINDS = new Set([
  SyntaxKind.ExpressionStatement, SyntaxKind.VariableStatement, SyntaxKind.ReturnStatement,
  SyntaxKind.ThrowStatement, SyntaxKind.IfStatement, SyntaxKind.ForStatement, SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement, SyntaxKind.WhileStatement, SyntaxKind.DoStatement,
  SyntaxKind.SwitchStatement, SyntaxKind.TryStatement, SyntaxKind.BreakStatement, SyntaxKind.ContinueStatement,
]);
const BRANCH_KINDS = new Set([
  SyntaxKind.IfStatement, SyntaxKind.ForStatement, SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement, SyntaxKind.WhileStatement, SyntaxKind.DoStatement,
  SyntaxKind.CaseClause, SyntaxKind.CatchClause, SyntaxKind.ConditionalExpression,
]);

function computeWeightedStatements(body: Node): { count: number; weighted: number } {
  let count = 0, weighted = 0;
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

// ── Call resolution ──

function makeFnId(filePath: string, pos: number): string {
  return `${filePath}:${pos}`;
}

// ── External caps (.cap.ts files) ──

function loadExternalCaps(): CapEntry[] {
  const capFiles: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".cap.ts")) capFiles.push(resolve(full));
    }
  }
  walk(ROOT);

  const entries: CapEntry[] = [];
  if (capFiles.length === 0) return entries;

  const p = new Project({ compilerOptions: { strict: true } });
  for (const fp of capFiles) {
    const sf = p.addSourceFileAtPath(fp);
    for (const fn of sf.getFunctions()) {
      const name = fn.getName();
      if (!name) continue;
      for (const range of fn.getLeadingCommentRanges()) {
        const match = range.getText().match(/@capability(?:\s+(.+))?/);
        if (match) {
          const caps: Cap[] = [];
          if (match[1]) {
            for (const w of match[1].trim().replace(/\*\/.*$/, "").trim().split(/[\s,]+/)) {
              if ((CAPS as readonly string[]).includes(w)) caps.push(w as Cap);
            }
          }
          entries.push({ name, caps });
        }
      }
    }
    for (const varDecl of sf.getVariableDeclarations()) {
      const name = varDecl.getName();
      for (const range of varDecl.getLeadingCommentRanges()) {
        const match = range.getText().match(/@capability(?:\s+(.+))?/);
        if (match) {
          const caps: Cap[] = [];
          if (match[1]) {
            for (const w of match[1].trim().replace(/\*\/.*$/, "").trim().split(/[\s,]+/)) {
              if ((CAPS as readonly string[]).includes(w)) caps.push(w as Cap);
            }
          }
          entries.push({ name, caps });
        }
      }
    }
  }
  return entries;
}

// ── Main scan ──

console.error("[scan] Loading project...");
const project = new Project({ tsConfigFilePath: TSCONFIG });
const functions = new Map<string, FuncNode>();
const edges: CallEdge[] = [];
const externalCaps = loadExternalCaps();
console.error(`[scan] Loaded ${externalCaps.length} external cap entries`);

// Pass 1: collect functions
for (const sf of project.getSourceFiles()) {
  const fp = sf.getFilePath();
  if (fp.includes("node_modules") || fp.endsWith(".cap.ts")) continue;
  const pkg = extractPkg(fp);

  function register(name: string, capsNode: Node, fnNode: FnNode, bodyNode: Node | undefined, posNode: Node) {
    const pos = posNode.getStart();
    const id = makeFnId(fp, pos);
    const { caps, isDeclared } = resolveCaps(name, capsNode);
    const auto = autoDetect(fnNode);
    const effective = new Set([...caps]);
    for (const c of auto) effective.add(c);
    const { count, weighted } = bodyNode ? computeWeightedStatements(bodyNode) : { count: 0, weighted: 0 };
    functions.set(id, {
      id, name, filePath: fp, pkg, line: posNode.getStartLineNumber(),
      declaredCaps: caps, effectiveCaps: [...effective], isDeclared,
      weightedStatements: weighted, statementCount: count,
    });
  }

  for (const fn of sf.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;
    register(name, fn, fn, fn.getBody(), fn);
  }
  for (const varDecl of sf.getVariableDeclarations()) {
    const init = varDecl.getInitializer();
    if (!init || (!Node.isArrowFunction(init) && !Node.isFunctionExpression(init))) continue;
    register(varDecl.getName(), varDecl, init, init.getBody(), varDecl);
  }
  for (const cls of sf.getClasses()) {
    for (const method of cls.getMethods()) {
      register(method.getName(), method, method, method.getBody(), method);
    }
  }
  // nested functions
  sf.forEachDescendant(node => {
    if (Node.isFunctionDeclaration(node) && node.getName()) {
      const parent = node.getParent();
      if (parent && !Node.isSourceFile(parent)) {
        register(node.getName()!, node, node, node.getBody(), node);
      }
    }
    if (Node.isVariableDeclaration(node)) {
      const init = node.getInitializer();
      if (!init || (!Node.isArrowFunction(init) && !Node.isFunctionExpression(init))) return;
      const stmt = node.getVariableStatement();
      if (!stmt) return;
      const parent = stmt.getParent();
      if (parent && !Node.isSourceFile(parent)) {
        register(node.getName(), node, init, init.getBody(), node);
      }
    }
  });
  // object methods
  sf.forEachDescendant(node => {
    if (Node.isMethodDeclaration(node)) {
      const parent = node.getParent();
      if (parent && Node.isObjectLiteralExpression(parent)) {
        register(node.getName(), node, node, node.getBody(), node);
      }
    }
    if (Node.isPropertyAssignment(node)) {
      const init = node.getInitializer();
      if (!init || (!Node.isArrowFunction(init) && !Node.isFunctionExpression(init))) return;
      const parent = node.getParent();
      if (parent && Node.isObjectLiteralExpression(parent)) {
        register(node.getName(), node, init, init.getBody(), node);
      }
    }
  });
}

console.error(`[scan] Found ${functions.size} functions`);

// Pass 2: resolve calls
function findOwnerFunction(node: Node, filePath: string): FuncNode | null {
  let current = node.getParent();
  while (current) {
    if (Node.isFunctionDeclaration(current) || Node.isArrowFunction(current) ||
        Node.isFunctionExpression(current) || Node.isMethodDeclaration(current)) {
      const id = makeFnId(filePath, current.getStart());
      const fn = functions.get(id);
      if (fn) return fn;
      const p = current.getParent();
      if (p && Node.isVariableDeclaration(p)) {
        const vid = makeFnId(filePath, p.getStart());
        const vfn = functions.get(vid);
        if (vfn) return vfn;
      }
      if (p && Node.isPropertyAssignment(p)) {
        const pid = makeFnId(filePath, p.getStart());
        const pfn = functions.get(pid);
        if (pfn) return pfn;
      }
    }
    current = current.getParent();
  }
  return null;
}

for (const sf of project.getSourceFiles()) {
  const fp = sf.getFilePath();
  if (fp.includes("node_modules") || fp.endsWith(".cap.ts")) continue;

  sf.forEachDescendant(node => {
    if (!Node.isCallExpression(node)) return;
    const owner = findOwnerFunction(node, fp);
    if (!owner) return;

    const expr = node.getExpression();
    const callLine = node.getStartLineNumber();

    // Barrier detection
    let isDIBarrier = false;
    let isTypeOnly = false;
    if (Node.isPropertyAccessExpression(expr)) {
      const base = expr.getExpression();
      // Check if base is a parameter
      try {
        const sym = base.getSymbol();
        if (sym) {
          const decls = sym.getDeclarations();
          if (decls.length > 0 && Node.isParameterDeclaration(decls[0])) {
            const paramType = decls[0].getType();
            if (paramType.isInterface() || paramType.getText().includes("Port")) {
              isDIBarrier = true;
            }
          }
        }
      } catch { /* ignore resolution errors */ }
    }

    // Resolve call target
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
              isTypeOnly = importDecl.isTypeOnly();
              const moduleSf = importDecl.getModuleSpecifierSourceFile();
              if (moduleSf) {
                const exportedSymbol = moduleSf.getExportedDeclarations().get(decl.getName());
                if (exportedSymbol && exportedSymbol.length > 0) {
                  decl = exportedSymbol[0];
                }
              }
            } catch { /* fall through */ }
          }

          const calleeSf = decl.getSourceFile();
          const calleeFp = calleeSf.getFilePath();
          if (!calleeFp.includes("node_modules")) {
            const pos = decl.getStart();
            const id = makeFnId(calleeFp, pos);
            const isCrossPkg = extractPkg(fp) !== extractPkg(calleeFp);
            if (functions.has(id)) {
              edges.push({
                from: owner.id, to: id, targetName: qualifiedName,
                qualifiedName, line: callLine, isResolved: true,
                isDIBarrier, isCrossPackage: isCrossPkg, isTypeOnly,
              });
              return;
            }
            // try variable declaration
            if (Node.isVariableDeclaration(decl)) {
              const vid = makeFnId(calleeFp, decl.getStart());
              if (functions.has(vid)) {
                edges.push({
                  from: owner.id, to: vid, targetName: qualifiedName,
                  qualifiedName, line: callLine, isResolved: true,
                  isDIBarrier, isCrossPackage: isCrossPkg, isTypeOnly,
                });
                return;
              }
            }
          }
        }
        // resolved to external
        edges.push({
          from: owner.id, to: null, targetName: qualifiedName,
          qualifiedName, line: callLine, isResolved: false,
          isDIBarrier, isCrossPackage: false, isTypeOnly,
        });
        return;
      }
    } catch { /* fall through */ }

    // Unresolved
    let callName = "unknown";
    if (Node.isIdentifier(expr)) callName = expr.getText();
    else if (Node.isPropertyAccessExpression(expr)) callName = expr.getName();
    edges.push({
      from: owner.id, to: null, targetName: callName,
      line: callLine, isResolved: false,
      isDIBarrier, isCrossPackage: false, isTypeOnly,
    });
  });
}

console.error(`[scan] Found ${edges.length} call edges (${edges.filter(e=>e.isResolved).length} resolved)`);

// ── Output ──

const output = {
  functions: Object.fromEntries([...functions.entries()].map(([id, f]) => [id, {
    name: f.name,
    filePath: relative(ROOT, f.filePath).replace(/\\/g, "/"),
    pkg: f.pkg,
    line: f.line,
    declaredCaps: f.declaredCaps,
    effectiveCaps: f.effectiveCaps,
    isDeclared: f.isDeclared,
    weightedStatements: f.weightedStatements,
    statementCount: f.statementCount,
  }])),
  edges: edges.map(e => ({
    ...e,
    fromFile: relative(ROOT, functions.get(e.from)?.filePath ?? "").replace(/\\/g, "/"),
  })),
  externalCaps,
  summary: {
    totalFunctions: functions.size,
    totalEdges: edges.length,
    resolvedEdges: edges.filter(e => e.isResolved).length,
    diBarriers: edges.filter(e => e.isDIBarrier).length,
    crossPkgEdges: edges.filter(e => e.isCrossPackage).length,
    typeOnlyEdges: edges.filter(e => e.isTypeOnly).length,
  },
};

writeFileSync(OUT, JSON.stringify(output, null, 2));
console.error(`[scan] Written to ${OUT}`);
console.error(`[scan] Summary: ${functions.size} fns, ${edges.length} edges`);
console.error(`[scan]   DI barriers: ${output.summary.diBarriers}, Cross-pkg: ${output.summary.crossPkgEdges}, Type-only: ${output.summary.typeOnlyEdges}`);
console.log(JSON.stringify(output.summary));
