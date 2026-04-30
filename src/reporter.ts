/**
 * 评分与 JSON 输出
 *
 * - 评分只计 scorable 能力（5 个传播能力）
 * - tips 按 --hint 关键词筛选
 */

import { PROPAGATE_CAPS, SCORABLE_CAPS, ALL_CAPABILITIES, type Capability } from "./capabilities.js";
import { DiagnosticKind, type AnalysisResult, type Diagnostic } from "./analyzer.js";
import type { FunctionInfo, ProjectScan } from "./scanner.js";
import type { LoosenessResult } from "./looseness.js";
import { relative } from "node:path";

// ── Score types ──

export interface FunctionScore {
  id: string;
  name: string;
  filePath: string;
  line: number;
  caps: Capability[];
  isDeclared: boolean;
  weightedStatements: number;
  ownScore: number;
  inheritedScore: number;
  calleeCount: number;
  score: number;
}

export interface FileScore {
  filePath: string;
  capScore: number;
  looseScore: number;
  functions: number;
  pure: number;
  undeclared: number;
}

export interface ScoreSummary {
  totalCap: number;
  totalOwn: number;
  totalLoose: number;
  totalFunctions: number;
  totalPure: number;
  totalUndeclared: number;
  capScores: Partial<Record<Capability, number>>;
  looseByType: Record<string, { count: number; penalty: number }>;
  allFunctions: FunctionScore[];
  topFunctions: FunctionScore[];
  fileScores: FileScore[];
  tips?: string[];
}

// ── Score computation ──

export function computeScores(
  scan: ProjectScan,
  result: AnalysisResult,
  loosenessResults: Map<string, LoosenessResult>,
): ScoreSummary {
  const fnScores: FunctionScore[] = [];
  const capScores: Partial<Record<Capability, number>> = {};
  const fileCapScores = new Map<string, number>();

  // ── Build call graph from resolved calls ──
  // callees[callerId] = calleeId[]
  const callees = new Map<string, string[]>();
  for (const [id, fn] of scan.functions) {
    const ids: string[] = [];
    for (const call of fn.resolvedCalls) {
      if (scan.functions.has(call.target)) {
        ids.push(call.target);
      }
    }
    callees.set(id, ids);
  }

  // ── First pass: own score (the old formula) ──
  for (const [id, fn] of scan.functions) {
    const effective = result.effectiveCaps.get(id) ?? fn.declaredCaps;
    // Scoring: only count propagate (scorable) capabilities
    const scorableCaps = fn.isDeclared
      ? [...effective].filter(c => SCORABLE_CAPS.includes(c))
      : [...PROPAGATE_CAPS]; // undeclared → max penalty (5 propagate caps)
    const ownScore = Math.round(fn.weightedStatements * scorableCaps.length * 10) / 10;

    fnScores.push({
      id, name: fn.name, filePath: fn.filePath, line: fn.line,
      caps: scorableCaps, isDeclared: fn.isDeclared,
      weightedStatements: fn.weightedStatements,
      ownScore, inheritedScore: 0, calleeCount: 0, score: ownScore,
    });

    for (const c of scorableCaps) {
      capScores[c] = (capScores[c] || 0) + fn.weightedStatements;
    }
  }

  // ── Fixed-point iteration for recursive scores ──
  // score(F) = ownScore(F) + Σ_{G∈callees(F)} score(G) × DECAY
  const scoreMap = new Map<string, FunctionScore>();
  for (const fs of fnScores) scoreMap.set(fs.id, fs);

  const DECAY = 0.5;
  let changed = true;
  let iterations = 0;
  const MAX_ITER = 100;
  while (changed && iterations < MAX_ITER) {
    changed = false;
    iterations++;
    for (const fs of fnScores) {
      const cIds = callees.get(fs.id) ?? [];
      let inherited = 0;
      for (const cId of cIds) {
        const callee = scoreMap.get(cId);
        if (callee) inherited += callee.score * DECAY;
      }
      inherited = Math.round(inherited * 10) / 10;
      const newScore = Math.round((fs.ownScore + inherited) * 10) / 10;
      if (Math.abs(newScore - fs.score) > 0.005) {
        fs.score = newScore;
        fs.inheritedScore = inherited;
        fs.calleeCount = cIds.length;
        changed = true;
      }
    }
  }

  // ── File cap scores from recursive scores ──
  for (const fs of fnScores) {
    fileCapScores.set(fs.filePath, (fileCapScores.get(fs.filePath) || 0) + fs.score);
  }

  // ── Round cap scores ──
  for (const k of Object.keys(capScores)) {
    capScores[k as Capability] = Math.round(capScores[k as Capability]! * 10) / 10;
  }

  // Sort by recursive score (descending)
  fnScores.sort((a, b) => b.score - a.score);

  // ── Looseness ──
  const looseByType: Record<string, { count: number; penalty: number }> = {};
  let totalLoose = 0;
  for (const [, lr] of loosenessResults) {
    totalLoose += lr.total;
    for (const [t, info] of Object.entries(lr.byType)) {
      if (!looseByType[t]) looseByType[t] = { count: 0, penalty: 0 };
      looseByType[t].count += info.count;
      looseByType[t].penalty += info.penalty;
    }
  }

  // ── File scores ──
  const files = new Set<string>();
  for (const fn of scan.functions.values()) files.add(fn.filePath);
  const fileScores: FileScore[] = [];
  for (const fp of files) {
    const fns = fnScores.filter(f => f.filePath === fp);
    const lr = loosenessResults.get(fp);
    fileScores.push({
      filePath: fp,
      capScore: Math.round((fileCapScores.get(fp) || 0) * 10) / 10,
      looseScore: lr?.total ?? 0,
      functions: fns.length,
      pure: fns.filter(f => f.isDeclared && f.caps.length === 0).length,
      undeclared: fns.filter(f => !f.isDeclared).length,
    });
  }
  fileScores.sort((a, b) => (b.capScore + b.looseScore) - (a.capScore + a.looseScore));

  // ── Totals ──
  const totalCap = Math.round(fnScores.reduce((s, f) => s + f.score, 0) * 10) / 10;
  const totalOwn = Math.round(fnScores.reduce((s, f) => s + f.ownScore, 0) * 10) / 10;
  const totalFunctions = fnScores.length;
  const totalPure = fnScores.filter(f => f.isDeclared && f.caps.length === 0).length;
  const totalUndeclared = fnScores.filter(f => !f.isDeclared).length;

  return {
    totalCap, totalOwn, totalLoose, totalFunctions, totalPure, totalUndeclared,
    capScores, looseByType, allFunctions: fnScores, topFunctions: fnScores.slice(0, 10), fileScores,
  };
}

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
    check: ({ totalUndeclared }) =>
      totalUndeclared > 0
        ? `${totalUndeclared} 个函数未声明能力，按最大惩罚(×5)计分。添加 @capability 标注可立即降分。`
        : null,
  },
  {
    keyword: "split",
    check: ({ fns, cwd }) => {
      const fn = fns.find(f => f.caps.length >= 3);
      return fn
        ? `${relative(cwd, fn.filePath)}:${fn.line} ${fn.name} 携带 ${fn.caps.length} 个能力(${fn.caps.join("+")})。拆分需付出 DECAY 代价(×0.5)，因此只有真正分离出「能力更少」的代码才值当。`
        : null;
    },
  },
  {
    keyword: "refactor",
    check: ({ fns }) => {
      const multi = fns.filter(f => f.isDeclared && f.caps.length >= 2);
      return multi.length >= 3
        ? `${multi.length} 个函数携带 2+ 能力。考虑状态机模式或 effect as data 重构。`
        : null;
    },
  },
  {
    keyword: "thin-delegate",
    check: ({ fns, cwd }) => {
      const thin = fns.find(f => f.ownScore === 0 && f.inheritedScore > 0 && f.isDeclared);
      return thin
        ? `${relative(cwd, thin.filePath)}:${thin.line} ${thin.name} 自身无能力负载(ownScore=0)，但继承得分 ${thin.inheritedScore.toFixed(1)}。它是透传函数。`
        : null;
    },
  },
  {
    keyword: "merge",
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
    check: ({ totalFunctions, totalPure }) =>
      totalFunctions > 3 && totalPure / totalFunctions < 0.3
        ? `纯函数占比 ${Math.round(totalPure / totalFunctions * 100)}%。注意：纯函数如果调用非纯函数仍会继承能力负担。收窄接口，减少对外部能力的依赖。`
        : null,
  },
  {
    keyword: "priority",
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
