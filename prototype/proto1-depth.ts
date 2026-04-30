/**
 * Proto 1 v2: 能力传播深度分析
 *
 * 策略变更：ChatFrame-v11 已被 linter 修复，几乎所有函数都声明了能力。
 * 因此不从 declaredCaps 出发，而从能力真正的"源头"出发：
 *   - 调用外部 API（external caps 表匹配）→ 该外部能力在此"诞生"
 *   - auto-detect（async 关键字、nullable 返回、mutable 参数）→ 诞生
 * 然后 BFS 向上游传播，计算每个函数的每种能力的深度。
 *
 * Usage: bun prototype/proto1-depth.ts
 */

import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("prototype/scan-result.json", "utf-8"));
const functions: Record<string, any> = data.functions;
const edges: any[] = data.edges;
const externalCaps: { name: string; caps: string[] }[] = data.externalCaps;

const PROPAGATE_CAPS = ["IO", "Impure", "Fallible", "Async", "Mutable"];

// Build external cap lookup
const extCapMap = new Map<string, string[]>();
for (const ec of externalCaps) {
  extCapMap.set(ec.name, ec.caps);
}

// ── Build adjacency ──
const outEdges = new Map<string, string[]>();  // caller → callees
const inEdges = new Map<string, string[]>();    // callee → callers
for (const fnId of Object.keys(functions)) {
  outEdges.set(fnId, []);
  inEdges.set(fnId, []);
}
for (const e of edges) {
  if (e.isResolved && e.to) {
    outEdges.get(e.from)?.push(e.to);
    inEdges.get(e.to)?.push(e.from);
  }
}

// ── Determine depth-0 "source" functions for each capability ──
// A function is a source for cap C if:
//   a) it has an unresolved call to a function whose name matches externalCaps with C
//   b) C is auto-detected from the function's own code (not declared)
//      → Async: fn has async or Promise return
//      → Fallible: fn returns nullable
//      → Mutable: fn has mutable params
//   c) it calls a node_modules function (qualified name) that we know has C
// For IO and Impure (not auto-detectable): only external calls count

function findSources(): Map<string, Set<string>> {
  // cap → set of fnIds that are sources
  const sources = new Map<string, Set<string>>();
  for (const cap of PROPAGATE_CAPS) sources.set(cap, new Set());

  for (const [fnId, fn] of Object.entries(functions)) {
    const f = fn as any;
    
    // Auto-detectable: check if the function actually has the capability in effectiveCaps
    // (effectiveCaps includes auto-detected features)
    // For auto-detectable caps, being in effectiveCaps means it's a source
    if (f.effectiveCaps.includes("Async")) sources.get("Async")!.add(fnId);
    if (f.effectiveCaps.includes("Fallible")) sources.get("Fallible")!.add(fnId);
    if (f.effectiveCaps.includes("Mutable")) sources.get("Mutable")!.add(fnId);

    // Check unresolved calls for IO and Impure (not auto-detectable)
    const fnEdges = edges.filter((e: any) => e.from === fnId && !e.isResolved);
    for (const e of fnEdges) {
      const name = e.targetName;
      // Check external caps
      const extCaps = extCapMap.get(name);
      if (extCaps) {
        for (const cap of extCaps) {
          if (PROPAGATE_CAPS.includes(cap)) sources.get(cap)!.add(fnId);
        }
      }
      // Check builtin-like names for IO
      if (name === "console" || name === "fetch" || name.includes("readFile") ||
          name.includes("writeFile") || name.includes("mkdir") || name.includes("unlink") ||
          name === "appendFile" || name === "log" || name === "warn" || name === "error" ||
          name === "connect" || name === "send_private_msg" || name === "generate" ||
          name === "create" || name.includes("write") || name.includes("save") ||
          name === "handler" || name === "connect") {
        sources.get("IO")!.add(fnId);
      }
      if (name === "Date.now" || name === "Math.random" || name === "now" || name === "random" ||
          name === "DateConstructor.now" || name === "rnd") {
        sources.get("Impure")!.add(fnId);
      }
      if (name === "JSON.parse" || name === "parse") {
        sources.get("Fallible")!.add(fnId);
      }
    }
  }

  // Remove functions that are sources for IO/Impure but don't actually have those caps
  // (this happens when we're too aggressive in heuristics)
  // Actually keep them — they're our best guess at source points

  return sources;
}

const sources = findSources();

console.error("[proto1] Sources found:");
for (const cap of PROPAGATE_CAPS) {
  const s = sources.get(cap)!;
  console.error(`  ${cap}: ${s.size} sources`);
}

// ── BFS propagation ──
// For each capability, BFS from sources through inEdges (going up to callers)
// Depth 0 = source, depth 1 = direct caller of source, etc.

function computeDepths(): Map<string, Map<string, number>> {
  const depths = new Map<string, Map<string, number>>();
  for (const fnId of Object.keys(functions)) {
    depths.set(fnId, new Map());
  }

  for (const cap of PROPAGATE_CAPS) {
    const queue: [string, number][] = [];
    const visited = new Set<string>();

    for (const src of sources.get(cap)!) {
      queue.push([src, 0]);
      visited.add(src);
    }

    while (queue.length > 0) {
      const [current, curDepth] = queue.shift()!;
      depths.get(current)!.set(cap, curDepth);

      for (const caller of inEdges.get(current) || []) {
        if (visited.has(caller)) continue;
        visited.add(caller);
        queue.push([caller, curDepth + 1]);
      }
    }
  }

  return depths;
}

const depths = computeDepths();

// ── Scoring ──

interface ScoreResult {
  fnId: string;
  name: string;
  pkg: string;
  ws: number;
  declaredCaps: string[];
  effectiveCaps: string[];
  isDeclared: boolean;
  depthMap: Record<string, number>;
  minDepth: number;
  maxDepth: number;
  current: number;
  gate2: number;
  graduated: number;
}

function computeScores(): ScoreResult[] {
  const results: ScoreResult[] = [];

  for (const [fnId, fn] of Object.entries(functions)) {
    const f = fn as any;
    const ws = f.weightedStatements;
    const fnDepths = depths.get(fnId)!;

    // Current scoring: effectiveCaps ∩ propagate
    const scorableCaps = f.isDeclared
      ? f.effectiveCaps.filter((c: string) => PROPAGATE_CAPS.includes(c))
      : [...PROPAGATE_CAPS];

    const depthMap: Record<string, number> = {};
    let minDepth = Infinity, maxDepth = -1;
    for (const cap of scorableCaps) {
      const d = fnDepths.get(cap);
      if (d !== undefined) {
        depthMap[cap] = d;
        if (d < minDepth) minDepth = d;
        if (d > maxDepth) maxDepth = d;
      } else {
        depthMap[cap] = -1; // no depth info
      }
    }
    if (minDepth === Infinity) minDepth = -1;
    if (maxDepth === -1) maxDepth = -1;

    const current = Math.round(ws * scorableCaps.length * 10) / 10;

    // Gate 2: only caps at depth ≥ 2
    const gate2Caps = scorableCaps.filter((c: string) => (depthMap[c] ?? -1) >= 2);
    const gate2 = Math.round(ws * gate2Caps.length * 10) / 10;

    // Graduated
    let gradSum = 0;
    for (const cap of scorableCaps) {
      const d = depthMap[cap] ?? -1;
      let mult = d < 0 ? 1 : d <= 1 ? 0.5 : d === 2 ? 1.0 : d - 1;
      gradSum += mult;
    }
    const graduated = Math.round(ws * gradSum * 10) / 10;

    results.push({
      fnId, name: f.name, pkg: f.pkg, ws,
      declaredCaps: f.declaredCaps,
      effectiveCaps: f.effectiveCaps,
      isDeclared: f.isDeclared,
      depthMap, minDepth, maxDepth,
      current, gate2, graduated,
    });
  }

  return results.sort((a, b) => b.current - a.current);
}

const scores = computeScores();

// ── Report ──

console.log("=".repeat(100));
console.log("Proto 1 v2: Propagation Depth from True Sources");
console.log("=".repeat(100));

const totalCur = scores.reduce((s, r) => s + r.current, 0);
const totalGate2 = scores.reduce((s, r) => s + r.gate2, 0);
const totalGrad = scores.reduce((s, r) => s + r.graduated, 0);

console.log(`\nScoring comparison:`);
console.log(`  Current (gate=1):      ${totalCur.toFixed(1)}`);
console.log(`  2-hop (gate=2):         ${totalGate2.toFixed(1)}  (${((1 - totalGate2/totalCur) * 100).toFixed(0)}% reduction)`);
console.log(`  Graduated multiplier:   ${totalGrad.toFixed(1)}  (${((1 - totalGrad/totalCur) * 100).toFixed(0)}% reduction)`);

// Depth distribution
console.log(`\nDepth distribution:`);
for (const cap of PROPAGATE_CAPS) {
  const ds: number[] = [];
  for (const r of scores) {
    const d = r.depthMap[cap];
    if (d !== undefined && d >= 0) ds.push(d);
  }
  if (ds.length === 0) { console.log(`  ${cap}: no data`); continue; }
  const avg = ds.reduce((a,b) => a+b, 0) / ds.length;
  const dist: Record<number, number> = {};
  for (const d of ds) dist[d] = (dist[d] || 0) + 1;
  const distStr = Object.entries(dist).sort((a,b) => +a[0]-+b[0])
    .map(([k,v]) => `d${k}:${v}`).join(" ");
  console.log(`  ${cap.padEnd(10)}: ${ds.length} fns, avg=${avg.toFixed(1)}, ${distStr}`);
}

// Top 20 functions
console.log(`\nTop 20 by current score:`);
console.log("─".repeat(100));
console.log(`${"Function".padEnd(22)} ${"pkg".padEnd(18)} ${"ws".padStart(4)} ${"caps".padStart(4)} ${"d-min".padStart(5)} ${"d-max".padStart(5)} ${"cur".padStart(6)} ${"g2".padStart(6)} ${"grad".padStart(6)} ${"depthMap"}`);
console.log("─".repeat(100));
for (const r of scores.slice(0, 20)) {
  const dm = Object.entries(r.depthMap).map(([c,d]) => `${c}:${d}`).join(" ");
  console.log(
    `${r.name.slice(0, 20).padEnd(22)} ${r.pkg.slice(0, 16).padEnd(18)} ${String(r.ws).padStart(4)} ${String(r.effectiveCaps.filter((c: string) => PROPAGATE_CAPS.includes(c)).length).padStart(4)} ${String(r.minDepth).padStart(5)} ${String(r.maxDepth).padStart(5)} ${String(r.current).padStart(6)} ${String(r.gate2).padStart(6)} ${String(r.graduated).padStart(6)} ${dm.slice(0, 35)}`
  );
}

// Top drops under 2-hop
console.log(`\nTop 15 score changes under gate=2 (largest drops):`);
const drops = scores.map(r => ({ ...r, drop: r.current - r.gate2 }))
  .filter(r => r.drop > 0)
  .sort((a, b) => b.drop - a.drop)
  .slice(0, 15);
console.log("─".repeat(100));
for (const r of drops) {
  const dm = Object.entries(r.depthMap).map(([c,d]) => `${c}:${d}`).join(" ");
  console.log(
    `${r.name.slice(0, 20).padEnd(22)} ${r.pkg.slice(0, 16).padEnd(18)} d=${String(r.minDepth).padStart(2)} drop=${String(r.drop.toFixed(1)).padStart(6)} ${dm.slice(0, 40)}`
  );
}

// Functions with depth ≥ 2 (interesting — deep propagation)
console.log(`\nFunctions with depth ≥ 2 for any capability (deep propagation):`);
const deep = scores.filter(r => r.maxDepth >= 2).sort((a, b) => b.maxDepth - a.maxDepth);
console.log(`  Count: ${deep.length}`);
for (const r of deep.slice(0, 20)) {
  const dm = Object.entries(r.depthMap).filter(([,d]) => d >= 0).map(([c,d]) => `${c}:${d}`).join(" ");
  console.log(`  ${r.name.padEnd(22)} ${r.pkg.padEnd(18)} maxDepth=${r.maxDepth}  ${dm}`);
}
