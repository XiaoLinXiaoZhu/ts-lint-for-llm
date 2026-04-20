/**
 * 报告输出
 *
 * 基于 AnalysisResult 生成：
 * - pretty: 终端友好的彩色输出
 * - json: 机器可读
 */

import { ALL_CAPABILITIES, type Capability } from "./capabilities.js";
import { DiagnosticKind, type AnalysisResult, type Diagnostic } from "./analyzer.js";
import type { FunctionInfo, ProjectScan } from "./scanner.js";
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

export interface ScoreSummary {
  totalScore: number;
  totalFunctions: number;
  totalPure: number;
  totalUndeclared: number;
  capScores: Partial<Record<Capability, number>>;
  topFunctions: FunctionScore[];
}

export function computeScores(scan: ProjectScan, effectiveCaps: Map<string, Set<Capability>>): ScoreSummary {
  const fnScores: FunctionScore[] = [];
  const capScores: Partial<Record<Capability, number>> = {};

  for (const [id, fn] of scan.functions) {
    const caps = effectiveCaps.get(id) ?? fn.declaredCaps;
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
  }

  for (const k of Object.keys(capScores)) {
    capScores[k as Capability] = Math.round(capScores[k as Capability]! * 10) / 10;
  }

  fnScores.sort((a, b) => b.score - a.score);

  return {
    totalScore: Math.round(fnScores.reduce((s, f) => s + f.score, 0) * 10) / 10,
    totalFunctions: fnScores.length,
    totalPure: fnScores.filter(f => f.isDeclared && f.caps.length === 0).length,
    totalUndeclared: fnScores.filter(f => !f.isDeclared).length,
    capScores,
    topFunctions: fnScores.slice(0, 10),
  };
}

// ── Pretty 输出 ──

const SEVERITY_ICON: Record<DiagnosticKind, string> = {
  [DiagnosticKind.Escalation]: "error",
  [DiagnosticKind.AsyncMismatch]: "error",
  [DiagnosticKind.FallibleMismatch]: "error",
  [DiagnosticKind.Absorbed]: "warn ",
  [DiagnosticKind.Unregistered]: "error",
  [DiagnosticKind.Undeclared]: "error",
};

export function formatPretty(
  result: AnalysisResult,
  scores: ScoreSummary,
  cwd: string,
): string {
  const lines: string[] = [];

  // 按文件分组诊断
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
      const sev = SEVERITY_ICON[d.kind];
      lines.push(`  ${String(d.line).padStart(4)}  ${sev}  ${d.message}`);
    }
  }

  const errors = result.diagnostics.filter(d => d.kind !== DiagnosticKind.Absorbed).length;
  const warnings = result.diagnostics.filter(d => d.kind === DiagnosticKind.Absorbed).length;
  lines.push(`\n✖ ${result.diagnostics.length} problems (${errors} errors, ${warnings} warnings)`);

  // 评分摘要
  lines.push(`\n── Score ──`);
  lines.push(`Total: ${scores.totalScore}  (${scores.totalFunctions} functions, ${scores.totalPure} pure, ${scores.totalUndeclared} undeclared)`);

  if (Object.keys(scores.capScores).length > 0) {
    const capLine = ALL_CAPABILITIES
      .filter(c => scores.capScores[c])
      .map(c => `${c}: ${scores.capScores[c]}`)
      .join("  ");
    lines.push(`By capability: ${capLine}`);
  }

  if (scores.topFunctions.length > 0) {
    lines.push(`\nTop functions by score:`);
    for (const fn of scores.topFunctions.slice(0, 5)) {
      const rel = relative(cwd, fn.filePath);
      const caps = fn.isDeclared ? (fn.caps.length > 0 ? fn.caps.join("+") : "pure") : "UNDECLARED";
      lines.push(`  ${String(fn.score).padStart(6)}  ${rel}:${fn.line}  ${fn.name} [${caps}]`);
    }
  }

  return lines.join("\n");
}

// ── JSON 输出 ──

export function formatJSON(
  result: AnalysisResult,
  scores: ScoreSummary,
  cwd: string,
): string {
  return JSON.stringify({
    diagnostics: result.diagnostics.map(d => ({
      ...d,
      filePath: relative(cwd, d.filePath),
    })),
    scores: {
      ...scores,
      topFunctions: scores.topFunctions.map(f => ({
        ...f,
        filePath: relative(cwd, f.filePath),
      })),
    },
  }, null, 2);
}
