/**
 * Proto 6: Recursive Compositional Scoring
 *
 * score(F) = ownScore(F) + Σ_{G ∈ callees(F)} score(G) × DECAY
 *
 * 对比当前公式和递归公式在 ChatFrame-v11 上的表现。
 *
 * Usage: bun prototype/proto6-recursive-score.ts
 */

import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("prototype/scan-result.json", "utf-8"));
const functions: Record<string, any> = data.functions;
const edges: any[] = data.edges;

const nodeIds = Object.keys(functions);
const nodeSet = new Set(nodeIds);
const PROPAGATE_CAPS = ["IO", "Impure", "Fallible", "Async", "Mutable"];

// ── Build call graph ──

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

// ── Compute own scores (current formula) ──

const ownScores = new Map<string, number>();
const currentScores = new Map<string, number>();
const capCounts = new Map<string, number>();

for (const [id, fn] of Object.entries(functions)) {
  const f = fn as any;
  const scorableCaps = f.isDeclared
    ? f.effectiveCaps.filter((c: string) => PROPAGATE_CAPS.includes(c))
    : [...PROPAGATE_CAPS];
  const capCount = scorableCaps.length;
  const ownScore = Math.round(f.weightedStatements * capCount * 10) / 10;
  ownScores.set(id, ownScore);
  currentScores.set(id, ownScore); // current = own (no recursion)
  capCounts.set(id, capCount);
}

const totalCurrent = [...currentScores.values()].reduce((a, b) => a + b, 0);

// ── Compute recursive scores ──

// Handle as DAG first (topological sort), fall back to iteration if cycles
function hasCycles(): boolean {
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) inDegree.set(id, callersOf.get(id)?.length || 0);
  
  const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  let processed = 0;
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    processed++;
    for (const callee of calleesOf.get(current) || []) {
      const d = inDegree.get(callee)! - 1;
      inDegree.set(callee, d);
      if (d === 0) queue.push(callee);
    }
  }
  
  return processed < nodeIds.length;
}

const hasCycle = hasCycles();
console.error(`[proto6] Call graph has cycles: ${hasCycle}`);

function computeRecursiveScores(decay: number): Map<string, number> {
  const scores = new Map<string, number>();
  
  if (!hasCycle) {
    // Topological order (reverse: leaves first)
    const inDegree = new Map<string, number>();
    for (const id of nodeIds) inDegree.set(id, calleesOf.get(id)?.length || 0);
    
    const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
    const order: string[] = [];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);
      for (const caller of callersOf.get(current) || []) {
        const d = inDegree.get(caller)! - 1;
        inDegree.set(caller, d);
        if (d === 0) queue.push(caller);
      }
    }
    
    // Compute bottom-up
    for (const id of order) {
      let inherited = 0;
      for (const callee of calleesOf.get(id) || []) {
        inherited += (scores.get(callee) || 0) * decay;
      }
      scores.set(id, Math.round((ownScores.get(id)! + inherited) * 10) / 10);
    }
  } else {
    // Fixed-point iteration
    for (const id of nodeIds) scores.set(id, ownScores.get(id)!);
    
    for (let iter = 0; iter < 100; iter++) {
      let maxChange = 0;
      const newScores = new Map<string, number>();
      
      for (const id of nodeIds) {
        let inherited = 0;
        for (const callee of calleesOf.get(id) || []) {
          inherited += (scores.get(callee) || 0) * decay;
        }
        const newScore = Math.round((ownScores.get(id)! + inherited) * 10) / 10;
        newScores.set(id, newScore);
        maxChange = Math.max(maxChange, Math.abs(newScore - (scores.get(id) || 0)));
      }
      
      scores.clear();
      for (const [k, v] of newScores) scores.set(k, v);
      
      if (maxChange < 0.01) {
        console.error(`[proto6] Converged after ${iter + 1} iterations`);
        break;
      }
    }
  }
  
  return scores;
}

// Try different decay values
const DECAY_VALUES = [0.3, 0.5, 0.7];

interface ScoredFn {
  id: string;
  name: string;
  pkg: string;
  ws: number;
  capCount: number;
  calleeCount: number;
  ownScore: number;
  current: number;
  recursive: number;
  inherited: number;     // recursive - own
  inheritanceRatio: number; // inherited / recursive
}

function buildResults(decay: number): ScoredFn[] {
  const recursiveScores = computeRecursiveScores(decay);
  
  const results: ScoredFn[] = [];
  for (const [id, fn] of Object.entries(functions)) {
    const f = fn as any;
    const own = ownScores.get(id)!;
    const rec = recursiveScores.get(id)!;
    
    results.push({
      id,
      name: f.name,
      pkg: f.pkg,
      ws: f.weightedStatements,
      capCount: capCounts.get(id)!,
      calleeCount: calleesOf.get(id)?.length || 0,
      ownScore: own,
      current: own,  // current = own (no recursion)
      recursive: rec,
      inherited: Math.round((rec - own) * 10) / 10,
      inheritanceRatio: rec > 0 ? Math.round((rec - own) / rec * 100) : 0,
    });
  }
  
  return results.sort((a, b) => b.recursive - a.recursive);
}

// ── Report ──

console.log("=".repeat(90));
console.log("Proto 6: Recursive Compositional Scoring");
console.log("=".repeat(90));

for (const decay of DECAY_VALUES) {
  const results = buildResults(decay);
  const totalRec = results.reduce((s, r) => s + r.recursive, 0);
  
  console.log(`\n${"─".repeat(90)}`);
  console.log(`DECAY = ${decay}`);
  console.log(`${"─".repeat(90)}`);
  console.log(`Total score: ${totalCurrent.toFixed(1)} → ${totalRec.toFixed(1)} (${((totalRec/totalCurrent - 1)*100).toFixed(0)}% change)`);
  
  // Rank correlation: how much does ranking change?
  const byCurrent = [...results].sort((a, b) => b.current - a.current);
  const byRecursive = [...results].sort((a, b) => b.recursive - a.recursive);
  
  const currentRank = new Map<string, number>();
  const recursiveRank = new Map<string, number>();
  byCurrent.forEach((r, i) => currentRank.set(r.id, i));
  byRecursive.forEach((r, i) => recursiveRank.set(r.id, i));
  
  // Top 20 by recursive score
  console.log(`\nTop 20 by recursive score:`);
  console.log(`${"Function".padEnd(22)} ${"pkg".padEnd(16)} ${"ws".padStart(4)} ${"caps".padStart(4)} ${"callees".padStart(7)} ${"own".padStart(6)} ${"recursive".padStart(8)} ${"inherited".padStart(9)} ${"inh%".padStart(5)} ${"rankΔ".padStart(6)}`);
  console.log("─".repeat(90));
  
  for (const r of results.slice(0, 20)) {
    const rankChange = (currentRank.get(r.id) || 0) - (recursiveRank.get(r.id) || 0);
    const rankStr = rankChange > 0 ? `↑${rankChange}` : rankChange < 0 ? `↓${-rankChange}` : "—";
    console.log(
      `${r.name.slice(0, 20).padEnd(22)} ${r.pkg.slice(0, 14).padEnd(16)} ${String(r.ws).padStart(4)} ${String(r.capCount).padStart(4)} ${String(r.calleeCount).padStart(7)} ${String(r.ownScore).padStart(6)} ${String(r.recursive).padStart(8)} ${String(r.inherited).padStart(9)} ${String(r.inheritanceRatio+"%").padStart(5)} ${rankStr.padStart(6)}`
    );
  }
  
  // Functions whose rank changed most (biggest gainers under recursive)
  const rankChanges = results.map(r => ({
    ...r,
    currentRank: currentRank.get(r.id) || 0,
    recursiveRank: recursiveRank.get(r.id) || 0,
    rankDelta: (currentRank.get(r.id) || 0) - (recursiveRank.get(r.id) || 0),
  })).sort((a, b) => b.rankDelta - a.rankDelta);
  
  console.log(`\nBiggest rank gainers (promoted by recursive scoring — these delegate a lot):`);
  console.log("─".repeat(90));
  for (const r of rankChanges.filter(x => x.rankDelta > 0).slice(0, 10)) {
    console.log(
      `  ↑${String(r.rankDelta).padStart(3)}  ${r.name.padEnd(22)} own=${String(r.ownScore).padStart(5)}→rec=${String(r.recursive).padStart(6)}  inh=${r.inheritanceRatio}%  (calls ${r.calleeCount} fns)`
    );
  }
  
  console.log(`\nBiggest rank losers (demoted — these are leaf functions):`);
  console.log("─".repeat(90));
  for (const r of rankChanges.filter(x => x.rankDelta < 0).slice(0, 10)) {
    console.log(
      `  ↓${String(-r.rankDelta).padStart(3)}  ${r.name.padEnd(22)} own=${String(r.ownScore).padStart(5)}→rec=${String(r.recursive).padStart(6)}  inh=${r.inheritanceRatio}%  (calls ${r.calleeCount} fns)`
    );
  }
}

// ── DECAY sensitivity analysis ──
console.log(`\n${"═".repeat(90)}`);
console.log("DECAY sensitivity: how total score changes");
console.log("─".repeat(90));

for (const decay of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
  const results = buildResults(decay);
  const totalRec = results.reduce((s, r) => s + r.recursive, 0);
  const pctChange = ((totalRec / totalCurrent - 1) * 100).toFixed(0);
  console.log(`  DECAY=${decay}: total=${totalRec.toFixed(1)} (${pctChange}% vs current ${totalCurrent.toFixed(1)})`);
}

// ── Inheritance ratio distribution (DECAY=0.5) ──
console.log(`\n${"═".repeat(90)}`);
console.log("Inheritance ratio distribution (DECAY=0.5): how much of score comes from callees?");
console.log("─".repeat(90));

const r05 = buildResults(0.5);
const inhBuckets: Record<string, number> = { "0%": 0, "1-25%": 0, "25-50%": 0, "50-75%": 0, "75-100%": 0 };
for (const r of r05) {
  if (r.inheritanceRatio === 0) inhBuckets["0%"]++;
  else if (r.inheritanceRatio <= 25) inhBuckets["1-25%"]++;
  else if (r.inheritanceRatio <= 50) inhBuckets["25-50%"]++;
  else if (r.inheritanceRatio <= 75) inhBuckets["50-75%"]++;
  else inhBuckets["75-100%"]++;
}
for (const [bucket, count] of Object.entries(inhBuckets)) {
  const bar = "█".repeat(Math.round(count / 2));
  console.log(`  ${bucket.padStart(7)}: ${String(count).padStart(3)} fns  ${bar}`);
}

// Show a few "worst offenders" — high inheritance ratio, low own score
console.log(`\nWorst offenders (high inheritance, low own — pure delegators, DECAY=0.5):`);
console.log("─".repeat(90));
const worstOffenders = r05
  .filter(r => r.inheritanceRatio >= 50 && r.ownScore <= 5 && r.calleeCount >= 1)
  .sort((a, b) => b.inheritanceRatio - a.inheritanceRatio)
  .slice(0, 15);
console.log(`${"Function".padEnd(22)} ${"own".padStart(5)} ${"rec".padStart(6)} ${"inh%".padStart(5)} ${"callees".padStart(7)}`);
console.log("─".repeat(90));
for (const r of worstOffenders) {
  console.log(
    `${r.name.slice(0, 20).padEnd(22)} ${String(r.ownScore).padStart(5)} ${String(r.recursive).padStart(6)} ${String(r.inheritanceRatio+"%").padStart(5)} ${String(r.calleeCount).padStart(7)}`
  );
}
