#!/usr/bin/env node
/**
 * 统一评分报告 CLI
 *
 * 用法:
 *   capability-report <file-or-dir> [...]           → JSON 输出（默认）
 *   capability-report --llm <file-or-dir> [...]     → LLM 友好的 Markdown 输出
 *   capability-report --pretty <file-or-dir> [...]  → 人类友好的终端输出
 */

import { collectFiles, scoreFile, summarize, generateTips } from "./report-core.js";
import { reportJSON } from "./reporter-json.js";
import { reportLLM } from "./reporter-llm.js";
import { reportPretty } from "./reporter-pretty.js";
import type { ReporterPort } from "./report-types.js";

const args = process.argv.slice(2);
const targets = args.filter(a => !a.startsWith("--"));

const reporters: Record<string, ReporterPort> = {
  "--json": reportJSON,
  "--llm": reportLLM,
  "--pretty": reportPretty,
};

const flag = args.find(a => a.startsWith("--"));
const reporter = flag ? reporters[flag] : reportJSON;

if (!reporter) {
  console.error(`Unknown flag: ${flag}`);
  console.error("Usage: capability-report [--json | --llm | --pretty] <file-or-dir> [file-or-dir...]");
  process.exit(1);
}

if (targets.length === 0) {
  console.error("Usage: capability-report [--json | --llm | --pretty] <file-or-dir> [file-or-dir...]");
  process.exit(1);
}

const files = collectFiles(targets);
if (files.length === 0) {
  console.error("No .ts files found in the specified paths.");
  process.exit(1);
}

const results = files.map(scoreFile);
const summary = summarize(results);
const tips = generateTips(results, summary);

reporter({ results, summary, tips });

if (summary.totalUndeclared > 0) process.exit(1);
