/**
 * ESLint 规则: capability/fallible-absorbed
 *
 * Fallible 吸收提醒：当 caller 调用了 Fallible 函数但自身未声明 Fallible 时，
 * 以 suggestion 形式提示开发者选择：
 * 1. 为 caller 补充 Fallible 声明（向上传播）
 * 2. 将被调方的 null/undefined 返回改为显式错误结构体（parse-don't-validate）
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

export const fallibleAbsorbed = createRule({
  name: "fallible-absorbed",
  meta: {
    type: "suggestion",
    hasSuggestions: true,
    docs: {
      description: "Suggest handling when calling Fallible functions without declaring Fallible",
    },
    messages: {
      fallibleAbsorbed:
        "'{{caller}}' 调用了 Fallible 函数 '{{callee}}'，但未声明 Fallible 能力。",
      suggestAddFallible:
        "为 '{{caller}}' 补充 Fallible 声明（若失败未被 try-catch、默认值等处理）",
      suggestParseNotValidate:
        "不补充 Fallible：将 '{{callee}}' 的空返回转为显式错误结构体（如 { success: false, error: \"reason\" }），让下游无需处理 null/undefined",
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
        if (missing.length > 0 || !absorbed.includes("Fallible")) return;

        const canSuggest = caller.declared && caller.source.kind === "jsdoc";
        context.report({
          node,
          messageId: "fallibleAbsorbed",
          data: {
            caller: caller.name ?? "(anonymous)",
            callee: calleeName,
          },
          suggest: canSuggest
            ? [
                {
                  messageId: "suggestAddFallible" as const,
                  data: { caller: caller.name ?? "(anonymous)" },
                  fix: (fixer) => buildJSDocFix(
                    fixer,
                    (caller.source as { kind: "jsdoc"; comment: any }).comment,
                    caller.caps,
                    ["Fallible" as Capability],
                  )!,
                },
                {
                  messageId: "suggestParseNotValidate" as const,
                  data: { callee: calleeName },
                  fix: (fixer) => fixer.insertTextBefore(node, ""),
                },
              ]
            : [
                {
                  messageId: "suggestParseNotValidate" as const,
                  data: { callee: calleeName },
                  fix: (fixer) => fixer.insertTextBefore(node, ""),
                },
              ],
        });
      },
    });
  },
});
