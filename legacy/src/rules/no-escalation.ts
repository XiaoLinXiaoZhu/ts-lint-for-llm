/**
 * ESLint 规则: capability/no-escalation
 *
 * 权限违例检测：
 * - 调用方的能力集必须是被调方能力集的超集（wrappable 能力除外）
 * - 未标注函数 = 全能力（坏函数）
 * - 返回 Promise/AsyncIterable → 自动注入 Async
 * - 返回 null/undefined → 自动注入 Fallible
 * - 声明了多余能力 → 建议移除
 *
 * --fix 行为：
 * - 对 JSDoc 声明的函数，自动补全缺失的 non-wrappable 能力
 * - 自动移除不需要的多余能力
 */

import { ESLintUtils, AST_NODE_TYPES } from "@typescript-eslint/utils";
import { ELIMINABILITY } from "../capabilities.js";
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

export const noEscalation = createRule({
  name: "no-escalation",
  meta: {
    type: "problem",
    fixable: "code",
    docs: {
      description: "Disallow calling functions with capabilities not declared by the caller",
    },
    messages: {
      escalation:
        "'{{caller}}' 缺少能力 [{{missing}}]，但调用了需要 [{{calleeCapabilities}}] 的 '{{callee}}'。",
      undeclared:
        "'{{name}}' 未声明能力，被视为全能力坏函数。请添加能力后缀或 @capability 标注。",
      unregistered:
        "'{{callee}}' 未注册能力声明，视为全能力函数。请在 externalCapabilities 中补充该函数的能力配置。",
      asyncMismatch:
        "'{{name}}' 返回类型包含 Promise/AsyncIterable，已自动标记为 Async。如不需要此标记，请将异步操作在函数内部消化（如 task/handle 模式），使返回类型不含 Promise。",
      fallibleMismatch:
        "'{{name}}' 返回类型包含 null/undefined，已自动标记为 Fallible。如不需要此标记，请将 null/undefined 返回改为显式的错误结构体（如 { success: false, error: \"reason\" }），用确定的类型替代空值。",
    },
    schema: [externalCapabilitiesSchema],
  },
  defaultOptions: [{ externalCapabilities: {} as ExternalCapabilityMap }],
  create(context, [options]) {
    const tracker = createCapabilityTracker(
      context.sourceCode,
      options.externalCapabilities ?? {},
    );
    const reportedUnknowns = new Set<string>();

    return createVisitorHooks(tracker, {
      onFunctionEnter(node, name, { resolved, asyncMismatch, fallibleMismatch }) {
        const reportNode = node.type === AST_NODE_TYPES.FunctionDeclaration && node.id
          ? node.id : node;

        if (asyncMismatch) {
          context.report({
            node: reportNode,
            messageId: "asyncMismatch",
            data: { name: name ?? "(anonymous)" },
            fix: resolved.source.kind === "jsdoc"
              ? (fixer) => buildJSDocFix(
                  fixer,
                  (resolved.source as { kind: "jsdoc"; comment: any }).comment,
                  resolved.caps,
                  [],
                )
              : undefined,
          });
        }

        if (fallibleMismatch) {
          context.report({
            node: reportNode,
            messageId: "fallibleMismatch",
            data: { name: name ?? "(anonymous)" },
            fix: resolved.source.kind === "jsdoc"
              ? (fixer) => buildJSDocFix(
                  fixer,
                  (resolved.source as { kind: "jsdoc"; comment: any }).comment,
                  resolved.caps,
                  [],
                )
              : undefined,
          });
        }
      },

      onUndeclared(node, name) {
        context.report({ node, messageId: "undeclared", data: { name } });
      },

      onUnknownCall(node, calleeName) {
        if (reportedUnknowns.has(calleeName)) return;
        reportedUnknowns.add(calleeName);
        context.report({
          node,
          messageId: "unregistered",
          data: { callee: calleeName },
        });
      },

      onCall(node, calleeName, { caller, missing }) {
        if (missing.length === 0) return;

        const canFix = caller.declared && caller.source.kind === "jsdoc";
        const propagatable = missing.filter(c => ELIMINABILITY[c] !== "wrappable");

        context.report({
          node,
          messageId: "escalation",
          data: {
            caller: caller.name ?? "(anonymous)",
            callee: calleeName,
            missing: missing.join(", "),
            calleeCapabilities: [...tracker.lookupCalleeCaps(calleeName)!.caps].join(", "),
          },
          fix: canFix && propagatable.length > 0
            ? (fixer) => buildJSDocFix(
                fixer,
                (caller.source as { kind: "jsdoc"; comment: any }).comment,
                caller.caps,
                propagatable,
              )
            : undefined,
        });
      },
    });
  },
});
