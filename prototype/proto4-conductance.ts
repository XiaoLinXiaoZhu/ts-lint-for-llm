/**
 * Proto 4: Conductance Analysis
 *
 * 电导 φ(S) = |∂S| / min(vol(S), vol(V\S))
 *   ∂S = 离开 S 的边（跨社区边）
 *   vol(S) = S 内所有节点的度之和
 *
 * 低电导 = 封装好（社区内部紧密，对外接口小）
 * 高电导 = "泄漏"严重（接口太宽）
 *
 * Usage: bun prototype/proto4-conductance.ts
 */

import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("prototype/scan-result.json", "utf-8"));
const functions: Record<string, any> = data.functions;
const edges: any[] = data.edges;

const nodeIds = Object.keys(functions);
const nodeSet = new Set(nodeIds);

// ── Build graph ──

const adjOut = new Map<string, string[]>();  // fn → callees
const adjIn = new Map<string, string[]>();   // fn → callers

for (const id of nodeIds) {
  adjOut.set(id, []);
  adjIn.set(id, []);
}

for (const e of edges) {
  if (e.isResolved && e.to && nodeSet.has(e.from) && nodeSet.has(e.to)) {
    adjOut.get(e.from)!.push(e.to);
    adjIn.get(e.to)!.push(e.from);
  }
}

// ── Compute degree ──

const degree = new Map<string, number>();
for (const id of nodeIds) {
  degree.set(id, (adjOut.get(id)?.length || 0) + (adjIn.get(id)?.length || 0));
}

const totalVolume = [...degree.values()].reduce((a, b) => a + b, 0);

// ── Partition by package ──

function partitionByPackage(): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const [id, fn] of Object.entries(functions)) {
    const pkg = (fn as any).pkg;
    if (!groups.has(pkg)) groups.set(pkg, []);
    groups.get(pkg)!.push(id);
  }
  return groups;
}

const pkgGroups = partitionByPackage();

// ── Compute conductance per package ──

interface ConductanceResult {
  pkg: string;
  size: number;
  volume: number;
  cutSize: number;         // edges leaving the package
  conductance: number;     // φ
  // "leak targets": which packages does this package leak to?
  leakTargets: Map<string, { count: number; topEdges: string[] }>;
}

function computeConductance(): ConductanceResult[] {
  const results: ConductanceResult[] = [];

  for (const [pkg, members] of pkgGroups.entries()) {
    const memberSet = new Set(members);
    
    // Volume of S
    let volS = 0;
    for (const id of members) volS += degree.get(id) || 0;

    // Cut size: edges from S to V\S
    let cutSize = 0;
    const leakTargets = new Map<string, { count: number; topEdges: string[] }>();

    for (const id of members) {
      for (const callee of adjOut.get(id) || []) {
        if (!memberSet.has(callee)) {
          cutSize++;
          const calleePkg = (functions as any)[callee]?.pkg || "?";
          if (!leakTargets.has(calleePkg)) {
            leakTargets.set(calleePkg, { count: 0, topEdges: [] });
          }
          const lt = leakTargets.get(calleePkg)!;
          lt.count++;
          if (lt.topEdges.length < 2) {
            lt.topEdges.push(
              `${(functions as any)[id]?.name}→${(functions as any)[callee]?.name}`
            );
          }
        }
      }
    }

    // Conductance
    const minVol = Math.min(volS, totalVolume - volS);
    const conductance = minVol > 0 ? Math.round(cutSize / minVol * 10000) / 10000 : 0;

    results.push({ pkg, size: members.length, volume: volS, cutSize, conductance, leakTargets });
  }

  return results.sort((a, b) => b.conductance - a.conductance);
}

const results = computeConductance();

// ── Report ──

console.log("=".repeat(70));
console.log("Proto 4: Conductance Analysis (by package)");
console.log("=".repeat(70));

console.log(`\nTotal volume: ${totalVolume}`);
console.log(`\nConductance φ (lower = better encapsulated):`);
console.log("─".repeat(70));
console.log(`${"Package".padEnd(20)} ${"size".padStart(4)} ${"volume".padStart(6)} ${"cut".padStart(4)} ${"φ".padStart(8)} ${"assessment"}`);
console.log("─".repeat(70));

for (const r of results) {
  let assessment: string;
  if (r.conductance === 0) assessment = "✅ fully encapsulated";
  else if (r.conductance < 0.15) assessment = "✅ well encapsulated";
  else if (r.conductance < 0.3) assessment = "⚠️  moderate leakage";
  else assessment = "❌ high leakage";

  console.log(
    `${r.pkg.padEnd(20)} ${String(r.size).padStart(4)} ${String(r.volume).padStart(6)} ${String(r.cutSize).padStart(4)} ${String(r.conductance.toFixed(4)).padStart(8)} ${assessment}`
  );
}

// Details for leaky packages
console.log(`\n${"─".repeat(70)}`);
console.log("Leakage details (where do edges cross boundaries?):");
console.log("─".repeat(70));

for (const r of results) {
  if (r.cutSize === 0) continue;
  console.log(`\n${r.pkg} (φ=${r.conductance.toFixed(4)}, ${r.cutSize} edges leave)`);
  for (const [target, lt] of [...r.leakTargets.entries()].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  → ${target}: ${lt.count} edges`);
    for (const e of lt.topEdges) console.log(`      ${e}`);
  }
}

// ── Also compute per-function conductance ──
// Which individual functions have the highest "leak rate"?
console.log(`\n${"─".repeat(70)}`);
console.log("Top 'bridge' functions (calls across packages the most):");
console.log("─".repeat(70));

const fnBridgeCount = new Map<string, { cross: number; total: number; targets: Set<string> }>();
for (const id of nodeIds) {
  fnBridgeCount.set(id, { cross: 0, total: 0, targets: new Set() });
}

for (const [from, to] of [...adjOut.entries()].flatMap(([f, ts]) => ts.map(t => [f, t] as [string, string]))) {
  const fromPkg = (functions as any)[from]?.pkg;
  const toPkg = (functions as any)[to]?.pkg;
  const info = fnBridgeCount.get(from)!;
  info.total++;
  if (fromPkg !== toPkg) {
    info.cross++;
    info.targets.add(toPkg);
  }
}

const bridgeFns = [...fnBridgeCount.entries()]
  .filter(([, info]) => info.cross > 0)
  .map(([id, info]) => ({
    name: (functions as any)[id]?.name || "?",
    pkg: (functions as any)[id]?.pkg || "?",
    cross: info.cross,
    total: info.total,
    targetPkgs: info.targets,
  }))
  .sort((a, b) => b.cross - a.cross)
  .slice(0, 15);

console.log(`${"Function".padEnd(22)} ${"from pkg".padEnd(22)} ${"cross".padStart(5)} ${"total".padStart(5)} ${"targets"}`);
console.log("─".repeat(70));
for (const b of bridgeFns) {
  console.log(
    `${b.name.slice(0, 20).padEnd(22)} ${b.pkg.padEnd(22)} ${String(b.cross).padStart(5)} ${String(b.total).padStart(5)} ${[...b.targetPkgs].map(p => p.split("/").pop()).join(", ")}`
  );
}
