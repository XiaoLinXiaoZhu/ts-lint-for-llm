/**
 * Proto 3: Modularity Analysis
 *
 * Modularity Q 衡量图划分的质量。Q = Σ(e_ii - a_i²)
 *   e_ii = 社区 i 内部边占比
 *   a_i  = 社区 i 所有端点占比
 *
 * Q > 0.3 通常认为是显著的社区结构。
 *
 * 我们对比三种划分：
 *   1. by-package:    按 tsconfig paths 的包名
 *   2. by-directory:  按顶级目录（apps/ vs packages/）
 *   3. by-role:       按推断角色（entry/api/core）
 *
 * Usage: bun prototype/proto3-modularity.ts
 */

import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("prototype/scan-result.json", "utf-8"));
const functions: Record<string, any> = data.functions;
const edges: any[] = data.edges;

// ── Build resolved edge list ──
// Node = function id, Edge = (from, to) where both are resolved

const nodeIds = Object.keys(functions);
const nodeSet = new Set(nodeIds);
const adjList: [string, string][] = [];
let totalResolvedEdges = 0;

for (const e of edges) {
  if (e.isResolved && e.to && nodeSet.has(e.from) && nodeSet.has(e.to)) {
    adjList.push([e.from, e.to]);
    totalResolvedEdges++;
  }
}

console.error(`[proto3] Resolved edges for modularity: ${totalResolvedEdges}`);

// ── Modularity computation ──

function computeModularity(partition: Map<string, string>): number {
  // partition: fnId → communityId
  // Q = Σ_c [ (L_c / L) - (k_c / 2L)² ]
  // L = total edges
  // L_c = edges within community c
  // k_c = sum of degrees of nodes in community c

  const L = totalResolvedEdges;
  if (L === 0) return 0;

  // Compute degree of each node
  const degree = new Map<string, number>();
  for (const id of nodeIds) degree.set(id, 0);
  for (const [from, to] of adjList) {
    degree.set(from, (degree.get(from) || 0) + 1);
    degree.set(to, (degree.get(to) || 0) + 1);
  }

  // Aggregate by community
  const commEdges = new Map<string, number>();  // internal edges per community
  const commDegree = new Map<string, number>();  // total degree per community

  for (const [from, to] of adjList) {
    const cFrom = partition.get(from);
    const cTo = partition.get(to);
    if (cFrom && cTo && cFrom === cTo) {
      commEdges.set(cFrom, (commEdges.get(cFrom) || 0) + 1);
    }
  }

  for (const [id, deg] of degree.entries()) {
    const c = partition.get(id);
    if (c) commDegree.set(c, (commDegree.get(c) || 0) + deg);
  }

  let Q = 0;
  for (const [c, lc] of commEdges.entries()) {
    const kc = commDegree.get(c) || 0;
    Q += (lc / L) - Math.pow(kc / (2 * L), 2);
  }

  return Math.round(Q * 10000) / 10000;
}

// ── Partition 1: by package ──

function partitionByPackage(): Map<string, string> {
  const p = new Map<string, string>();
  for (const [id, fn] of Object.entries(functions)) {
    p.set(id, (fn as any).pkg);
  }
  return p;
}

// ── Partition 2: by top-level directory ──

function partitionByTopDir(): Map<string, string> {
  const p = new Map<string, string>();
  for (const [id, fn] of Object.entries(functions)) {
    const pkg = (fn as any).pkg;
    const top = pkg.split("/")[0]; // "apps" or "packages"
    p.set(id, top);
  }
  return p;
}

// ── Partition 3: by inferred role ──

function partitionByRole(): Map<string, string> {
  const p = new Map<string, string>();
  for (const [id, fn] of Object.entries(functions)) {
    const pkg = (fn as any).pkg;
    let role: string;
    if (pkg === "packages/core") role = "core";
    else if (pkg === "packages/types") role = "types";
    else if (pkg === "packages/llm") role = "adapter";
    else if (pkg === "packages/data") role = "data";
    else if (pkg === "packages/painting") role = "adapter";
    else if (pkg.startsWith("apps/")) role = "entry";
    else role = "other";
    p.set(id, role);
  }
  return p;
}

// ── Compute ──

const qPkg = computeModularity(partitionByPackage());
const qTop = computeModularity(partitionByTopDir());
const qRole = computeModularity(partitionByRole());

// ── Report ──

console.log("=".repeat(70));
console.log("Proto 3: Modularity Analysis");
console.log("=".repeat(70));

console.log(`\nResolved call edges used: ${totalResolvedEdges}`);

console.log(`\nModularity Q (higher = better community structure, >0.3 = significant):`);
console.log("─".repeat(70));
console.log(`  By package:          Q = ${String(qPkg).padStart(7)}  (7 communities)`);
console.log(`  By top-level dir:    Q = ${String(qTop).padStart(7)}  (2 communities: apps vs packages)`);
console.log(`  By inferred role:     Q = ${String(qRole).padStart(7)}  (5 communities: core/adapter/data/entry/types)`);

// Interpretation
console.log(`\nInterpretation:`);
if (qPkg > 0.3) {
  console.log(`  ✅ Package structure shows significant community structure (Q=${qPkg})`);
  console.log(`     The package boundaries match actual call patterns well.`);
} else if (qPkg > 0.1) {
  console.log(`  ⚠️  Package structure shows weak community structure (Q=${qPkg})`);
  console.log(`     There may be some misalignment between packages and call patterns.`);
} else {
  console.log(`  ❌ Package structure shows poor community structure (Q=${qPkg})`);
  console.log(`     Package boundaries don't reflect actual call patterns. Consider refactoring.`);
}

const gap = qPkg - qTop;
if (gap > 0.1) {
  console.log(`  📐 Fine-grained packages add value over coarse split (ΔQ=${gap.toFixed(4)})`);
} else if (gap > 0) {
  console.log(`  📐 Fine-grained packages add marginal value over coarse split (ΔQ=${gap.toFixed(4)})`);
} else {
  console.log(`  ⚠️  Fine-grained packages may be too fragmented (ΔQ=${gap.toFixed(4)})`);
}

// Per-community contribution to Q
console.log(`\nPer-package contribution to modularity:`);
console.log("─".repeat(70));
const partPkg = partitionByPackage();
const communities = new Set(partPkg.values());

// Compute deg and internal edges per community
const degree = new Map<string, number>();
for (const id of nodeIds) degree.set(id, 0);
for (const [from, to] of adjList) {
  degree.set(from, (degree.get(from) || 0) + 1);
  degree.set(to, (degree.get(to) || 0) + 1);
}

const L = totalResolvedEdges;
for (const comm of [...communities].sort()) {
  const members = [...partPkg.entries()].filter(([, c]) => c === comm).map(([id]) => id);
  let lc = 0, kc = 0;
  for (const [from, to] of adjList) {
    if (partPkg.get(from) === comm && partPkg.get(to) === comm) lc++;
  }
  for (const id of members) kc += degree.get(id) || 0;
  const contrib = (lc / L) - Math.pow(kc / (2 * L), 2);
  console.log(`  ${comm.padEnd(22)} ${String(members.length).padStart(3)} fns  internal=${String(lc).padStart(3)}  degree=${String(kc).padStart(4)}  contrib=${contrib.toFixed(4)}`);
}
