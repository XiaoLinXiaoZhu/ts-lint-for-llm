/**
 * ESLint 规则: capability/no-escalation
 *
 * 核心规则：调用方的能力集必须是被调方能力集的超集。
 * 未标注函数 = 全能力（坏函数）。
 *
 * 能力声明方式（优先级从高到低）：
 * 1. 函数名后缀: fetchUser_IO_Async_Fallible
 * 2. JSDoc @capability: /** @capability IO Fallible *\/
 */

import { ESLintUtils, TSESTree, AST_NODE_TYPES } from "@typescript-eslint/utils";
import { VALID_CAPABILITY_NAMES, ALL_CAPABILITIES, ELIMINABILITY, type Capability } from "../capabilities.js";

function extractFromSuffix(name: string | null): Set<Capability> | null {
  if (!name) return null;
  const parts = name.split("_");
  const caps = new Set<Capability>();
  let found = false;
  for (const part of parts) {
    if (VALID_CAPABILITY_NAMES.has(part as Capability)) {
      caps.add(part as Capability);
      found = true;
    }
  }
  return found ? caps : null;
}

function extractFromJSDoc(comments: TSESTree.Comment[] | undefined): Set<Capability> | null {
  if (!comments) return null;
  for (const comment of comments) {
    const match = comment.value.match(/@capability(?:\s+(.+))?/);
    if (match) {
      const caps = new Set<Capability>();
      if (match[1]) {
        for (const word of match[1].trim().replace(/\*\/.*$/, "").trim().split(/[\s,]+/)) {
          if (VALID_CAPABILITY_NAMES.has(word as Capability)) {
            caps.add(word as Capability);
          }
        }
      }
      return caps;
    }
  }
  return null;
}

function resolveCapabilities(
  name: string | null,
  comments: TSESTree.Comment[] | undefined,
): { caps: Set<Capability>; declared: boolean } {
  const fromSuffix = extractFromSuffix(name);
  if (fromSuffix !== null) return { caps: fromSuffix, declared: true };
  const fromJSDoc = extractFromJSDoc(comments);
  if (fromJSDoc !== null) return { caps: fromJSDoc, declared: true };
  return { caps: new Set(ALL_CAPABILITIES), declared: false };
}

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropic/ts-lint-for-llm#${name}`
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
        "'{{name}}' 未声明能力，被视为全能力坏函数。请添加能力后缀或 @capability 标注。",
      fallibleAbsorbed:
        "'{{caller}}' 调用了 Fallible 函数 '{{callee}}'。如果失败已被处理（try-catch、默认值、parse-don't-validate），可忽略；否则请为 '{{caller}}' 补充 Fallible 声明。",
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
      if (
        node.type === AST_NODE_TYPES.ArrowFunctionExpression &&
        node.parent.type === AST_NODE_TYPES.VariableDeclarator &&
        node.parent.parent
      ) {
        comments = [...(comments ?? []), ...(getLeadingComments(node.parent.parent) ?? [])];
      }
      if (
        node.type === AST_NODE_TYPES.FunctionDeclaration &&
        (node.parent.type === AST_NODE_TYPES.ExportNamedDeclaration ||
          node.parent.type === AST_NODE_TYPES.ExportDefaultDeclaration)
      ) {
        comments = [...(comments ?? []), ...(getLeadingComments(node.parent) ?? [])];
      }

      const resolved = resolveCapabilities(name, comments);
      if (name) functionCapabilities.set(name, resolved);
      functionStack.push({ name, ...resolved, node });
    }

    function exitFunction() {
      functionStack.pop();
    }

    function lookupCalleeCaps(calleeName: string): { caps: Set<Capability>; declared: boolean } | null {
      const known = functionCapabilities.get(calleeName);
      if (known) return known;
      const ext = externalFunctionCaps.get(calleeName);
      if (ext) return { caps: ext, declared: true };
      const fromSuffix = extractFromSuffix(calleeName);
      if (fromSuffix) return { caps: fromSuffix, declared: true };
      return null;
    }

    function checkCall(node: TSESTree.CallExpression, calleeName: string) {
      if (functionStack.length === 0) return;
      const caller = functionStack[functionStack.length - 1];
      const callee = lookupCalleeCaps(calleeName);
      if (!callee) return;
      if (!callee.declared) return;

      const missing: Capability[] = [];
      const absorbed: Capability[] = [];
      for (const cap of callee.caps) {
        if (!caller.caps.has(cap)) {
          if (ELIMINABILITY[cap] === "wrappable") {
            absorbed.push(cap);
          } else {
            missing.push(cap);
          }
        }
      }

      if (missing.length > 0) {
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

      if (absorbed.length > 0 && missing.length === 0) {
        context.report({
          node,
          messageId: "fallibleAbsorbed",
          data: {
            caller: caller.name ?? "(anonymous)",
            callee: calleeName,
          },
        });
      }
    }

    return {
      FunctionDeclaration(node) {
        enterFunction(node, node.id?.name ?? null);
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
