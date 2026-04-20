#!/usr/bin/env node
/**
 * 统一评分报告 CLI
 *
 * 用法:
 *   bunx capability-report <file-or-dir> [file-or-dir...]
 *   bunx capability-report --pretty <file-or-dir> [file-or-dir...]
 */

import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { scoreCapability, type CapabilityResult, type FunctionScore } from "./capability-scorer.js";
import { scoreLooseness, type LoosenessResult } from "./looseness-scorer.js";

let parser: any;
function loadParser() {
  const tryPaths = [
    resolve(process.cwd(), "node_modules", "@typescript-eslint", "parser"),
    resolve(process.cwd(), "node_modules", "@typescript-eslint", "parser", "dist", "index.js"),
  ];
  for (const p of tryPaths) {
    try { return require(p); } catch {}
  }
  try { return require("@typescript-eslint/parser"); } catch {}
  console.error("Error: @typescript-eslint/parser not found. Install it: npm install -D @typescript-eslint/parser");
  process.exit(1);
}
parser = loadParser();

interface FileResult {
  file: string;
  capability: CapabilityResult;
  looseness: LoosenessResult;
}

function scoreFile(filePath: string): FileResult {
  const source = readFileSync(filePath, "utf8");
  const ast = parser.parse(source, { loc: true, range: true, comment: true });
  return {
    file: relative(process.cwd(), filePath),
    capability: scoreCapability(source, ast),
    looseness: scoreLooseness(source, ast),
  };
}

function collectFiles(targets: string[]): string[] {
  const files: string[] = [];
  for (const target of targets) {
    const stat = statSync(target);
    if (stat.isFile() && target.endsWith(".ts") && !target.endsWith(".d.ts")) {
      files.push(resolve(target));
    } else if (stat.isDirectory()) {
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
          const full = join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
            files.push(full);
          }
        }
      };
      walk(resolve(target));
    }
  }
  return files;
}

// ── 聚合统计 ──

interface Summary {
  totalCap: number;
  totalLoose: number;
  totalFunctions: number;
  totalPure: number;
  totalUndeclared: number;
  capScores: Record<string, number>;
  looseByType: Record<string, { count: number; penalty: number }>;
  allFunctions: Array<FunctionScore & { file: string }>;
}

function summarize(results: FileResult[]): Summary {
  let totalCap = 0, totalLoose = 0, totalFunctions = 0, totalPure = 0, totalUndeclared = 0;
  const capScores: Record<string, number> = {};
  const looseByType: Record<string, { count: number; penalty: number }> = {};
  const allFunctions: Array<FunctionScore & { file: string }> = [];

  for (const r of results) {
    totalCap += r.capability.total;
    totalLoose += r.looseness.total;
    totalFunctions += r.capability.functions.length;
    totalPure += r.capability.functions.filter(f => f.declared && f.caps.length === 0).length;
    totalUndeclared += r.capability.functions.filter(f => !f.declared).length;
    for (const [c, v] of Object.entries(r.capability.capScores)) {
      capScores[c] = (capScores[c] || 0) + (v || 0);
    }
    for (const [t, info] of Object.entries(r.looseness.byType)) {
      if (!looseByType[t]) looseByType[t] = { count: 0, penalty: 0 };
      looseByType[t].count += info.count;
      looseByType[t].penalty += info.penalty;
    }
    for (const fn of r.capability.functions) {
      allFunctions.push({ ...fn, file: r.file });
    }
  }

  return { totalCap, totalLoose, totalFunctions, totalPure, totalUndeclared, capScores, looseByType, allFunctions };
}

// ── 建议生成 ──

interface Tip {
  priority: number;
  text: string;
}

function generateTips(results: FileResult[], s: Summary): Tip[] {
  const tips: Tip[] = [];

  if (s.totalUndeclared > 0) {
    tips.push({
      priority: 1,
      text: `声明能力: ${s.totalUndeclared} 个函数未声明能力，按最大惩罚(×5)计分。添加 @capability 标注（纯函数用空 @capability）可立即降分。`,
    });
  }

  let maxCapFn: FunctionScore & { file: string } | null = null;
  for (const fn of s.allFunctions) {
    const score = fn.weightedStatements * (fn.declared ? fn.caps.length : 5);
    if (!maxCapFn || score > maxCapFn.weightedStatements * (maxCapFn.declared ? maxCapFn.caps.length : 5)) {
      maxCapFn = fn;
    }
  }
  if (maxCapFn && maxCapFn.caps.length >= 3) {
    tips.push({
      priority: 2,
      text: `拆分高负担函数: ${maxCapFn.file}:${maxCapFn.line} 的 ${maxCapFn.name} 携带 ${maxCapFn.caps.length} 个能力(${maxCapFn.caps.join("+")})。`
        + ` 考虑将纯逻辑提取为独立纯函数——纯函数得分为 0，父函数的语句数减少即可降分。`
        + ` 注意：仅提取子能力到新函数不会降分（父函数仍需声明该能力），只有提取出"能力更少"的代码才有效。`,
    });
  }

  const multiCapFns = s.allFunctions.filter(f => f.declared && f.caps.length >= 2);
  if (multiCapFns.length > 2) {
    tips.push({
      priority: 3,
      text: `系统性重构: ${multiCapFns.length} 个函数携带 2+ 能力。`
        + ` 考虑状态机模式（纯 transition 函数 + 薄 IO 层）或 "effect as data"，将业务逻辑集中到纯函数中。`,
    });
  }

  if (s.totalFunctions > 3 && s.totalPure / s.totalFunctions < 0.3) {
    tips.push({
      priority: 4,
      text: `收窄接口: 纯函数占比 ${Math.round(s.totalPure / s.totalFunctions * 100)}%。`
        + ` 将函数参数从宽接口收窄为所需的最小数据，可以减少对外部能力的依赖。`,
    });
  }

  if (s.totalCap > 0 && s.totalLoose > 0) {
    tips.push({
      priority: 5,
      text: `优化顺序: 优先降低能力负担(${s.totalCap.toFixed(1)})，再处理类型松散度(${s.totalLoose})。前者需要重构，后者只需收窄类型。`,
    });
  } else if (s.totalCap > 0 && s.totalLoose === 0) {
    tips.push({ priority: 5, text: `类型松散度为 0，集中精力降低能力负担(${s.totalCap.toFixed(1)})。` });
  }

  const nameFreq = new Map<string, number>();
  for (const fn of s.allFunctions) nameFreq.set(fn.name, (nameFreq.get(fn.name) || 0) + 1);
  const dupes = [...nameFreq.entries()].filter(([, c]) => c > 1).map(([n]) => n);
  if (dupes.length > 0 && results.length > 1) {
    tips.push({ priority: 6, text: `消除重复: ${dupes.join(", ")} 在多个文件中出现。提取到共享模块可以减少总能力面积。` });
  }

  return tips.sort((a, b) => a.priority - b.priority);
}

// ── LLM 友好输出（默认） ──

function printLLM(results: FileResult[]) {
  const s = summarize(results);
  const sortedCaps = Object.entries(s.capScores).sort((a, b) => b[1] - a[1]);

  console.log(`# Capability Report`);
  console.log(`Files: ${results.length} | Functions: ${s.totalFunctions} | Pure: ${s.totalPure} | Undeclared: ${s.totalUndeclared}`);
  console.log();

  console.log(`## Capability Burden: ${s.totalCap.toFixed(1)}`);
  for (const [cap, val] of sortedCaps) {
    console.log(`${cap}: ${val.toFixed(1)}`);
  }
  console.log();

  console.log(`## Type Looseness: ${s.totalLoose}`);
  if (Object.keys(s.looseByType).length === 0) {
    console.log(`(none)`);
  } else {
    for (const [t, info] of Object.entries(s.looseByType).sort((a, b) => b[1].penalty - a[1].penalty)) {
      console.log(`${t}: ×${info.count} = ${info.penalty}`);
    }
  }

  if (results.length > 1) {
    console.log();
    console.log(`## File Details (sorted by score)`);
    const sorted = [...results].sort((a, b) => (b.capability.total + b.looseness.total) - (a.capability.total + a.looseness.total));
    for (const r of sorted) {
      const fns = r.capability.functions.length;
      const pure = r.capability.functions.filter(f => f.declared && f.caps.length === 0).length;
      const undecl = r.capability.functions.filter(f => !f.declared).length;
      if (r.capability.total === 0 && r.looseness.total === 0 && fns === 0) continue;
      console.log(`${r.file}: cap=${r.capability.total.toFixed(1)} loose=${r.looseness.total} fn=${fns} pure=${pure} undecl=${undecl}`);
    }
  }

  const undeclaredFns = s.allFunctions.filter(f => !f.declared);
  if (undeclaredFns.length > 0) {
    console.log();
    console.log(`## Undeclared Functions (${undeclaredFns.length})`);
    for (const fn of undeclaredFns.sort((a, b) => b.weightedStatements - a.weightedStatements)) {
      console.log(`${fn.file}:${fn.line} ${fn.name} (weighted: ${fn.weightedStatements})`);
    }
  }

  const tips = generateTips(results, s);
  if (tips.length > 0) {
    console.log();
    console.log(`## Optimization Tips`);
    for (const tip of tips) {
      console.log(`- ${tip.text}`);
    }
    console.log();
    console.log(`每次修改后重新运行评分确认分数变化。分数没降 = 无效修改，应撤回。`);
  }

  if (undeclaredFns.length > 0) process.exit(1);
}

// ── 人类友好输出（--pretty） ──

function printPretty(results: FileResult[]) {
  const s = summarize(results);
  const sortedCaps = Object.entries(s.capScores).sort((a, b) => b[1] - a[1]);

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║          Capability Health Report                ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║  Files scanned:    ${String(results.length).padStart(5)}`);
  console.log(`║  Functions:        ${String(s.totalFunctions).padStart(5)}`);
  console.log(`║  Pure functions:   ${String(s.totalPure).padStart(5)}`);
  console.log(`║  Undeclared:       ${String(s.totalUndeclared).padStart(5)}`);
  console.log("║");
  console.log(`║  ── Capability Burden ──`);
  for (const [cap, val] of sortedCaps) {
    const bar = "█".repeat(Math.round(val / Math.max(...sortedCaps.map(x => x[1]), 1) * 20));
    console.log(`║    ${cap.padEnd(12)} ${val.toFixed(1).padStart(8)}  ${bar}`);
  }
  console.log(`║    ${"─".repeat(35)}`);
  console.log(`║    ${"TOTAL".padEnd(12)} ${s.totalCap.toFixed(1).padStart(8)}`);
  console.log("║");
  console.log(`║  ── Type Looseness ──`);
  if (Object.keys(s.looseByType).length === 0) {
    console.log(`║    (no loose signals)`);
  } else {
    for (const [t, info] of Object.entries(s.looseByType).sort((a, b) => b[1].penalty - a[1].penalty)) {
      console.log(`║    ${t.padEnd(20)} ×${String(info.count).padStart(3)}  = ${String(info.penalty).padStart(5)}`);
    }
  }
  console.log(`║    ${"─".repeat(35)}`);
  console.log(`║    ${"TOTAL".padEnd(20)}        ${String(s.totalLoose).padStart(5)}`);
  console.log("╚══════════════════════════════════════════════════╝");

  if (results.length > 1) {
    console.log("\n── File Details ──\n");
    console.log(`  ${"File".padEnd(40)} ${"Cap".padStart(7)} ${"Loose".padStart(7)} ${"Fn".padStart(4)} ${"Pure".padStart(5)} ${"Undecl".padStart(7)}`);
    console.log(`  ${"─".repeat(70)}`);

    const sorted = [...results].sort((a, b) => (b.capability.total + b.looseness.total) - (a.capability.total + a.looseness.total));
    for (const r of sorted) {
      const fns = r.capability.functions.length;
      const pure = r.capability.functions.filter(f => f.declared && f.caps.length === 0).length;
      const undecl = r.capability.functions.filter(f => !f.declared).length;
      console.log(
        `  ${r.file.padEnd(40)} ${r.capability.total.toFixed(1).padStart(7)} ${String(r.looseness.total).padStart(7)} ${String(fns).padStart(4)} ${String(pure).padStart(5)} ${String(undecl).padStart(7)}`
      );
    }
  }

  const undeclaredFns = s.allFunctions.filter(f => !f.declared);
  if (undeclaredFns.length > 0) {
    console.log(`\n── Undeclared Functions (${undeclaredFns.length}) ──\n`);
    for (const fn of undeclaredFns.sort((a, b) => b.weightedStatements - a.weightedStatements)) {
      console.log(`  ⚠ ${fn.file}:${fn.line}  ${fn.name}  (weighted: ${fn.weightedStatements})`);
    }
  }

  const tips = generateTips(results, s);
  if (tips.length > 0) {
    console.log(`\n── Optimization Tips ──\n`);
    for (const tip of tips) {
      console.log(`  → ${tip.text}`);
    }
    console.log("");
    console.log(`  注意: 每次修改后重新运行评分确认分数变化。分数没降 = 无效修改，应撤回。`);
  }

  if (undeclaredFns.length > 0) process.exit(1);
}

// ── 入口 ──

const args = process.argv.slice(2);
const pretty = args.includes("--pretty");
const targets = args.filter(a => a !== "--pretty");

if (targets.length === 0) {
  console.error("Usage: capability-report [--pretty] <file-or-dir> [file-or-dir...]");
  process.exit(1);
}

const files = collectFiles(targets);
if (files.length === 0) {
  console.error("No .ts files found in the specified paths.");
  process.exit(1);
}

const results = files.map(scoreFile);
if (pretty) {
  printPretty(results);
} else {
  printLLM(results);
}
