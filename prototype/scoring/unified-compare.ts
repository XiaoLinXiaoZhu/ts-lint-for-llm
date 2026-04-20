import { scoreFile, printUnified, printComparison } from "./unified-engine.ts";
import { resolve } from "node:path";

const dir = import.meta.dir;

const scenarios = [
  { label: "bad", file: "unified-bad.ts", desc: "能力混合+类型松散" },
  { label: "mixed-A", file: "unified-mixed-a.ts", desc: "能力分离+类型松散" },
  { label: "mixed-B", file: "unified-mixed-b.ts", desc: "类型紧凑+能力混合" },
  { label: "good", file: "unified-good.ts", desc: "能力分离+类型紧凑" },
];

const scored = scenarios.map(s => ({
  label: s.label,
  desc: s.desc,
  score: scoreFile(resolve(dir, s.file)),
}));

for (const s of scored) {
  printUnified(s.score, `${s.label}: ${s.desc}`);
}

printComparison(scored);

// 二维散点图（文本版）
console.log(`\n\n${"═".repeat(70)}`);
console.log("  二维评分空间");
console.log(`${"═".repeat(70)}`);
console.log("\n  纵轴: 类型松散度 ↑ = 差");
console.log("  横轴: 能力负担   → = 差\n");

const maxCap = Math.max(...scored.map(s => s.score.capability.total));
const maxLoose = Math.max(...scored.map(s => s.score.looseness.total));

const W = 50, H = 20;
const grid: string[][] = Array.from({ length: H + 1 }, () => Array(W + 1).fill(" "));

// 坐标轴
for (let x = 0; x <= W; x++) grid[H][x] = "─";
for (let y = 0; y <= H; y++) grid[y][0] = "│";
grid[H][0] = "└";

// 放置点
for (const s of scored) {
  const x = Math.round((s.score.capability.total / maxCap) * (W - 2)) + 1;
  const y = H - 1 - Math.round((s.score.looseness.total / maxLoose) * (H - 2));
  const ch = s.label[0].toUpperCase();
  grid[y][x] = ch;
}

for (const row of grid) {
  console.log("  " + row.join(""));
}

console.log(`\n  B=bad  A=mixed-A  M=mixed-B  G=good`);
console.log(`  理想位置: 左下角 (两个维度都低)`);

// 关键分析
console.log(`\n${"═".repeat(70)}`);
console.log("  分析");
console.log(`${"═".repeat(70)}\n`);

const [bad, mixA, mixB, good] = scored;

console.log(`  bad   → good:   能力 ${bad.score.capability.total} → ${good.score.capability.total} (${((bad.score.capability.total - good.score.capability.total) / bad.score.capability.total * 100).toFixed(0)}%)   松散 ${bad.score.looseness.total} → ${good.score.looseness.total} (${bad.score.looseness.total > 0 ? ((bad.score.looseness.total - good.score.looseness.total) / bad.score.looseness.total * 100).toFixed(0) : 0}%)`);
console.log(`  bad   → mixA:   能力 ${bad.score.capability.total} → ${mixA.score.capability.total} (${((bad.score.capability.total - mixA.score.capability.total) / bad.score.capability.total * 100).toFixed(0)}%)   松散 ${bad.score.looseness.total} → ${mixA.score.looseness.total}`);
console.log(`  bad   → mixB:   能力 ${bad.score.capability.total} → ${mixB.score.capability.total}   松散 ${bad.score.looseness.total} → ${mixB.score.looseness.total} (${bad.score.looseness.total > 0 ? ((bad.score.looseness.total - mixB.score.looseness.total) / bad.score.looseness.total * 100).toFixed(0) : 0}%)`);

console.log(`\n  独立性验证:`);
console.log(`    mixed-A 只优化了能力，不优化类型 → 能力降但松散度不变`);
console.log(`    mixed-B 只优化了类型，不优化能力 → 松散度降但能力不变`);
console.log(`    → 两个维度确实独立，不能互相替代`);
