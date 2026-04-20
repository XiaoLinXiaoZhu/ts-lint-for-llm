/**
 * LLM 文本报告适配器
 *
 * Markdown 格式，包含优化建议。
 * 适合直接粘贴给 LLM 阅读。
 */

import type { ReporterPort } from "./report-types.js";

export const reportLLM: ReporterPort = ({ results, summary: s, tips }) => {
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

  if (tips.length > 0) {
    console.log();
    console.log(`## Optimization Tips`);
    for (const tip of tips) {
      console.log(`- ${tip.text}`);
    }
    console.log();
    console.log(`每次修改后重新运行评分确认分数变化。分数没降 = 无效修改，应撤回。`);
  }
};
