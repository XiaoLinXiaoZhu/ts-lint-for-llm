import { readFileSync, writeFileSync, existsSync } from "node:fs";

// 按"代码写法"维度分区，而非按历史年代
const SEEDS = [
  { id: "naming-encoding", label: "命名与标识符中的语义编码" },
  { id: "type-narrowing", label: "类型收窄与 branded types" },
  { id: "state-modeling", label: "状态建模与幽灵状态消除" },
  { id: "interface-design", label: "接口形态与最小暴露" },
  { id: "effect-tracking", label: "副作用追踪与标记" },
  { id: "data-flow-types", label: "数据流阶段的窄类型" },
  { id: "error-modeling", label: "错误表示与传播方式" },
  { id: "redundancy-encoding", label: "冗余信息编码（注释/命名/类型的重叠表达）" },
  { id: "module-boundary", label: "模块边界处的代码形态" },
  { id: "literal-exhaustive", label: "字面量穷举与编译期完备性" },
];

const STATE_FILE = ".temp/era_state.json";

let picked: string[] = [];
if (existsSync(STATE_FILE)) {
  picked = JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

const remaining = SEEDS.filter((e) => !picked.includes(e.id));

if (remaining.length === 0) {
  console.log("ALL_DONE: 所有种子已抽完。");
  process.exit(0);
}

const idx = Math.floor(Math.random() * remaining.length);
const chosen = remaining[idx];
picked.push(chosen.id);
writeFileSync(STATE_FILE, JSON.stringify(picked, null, 2));

console.log(`[${picked.length}/${SEEDS.length}] 🎲 抽中: ${chosen.label}`);
console.log(`剩余: ${remaining.length - 1} 个种子`);
