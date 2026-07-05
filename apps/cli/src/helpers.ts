/**
 * CLI 共享工具函数
 */

import { resolve } from "node:path";
import { existsSync, statSync } from "node:fs";

export function resolveTsConfig(flag?: string): string {
  const path = flag ? resolve(flag) : resolve("tsconfig.json");
  if (!existsSync(path)) {
    console.error(`tsconfig not found: ${path}`);
    process.exit(1);
  }
  return path;
}

export function filterByScope(violations: any[], paths: string[]): any[] {
  if (paths.length === 0) return violations;
  return violations.filter(v => isInScope(v.assertion.filePath, paths));
}

export function isInScope(filePath: string, paths: string[]): boolean {
  return paths.some(p => {
    const resolved = resolve(p);
    const normalized = resolve(filePath);
    const stat = statSync(resolved, { throwIfNoEntry: false });
    if (stat?.isDirectory()) return normalized.startsWith(resolved);
    return normalized === resolved;
  });
}
