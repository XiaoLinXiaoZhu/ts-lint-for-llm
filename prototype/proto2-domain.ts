/**
 * Proto 2 v2: Package Call Graph & Natural Clusters
 *
 * 因为调用图解析率仅 36%，纯 flood fill 产生大量孤立节点。
 * 改为从包粒度分析：哪些包之间调用密集？自然聚类在哪？
 *
 * Usage: bun prototype/proto2-domain.ts
 */

import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("prototype/scan-result.json", "utf-8"));
const functions: Record<string, any> = data.functions;
const edges: any[] = data.edges;

// ── Package-level call matrix ──

const pkgs = new Set<string>();
for (const fn of Object.values(functions)) pkgs.add((fn as any).pkg);

// pkgMatrix[fromPkg][toPkg] = { resolved, unresolved, total }
interface PkgEdgeCount { resolved: number; unresolved: number; examples: string[] }
const pkgMatrix = new Map<string, Map<string, PkgEdgeCount>>();

for (const pkg of pkgs) {
  pkgMatrix.set(pkg, new Map());
  for (const pkg2 of pkgs) {
    pkgMatrix.get(pkg)!.set(pkg2, { resolved: 0, unresolved: 0, examples: [] });
  }
}

for (const e of edges) {
  const fromPkg = (functions as any)[e.from]?.pkg || "?";
  let toPkg = "?";
  if (e.isResolved && e.to) {
    toPkg = (functions as any)[e.to]?.pkg || "?";
  } else {
    toPkg = "(external)";
  }

  if (!pkgMatrix.has(fromPkg)) pkgMatrix.set(fromPkg, new Map());
  if (!pkgMatrix.get(fromPkg)!.has(toPkg)) {
    pkgMatrix.get(fromPkg)!.set(toPkg, { resolved: 0, unresolved: 0, examples: [] });
  }
  const cell = pkgMatrix.get(fromPkg)!.get(toPkg)!;
  if (e.isResolved) {
    cell.resolved++;
    if (cell.examples.length < 2) {
      const fromName = (functions as any)[e.from]?.name || "?";
      const toName = e.to ? (functions as any)[e.to]?.name || "?" : "?";
      cell.examples.push(`${fromName}→${toName}`);
    }
  } else {
    cell.unresolved++;
  }
}

// ── Compute internal vs external call ratios ──

interface PkgStats {
  name: string;
  fnCount: number;
  internalResolved: number;   // calls to same package (resolved)
  externalResolved: number;   // calls to other packages (resolved)
  unresolved: number;         // calls to unresolved targets
  externalPkgs: Map<string, number>; // which packages do we call?
  calledBy: Map<string, number>;     // which packages call us?
}

const pkgStats = new Map<string, PkgStats>();

for (const pkg of pkgs) {
  const fns = Object.values(functions).filter((f: any) => f.pkg === pkg);
  let internalResolved = 0, externalResolved = 0, unresolved = 0;
  const externalPkgs = new Map<string, number>();
  const calledBy = new Map<string, number>();

  for (const [toPkg, cell] of pkgMatrix.get(pkg)!.entries()) {
    if (toPkg === pkg) {
      internalResolved += cell.resolved;
    } else if (toPkg === "(external)") {
      unresolved += cell.unresolved;
    } else {
      externalResolved += cell.resolved;
      if (cell.resolved > 0) externalPkgs.set(toPkg, cell.resolved);
    }
  }

  // Who calls us?
  for (const [fromPkg, row] of pkgMatrix.entries()) {
    if (fromPkg === pkg) continue;
    const cell = row.get(pkg);
    if (cell && cell.resolved > 0) calledBy.set(fromPkg, cell.resolved);
  }

  pkgStats.set(pkg, {
    name: pkg,
    fnCount: fns.length,
    internalResolved,
    externalResolved,
    unresolved,
    externalPkgs,
    calledBy,
  });
}

// ── Report ──

console.log("=".repeat(90));
console.log("Proto 2: Package Call Graph Analysis");
console.log("=".repeat(90));

// Heatmap
const pkgList = [...pkgs].sort();
console.log(`\nCall matrix (resolved calls, from → to):`);
console.log("─".repeat(90));

// Header
const colWidth = 10;
const header = "".padEnd(18) + pkgList.map(p => p.split("/").pop()!.slice(0, colWidth).padStart(colWidth)).join("");
console.log(header);
console.log("─".repeat(90));

for (const fromPkg of pkgList) {
  let row = fromPkg.slice(0, 16).padEnd(18);
  for (const toPkg of pkgList) {
    const cell = pkgMatrix.get(fromPkg)!.get(toPkg)!;
    const val = cell.resolved > 0 ? String(cell.resolved) : (fromPkg === toPkg ? "·" : "");
    row += val.padStart(colWidth);
  }
  // Also show external calls
  const ext = pkgMatrix.get(fromPkg)!.get("(external)")!;
  row += `  ext:${ext.unresolved}`;
  console.log(row);
}

// Package stats
console.log(`\n${"─".repeat(90)}`);
console.log("Package cohesion stats:");
console.log("─".repeat(90));
console.log(`${"Package".padEnd(20)} ${"fns".padStart(4)} ${"internal".padStart(8)} ${"external".padStart(8)} ${"unresolved".padStart(10)} ${"cohesion".padStart(8)} ${"external targets"}`);
console.log("─".repeat(90));

for (const [pkg, stats] of [...pkgStats.entries()].sort((a, b) => b[1].fnCount - a[1].fnCount)) {
  const totalResolved = stats.internalResolved + stats.externalResolved;
  const cohesion = totalResolved > 0 ? Math.round(stats.internalResolved / totalResolved * 100) : 0;
  const extTargets = [...stats.externalPkgs.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([p, c]) => `${p.split("/").pop()}:${c}`)
    .join(" ");
  console.log(
    `${stats.name.padEnd(20)} ${String(stats.fnCount).padStart(4)} ${String(stats.internalResolved).padStart(8)} ${String(stats.externalResolved).padStart(8)} ${String(stats.unresolved).padStart(10)} ${String(cohesion + "%").padStart(8)} ${extTargets}`
  );
}

// Key cross-package edges (the "interfaces")
console.log(`\n${"─".repeat(90)}`);
console.log("Key cross-package interfaces (examples of cross-boundary calls):");
console.log("─".repeat(90));

for (const [fromPkg, row] of pkgMatrix.entries()) {
  for (const [toPkg, cell] of row.entries()) {
    if (toPkg === fromPkg || toPkg === "(external)" || cell.resolved === 0) continue;
    console.log(`  ${fromPkg} → ${toPkg} (${cell.resolved} calls)`);
    for (const ex of cell.examples) console.log(`    ${ex}`);
  }
}
