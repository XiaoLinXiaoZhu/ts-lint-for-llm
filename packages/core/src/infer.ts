/**
 * 能力推断 — 从调用图自底向上传播能力
 *
 * 不需要用户标注中间函数。系统自动推断每个函数的完整能力集。
 * 推断来源：
 *   1. 类型自动检测（Async/Fallible/Mutable）
 *   2. 调用图传播（从 callee 继承所有能力）
 *   3. 外部声明（builtin + .cap.ts 提供 IO/Impure）
 */

import type { Capability } from "./capabilities.js";
import type { ProjectGraph, FunctionInfo } from "./graph.js";
import { BUILTIN_CAPABILITIES } from "./builtin.js";
import type { ExternalCapEntry } from "./cap-file.js";

export interface InferredCaps {
  /** 每个函数 ID → 推断出的完整能力集 */
  caps: Map<string, Set<Capability>>;
}

export function inferAll(
  graph: ProjectGraph,
  externalCaps: Map<string, ExternalCapEntry>,
): InferredCaps {
  const caps = new Map<string, Set<Capability>>();

  // Initialize with auto-detected caps
  for (const [id, fn] of graph.functions) {
    caps.set(id, new Set(fn.autoDetected));
  }

  // Fixed-point iteration: propagate until stable
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 200) {
    changed = false;
    iterations++;

    for (const [id, fn] of graph.functions) {
      const current = caps.get(id)!;
      const before = current.size;

      for (const call of fn.calls) {
        if (call.targetId) {
          // Resolved internal call — inherit all caps from callee
          const calleeCaps = caps.get(call.targetId);
          if (calleeCaps) {
            for (const c of calleeCaps) current.add(c);
          }
        } else {
          // Unresolved call — check external declarations and builtin
          const resolved = resolveExternal(call.targetName, call.qualifiedName, externalCaps);
          if (resolved) {
            for (const c of resolved) current.add(c);
          }
        }
      }

      if (current.size > before) changed = true;
    }
  }

  return { caps };
}

function resolveExternal(
  name: string,
  qualifiedName: string | undefined,
  externalCaps: Map<string, ExternalCapEntry>,
): Capability[] | null {
  // 1. User-defined .cap.ts (match by bare name)
  const ext = externalCaps.get(name);
  if (ext) return ext.caps;

  // 2. Builtin table (try qualifiedName first, then bare name)
  if (qualifiedName && Object.hasOwn(BUILTIN_CAPABILITIES, qualifiedName)) {
    return BUILTIN_CAPABILITIES[qualifiedName];
  }
  if (Object.hasOwn(BUILTIN_CAPABILITIES, name)) {
    return BUILTIN_CAPABILITIES[name];
  }

  // Unknown external call — no capabilities assumed
  return null;
}
