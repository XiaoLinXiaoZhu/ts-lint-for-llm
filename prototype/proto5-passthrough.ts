/**
 * Proto 5: Pass-through Detection & Indirection Tax
 *
 * 核心问题：当前 linter 鼓励按能力拆分函数，导致大量 "pass-through" 函数——
 * 自身逻辑极少，主要工作就是把调用转发给另一个函数。
 * 虽然每个函数个体看起来很"纯"，但理解一个功能需要追踪十几个函数。
 *
 * 检测指标：
 *   1. Pass-through score: 函数的"转发程度"（0~1）
 *   2. Chain depth: 从入口函数到叶子函数的最长路径
 *   3. Transitive fan-out: 一个函数间接调用了多少不同函数
 *   4. Indirection ratio: 链中 pass-through 函数占比
 *
 * Usage: bun prototype/proto5-passthrough.ts
 */

import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("prototype/scan-result.json", "utf-8"));
const functions: Record<string, any> = data.functions;
const edges: any[] = data.edges;

const nodeIds = Object.keys(functions);
const nodeSet = new Set(nodeIds);

// ── Build call graph (resolved only) ──

const calleesOf = new Map<string, string[]>();    // fn → direct callees
const callersOf = new Map<string, string[]>();    // fn → direct callers
for (const id of nodeIds) {
  calleesOf.set(id, []);
  callersOf.set(id, []);
}
for (const e of edges) {
  if (e.isResolved && e.to && nodeSet.has(e.from) && nodeSet.has(e.to)) {
    calleesOf.get(e.from)!.push(e.to);
    callersOf.get(e.to)!.push(e.from);
  }
}

// ── 1. Pass-through detection ──

interface PassThroughInfo {
  fnId: string;
  name: string;
  pkg: string;
  ws: number;
  directCallees: number;      // how many resolved callees
  totalCalls: number;          // resolved + unresolved calls
  declaredCaps: string[];
  effectiveCaps: string[];
  isDeclared: boolean;
  // Pass-through metrics
  isPureRouter: boolean;       // ws ≤ 2, only 1-2 callees, adds minimal logic
  isThinWrapper: boolean;      // ws ≤ 5, delegates most work
  passThroughScore: number;    // 0~1, higher = more of a pass-through
  // Why it exists (guessed)
  guessedReason: string;
}

function detectPassThroughs(): PassThroughInfo[] {
  const results: PassThroughInfo[] = [];

  for (const [fnId, fn] of Object.entries(functions)) {
    const f = fn as any;
    const directCallees = calleesOf.get(fnId)?.length || 0;
    
    // Count total calls (including unresolved)
    const fnEdges = edges.filter((e: any) => e.from === fnId);
    const totalCalls = fnEdges.length;

    // Pass-through score calculation:
    // Components:
    //   a) thinness: low ws relative to callee count → high score
    //   b) delegation ratio: most calls are to other functions → high score  
    //   c) capability match: own caps ≈ callees' caps → high score (not adding new capabilities)
    
    // a) Thinness: ws ≤ 3 is "thin", ws ≤ 1 is "very thin"
    const thinnessScore = f.weightedStatements <= 1 ? 1.0 :
                          f.weightedStatements <= 3 ? 0.7 :
                          f.weightedStatements <= 5 ? 0.4 :
                          f.weightedStatements <= 10 ? 0.1 : 0;

    // b) Delegation: has callees and total calls > ws (more calls than statements)
    const delegationScore = directCallees === 0 ? 0 :
                            directCallees === 1 ? 0.8 :  // single callee = pure delegation
                            directCallees <= 2 ? 0.6 :
                            directCallees <= 3 ? 0.3 : 0.1;

    // c) Combined
    const passThroughScore = Math.round((thinnessScore * 0.5 + delegationScore * 0.5) * 100) / 100;

    // Classification
    const isPureRouter = f.weightedStatements <= 2 && directCallees >= 1 && totalCalls <= 3;
    const isThinWrapper = f.weightedStatements <= 5 && directCallees >= 1;

    // Guess why it exists
    let reason = "";
    if (directCallees === 1 && f.weightedStatements <= 2) {
      reason = "单调用转发（只是重命名了一次调用）";
    } else if (directCallees >= 2 && f.weightedStatements <= 3 && totalCalls === directCallees) {
      reason = "纯串联/路由（if-else分发到不同函数）";
    } else if (f.effectiveCaps.length === 0 && directCallees > 0) {
      reason = "纯函数包装（自身零能力，只做调用编排）";
    } else if (f.isDeclared && f.declaredCaps.length === 0 && directCallees > 0) {
      reason = "声明为纯函数但实际是转发";
    } else if (f.weightedStatements <= 3) {
      reason = "极薄包装（ws≤3，可能是过度拆分）";
    } else if (f.weightedStatements <= 5 && directCallees >= 1) {
      reason = "薄包装";
    } else {
      reason = "正常函数";
    }

    results.push({
      fnId, name: f.name, pkg: f.pkg, ws: f.weightedStatements,
      directCallees, totalCalls,
      declaredCaps: f.declaredCaps, effectiveCaps: f.effectiveCaps,
      isDeclared: f.isDeclared,
      isPureRouter, isThinWrapper,
      passThroughScore,
      guessedReason: reason,
    });
  }

  return results.sort((a, b) => b.passThroughScore - a.passThroughScore);
}

const ptResults = detectPassThroughs();

// ── 2. Transitive fan-out + chain depth ──

function computeTransitiveMetrics(): Map<string, { fanOut: number; maxDepth: number; avgDepth: number }> {
  const metrics = new Map<string, { fanOut: number; maxDepth: number; avgDepth: number }>();

  for (const fnId of nodeIds) {
    // BFS/DFS to find all reachable functions and depths
    const visited = new Set<string>();
    const depths = new Map<string, number>(); // fnId → min depth from start
    
    function dfs(current: string, depth: number) {
      if (depth > 20) return; // safety limit
      if (!visited.has(current) || (depths.get(current) || 0) > depth) {
        visited.add(current);
        depths.set(current, depth);
        for (const callee of calleesOf.get(current) || []) {
          dfs(callee, depth + 1);
        }
      }
    }

    dfs(fnId, 0);
    
    // Remove self
    visited.delete(fnId);
    depths.delete(fnId);

    const fanOut = visited.size;
    const maxDepth = depths.size > 0 ? Math.max(...depths.values()) : 0;
    const avgDepth = depths.size > 0 ? [...depths.values()].reduce((a, b) => a + b, 0) / depths.size : 0;

    metrics.set(fnId, { fanOut, maxDepth, avgDepth });
  }

  return metrics;
}

const transMetrics = computeTransitiveMetrics();

// ── 3. Entry point analysis ──
// Entry points: functions called by 0 other internal functions (top-level)

function findEntryPoints(): string[] {
  return nodeIds.filter(id => (callersOf.get(id)?.length || 0) === 0);
}

const entryPoints = findEntryPoints();
console.error(`[proto5] Entry points (called by nobody): ${entryPoints.length}`);

// ── Report ──

console.log("=".repeat(80));
console.log("Proto 5: Pass-through Detection & Indirection Tax");
console.log("=".repeat(80));

// Summary
const pureRouters = ptResults.filter(r => r.isPureRouter);
const thinWrappers = ptResults.filter(r => r.isThinWrapper);
const highPT = ptResults.filter(r => r.passThroughScore >= 0.6);

console.log(`\nSummary:`);
console.log(`  Total functions: ${nodeIds.length}`);
console.log(`  Pure routers (ws≤2, ≤3 calls): ${pureRouters.length} (${Math.round(pureRouters.length/nodeIds.length*100)}%)`);
console.log(`  Thin wrappers (ws≤5, has callees): ${thinWrappers.length} (${Math.round(thinWrappers.length/nodeIds.length*100)}%)`);
console.log(`  High pass-through (score≥0.6): ${highPT.length} (${Math.round(highPT.length/nodeIds.length*100)}%)`);

// Top pass-through functions
console.log(`\nTop 25 pass-through functions:`);
console.log("─".repeat(80));
console.log(`${"Function".padEnd(22)} ${"pkg".padEnd(16)} ${"ws".padStart(3)} ${"callees".padStart(7)} ${"calls".padStart(5)} ${"PT".padStart(5)} ${"caps".padEnd(25)} ${"reason"}`);
console.log("─".repeat(80));

for (const r of ptResults.slice(0, 25)) {
  const capsStr = r.effectiveCaps.join(",").slice(0, 23);
  console.log(
    `${r.name.slice(0, 20).padEnd(22)} ${r.pkg.slice(0, 14).padEnd(16)} ${String(r.ws).padStart(3)} ${String(r.directCallees).padStart(7)} ${String(r.totalCalls).padStart(5)} ${r.passThroughScore.toFixed(2).padStart(5)} ${capsStr.padEnd(25)} ${r.guessedReason}`
  );
}

// Pass-through by package
console.log(`\nPass-through density by package:`);
console.log("─".repeat(80));
const pkgPT = new Map<string, { total: number; pt: number; highPT: number; totalWS: number; ptWS: number }>();
for (const r of ptResults) {
  if (!pkgPT.has(r.pkg)) pkgPT.set(r.pkg, { total: 0, pt: 0, highPT: 0, totalWS: 0, ptWS: 0 });
  const s = pkgPT.get(r.pkg)!;
  s.total++;
  s.totalWS += r.ws;
  if (r.passThroughScore >= 0.6) {
    s.pt++;
    s.ptWS += r.ws;
  }
  if (r.passThroughScore >= 0.8) s.highPT++;
}
console.log(`${"Package".padEnd(18)} ${"total".padStart(5)} ${"PT≥0.6".padStart(7)} ${"PT%".padStart(6)} ${"ws-PT%".padStart(8)}`);
console.log("─".repeat(80));
for (const [pkg, s] of [...pkgPT.entries()].sort((a, b) => b[1].total - a[1].total)) {
  console.log(
    `${pkg.padEnd(18)} ${String(s.total).padStart(5)} ${String(s.pt).padStart(7)} ${String(Math.round(s.pt/s.total*100)+"%").padStart(6)} ${String(Math.round(s.ptWS/s.totalWS*100)+"%").padStart(8)}`
  );
}

// Entry point depth analysis
console.log(`\nEntry point call chain depths:`);
console.log("─".repeat(80));
console.log(`${"Entry point".padEnd(30)} ${"pkg".padEnd(16)} ${"fanOut".padStart(6)} ${"maxDepth".padStart(8)} ${"avgDepth".padStart(8)}`);
console.log("─".repeat(80));

const entryMetrics = entryPoints
  .map(id => ({
    name: (functions as any)[id]?.name || "?",
    pkg: (functions as any)[id]?.pkg || "?",
    fanOut: transMetrics.get(id)?.fanOut || 0,
    maxDepth: transMetrics.get(id)?.maxDepth || 0,
    avgDepth: transMetrics.get(id)?.avgDepth || 0,
  }))
  .filter(m => m.fanOut > 0)
  .sort((a, b) => b.maxDepth - a.maxDepth);

for (const m of entryMetrics.slice(0, 20)) {
  console.log(
    `${m.name.slice(0, 28).padEnd(30)} ${m.pkg.slice(0, 14).padEnd(16)} ${String(m.fanOut).padStart(6)} ${String(m.maxDepth).padStart(8)} ${m.avgDepth.toFixed(1).padStart(8)}`
  );
}

// ── Indirection ratio per chain ──
// For each entry point, what % of reachable functions are pass-throughs?

console.log(`\nIndirection ratio per entry chain (pass-through density in transitive fanout):`);
console.log("─".repeat(80));

for (const m of entryMetrics.slice(0, 15)) {
  // Find all reachable functions from this entry point
  const entryId = nodeIds.find(id => (functions as any)[id]?.name === m.name && (functions as any)[id]?.pkg === m.pkg);
  if (!entryId) continue;
  
  const reachable = new Set<string>();
  function dfs(id: string) {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const callee of calleesOf.get(id) || []) dfs(callee);
  }
  dfs(entryId);
  reachable.delete(entryId);

  const ptInChain = [...reachable].filter(id => {
    const r = ptResults.find(r => r.fnId === id);
    return r && r.passThroughScore >= 0.6;
  }).length;

  const ptRatio = reachable.size > 0 ? Math.round(ptInChain / reachable.size * 100) : 0;
  console.log(
    `${m.name.slice(0, 28).padEnd(30)} reachable=${String(reachable.size).padStart(3)}  PT=${ptInChain}/${reachable.size} (${ptRatio}%)`
  );
}

// ── Single-callee functions (pure delegation) ──
const singleCallee = ptResults.filter(r => r.directCallees === 1 && r.ws <= 3);
console.log(`\nSingle-callee thin functions (pure delegation, ws≤3): ${singleCallee.length}`);
console.log("─".repeat(80));
for (const r of singleCallee.slice(0, 20)) {
  const callee = calleesOf.get(r.fnId)?.[0];
  const calleeName = callee ? (functions as any)[callee]?.name : "?";
  console.log(`  ${r.name.padEnd(22)} → ${calleeName}  (ws=${r.ws}, pkg=${r.pkg})`);
}
