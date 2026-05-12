#!/usr/bin/env bun
/**
 * lm-linter CLI — 断言式效果追踪与类型松散度检测
 *
 *   lm-linter assert [options]   效果断言验证（推断 + 断言检查 + 污染链 + handle 提示）
 *   lm-linter type   [options]   类型松散度检测
 *   lm-linter infer  [options]   显示所有函数的推断能力（辅助）
 *   lm-linter minimal [options]  穿透参数检测
 */

import { parseArgs } from "./args.js";
import { runAssert } from "./commands/assert.js";
import { runType } from "./commands/type.js";
import { runInfer } from "./commands/infer.js";
import { runMinimal } from "./commands/minimal.js";

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

switch (options.command) {
  case "assert": runAssert(options); break;
  case "type": runType(options); break;
  case "infer": runInfer(options); break;
  case "minimal": runMinimal(options); break;
  default: printHelp(); break;
}

function printHelp() {
  console.log(`lm-linter — 断言式 TypeScript 效果追踪

Usage:
  lm-linter assert  [file|dir ...] [options]   验证 @assert 断言
  lm-linter type    [file|dir ...] [options]   类型松散度检测
  lm-linter infer   [file|dir ...] [options]   显示推断的能力集
  lm-linter minimal [file|dir ...] [options]   穿透参数检测

Options:
  --tsconfig <path>   指定 tsconfig.json (默认: ./tsconfig.json)
  --summary           只输出汇总（不输出详细信息）
  --all               扫描所有函数（不限于有 @assert minimal 的）
  --help              显示帮助

═══ 断言词汇 ═══

  @assert pure            完全纯函数 (无 IO/Impure/Fallible/Async/Mutable)
  @assert infallible      不可失败 (无 Fallible)
  @assert immutable       不修改状态 (无 Mutable)
  @assert sync            同步 (无 Async)
  @assert deterministic   确定性 (无 Impure)
  @assert local           不与外部交互 (无 IO)

  属性可组合: @assert infallible immutable sync

═══ Handle 标记 ═══

  @assert HandleFallible    声明此函数已处理了可失败性（如 try/catch）
  @assert HandleAsync       声明此函数已解包了异步（如 await）
  @assert HandleMutable     声明此函数已处理了可变性（如 freeze/copy）

  当 assert 子命令检测到 Fallible/Async/Mutable 违规时，
  会在输出的 handleHints 中提示链上哪些中间函数可以标记 Handle 来阻断传递。

═══ 工作流 ═══

  1. 在关键函数上标记 @assert
  2. 运行 lm-linter assert
  3. 断言不满足 → 输出污染链 + handle 提示 → AI/人按链修复或标记 Handle
  4. 断言满足 → 无输出 → 代码质量已验证

═══ 外部声明 ═══

  创建 .cap.ts 文件声明外部函数的 IO/Impure 能力。
  Async/Fallible/Mutable 从 .d.ts 类型自动推断。

═══ 示例 ═══

  lm-linter assert                      完整断言验证（含传递路线 + handle 提示）
  lm-linter assert src/core/            只检查 src/core/
  lm-linter assert --summary            只看汇总
  lm-linter infer                       查看所有函数的推断能力
  lm-linter type                        类型松散度
  lm-linter type --summary              只看总分
`);
}
