/**
 * 评分与 JSON 输出
 *
 * - 评分只计 scorable 能力（5 个传播能力）
 * - tips 按 --hint 关键词筛选
 */

import { DiagnosticKind, type AnalysisResult, type Diagnostic } from "./analyzer.js";
import { relative } from "node:path";
import type { FunctionScore, FileScore, ScoreSummary } from "./score.js";

// ── Tips generation ──

interface TipRule {
  keyword: string;
  check: (ctx: TipContext) => string | null;
}

interface TipContext {
  fns: FunctionScore[];
  totalCap: number;
  totalOwn: number;
  totalLoose: number;
  totalFunctions: number;
  totalPure: number;
  totalUndeclared: number;
  cwd: string;
}

const TIP_RULES: TipRule[] = [
  {
    keyword: "undeclared",
    /** @capability */
    check: ({ totalUndeclared }) =>
      totalUndeclared > 0
        ? `${totalUndeclared} 个函数未声明能力，按最大惩罚(×5)计分。添加 @capability 标注可立即降分。`
        : null,
  },
  {
    keyword: "split",
    /** @capability */
    check: ({ fns, cwd }) => {
      const fn = fns.find(f => f.caps.length >= 3);
      return fn
        ? `${relative(cwd, fn.filePath)}:${fn.line} ${fn.name} 携带 ${fn.caps.length} 个能力(${fn.caps.join("+")})。拆分需付出 DECAY 代价(×0.5)，因此只有真正分离出「能力更少」的代码才值当。`
        : null;
    },
  },
  {
    keyword: "refactor",
    /** @capability */
    check: ({ fns }) => {
      const multi = fns.filter(f => f.isDeclared && f.caps.length >= 2);
      return multi.length >= 3
        ? `${multi.length} 个函数携带 2+ 能力。考虑状态机模式或 effect as data 重构。`
        : null;
    },
  },
  {
    keyword: "thin-delegate",
    /** @capability */
    check: ({ fns, cwd }) => {
      const thin = fns.find(f => f.ownScore === 0 && f.inheritedScore > 0 && f.isDeclared);
      return thin
        ? `${relative(cwd, thin.filePath)}:${thin.line} ${thin.name} 自身无能力负载(ownScore=0)，但继承得分 ${thin.inheritedScore.toFixed(1)}。它是透传函数。`
        : null;
    },
  },
  {
    keyword: "merge",
    /** @capability */
    check: ({ fns, cwd }) => {
      const thins = fns.filter(f => f.ownScore === 0 && f.inheritedScore > 0 && f.isDeclared);
      if (thins.length >= 2) {
        const names = thins.slice(0, 3).map(f => f.name).join(", ");
        return `${thins.length} 个透传函数(如 ${names})。考虑合并以消除间接调用带来的 DECAY 损失。`;
      }
      return null;
    },
  },
  {
    keyword: "purity",
    /** @capability */
    check: ({ totalFunctions, totalPure }) =>
      totalFunctions > 3 && totalPure / totalFunctions < 0.3
        ? `纯函数占比 ${Math.round(totalPure / totalFunctions * 100)}%。注意：纯函数如果调用非纯函数仍会继承能力负担。收窄接口，减少对外部能力的依赖。`
        : null,
  },
  {
    keyword: "priority",
    /** @capability */
    check: ({ totalCap, totalLoose }) => {
      if (totalCap > 0 && totalLoose > 0)
        return `优先降低能力负担(${totalCap.toFixed(1)})，再处理类型松散度(${totalLoose})。`;
      if (totalCap > 0 && totalLoose === 0)
        return `类型松散度为 0，集中精力降低能力负担(${totalCap.toFixed(1)})。`;
      return null;
    },
  },
  {
    keyword: "duplicate",
    /** @capability */
    check: ({ fns }) => {
      const freq = new Map<string, Set<string>>();
      for (const fn of fns) {
        if (!freq.has(fn.name)) freq.set(fn.name, new Set());
        freq.get(fn.name)!.add(fn.filePath);
      }
      const dupes = [...freq.entries()].filter(([, files]) => files.size > 1).map(([n]) => n);
      return dupes.length > 0
        ? `${dupes.join(", ")} 在多个文件中出现。提取到共享模块可减少总能力面积。`
        : null;
    },
  },
];

/** @capability IO Impure */
export function generateTips(scores: ScoreSummary, cwd: string, hintKeyword?: string): string[] {
  const ctx: TipContext = {
    fns: scores.allFunctions,
    totalCap: scores.totalCap,
    totalOwn: scores.totalOwn,
    totalLoose: scores.totalLoose,
    totalFunctions: scores.totalFunctions,
    totalPure: scores.totalPure,
    totalUndeclared: scores.totalUndeclared,
    cwd,
  };

  const rules = hintKeyword
    ? TIP_RULES.filter(r => r.keyword === hintKeyword)
    : TIP_RULES;

  const tips: string[] = [];
  for (const rule of rules) {
    const tip = rule.check(ctx);
    if (tip) tips.push(tip);
  }
  return tips;
}

// ── JSON output ──

/** @capability */
export function formatJSON(
  result: AnalysisResult,
  scores: ScoreSummary,
  cwd: string,
  options: { summary?: boolean } = {},
): string {
  const scoresObj: any = {
    totalCap: scores.totalCap,
    totalOwn: scores.totalOwn,
    totalLoose: scores.totalLoose,
    totalFunctions: scores.totalFunctions,
    totalPure: scores.totalPure,
    totalUndeclared: scores.totalUndeclared,
    capScores: scores.capScores,
    looseByType: scores.looseByType,
    topFunctions: scores.topFunctions.map(f => ({ ...f, filePath: relative(cwd, f.filePath), id: undefined })),
    fileScores: scores.fileScores.map(f => ({ ...f, filePath: relative(cwd, f.filePath) })),
  };
  if (scores.tips) scoresObj.tips = scores.tips;

  if (options.summary) {
    return JSON.stringify({ scores: scoresObj }, null, 2);
  }

  return JSON.stringify({
    diagnostics: result.diagnostics.map(d => ({
      kind: d.kind,
      functionName: d.functionName,
      filePath: relative(cwd, d.filePath),
      line: d.line,
      message: d.message,
      ...(d.callee ? { callee: d.callee } : {}),
      ...(d.missingCaps ? { missingCaps: d.missingCaps } : {}),
    })),
    functions: scores.allFunctions.map(f => ({
      name: f.name,
      filePath: relative(cwd, f.filePath),
      line: f.line,
      caps: f.caps,
      isDeclared: f.isDeclared,
      weightedStatements: f.weightedStatements,
      ownScore: f.ownScore,
      inheritedScore: f.inheritedScore,
      calleeCount: f.calleeCount,
      score: f.score,
    })),
    scores: scoresObj,
  }, null, 2);
}
