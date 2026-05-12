/**
 * 输出格式化 — JSON 结构化输出
 *
 * assert 输出增强：
 *   - 完整传递路线（从断言函数沿调用图到达污染源）
 *   - 对 Fallible/Async/Mutable 违规，在链中每个中间节点提示：
 *     如果该处阻断了传递，应标记 @assert HandleFallible / HandleAsync / HandleMutable
 *
 * Handle 语义（参考 docs/wiki）：
 *   Handle 阻断的是 callee 向上传递的能力，不能否认自身的能力。
 *   - HandleFallible: 函数处理了 callee 传来的 Fallible（默认值/try-catch），自身不返回 null
 *   - HandleAsync: 函数处理了 callee 传来的 Async（await 后同步返回/fire-and-forget），自身不返回 Promise
 *   - HandleMutable: 函数处理了 callee 传来的 Mutable（传入局部拷贝），调用方数据未被修改
 *
 *   IO 和 Impure 不可阻断——只能通过缩小携带面积来降低负担。
 */

import { relative } from "node:path";
import type { AssertionViolation, ProjectGraph, InferredCaps, Capability } from "@lm-linter/core";

/**
 * 可阻断能力对应的 Handle 标记及处理方式说明
 */
const HANDLE_INFO: Partial<Record<Capability, { tag: string; validHandling: string }>> = {
  Fallible: {
    tag: "HandleFallible",
    validHandling: "提供默认值(?? fallback) / try-catch 捕获 / 转换为 Result 结构体",
  },
  Async: {
    tag: "HandleAsync",
    validHandling: "await 后同步返回结果(自身不是 async) / fire-and-forget(.then().catch()) / 转为回调模式",
  },
  Mutable: {
    tag: "HandleMutable",
    validHandling: "传入局部拷贝([...arr] / {...obj} / structuredClone) / 内部创建新对象传给 callee",
  },
};

interface HandleHint {
  function: string;
  file: string;
  line: number;
  /** 建议标记 */
  marker: string;
  /** 什么情况下可以标记——必须满足的条件 */
  condition: string;
}

/**
 * 为可阻断能力(Fallible/Async/Mutable)的违规生成 handle 提示。
 * 
 * 提示逻辑：链中间的每个函数如果确实处理了该效果（而非仅仅转发），
 * 则可以标记 Handle 来阻断传播。
 */
function generateHandleHints(v: AssertionViolation, cwd: string): HandleHint[] {
  const info = HANDLE_INFO[v.violatedBy];
  if (!info) return []; // IO/Impure 不可阻断

  // Handle 不能否认自身的能力。当源头就是断言函数自身时（autoDetected），
  // 修复方式是改签名（如参数改为 readonly），而非标记 Handle。
  if (!v.chain.source.isExternal && v.chain.nodes.length === 1) return [];

  const nodes = v.chain.nodes;
  const hints: HandleHint[] = [];

  if (nodes.length <= 2) {
    // 断言函数直接调用了携带该能力的源头
    if (nodes.length >= 1) {
      hints.push({
        function: nodes[0].functionName,
        file: relative(cwd, nodes[0].filePath),
        line: nodes[0].line,
        marker: `@assert ${info.tag}`,
        condition: `此函数直接调用了 ${v.violatedBy} 源头。若函数内部已处理 callee 传来的 ${v.violatedBy}（${info.validHandling}），且自身签名不再携带该效果，可标记 ${info.tag} 阻断向上传播。`,
      });
    }
    return hints;
  }

  // 中间节点（index 1 到 length-2）：每个都是潜在的阻断点
  for (let i = 1; i < nodes.length - 1; i++) {
    const node = nodes[i];
    hints.push({
      function: node.functionName,
      file: relative(cwd, node.filePath),
      line: node.line,
      marker: `@assert ${info.tag}`,
      condition: `此函数处于 ${v.violatedBy} 传递路线中间。若它已处理了 callee 传来的 ${v.violatedBy}（${info.validHandling}），可标记 ${info.tag}，${v.violatedBy} 将不再向上传播至断言函数。`,
    });
  }

  return hints;
}

export function formatAssertViolations(violations: AssertionViolation[], cwd: string, summary: boolean): string {
  if (violations.length === 0) {
    return JSON.stringify({ status: "pass", violations: 0 }, null, 2);
  }

  if (summary) {
    const byFn = new Map<string, { function: string; file: string; line: number; count: number; properties: string[] }>();
    for (const v of violations) {
      const key = v.assertion.functionId;
      if (!byFn.has(key)) {
        byFn.set(key, { function: v.assertion.functionName, file: relative(cwd, v.assertion.filePath), line: v.assertion.line, count: 0, properties: [] });
      }
      const entry = byFn.get(key)!;
      entry.count++;
      if (!entry.properties.includes(v.property)) entry.properties.push(v.property);
    }
    return JSON.stringify({ status: "fail", totalViolations: violations.length, functions: [...byFn.values()] }, null, 2);
  }

  const formatted = violations.map(v => {
    const chain = v.chain.nodes.map(n => ({
      function: n.functionName,
      file: relative(cwd, n.filePath),
      line: n.line,
      ...(n.callLine ? { callLine: n.callLine } : {}),
    }));
    const handleHints = generateHandleHints(v, cwd);
    return {
      assertion: { function: v.assertion.functionName, file: relative(cwd, v.assertion.filePath), line: v.assertion.line, property: v.property },
      violatedBy: v.violatedBy,
      chain,
      source: { name: v.chain.source.name, caps: v.chain.source.caps, external: v.chain.source.isExternal },
      ...(handleHints.length > 0 ? { handleHints } : {}),
    };
  });

  return JSON.stringify({ status: "fail", violations: formatted }, null, 2);
}

export function formatInferred(graph: ProjectGraph, inferred: InferredCaps, cwd: string, paths: string[]): string {
  const entries: Array<{ name: string; file: string; line: number; caps: string[]; hasAssertion: boolean }> = [];
  for (const [id, fn] of graph.functions) {
    if (paths.length > 0 && !paths.some(p => fn.filePath.includes(p))) continue;
    const caps = inferred.caps.get(id) ?? new Set();
    entries.push({ name: fn.name, file: relative(cwd, fn.filePath), line: fn.line, caps: [...caps].sort(), hasAssertion: fn.assertion !== null });
  }
  entries.sort((a, b) => b.caps.length - a.caps.length);
  return JSON.stringify({ totalFunctions: entries.length, pureFunctions: entries.filter(e => e.caps.length === 0).length, withAssertions: entries.filter(e => e.hasAssertion).length, functions: entries }, null, 2);
}

export function formatLooseness(results: Array<{ filePath: string; signals: Array<{ type: string; line: number; desc: string }> }>, summary: boolean): string {
  const withSignals = results.filter(r => r.signals.length > 0);
  if (withSignals.length === 0) {
    return JSON.stringify({ status: "pass", issues: 0 }, null, 2);
  }
  if (summary) {
    const totalIssues = withSignals.reduce((s, r) => s + r.signals.length, 0);
    return JSON.stringify({ status: "fail", issues: totalIssues, files: withSignals.map(r => ({ file: r.filePath, issues: r.signals.length })) }, null, 2);
  }
  return JSON.stringify({ status: "fail", files: withSignals.map(r => ({ file: r.filePath, signals: r.signals })) }, null, 2);
}
