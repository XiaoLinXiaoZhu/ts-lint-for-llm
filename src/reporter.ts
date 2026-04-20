/**
 * 报告输出
 *
 * 三种格式：pretty（终端）、json（机器可读）、llm（Markdown）
 * 包含评分计算和优化建议。
 */

import { ALL_CAPABILITIES, type Capability } from "./capabilities.js";
import { DiagnosticKind, type AnalysisResult, type Diagnostic } from "./analyzer.js";
import type { FunctionInfo, ProjectScan } from "./scanner.js";
import type { LoosenessResult } from "./looseness.js";
import { relative } from "node:path";

// ── 评分 ──

export interface FunctionScore {
  id: string;
  name: string;
  filePath: string;
  line: number;
  caps: Capability[];
  isDeclared: boolean;
  weightedStatements: number;
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
  totalLoose: number;
  totalFunctions: number;
  totalPure: number;
  totalUndeclared: number;
  capScores: Partial<Record<Capability, number>>;
  looseByType: Record<string, { count: number; penalty: number }>;
  topFunctions: FunctionScore[];
  fileScores: FileScore[];
  tips: string[];
}

export function computeScores(
  scan: ProjectScan,
  result: AnalysisResult,
  loosenessResults: Map<string, LoosenessResult>,
): ScoreSummary {
  const fnScores: FunctionScore[] = [];
  const capScores: Partial<Record<Capability, number>> = {};
  const fileCapScores = new Map<string, number>();

  for (const [id, fn] of scan.functions) {
    const caps = result.effectiveCaps.get(id) ?? fn.declaredCaps;
    const capList = fn.isDeclared ? [...caps] : ALL_CAPABILITIES;
    const score = Math.round(fn.weightedStatements * capList.length * 10) / 10;

    fnScores.push({
      id, name: fn.name, filePath: fn.filePath, line: fn.line,
      caps: capList as Capability[], isDeclared: fn.isDeclared,
      weightedStatements: fn.weightedStatements, score,
    });

    for (const c of capList) {
      capScores[c] = (capScores[c] || 0) + fn.weightedStatements;
    }
    fileCapScores.set(fn.filePath, (fileCapScores.get(fn.filePath) || 0) + score);
  }

  for (const k of Object.keys(capScores)) {
    capScores[k as Capability] = Math.round(capScores[k as Capability]! * 10) / 10;
  }

  fnScores.sort((a, b) => b.score - a.score);

  // Looseness 汇总
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

  // 文件级评分
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
  const totalFunctions = fnScores.length;
  const totalPure = fnScores.filter(f => f.isDeclared && f.caps.length === 0).length;
  const totalUndeclared = fnScores.filter(f => !f.isDeclared).length;

  // Tips
  const tips = generateTips(fnScores, totalCap, totalLoose, totalFunctions, totalPure, totalUndeclared);

  return {
    totalCap, totalLoose, totalFunctions, totalPure, totalUndeclared,
    capScores, looseByType, topFunctions: fnScores.slice(0, 10), fileScores, tips,
  };
}

function generateTips(
  fns: FunctionScore[], totalCap: number, totalLoose: number,
  totalFunctions: number, totalPure: number, totalUndeclared: number,
): string[] {
  const tips: string[] = [];

  if (totalUndeclared > 0) {
    tips.push(`声明能力: ${totalUndeclared} 个函数未声明能力，按最大惩罚(×5)计分。添加 @capability 标注可立即降分。`);
  }

  const maxFn = fns.find(f => f.caps.length >= 3);
  if (maxFn) {
    tips.push(`拆分高负担函数: ${relative(process.cwd(), maxFn.filePath)}:${maxFn.line} ${maxFn.name} 携带 ${maxFn.caps.length} 个能力(${maxFn.caps.join("+")})。提取纯逻辑为独立函数可降分。`);
  }

  const multiCap = fns.filter(f => f.isDeclared && f.caps.length >= 2);
  if (multiCap.length > 2) {
    tips.push(`系统性重构: ${multiCap.length} 个函数携带 2+ 能力。考虑纯 transition + 薄 IO 层模式。`);
  }

  if (totalFunctions > 3 && totalPure / totalFunctions < 0.3) {
    tips.push(`提升纯函数占比: 当前 ${Math.round(totalPure / totalFunctions * 100)}%，收窄函数参数可减少外部能力依赖。`);
  }

  if (totalCap > 0 && totalLoose > 0) {
    tips.push(`优先降低能力负担(${totalCap.toFixed(1)})，再处理类型松散度(${totalLoose})。`);
  }

  return tips;
}

// ── Pretty 输出 ──

export function formatPretty(result: AnalysisResult, scores: ScoreSummary, cwd: string): string {
  const lines: string[] = [];

  // 诊断按文件分组
  const byFile = new Map<string, Diagnostic[]>();
  for (const d of result.diagnostics) {
    const rel = relative(cwd, d.filePath);
    const list = byFile.get(rel) || [];
    list.push(d);
    byFile.set(rel, list);
  }

  for (const [file, diags] of [...byFile.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`\n${file}`);
    for (const d of diags.sort((a, b) => a.line - b.line)) {
      const sev = d.kind === DiagnosticKind.Absorbed ? "warn " : "error";
      lines.push(`  ${String(d.line).padStart(4)}  ${sev}  ${d.message}`);
    }
  }

  const errors = result.diagnostics.filter(d => d.kind !== DiagnosticKind.Absorbed).length;
  const warnings = result.diagnostics.filter(d => d.kind === DiagnosticKind.Absorbed).length;
  lines.push(`\n✖ ${result.diagnostics.length} problems (${errors} errors, ${warnings} warnings)`);

  // 评分
  lines.push(`\n══ Score ══`);
  lines.push(`Capability Burden: ${scores.totalCap}  |  Type Looseness: ${scores.totalLoose}`);
  lines.push(`Functions: ${scores.totalFunctions}  |  Pure: ${scores.totalPure}  |  Undeclared: ${scores.totalUndeclared}`);

  if (Object.keys(scores.capScores).length > 0) {
    const maxVal = Math.max(...Object.values(scores.capScores).filter(Boolean) as number[], 1);
    for (const c of ALL_CAPABILITIES) {
      const v = scores.capScores[c];
      if (!v) continue;
      const bar = "█".repeat(Math.round(v / maxVal * 20));
      lines.push(`  ${c.padEnd(12)} ${String(v).padStart(7)}  ${bar}`);
    }
  }

  if (Object.keys(scores.looseByType).length > 0) {
    lines.push(`\nLooseness:`);
    for (const [t, info] of Object.entries(scores.looseByType).sort((a, b) => b[1].penalty - a[1].penalty)) {
      lines.push(`  ${t.padEnd(22)} ×${String(info.count).padStart(3)}  = ${String(info.penalty).padStart(4)}`);
    }
  }

  if (scores.topFunctions.length > 0) {
    lines.push(`\nTop functions:`);
    for (const fn of scores.topFunctions.slice(0, 5)) {
      const rel = relative(cwd, fn.filePath);
      const caps = fn.isDeclared ? (fn.caps.length > 0 ? fn.caps.join("+") : "pure") : "UNDECLARED";
      lines.push(`  ${String(fn.score).padStart(6)}  ${rel}:${fn.line}  ${fn.name} [${caps}]`);
    }
  }

  if (scores.tips.length > 0) {
    lines.push(`\n── Tips ──`);
    for (const tip of scores.tips) lines.push(`  → ${tip}`);
  }

  return lines.join("\n");
}

// ── JSON 输出 ──

export function formatJSON(result: AnalysisResult, scores: ScoreSummary, cwd: string): string {
  return JSON.stringify({
    diagnostics: result.diagnostics.map(d => ({
      ...d, filePath: relative(cwd, d.filePath),
      declaredCaps: undefined, effectiveCaps: undefined,
    })),
    scores: {
      ...scores,
      topFunctions: scores.topFunctions.map(f => ({ ...f, filePath: relative(cwd, f.filePath) })),
      fileScores: scores.fileScores.map(f => ({ ...f, filePath: relative(cwd, f.filePath) })),
    },
  }, null, 2);
}

// ── LLM 输出 ──

export function formatLLM(result: AnalysisResult, scores: ScoreSummary, cwd: string): string {
  const lines: string[] = [];
  lines.push(`# Capability Report`);
  lines.push(`Functions: ${scores.totalFunctions} | Pure: ${scores.totalPure} | Undeclared: ${scores.totalUndeclared}`);
  lines.push(``);
  lines.push(`## Capability Burden: ${scores.totalCap}`);
  for (const c of ALL_CAPABILITIES) {
    const v = scores.capScores[c];
    if (v) lines.push(`${c}: ${v}`);
  }
  lines.push(``);
  lines.push(`## Type Looseness: ${scores.totalLoose}`);
  if (Object.keys(scores.looseByType).length === 0) {
    lines.push(`(none)`);
  } else {
    for (const [t, info] of Object.entries(scores.looseByType).sort((a, b) => b[1].penalty - a[1].penalty)) {
      lines.push(`${t}: ×${info.count} = ${info.penalty}`);
    }
  }

  if (scores.fileScores.length > 1) {
    lines.push(``);
    lines.push(`## File Details`);
    for (const f of scores.fileScores) {
      if (f.capScore === 0 && f.looseScore === 0) continue;
      lines.push(`${relative(cwd, f.filePath)}: cap=${f.capScore} loose=${f.looseScore} fn=${f.functions} pure=${f.pure} undecl=${f.undeclared}`);
    }
  }

  const undeclared = [...result.diagnostics].filter(d => d.kind === DiagnosticKind.Undeclared);
  if (undeclared.length > 0) {
    lines.push(``);
    lines.push(`## Undeclared Functions (${undeclared.length})`);
    for (const d of undeclared) {
      lines.push(`${relative(cwd, d.filePath)}:${d.line} ${d.functionName}`);
    }
  }

  if (scores.tips.length > 0) {
    lines.push(``);
    lines.push(`## Optimization Tips`);
    for (const tip of scores.tips) lines.push(`- ${tip}`);
    lines.push(``);
    lines.push(`每次修改后重新运行评分确认分数变化。分数没降 = 无效修改，应撤回。`);
  }

  return lines.join("\n");
}
