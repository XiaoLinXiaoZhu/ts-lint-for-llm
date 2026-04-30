/**
 * 递归组合评分
 *
 * score(F) = ownScore(F) + Σ_{G∈callees(F)} score(G) × DECAY
 *
 * 纯计算模块 — 不涉及 I/O，不涉及格式化。
 */
import { PROPAGATE_CAPS, SCORABLE_CAPS, type Capability } from "./capabilities.js";
import type { FunctionInfo, ProjectScan } from "./scanner.js";
import type { AnalysisResult } from "./analyzer.js";
import type { LoosenessResult } from "./looseness.js";

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

/** @capability */
export function computeScores(
  scan: ProjectScan,
  result: AnalysisResult,
  loosenessResults: Map<string, LoosenessResult>,
): ScoreSummary {
  const fnScores: FunctionScore[] = [];
  const capScores: Partial<Record<Capability, number>> = {};
  const fileCapScores = new Map<string, number>();

  // ── Build call graph from resolved calls ──
  const callees = new Map<string, string[]>();
  for (const [id, fn] of scan.functions) {
    const ids: string[] = [];
    for (const call of fn.resolvedCalls) {
      if (scan.functions.has(call.target)) ids.push(call.target);
    }
    callees.set(id, ids);
  }

  // ── First pass: own score ──
  for (const [id, fn] of scan.functions) {
    const effective = result.effectiveCaps.get(id) ?? fn.declaredCaps;
    const scorableCaps = fn.isDeclared
      ? [...effective].filter(c => SCORABLE_CAPS.includes(c))
      : [...PROPAGATE_CAPS];
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
  const scoreMap = new Map<string, FunctionScore>();
  for (const fs of fnScores) scoreMap.set(fs.id, fs);

  const DECAY = 0.5;
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 100) {
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

  for (const k of Object.keys(capScores)) {
    capScores[k as Capability] = Math.round(capScores[k as Capability]! * 10) / 10;
  }

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
