/**
 * 统一评分报告 CLI
 *
 * 用法:
 *   bun src/scoring/report.ts <file-or-dir> [file-or-dir...]
 *   npx capability-report <file-or-dir> [file-or-dir...]
 */

import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { scoreCapability, type CapabilityResult, type FunctionScore } from "./capability-scorer.js";
import { scoreLooseness, type LoosenessResult } from "./looseness-scorer.js";

// @typescript-eslint/parser — resolve from cwd's node_modules or our own
let parser: any;
try {
  parser = require(resolve("node_modules", "@typescript-eslint", "parser", "dist", "index.js"));
} catch {
  try {
    parser = require(resolve(__dirname, "..", "..", "node_modules", "@typescript-eslint", "parser", "dist", "index.js"));
  } catch {
    console.error("Error: @typescript-eslint/parser not found. Install it: npm install -D @typescript-eslint/parser");
    process.exit(1);
  }
}

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

function printReport(results: FileResult[]) {
  // 汇总
  let totalCap = 0;
  let totalLoose = 0;
  let totalFunctions = 0;
  let totalPure = 0;
  let totalUndeclared = 0;
  const capScores: Record<string, number> = {};

  for (const r of results) {
    totalCap += r.capability.total;
    totalLoose += r.looseness.total;
    totalFunctions += r.capability.functions.length;
    totalPure += r.capability.functions.filter(f => f.declared && f.caps.length === 0).length;
    totalUndeclared += r.capability.functions.filter(f => !f.declared).length;
    for (const [c, v] of Object.entries(r.capability.capScores)) {
      capScores[c] = (capScores[c] || 0) + (v || 0);
    }
  }

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║          Capability Health Report                ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║  Files scanned:    ${String(results.length).padStart(5)}`);
  console.log(`║  Functions:        ${String(totalFunctions).padStart(5)}`);
  console.log(`║  Pure functions:   ${String(totalPure).padStart(5)}`);
  console.log(`║  Undeclared:       ${String(totalUndeclared).padStart(5)}`);
  console.log("║");
  console.log(`║  ── Capability Burden ──`);
  const sorted = Object.entries(capScores).sort((a, b) => b[1] - a[1]);
  for (const [cap, val] of sorted) {
    const bar = "█".repeat(Math.round(val / Math.max(...sorted.map(x => x[1]), 1) * 20));
    console.log(`║    ${cap.padEnd(12)} ${val.toFixed(1).padStart(8)}  ${bar}`);
  }
  console.log(`║    ${"─".repeat(35)}`);
  console.log(`║    ${"TOTAL".padEnd(12)} ${totalCap.toFixed(1).padStart(8)}`);
  console.log("║");
  console.log(`║  ── Type Looseness ──`);
  const looseByType: Record<string, { count: number; penalty: number }> = {};
  for (const r of results) {
    for (const [t, info] of Object.entries(r.looseness.byType)) {
      if (!looseByType[t]) looseByType[t] = { count: 0, penalty: 0 };
      looseByType[t].count += info.count;
      looseByType[t].penalty += info.penalty;
    }
  }
  if (Object.keys(looseByType).length === 0) {
    console.log(`║    (no loose signals)`);
  } else {
    for (const [t, info] of Object.entries(looseByType).sort((a, b) => b[1].penalty - a[1].penalty)) {
      console.log(`║    ${t.padEnd(20)} ×${String(info.count).padStart(3)}  = ${String(info.penalty).padStart(5)}`);
    }
  }
  console.log(`║    ${"─".repeat(35)}`);
  console.log(`║    ${"TOTAL".padEnd(20)}        ${String(totalLoose).padStart(5)}`);
  console.log("╚══════════════════════════════════════════════════╝");

  // 文件明细
  if (results.length > 1) {
    console.log("\n── File Details ──\n");
    console.log(`  ${"File".padEnd(40)} ${"Cap".padStart(7)} ${"Loose".padStart(7)} ${"Fn".padStart(4)} ${"Pure".padStart(5)} ${"Undecl".padStart(7)}`);
    console.log(`  ${"─".repeat(70)}`);

    const sortedResults = [...results].sort((a, b) => (b.capability.total + b.looseness.total) - (a.capability.total + a.looseness.total));
    for (const r of sortedResults) {
      const fns = r.capability.functions.length;
      const pure = r.capability.functions.filter(f => f.declared && f.caps.length === 0).length;
      const undecl = r.capability.functions.filter(f => !f.declared).length;
      console.log(
        `  ${r.file.padEnd(40)} ${r.capability.total.toFixed(1).padStart(7)} ${String(r.looseness.total).padStart(7)} ${String(fns).padStart(4)} ${String(pure).padStart(5)} ${String(undecl).padStart(7)}`
      );
    }
  }

  // 函数明细（只显示未声明和高分函数）
  const allFunctions: Array<FunctionScore & { file: string }> = [];
  for (const r of results) {
    for (const fn of r.capability.functions) {
      allFunctions.push({ ...fn, file: r.file });
    }
  }

  const undeclaredFns = allFunctions.filter(f => !f.declared);
  if (undeclaredFns.length > 0) {
    console.log(`\n── Undeclared Functions (${undeclaredFns.length}) ──\n`);
    for (const fn of undeclaredFns.sort((a, b) => b.weightedLines - a.weightedLines)) {
      console.log(`  ⚠ ${fn.file}:${fn.line}  ${fn.name}  (weighted: ${fn.weightedLines})`);
    }
  }

  // 退出码：如果有未声明函数则非零
  if (undeclaredFns.length > 0) {
    process.exit(1);
  }
}

// ── 入口 ──

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("Usage: capability-report <file-or-dir> [file-or-dir...]");
  process.exit(1);
}

const files = collectFiles(targets);
if (files.length === 0) {
  console.error("No .ts files found in the specified paths.");
  process.exit(1);
}

const results = files.map(scoreFile);
printReport(results);
