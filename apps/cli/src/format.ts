/**
 * 输出格式化 — JSON 结构化输出
 */

import { relative } from "node:path";
import type { AssertionViolation, ProjectGraph, InferredCaps } from "@lm-linter/core";

export function formatViolations(violations: AssertionViolation[], cwd: string, summary: boolean): string {
  if (violations.length === 0) {
    return JSON.stringify({ status: "pass", violations: 0 }, null, 2);
  }

  if (summary) {
    // Group by function
    const byFn = new Map<string, { function: string; file: string; line: number; count: number; properties: string[] }>();
    for (const v of violations) {
      const key = v.assertion.functionId;
      if (!byFn.has(key)) {
        byFn.set(key, {
          function: v.assertion.functionName,
          file: relative(cwd, v.assertion.filePath),
          line: v.assertion.line,
          count: 0,
          properties: [],
        });
      }
      const entry = byFn.get(key)!;
      entry.count++;
      if (!entry.properties.includes(v.property)) entry.properties.push(v.property);
    }
    return JSON.stringify({
      status: "fail",
      totalViolations: violations.length,
      functions: [...byFn.values()],
    }, null, 2);
  }

  const formatted = violations.map(v => ({
    assertion: {
      function: v.assertion.functionName,
      file: relative(cwd, v.assertion.filePath),
      line: v.assertion.line,
      property: v.property,
    },
    violatedBy: v.violatedBy,
    chain: v.chain.nodes.map(n => ({
      function: n.functionName,
      file: relative(cwd, n.filePath),
      line: n.line,
      ...(n.callLine ? { callLine: n.callLine } : {}),
    })),
    source: {
      name: v.chain.source.name,
      caps: v.chain.source.caps,
      external: v.chain.source.isExternal,
    },
  }));

  return JSON.stringify({ status: "fail", violations: formatted }, null, 2);
}

export function formatInferred(graph: ProjectGraph, inferred: InferredCaps, cwd: string, paths: string[]): string {
  const entries: Array<{ name: string; file: string; line: number; caps: string[]; hasAssertion: boolean }> = [];

  for (const [id, fn] of graph.functions) {
    if (paths.length > 0 && !paths.some(p => fn.filePath.includes(p))) continue;
    const caps = inferred.caps.get(id) ?? new Set();
    entries.push({
      name: fn.name,
      file: relative(cwd, fn.filePath),
      line: fn.line,
      caps: [...caps].sort(),
      hasAssertion: fn.assertion !== null,
    });
  }

  entries.sort((a, b) => b.caps.length - a.caps.length);

  const totalFunctions = entries.length;
  const pureFunctions = entries.filter(e => e.caps.length === 0).length;
  const withAssertions = entries.filter(e => e.hasAssertion).length;

  return JSON.stringify({
    totalFunctions,
    pureFunctions,
    withAssertions,
    functions: entries,
  }, null, 2);
}

export function formatLooseness(
  results: Array<{ filePath: string; signals: Array<{ type: string; line: number; desc: string }> }>,
  summary: boolean,
): string {
  // Filter out files with no signals
  const withSignals = results.filter(r => r.signals.length > 0);

  if (withSignals.length === 0) {
    return JSON.stringify({ status: "pass", issues: 0 }, null, 2);
  }

  if (summary) {
    const totalIssues = withSignals.reduce((s, r) => s + r.signals.length, 0);
    return JSON.stringify({
      status: "fail",
      issues: totalIssues,
      files: withSignals.map(r => ({ file: r.filePath, issues: r.signals.length })),
    }, null, 2);
  }

  return JSON.stringify({
    status: "fail",
    files: withSignals.map(r => ({
      file: r.filePath,
      signals: r.signals,
    })),
  }, null, 2);
}
