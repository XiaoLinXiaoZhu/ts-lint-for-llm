/**
 * 逐行加权评分引擎（AST 版）
 *
 * 用 @typescript-eslint/parser 解析源码拿到完整 AST，
 * 递归遍历计算每行的嵌套深度和分支标记，然后按函数+能力聚合评分。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// @typescript-eslint/parser 需要从 prototype/ 的 node_modules 解析
const parser = require(resolve(import.meta.dir, "..", "node_modules", "@typescript-eslint", "parser", "dist", "index.js"));

// ---- 类型 ----

type Cap = string;

const CAPABILITY_ABBREV: Record<string, string> = {
  Async: "A", Blocking: "B", Fallible: "E", IO: "I",
  Mutable: "M", Impure: "P", ThreadLocal: "T", Unsafe: "U",
};
const ALL_CAPS = Object.keys(CAPABILITY_ABBREV);

// AST 节点类型集合
const NESTING_TYPES = new Set([
  "IfStatement", "ForStatement", "ForInStatement", "ForOfStatement",
  "WhileStatement", "DoWhileStatement", "SwitchStatement",
  "TryStatement", "CatchClause",
]);

const COMPLEXITY_TYPES = new Set([
  "IfStatement", "ForStatement", "ForInStatement", "ForOfStatement",
  "WhileStatement", "DoWhileStatement",
  "SwitchCase", "CatchClause",
  "ConditionalExpression",
  "LogicalExpression",
]);

const FUNCTION_TYPES = new Set([
  "FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression",
]);

// ---- AST 遍历工具 ----

interface ASTNode {
  type: string;
  loc?: { start: { line: number; column: number }; end: { line: number; column: number } };
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

// ---- 逐行权重计算 ----

interface LineInfo {
  lineNo: number;
  depth: number;
  isBranch: boolean;
  weight: number;
}

function computeLineInfo(source: string, ast: ASTNode): LineInfo[] {
  const lines = source.split("\n");
  const totalLines = lines.length;

  const depths = new Array(totalLines + 1).fill(0);
  const branches = new Array(totalLines + 1).fill(false);

  walkAST(ast, (node) => {
    if (!node.loc) return;
    const start = node.loc.start.line;
    const end = node.loc.end.line;

    if (NESTING_TYPES.has(node.type)) {
      for (let l = start; l <= end; l++) depths[l]++;
    }
    if (COMPLEXITY_TYPES.has(node.type)) {
      branches[start] = true;
    }
  });

  const result: LineInfo[] = [];
  for (let i = 1; i <= totalLines; i++) {
    const raw = lines[i - 1];
    const trimmed = raw.trim();
    const isEmpty = !trimmed || trimmed === "{" || trimmed === "}" || trimmed.startsWith("//");
    const weight = isEmpty ? 0 : 1 + depths[i] + (branches[i] ? 0.5 : 0);
    result.push({ lineNo: i, depth: depths[i], isBranch: branches[i], weight });
  }
  return result;
}

// ---- 函数提取（AST 版）----

const CAP_SUFFIX_PATTERN = /_((?:IO|Async|Blocking|Fallible|Mutable|Impure|Unsafe|ThreadLocal)(?:_(?:IO|Async|Blocking|Fallible|Mutable|Impure|Unsafe|ThreadLocal))*)$/;
const JSDOC_CAP_PATTERN = /@capability(?:\s+(.*))?/;

function extractCapsFromName(name: string): Set<Cap> | null {
  const m = name.match(CAP_SUFFIX_PATTERN);
  if (!m) return null;
  return new Set(m[1].split("_"));
}

interface FunctionInfo {
  name: string;
  startLine: number;
  endLine: number;
  caps: Set<Cap>;
  declared: boolean;
  cyclomaticComplexity: number;
}

function extractFunctions(source: string, ast: ASTNode): FunctionInfo[] {
  const lines = source.split("\n");
  const functions: FunctionInfo[] = [];

  walkAST(ast, (node) => {
    if (!FUNCTION_TYPES.has(node.type)) return;
    if (!node.loc) return;

    // 获取函数名
    let name: string | null = null;
    if (node.type === "FunctionDeclaration") {
      const id = (node as any).id;
      if (id) name = id.name;
    } else {
      // ArrowFunctionExpression / FunctionExpression — 从父级 VariableDeclarator 取名
      // 需要向上找，但我们没有 parent 引用，所以用另一种方式：
      // 通过行号在源码中匹配 const/let xxx = 的模式
      const line = lines[node.loc.start.line - 1];
      const varMatch = line.match(/(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
      if (varMatch) name = varMatch[1];
    }

    if (!name) return;

    const startLine = node.loc.start.line;
    const endLine = node.loc.end.line;

    // 能力提取：后缀 > JSDoc > 未声明
    const fromSuffix = extractCapsFromName(name);
    let fromJSDoc: Set<Cap> | null = null;

    if (!fromSuffix) {
      // 向上搜索 JSDoc
      for (let j = Math.max(0, startLine - 6); j < startLine - 1; j++) {
        const m = lines[j].match(JSDOC_CAP_PATTERN);
        if (m) {
          fromJSDoc = new Set<Cap>();
          if (m[1]) {
            const cleaned = m[1].replace(/\*\/.*$/, "").trim();
            if (cleaned) {
              for (const word of cleaned.split(/[\s,]+/)) fromJSDoc.add(word);
            }
          }
          break;
        }
      }
    }

    const caps = fromSuffix ?? fromJSDoc ?? new Set<Cap>();
    const declared = fromSuffix !== null || fromJSDoc !== null;

    // 计算函数体内的圈复杂度
    let cc = 1; // 函数本身
    walkAST(node, (inner) => {
      if (inner === node) return;
      // 不穿透嵌套函数
      if (FUNCTION_TYPES.has(inner.type) && inner !== node) return;
      if (COMPLEXITY_TYPES.has(inner.type)) cc++;
    });

    functions.push({ name, startLine, endLine, caps, declared, cyclomaticComplexity: cc });
  });

  // 按 startLine 排序，去掉完全相同的重复
  functions.sort((a, b) => a.startLine - b.startLine);
  return functions;
}

// ---- 评分 ----

interface FunctionScore {
  name: string;
  startLine: number;
  endLine: number;
  rawLines: number;
  weightedLines: number;
  maxDepth: number;
  cyclomaticComplexity: number;
  caps: string[];
  declared: boolean;
}

interface FileScore {
  file: string;
  functions: FunctionScore[];
  capScores: Record<string, number>;
  totalScore: number;
}

function scoreFile(filePath: string): FileScore {
  const source = readFileSync(filePath, "utf8");
  const ast = parser.parse(source, { loc: true, range: true, comment: true });
  const lineInfo = computeLineInfo(source, ast);
  const functions = extractFunctions(source, ast);

  const capScores: Record<string, number> = {};
  const scored: FunctionScore[] = [];

  for (const fn of functions) {
    const fnLines = lineInfo.slice(fn.startLine - 1, fn.endLine);
    const rawLines = fnLines.filter(l => l.weight > 0).length;
    const weightedLines = fnLines.reduce((sum, l) => sum + l.weight, 0);
    const maxDepth = Math.max(0, ...fnLines.map(l => l.depth));

    const caps = [...fn.caps].sort();
    scored.push({
      name: fn.name,
      startLine: fn.startLine,
      endLine: fn.endLine,
      rawLines,
      weightedLines: round1(weightedLines),
      maxDepth,
      cyclomaticComplexity: fn.cyclomaticComplexity,
      caps,
      declared: fn.declared,
    });

    // 累计能力得分
    if (fn.declared) {
      for (const cap of caps) {
        capScores[cap] = (capScores[cap] || 0) + weightedLines;
      }
    } else {
      // 未声明 = 全能力
      for (const cap of ALL_CAPS) {
        capScores[cap] = (capScores[cap] || 0) + weightedLines;
      }
    }
  }

  for (const k of Object.keys(capScores)) capScores[k] = round1(capScores[k]);
  const totalScore = round1(Object.values(capScores).reduce((a, b) => a + b, 0));

  return { file: filePath, functions: scored, capScores, totalScore };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---- 报告输出 ----

function printReport(score: FileScore, label: string) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${label}`);
  console.log(`${"═".repeat(70)}`);

  console.log(`\n  ${"函数名".padEnd(36)} ${"行".padStart(4)} ${"加权".padStart(6)} ${"CC".padStart(3)} ${"深".padStart(2)} 能力`);
  console.log(`  ${"─".repeat(64)}`);

  for (const fn of score.functions) {
    const capStr = fn.declared
      ? (fn.caps.length > 0 ? fn.caps.map(c => CAPABILITY_ABBREV[c] || c).join("") : "pure")
      : "UNDECLARED";
    console.log(
      `  ${fn.name.padEnd(36)} ${String(fn.rawLines).padStart(4)} ${String(fn.weightedLines).padStart(6)} ${String(fn.cyclomaticComplexity).padStart(3)} ${String(fn.maxDepth).padStart(2)} ${capStr}`
    );
  }

  console.log("\n  能力得分:");
  const sorted = Object.entries(score.capScores).sort((a, b) => b[1] - a[1]);
  const maxVal = Math.max(...sorted.map(([, v]) => v), 1);
  for (const [cap, val] of sorted) {
    const bar = "█".repeat(Math.round(val / maxVal * 35));
    const abbrev = CAPABILITY_ABBREV[cap] || cap;
    console.log(`    ${abbrev}(${cap.padEnd(10)}) ${String(val.toFixed(1)).padStart(8)}  ${bar}`);
  }
  console.log(`\n  总分: ${score.totalScore.toFixed(1)}`);
}

function printComparison(bad: FileScore, good: FileScore) {
  console.log(`\n\n${"═".repeat(70)}`);
  console.log("  对比汇总");
  console.log(`${"═".repeat(70)}`);

  const allCaps = [...new Set([...Object.keys(bad.capScores), ...Object.keys(good.capScores)])].sort();

  console.log(`\n  ${"能力".padEnd(15)} ${"改造前".padStart(8)} ${"改造后".padStart(8)} ${"降幅".padStart(7)} 方向`);
  console.log(`  ${"─".repeat(50)}`);

  for (const cap of allCaps) {
    const before = bad.capScores[cap] || 0;
    const after = good.capScores[cap] || 0;
    const drop = before > 0 ? ((before - after) / before * 100) : (after > 0 ? -100 : 0);
    const dir = after === 0 && before > 0 ? "消除" : drop > 50 ? "大幅↓" : drop > 0 ? "↓" : "—";
    const abbrev = CAPABILITY_ABBREV[cap] || cap;
    console.log(
      `  ${abbrev}(${cap.padEnd(10)}) ${before.toFixed(1).padStart(8)} ${after.toFixed(1).padStart(8)} ${(drop.toFixed(0) + "%").padStart(7)} ${dir}`
    );
  }

  const totalDrop = ((bad.totalScore - good.totalScore) / bad.totalScore * 100).toFixed(0);
  console.log(`  ${"─".repeat(50)}`);
  console.log(`  ${"总分".padEnd(15)} ${bad.totalScore.toFixed(1).padStart(8)} ${good.totalScore.toFixed(1).padStart(8)} ${(totalDrop + "%").padStart(7)}`);

  // 结构变化
  console.log(`\n  结构变化:`);
  console.log(`    函数数: ${bad.functions.length} → ${good.functions.length}`);
  console.log(`    纯函数: ${bad.functions.filter(f => f.declared && f.caps.length === 0).length} → ${good.functions.filter(f => f.declared && f.caps.length === 0).length}`);
  console.log(`    未声明: ${bad.functions.filter(f => !f.declared).length} → ${good.functions.filter(f => !f.declared).length}`);

  const badW = bad.functions.reduce((s, f) => s + f.weightedLines, 0);
  const goodW = good.functions.reduce((s, f) => s + f.weightedLines, 0);
  const badR = bad.functions.reduce((s, f) => s + f.rawLines, 0);
  const goodR = good.functions.reduce((s, f) => s + f.rawLines, 0);
  console.log(`    原始行: ${badR} → ${goodR}`);
  console.log(`    加权行: ${badW.toFixed(1)} → ${goodW.toFixed(1)}  (平均权重 ${(badW / badR).toFixed(2)} → ${(goodW / goodR).toFixed(2)})`);

  const badCC = bad.functions.reduce((s, f) => s + f.cyclomaticComplexity, 0);
  const goodCC = good.functions.reduce((s, f) => s + f.cyclomaticComplexity, 0);
  const badMaxCC = Math.max(...bad.functions.map(f => f.cyclomaticComplexity));
  const goodMaxCC = Math.max(...good.functions.map(f => f.cyclomaticComplexity));
  console.log(`    总CC:   ${badCC} → ${goodCC}  (最大单函数 ${badMaxCC} → ${goodMaxCC})`);
}

// ---- 逐行热力图 ----

function printHeatmap(filePath: string, label: string) {
  const source = readFileSync(filePath, "utf8");
  const ast = parser.parse(source, { loc: true, range: true, comment: true });
  const lineInfo = computeLineInfo(source, ast);
  const lines = source.split("\n");

  console.log(`\n  ${label} — 逐行权重热力图`);
  console.log(`  ${"─".repeat(64)}`);

  for (const li of lineInfo) {
    if (li.weight === 0) continue;
    const raw = lines[li.lineNo - 1];
    const bar = "▓".repeat(Math.min(Math.round(li.weight * 2), 16));
    const depthStr = li.isBranch ? `d${li.depth}*` : `d${li.depth} `;
    console.log(`  ${String(li.lineNo).padStart(3)} ${depthStr} ${li.weight.toFixed(1).padStart(4)} ${bar.padEnd(16)} ${raw.slice(0, 60)}`);
  }
}

export { scoreFile, printReport, printComparison, printHeatmap };
