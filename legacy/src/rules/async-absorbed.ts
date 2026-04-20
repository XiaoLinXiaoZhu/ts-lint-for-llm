/**
 * ESLint 规则: capability/async-absorbed
 *
 * Async 吸收提醒：当 caller 调用了 Async 函数但自身未声明 Async 时，
 * 以 suggestion 形式提示开发者选择：
 * 1. 为 caller 补充 Async 声明（向上传播）
 * 2. 确认已通过 task/handle 模式消化了异步操作
 */

import { ESLintUtils } from "@typescript-eslint/utils";
import type { Capability } from "../capabilities.js";
import {
  type ExternalCapabilityMap,
  createCapabilityTracker,
  createVisitorHooks,
  buildJSDocFix,
  externalCapabilitiesSchema,
} from "./capability-tracker.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropic/ts-lint-for-llm#${name}`
);

export const asyncAbsorbed = createRule({
  name: "async-absorbed",
  meta: {
    type: "suggestion",
    hasSuggestions: true,
    docs: {
      description: "Suggest handling when calling Async functions without declaring Async",
    },
    messages: {
      asyncAbsorbed:
        "'{{caller}}' 调用了 Async 函数 '{{callee}}'，但未声明 Async 能力。",
      suggestAddAsync:
        "为 '{{caller}}' 补充 Async 声明（若调用方需要 await 本函数的结果）",
      suggestHandlePattern:
        "不补充 Async：确认已通过 task/handle、fire-and-forget+错误处理 等模式在函数内部消化了异步操作",
    },
    schema: [externalCapabilitiesSchema],
  },
  defaultOptions: [{ externalCapabilities: {} as ExternalCapabilityMap }],
  create(context, [options]) {
    const tracker = createCapabilityTracker(
      context.sourceCode,
      options.externalCapabilities ?? {},
    );

    return createVisitorHooks(tracker, {
      onCall(node, calleeName, { caller, missing, absorbed }) {
        if (missing.length > 0 || !absorbed.includes("Async" as Capability)) return;

        const canSuggest = caller.declared && caller.source.kind === "jsdoc";
        context.report({
          node,
          messageId: "asyncAbsorbed",
          data: {
            caller: caller.name ?? "(anonymous)",
            callee: calleeName,
          },
          suggest: canSuggest
            ? [
                {
                  messageId: "suggestAddAsync" as const,
                  data: { caller: caller.name ?? "(anonymous)" },
                  fix: (fixer) => buildJSDocFix(
                    fixer,
                    (caller.source as { kind: "jsdoc"; comment: any }).comment,
                    caller.caps,
                    ["Async" as Capability],
                  )!,
                },
                {
                  messageId: "suggestHandlePattern" as const,
                  data: { callee: calleeName },
                  fix: (fixer) => fixer.insertTextBefore(node, ""),
                },
              ]
            : [
                {
                  messageId: "suggestHandlePattern" as const,
                  data: { callee: calleeName },
                  fix: (fixer) => fixer.insertTextBefore(node, ""),
                },
              ],
        });
      },
    });
  },
});
