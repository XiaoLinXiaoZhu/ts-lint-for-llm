/**
 * JSON 报告适配器（默认）
 *
 * 输出完整分层 JSON，函数按 score 降序排列。
 * 供 AI agent 或其他工具解析。
 */

import { computeFnScore } from "./report-core.js";
import type { ReporterPort } from "./report-types.js";

export const reportJSON: ReporterPort = ({ results, summary: s, tips }) => {
  const output = {
    summary: {
      files: results.length,
      functions: s.totalFunctions,
      pure: s.totalPure,
      undeclared: s.totalUndeclared,
      capabilityBurden: Math.round(s.totalCap * 10) / 10,
      typeLooseness: s.totalLoose,
      capScores: s.capScores,
      looseByType: s.looseByType,
    },
    files: results.map(r => ({
      file: r.file,
      capability: {
        total: r.capability.total,
        capScores: r.capability.capScores,
        functions: r.capability.functions
          .map(fn => ({
            name: fn.name,
            line: fn.line,
            caps: fn.caps,
            declared: fn.declared,
            statements: fn.statements,
            weightedStatements: fn.weightedStatements,
            score: computeFnScore(fn),
          }))
          .sort((a, b) => b.score - a.score),
      },
      looseness: {
        total: r.looseness.total,
        signals: r.looseness.signals,
      },
    })),
    tips: tips.map(t => t.text),
  };

  console.log(JSON.stringify(output, null, 2));
};
