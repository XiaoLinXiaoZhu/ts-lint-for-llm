/**
 * 断言验证 — 检查函数的推断能力是否满足用户声明的约束
 *
 * 当断言不满足时，输出完整的污染链：
 * 从断言函数出发，沿调用图到达携带违禁能力的源头。
 */

import type { Capability } from "./capabilities.js";
import type { AssertionProperty } from "./capabilities.js";
import type { ProjectGraph, FunctionInfo } from "./graph.js";
import type { InferredCaps } from "./infer.js";
import { BUILTIN_CAPABILITIES } from "./builtin.js";
import type { ExternalCapEntry } from "./cap-file.js";

export interface Assertion {
  functionId: string;
  functionName: string;
  filePath: string;
  line: number;
  properties: AssertionProperty[];
}

export interface ChainNode {
  functionName: string;
  filePath: string;
  line: number;
  callLine?: number;
}

export interface ViolationChain {
  nodes: ChainNode[];
  /** 链尾的污染源（外部函数或内部函数） */
  source: { name: string; caps: Capability[]; isExternal: boolean };
}

export interface AssertionViolation {
  assertion: Assertion;
  property: AssertionProperty;
  violatedBy: Capability;
  chain: ViolationChain;
}

export function checkAssertions(
  graph: ProjectGraph,
  inferred: InferredCaps,
  externalCaps: Map<string, ExternalCapEntry>,
): AssertionViolation[] {
  const violations: AssertionViolation[] = [];

  for (const [id, fn] of graph.functions) {
    if (!fn.assertion) continue;

    const fnCaps = inferred.caps.get(id) ?? new Set();
    const assertion: Assertion = {
      functionId: id,
      functionName: fn.name,
      filePath: fn.filePath,
      line: fn.line,
      properties: fn.assertion.properties,
    };

    for (const prop of fn.assertion.properties) {
      for (const cap of fn.assertion.forbiddenCaps) {
        if (!fnCaps.has(cap)) continue;

        // This cap violates this property — find the chain
        const chain = findChain(id, cap, graph, inferred, externalCaps);
        if (chain) {
          violations.push({ assertion, property: prop, violatedBy: cap, chain });
        }
      }
    }
  }

  return violations;
}

/**
 * BFS to find shortest path from source function to a node carrying the target capability
 */
function findChain(
  startId: string,
  targetCap: Capability,
  graph: ProjectGraph,
  inferred: InferredCaps,
  externalCaps: Map<string, ExternalCapEntry>,
): ViolationChain | null {
  const startFn = graph.functions.get(startId)!;

  // Check if the function itself has the cap from auto-detection (leaf case)
  if (startFn.autoDetected.has(targetCap)) {
    return {
      nodes: [{ functionName: startFn.name, filePath: startFn.filePath, line: startFn.line }],
      source: { name: startFn.name, caps: [...startFn.autoDetected], isExternal: false },
    };
  }

  // BFS through call graph
  interface QueueItem { fnId: string; path: Array<{ fnId: string; callLine: number }> }
  const queue: QueueItem[] = [{ fnId: startId, path: [] }];
  const visited = new Set<string>([startId]);

  while (queue.length > 0) {
    const { fnId, path } = queue.shift()!;
    const fn = graph.functions.get(fnId)!;

    for (const call of fn.calls) {
      if (call.targetId) {
        // Internal call
        if (visited.has(call.targetId)) continue;
        visited.add(call.targetId);

        const calleeCaps = inferred.caps.get(call.targetId);
        if (!calleeCaps || !calleeCaps.has(targetCap)) continue;

        const newPath = [...path, { fnId, callLine: call.line }];
        const callee = graph.functions.get(call.targetId)!;

        // Is this callee the source of the cap?
        if (isLeafSource(callee, targetCap, graph, inferred)) {
          const nodes: ChainNode[] = [];
          nodes.push({ functionName: startFn.name, filePath: startFn.filePath, line: startFn.line });
          for (const step of newPath) {
            const stepFn = graph.functions.get(step.fnId)!;
            if (stepFn.id !== startId) {
              nodes.push({ functionName: stepFn.name, filePath: stepFn.filePath, line: stepFn.line, callLine: step.callLine });
            } else {
              nodes[nodes.length - 1].callLine = step.callLine;
            }
          }
          nodes.push({ functionName: callee.name, filePath: callee.filePath, line: callee.line });

          // Determine if the ultimate source is an external call within this leaf
          const extSource = findExternalSource(callee, targetCap, externalCaps);
          const source = extSource
            ? { name: extSource.name, caps: extSource.caps, isExternal: true }
            : { name: callee.name, caps: [...callee.autoDetected], isExternal: false };

          return { nodes, source };
        }

        queue.push({ fnId: call.targetId, path: newPath });
      } else {
        // External call — check if it carries the target cap
        const extCaps = resolveExternalCaps(call.targetName, call.qualifiedName, externalCaps);
        if (extCaps && extCaps.includes(targetCap)) {
          const nodes: ChainNode[] = [];
          nodes.push({ functionName: startFn.name, filePath: startFn.filePath, line: startFn.line });
          for (const step of path) {
            const stepFn = graph.functions.get(step.fnId)!;
            if (stepFn.id !== startId) {
              nodes.push({ functionName: stepFn.name, filePath: stepFn.filePath, line: stepFn.line, callLine: step.callLine });
            } else {
              nodes[nodes.length - 1].callLine = step.callLine;
            }
          }
          // Add current function in chain if it's not the start
          if (fnId !== startId) {
            nodes.push({ functionName: fn.name, filePath: fn.filePath, line: fn.line, callLine: call.line });
          } else {
            nodes[nodes.length - 1].callLine = call.line;
          }
          return {
            nodes,
            source: { name: call.targetName, caps: extCaps, isExternal: true },
          };
        }
      }
    }
  }

  // Fallback: couldn't trace chain (shouldn't happen if inference is correct)
  return {
    nodes: [{ functionName: startFn.name, filePath: startFn.filePath, line: startFn.line }],
    source: { name: "unknown", caps: [targetCap], isExternal: true },
  };
}

function findExternalSource(
  fn: FunctionInfo,
  targetCap: Capability,
  externalCaps: Map<string, ExternalCapEntry>,
): { name: string; caps: Capability[] } | null {
  for (const call of fn.calls) {
    if (call.targetId) continue;
    const caps = resolveExternalCaps(call.targetName, call.qualifiedName, externalCaps);
    if (caps && caps.includes(targetCap)) {
      return { name: call.targetName, caps };
    }
  }
  return null;
}

function isLeafSource(fn: FunctionInfo, cap: Capability, graph: ProjectGraph, inferred: InferredCaps): boolean {
  // A function is a leaf source for a cap if:
  // - it has the cap from auto-detection, OR
  // - all its callees that carry this cap are external
  if (fn.autoDetected.has(cap)) return true;
  for (const call of fn.calls) {
    if (call.targetId) {
      const calleeCaps = inferred.caps.get(call.targetId);
      if (calleeCaps && calleeCaps.has(cap)) return false;
    }
  }
  return true;
}

function resolveExternalCaps(
  name: string,
  qualifiedName: string | undefined,
  externalCaps: Map<string, ExternalCapEntry>,
): Capability[] | null {
  const ext = externalCaps.get(name);
  if (ext) return ext.caps;
  if (qualifiedName && Object.hasOwn(BUILTIN_CAPABILITIES, qualifiedName)) {
    return BUILTIN_CAPABILITIES[qualifiedName];
  }
  if (Object.hasOwn(BUILTIN_CAPABILITIES, name)) {
    return BUILTIN_CAPABILITIES[name];
  }
  return null;
}
