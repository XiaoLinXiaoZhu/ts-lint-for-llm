/**
 * ESLint 规则: capability/no-escalation (v2)
 *
 * 变更点:
 * 1. 未标注函数 = 全能力（坏函数），不是纯函数
 * 2. 能力用完整英文单词: IO, Blocking, Fallible, Async, Mutable, Impure, ThreadLocal, Unsafe
 * 3. 同时支持函数名后缀（首选）和 JSDoc @capability（兜底）
 * 4. 支持从 .caps.ts 声明文件加载外部包能力
 */

import { ESLintUtils, TSESTree, AST_NODE_TYPES } from "@typescript-eslint/utils";
import { ALL_CAPABILITIES, CAPABILITY_WORDS, type Capability } from "./capabilities.js";

const VALID_CAPABILITY_NAMES = new Set(Object.keys(CAPABILITY_WORDS));

/** 从函数名后缀提取能力：fetchUser_IO_Fallible → Set(IO, Fallible) */
function extractFromSuffix(name: string | null): Set<Capability> | null {
  if (!name) return null;
  // 找到第一个 _CapWord 位置
  const parts = name.split("_");
  const caps = new Set<Capability>();
  let foundCap = false;
  for (const part of parts) {
    if (VALID_CAPABILITY_NAMES.has(part)) {
      caps.add(part as Capability);
      foundCap = true;
    }
  }
  return foundCap ? caps : null;
}

/** 从 JSDoc @capability 标签提取 */
function extractFromJSDoc(comments: TSESTree.Comment[] | undefined): Set<Capability> | null {
  if (!comments) return null;
  for (const comment of comments) {
    const match = comment.value.match(/@capability(?:\s+(.+))?/);
    if (match) {
      const caps = new Set<Capability>();
      if (match[1]) {
        for (const word of match[1].trim().split(/[\s,]+/)) {
          if (VALID_CAPABILITY_NAMES.has(word)) {
            caps.add(word as Capability);
          }
        }
      }
      return caps;
    }
  }
  return null;
}

/**
 * 获取函数的能力集
 * 优先级: 函数名后缀 > JSDoc > 未标注(= 全能力)
 *
 * 特殊: 空标注 @capability Pure 或后缀中无能力词 → 表示纯函数(空集)
 *       但我们用 "无能力词但函数名有明确的非能力后缀" 不触发
 *       最简单的: 只要没有任何能力声明 = 全能力(坏函数)
 */
function resolveCapabilities(
  name: string | null,
  comments: TSESTree.Comment[] | undefined,
): { caps: Set<Capability>; declared: boolean } {
  // 1. 尝试从函数名后缀提取
  const fromSuffix = extractFromSuffix(name);
  if (fromSuffix !== null) return { caps: fromSuffix, declared: true };

  // 2. 尝试从 JSDoc 提取
  const fromJSDoc = extractFromJSDoc(comments);
  if (fromJSDoc !== null) return { caps: fromJSDoc, declared: true };

  // 3. 未标注 = 全能力（坏函数）
  return { caps: new Set(ALL_CAPABILITIES), declared: false };
}

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/example/capability-lint#${name}`
);

type ExternalCapabilityMap = Record<string, Record<string, Capability[]>>;

export const noEscalation = createRule({
  name: "no-escalation",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow calling functions with capabilities not declared by the caller",
    },
    messages: {
      escalation:
        "'{{caller}}' 缺少能力 [{{missing}}]，但调用了需要 [{{calleeCapabilities}}] 的 '{{callee}}'。",
      undeclared:
        "'{{name}}' 未声明能力，被视为全能力坏函数。请添加能力后缀(如 _IO_Fallible)或 @capability 标注。",
    },
    schema: [
      {
        type: "object",
        properties: {
          externalCapabilities: {
            type: "object",
            description: "外部模块能力声明映射",
            additionalProperties: {
              type: "object",
              additionalProperties: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{ externalCapabilities: {} as ExternalCapabilityMap }],
  create(context, [options]) {
    const functionCapabilities = new Map<string, { caps: Set<Capability>; declared: boolean }>();
    const externalCaps: ExternalCapabilityMap = options.externalCapabilities ?? {};

    // 解析外部能力声明到扁平 map: functionName → Set<Capability>
    const externalFunctionCaps = new Map<string, Set<Capability>>();
    for (const [_module, fns] of Object.entries(externalCaps)) {
      for (const [fnName, caps] of Object.entries(fns)) {
        externalFunctionCaps.set(fnName, new Set(caps as Capability[]));
      }
    }

    const functionStack: Array<{
      name: string | null;
      caps: Set<Capability>;
      declared: boolean;
      node: TSESTree.Node;
    }> = [];

    function getLeadingComments(node: TSESTree.Node): TSESTree.Comment[] | undefined {
      return context.sourceCode.getCommentsBefore(node);
    }

    function enterFunction(
      node: TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
      name: string | null,
    ) {
      let comments = getLeadingComments(node);
      // 箭头函数: JSDoc 在 VariableDeclaration 上
      if (
        node.type === AST_NODE_TYPES.ArrowFunctionExpression &&
        node.parent.type === AST_NODE_TYPES.VariableDeclarator &&
        node.parent.parent
      ) {
        comments = [...(comments ?? []), ...(getLeadingComments(node.parent.parent) ?? [])];
      }

      const resolved = resolveCapabilities(name, comments);
      if (name) functionCapabilities.set(name, resolved);
      functionStack.push({ name, ...resolved, node });
    }

    function exitFunction() {
      functionStack.pop();
    }

    function lookupCalleeCaps(calleeName: string): { caps: Set<Capability>; declared: boolean } | null {
      // 1. 项目内已知函数
      const known = functionCapabilities.get(calleeName);
      if (known) return known;
      // 2. 外部声明
      const ext = externalFunctionCaps.get(calleeName);
      if (ext) return { caps: ext, declared: true };
      // 3. 函数名后缀
      const fromSuffix = extractFromSuffix(calleeName);
      if (fromSuffix) return { caps: fromSuffix, declared: true };
      // 未知 = 全能力
      return null;
    }

    function checkCall(node: TSESTree.CallExpression, calleeName: string) {
      if (functionStack.length === 0) return;
      const caller = functionStack[functionStack.length - 1];
      const callee = lookupCalleeCaps(calleeName);
      if (!callee) return; // 完全未知的函数，跳过（或可报 warning）

      const missing: Capability[] = [];
      for (const cap of callee.caps) {
        if (!caller.caps.has(cap)) {
          missing.push(cap);
        }
      }

      if (missing.length > 0 && callee.declared) {
        context.report({
          node,
          messageId: "escalation",
          data: {
            caller: caller.name ?? "(anonymous)",
            callee: calleeName,
            missing: missing.join(", "),
            calleeCapabilities: [...callee.caps].join(", "),
          },
        });
      }
    }

    return {
      FunctionDeclaration(node) {
        enterFunction(node, node.id?.name ?? null);
        // 报告未声明的函数
        const name = node.id?.name;
        if (name) {
          const resolved = functionCapabilities.get(name);
          if (resolved && !resolved.declared) {
            context.report({ node: node.id!, messageId: "undeclared", data: { name } });
          }
        }
      },
      "FunctionDeclaration:exit"() { exitFunction(); },

      VariableDeclarator(node) {
        if (
          node.init &&
          (node.init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            node.init.type === AST_NODE_TYPES.FunctionExpression) &&
          node.id.type === AST_NODE_TYPES.Identifier
        ) {
          const varDecl = node.parent;
          const comments = getLeadingComments(varDecl);
          const nameCaps = extractFromSuffix(node.id.name);
          const jsdocCaps = extractFromJSDoc(comments);
          const declared = nameCaps !== null || jsdocCaps !== null;
          const caps = nameCaps ?? jsdocCaps ?? new Set(ALL_CAPABILITIES);
          functionCapabilities.set(node.id.name, { caps, declared });
          if (!declared) {
            context.report({ node: node.id, messageId: "undeclared", data: { name: node.id.name } });
          }
        }
      },

      ArrowFunctionExpression(node) {
        let name: string | null = null;
        if (node.parent.type === AST_NODE_TYPES.VariableDeclarator &&
          node.parent.id.type === AST_NODE_TYPES.Identifier) {
          name = node.parent.id.name;
        }
        enterFunction(node, name);
      },
      "ArrowFunctionExpression:exit"() { exitFunction(); },

      FunctionExpression(node) {
        let name: string | null = node.id?.name ?? null;
        if (!name && node.parent.type === AST_NODE_TYPES.VariableDeclarator &&
          node.parent.id.type === AST_NODE_TYPES.Identifier) {
          name = node.parent.id.name;
        }
        enterFunction(node, name);
      },
      "FunctionExpression:exit"() { exitFunction(); },

      CallExpression(node) {
        let calleeName: string | null = null;
        if (node.callee.type === AST_NODE_TYPES.Identifier) {
          calleeName = node.callee.name;
        } else if (node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.property.type === AST_NODE_TYPES.Identifier) {
          calleeName = node.callee.property.name;
        }
        if (calleeName) checkCall(node, calleeName);
      },
    };
  },
});
