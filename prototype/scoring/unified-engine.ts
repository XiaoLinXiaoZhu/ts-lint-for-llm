/**
 * 统一评分引擎：能力负担 + 类型松散度
 *
 * 两个独立维度，分别计算，分别报告。
 * LLM 的优化目标：两个维度的得分都尽可能低。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const parser = require(resolve(import.meta.dir, "..", "node_modules", "@typescript-eslint", "parser", "dist", "index.js"));

// ════════════════════════════════════════════════════════
// 共享：AST 工具
// ════════════════════════════════════════════════════════

interface ASTNode {
  type: string;
  loc?: { start: { line: number }; end: { line: number } };
  [key: string]: unknown;
}

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

// ════════════════════════════════════════════════════════
// 维度 A：能力负担（来自 012）
// ════════════════════════════════════════════════════════

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

const ALL_CAPS = ["Async", "Blocking", "Fallible", "IO", "Mutable", "Impure", "ThreadLocal", "Unsafe"];
const CAP_SUFFIX = /_((?:IO|Async|Blocking|Fallible|Mutable|Impure|Unsafe|ThreadLocal)(?:_(?:IO|Async|Blocking|Fallible|Mutable|Impure|Unsafe|ThreadLocal))*)$/;
const JSDOC_CAP = /@capability(?:\s+(.*))?/;

interface CapabilityScore {
  functions: Array<{ name: string; line: number; rawLines: number; weightedLines: number; caps: string[]; declared: boolean }>;
  capScores: Record<string, number>;
  total: number;
}

function scoreCapability(source: string, ast: ASTNode): CapabilityScore {
  const lines = source.split("\n");
  const totalLines = lines.length;

  // 逐行权重
  const depths = new Array(totalLines + 1).fill(0);
  const branches = new Array(totalLines + 1).fill(false);
  walkAST(ast, (node) => {
    if (!node.loc) return;
    if (NESTING_TYPES.has(node.type)) {
      for (let l = node.loc.start.line; l <= node.loc.end.line; l++) depths[l]++;
    }
    if (COMPLEXITY_TYPES.has(node.type)) branches[node.loc.start.line] = true;
  });

  const lineWeights: number[] = [0]; // 1-indexed
  for (let i = 1; i <= totalLines; i++) {
    const trimmed = lines[i - 1].trim();
    const isEmpty = !trimmed || trimmed === "{" || trimmed === "}" || trimmed.startsWith("//");
    lineWeights.push(isEmpty ? 0 : 1 + depths[i] + (branches[i] ? 0.5 : 0));
  }

  // 函数提取
  const functions: CapabilityScore["functions"] = [];
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
    let caps: string[] = [];
    let declared = false;
    if (fromSuffix) {
      caps = fromSuffix[1].split("_");
      declared = true;
    } else {
      for (let j = Math.max(0, start - 6); j < start - 1; j++) {
        const m = lines[j].match(JSDOC_CAP);
        if (m) {
          declared = true;
          if (m[1]) {
            const cleaned = m[1].replace(/\*\/.*$/, "").trim();
            if (cleaned) caps = cleaned.split(/[\s,]+/);
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

    functions.push({ name, line: start, rawLines, weightedLines: Math.round(weightedLines * 10) / 10, caps: caps.sort(), declared });
  });

  // 能力得分
  const capScores: Record<string, number> = {};
  for (const fn of functions) {
    const assignCaps = fn.declared ? fn.caps : ALL_CAPS;
    for (const c of assignCaps) {
      capScores[c] = (capScores[c] || 0) + fn.weightedLines;
    }
  }
  for (const k of Object.keys(capScores)) capScores[k] = Math.round(capScores[k] * 10) / 10;
  const total = Math.round(Object.values(capScores).reduce((a, b) => a + b, 0) * 10) / 10;

  return { functions, capScores, total };
}

// ════════════════════════════════════════════════════════
// 维度 B：类型松散度（来自 013 + 014）
// ════════════════════════════════════════════════════════

interface LooseSignal {
  type: string;
  line: number;
  penalty: number;
  desc: string;
}

interface LoosenessScore {
  signals: LooseSignal[];
  byType: Record<string, { count: number; penalty: number }>;
  total: number;
}

function scoreLooseness(source: string, ast: ASTNode): LoosenessScore {
  const signals: LooseSignal[] = [];

  walkAST(ast, (node) => {
    const line = node.loc?.start?.line ?? 0;

    if (node.type === "TSAnyKeyword") {
      signals.push({ type: "any", line, penalty: 10, desc: "any" });
    }

    if (node.type === "TSUnknownKeyword") {
      signals.push({ type: "unknown", line, penalty: 3, desc: "unknown" });
    }

    // Record<string, any>
    if (node.type === "TSTypeReference" && (node as any).typeName?.name === "Record") {
      const params = (node as any).typeArguments?.params || (node as any).typeParameters?.params || [];
      if (params.length === 2 && params[0]?.type === "TSStringKeyword" && params[1]?.type === "TSAnyKeyword") {
        signals.push({ type: "record-string-any", line, penalty: 8, desc: "Record<string, any>" });
      }
    }

    // 函数参数中的 boolean
    if (node.type === "Identifier" && (node as any).typeAnnotation?.typeAnnotation?.type === "TSBooleanKeyword") {
      signals.push({ type: "bool-param", line, penalty: 2, desc: `boolean 参数 '${(node as any).name}'` });
    }

    // 可选属性（每个 +1）
    if (node.type === "TSPropertySignature" && (node as any).optional) {
      signals.push({ type: "optional-field", line, penalty: 1, desc: `可选字段 '${(node as any).key?.name || "?"}'` });
    }
  });

  const byType: Record<string, { count: number; penalty: number }> = {};
  for (const s of signals) {
    if (!byType[s.type]) byType[s.type] = { count: 0, penalty: 0 };
    byType[s.type].count++;
    byType[s.type].penalty += s.penalty;
  }
  const total = signals.reduce((s, sig) => s + sig.penalty, 0);

  return { signals, byType, total };
}

// ════════════════════════════════════════════════════════
// 统一报告
// ════════════════════════════════════════════════════════

interface UnifiedScore {
  file: string;
  capability: CapabilityScore;
  looseness: LoosenessScore;
}

function scoreFile(filePath: string): UnifiedScore {
  const source = readFileSync(filePath, "utf8");
  const ast = parser.parse(source, { loc: true, range: true, comment: true });
  return {
    file: filePath,
    capability: scoreCapability(source, ast),
    looseness: scoreLooseness(source, ast),
  };
}

function printUnified(score: UnifiedScore, label: string) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${label}`);
  console.log(`${"═".repeat(70)}`);

  // 能力负担
  const cap = score.capability;
  console.log(`\n  [能力负担] 总分: ${cap.total}`);
  const sortedCaps = Object.entries(cap.capScores).sort((a, b) => b[1] - a[1]);
  for (const [c, v] of sortedCaps) {
    const bar = "█".repeat(Math.round(v / Math.max(...sortedCaps.map(x => x[1]), 1) * 25));
    console.log(`    ${c.padEnd(12)} ${String(v).padStart(6)}  ${bar}`);
  }

  console.log(`\n  [类型松散度] 总分: ${score.looseness.total}`);
  if (score.looseness.total === 0) {
    console.log(`    (无松散信号)`);
  } else {
    for (const [type, info] of Object.entries(score.looseness.byType).sort((a, b) => b[1].penalty - a[1].penalty)) {
      console.log(`    ${type.padEnd(20)} ×${String(info.count).padStart(2)}  = ${String(info.penalty).padStart(4)}`);
    }
  }
}

function printComparison(scores: Array<{ label: string; score: UnifiedScore }>) {
  console.log(`\n\n${"═".repeat(70)}`);
  console.log("  统一评分对比");
  console.log(`${"═".repeat(70)}`);

  // 表头
  const labels = scores.map(s => s.label);
  console.log(`\n  ${"".padEnd(16)} ${labels.map(l => l.padStart(10)).join("")}`);
  console.log(`  ${"─".repeat(16 + labels.length * 10)}`);

  // 能力负担
  const allCaps = [...new Set(scores.flatMap(s => Object.keys(s.score.capability.capScores)))].sort();
  for (const c of allCaps) {
    const vals = scores.map(s => (s.score.capability.capScores[c] || 0).toFixed(1).padStart(10));
    console.log(`  ${("  " + c).padEnd(16)} ${vals.join("")}`);
  }
  const capTotals = scores.map(s => s.score.capability.total.toFixed(1).padStart(10));
  console.log(`  ${"─".repeat(16 + labels.length * 10)}`);
  console.log(`  ${"能力负担总分".padEnd(12)} ${capTotals.join("")}`);

  // 松散度
  console.log();
  const looseTotals = scores.map(s => String(s.score.looseness.total).padStart(10));
  console.log(`  ${"松散度总分".padEnd(12)} ${looseTotals.join("")}`);

  // 按类型
  const allTypes = [...new Set(scores.flatMap(s => Object.keys(s.score.looseness.byType)))].sort();
  for (const t of allTypes) {
    const vals = scores.map(s => String(s.score.looseness.byType[t]?.penalty || 0).padStart(10));
    console.log(`  ${("  " + t).padEnd(16)} ${vals.join("")}`);
  }

  // 结构指标
  console.log(`\n  结构:`);
  const fns = scores.map(s => String(s.score.capability.functions.length).padStart(10));
  console.log(`  ${"函数数".padEnd(12)} ${fns.join("")}`);
  const pures = scores.map(s => String(s.score.capability.functions.filter(f => f.declared && f.caps.length === 0).length).padStart(10));
  console.log(`  ${"纯函数".padEnd(12)} ${pures.join("")}`);
  const undecl = scores.map(s => String(s.score.capability.functions.filter(f => !f.declared).length).padStart(10));
  console.log(`  ${"未声明".padEnd(12)} ${undecl.join("")}`);
}

export { scoreFile, printUnified, printComparison, type UnifiedScore };
