/**
 * 评分报告核心逻辑：文件收集、评分、聚合、建议生成
 */

import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { ALL_CAPABILITIES } from "../capabilities.js";
import { scoreCapability, type FunctionScore } from "./capability-scorer.js";
import { scoreLooseness } from "./looseness-scorer.js";
import type { FileResult, Summary, Tip } from "./report-types.js";

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

export function scoreFile(filePath: string): FileResult {
  const source = readFileSync(filePath, "utf8");
  const ast = parser.parse(source, { loc: true, range: true, comment: true });
  return {
    file: relative(process.cwd(), filePath),
    capability: scoreCapability(source, ast),
    looseness: scoreLooseness(source, ast),
  };
}

export function collectFiles(targets: string[]): string[] {
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

export function summarize(results: FileResult[]): Summary {
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

export function generateTips(results: FileResult[], s: Summary): Tip[] {
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

export function computeFnScore(fn: FunctionScore): number {
  const capCount = fn.declared ? (fn.caps.length || 0) : ALL_CAPABILITIES.length;
  return Math.round(fn.weightedStatements * capCount * 10) / 10;
}
