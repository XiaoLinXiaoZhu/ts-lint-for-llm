import { scoreFile, printReport, printComparison, printHeatmap } from "./engine.ts";
import { resolve } from "node:path";

const dir = import.meta.dir;
const bad = scoreFile(resolve(dir, "example-bad.ts"));
const good = scoreFile(resolve(dir, "example-good.ts"));
const best = scoreFile(resolve(dir, "example-best.ts"));

printReport(bad, "改造前 (example-bad.ts)");
printReport(good, "改造后 (example-good.ts)");
printReport(best, "最优化 (example-best.ts)");

console.log("\n\n" + "═".repeat(70));
console.log("  三方对比");
console.log("═".repeat(70));

// 合并所有能力
const allCaps = [...new Set([
  ...Object.keys(bad.capScores),
  ...Object.keys(good.capScores),
  ...Object.keys(best.capScores),
])].sort();

console.log(`\n  ${"能力".padEnd(15)} ${"改造前".padStart(8)} ${"改造后".padStart(8)} ${"最优化".padStart(8)} ${"前→后".padStart(7)} ${"前→优".padStart(7)}`);
console.log(`  ${"─".repeat(58)}`);

for (const cap of allCaps) {
  const bv = bad.capScores[cap] || 0;
  const gv = good.capScores[cap] || 0;
  const sv = best.capScores[cap] || 0;
  const dropG = bv > 0 ? ((bv - gv) / bv * 100).toFixed(0) + "%" : "—";
  const dropS = bv > 0 ? ((bv - sv) / bv * 100).toFixed(0) + "%" : "—";
  const abbrev = { Async: "A", Blocking: "B", Fallible: "E", IO: "I", Mutable: "M", Impure: "P", ThreadLocal: "T", Unsafe: "U" }[cap] || cap;
  console.log(
    `  ${abbrev}(${cap.padEnd(10)}) ${bv.toFixed(1).padStart(8)} ${gv.toFixed(1).padStart(8)} ${sv.toFixed(1).padStart(8)} ${dropG.padStart(7)} ${dropS.padStart(7)}`
  );
}

console.log(`  ${"─".repeat(58)}`);
console.log(
  `  ${"总分".padEnd(15)} ${bad.totalScore.toFixed(1).padStart(8)} ${good.totalScore.toFixed(1).padStart(8)} ${best.totalScore.toFixed(1).padStart(8)} ` +
  `${((bad.totalScore - good.totalScore) / bad.totalScore * 100).toFixed(0).padStart(6)}% ${((bad.totalScore - best.totalScore) / bad.totalScore * 100).toFixed(0).padStart(6)}%`
);

// 结构对比
console.log(`\n  结构指标            改造前    改造后    最优化`);
console.log(`  ${"─".repeat(50)}`);
const metrics = [
  ["函数数", (s: typeof bad) => s.functions.length],
  ["纯函数", (s: typeof bad) => s.functions.filter(f => f.declared && f.caps.length === 0).length],
  ["未声明", (s: typeof bad) => s.functions.filter(f => !f.declared).length],
  ["原始行", (s: typeof bad) => s.functions.reduce((a, f) => a + f.rawLines, 0)],
  ["加权行", (s: typeof bad) => s.functions.reduce((a, f) => a + f.weightedLines, 0)],
  ["最大CC", (s: typeof bad) => Math.max(...s.functions.map(f => f.cyclomaticComplexity))],
  ["总CC",   (s: typeof bad) => s.functions.reduce((a, f) => a + f.cyclomaticComplexity, 0)],
] as const;

for (const [label, fn] of metrics) {
  const bv = fn(bad), gv = fn(good), sv = fn(best);
  console.log(`  ${label.padEnd(18)} ${String(bv).padStart(8)} ${String(gv).padStart(8)} ${String(sv).padStart(8)}`);
}

// 平均权重
const avgW = (s: typeof bad) => {
  const raw = s.functions.reduce((a, f) => a + f.rawLines, 0);
  const w = s.functions.reduce((a, f) => a + f.weightedLines, 0);
  return raw > 0 ? (w / raw).toFixed(2) : "0";
};
console.log(`  ${"平均行权重".padEnd(18)} ${avgW(bad).padStart(8)} ${avgW(good).padStart(8)} ${avgW(best).padStart(8)}`);
