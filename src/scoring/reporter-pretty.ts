/**
 * 人类友好报告适配器
 *
 * 带边框和柱状图的终端输出。
 */

import type { ReporterPort } from "./report-types.js";

export const reportPretty: ReporterPort = ({ results, summary: s, tips }) => {
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

  if (tips.length > 0) {
    console.log(`\n── Optimization Tips ──\n`);
    for (const tip of tips) {
      console.log(`  → ${tip.text}`);
    }
    console.log("");
    console.log(`  注意: 每次修改后重新运行评分确认分数变化。分数没降 = 无效修改，应撤回。`);
  }
};
