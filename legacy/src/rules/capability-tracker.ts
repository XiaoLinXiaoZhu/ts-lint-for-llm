/**
 * 共享的能力追踪基础设施
 *
 * 提供能力解析、函数栈管理、JSDoc fix 构建等功能，
 * 供 no-escalation / fallible-absorbed / async-absorbed 规则复用。
 */

import { TSESTree, AST_NODE_TYPES } from "@typescript-eslint/utils";
import { VALID_CAPABILITY_NAMES, ALL_CAPABILITIES, ELIMINABILITY, type Capability } from "../capabilities.js";
import { BUILTIN_CAPABILITIES } from "./known-pure.js";

// ── 类型 ──

export type DeclarationSource =
  | { kind: "suffix" }
  | { kind: "jsdoc"; comment: TSESTree.Comment }
  | { kind: "undeclared" };

export interface ResolvedCaps {
  caps: Set<Capability>;
  declared: boolean;
  source: DeclarationSource;
}

export type ExternalCapabilityMap = Record<string, Record<string, Capability[]>>;

export interface FunctionFrame {
  name: string | null;
  caps: Set<Capability>;
  declared: boolean;
  source: DeclarationSource;
  node: TSESTree.Node;
  /** 函数体内实际涉及的能力（来自调用的 callee + 自身特征） */
  encounteredCaps: Set<Capability>;
  hasUnknownCalls: boolean;
}

export interface CallAnalysis {
  caller: FunctionFrame;
  missing: Capability[];
  absorbed: Capability[];
}

// ── 能力解析 ──

export function extractFromSuffix(name: string | null): Set<Capability> | null {
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

export function extractFromJSDoc(comments: TSESTree.Comment[] | undefined): { caps: Set<Capability>; comment: TSESTree.Comment } | null {
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
      return { caps, comment };
    }
  }
  return null;
}

export function resolveCapabilities(
  name: string | null,
  comments: TSESTree.Comment[] | undefined,
): ResolvedCaps {
  const fromSuffix = extractFromSuffix(name);
  if (fromSuffix !== null) return { caps: fromSuffix, declared: true, source: { kind: "suffix" } };
  const fromJSDoc = extractFromJSDoc(comments);
  if (fromJSDoc !== null) return { caps: fromJSDoc.caps, declared: true, source: { kind: "jsdoc", comment: fromJSDoc.comment } };
  return { caps: new Set(ALL_CAPABILITIES), declared: false, source: { kind: "undeclared" } };
}

// ── 函数特征检测 ──

/** 返回类型是否包含 Promise / AsyncIterable（含 async 关键字隐含的 Promise） */
export function returnsAsync(
  node: TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): boolean {
  if (node.async) return true;
  const retType = node.returnType?.typeAnnotation;
  if (!retType) return false;
  return typeContainsAsync(retType);
}

function typeContainsAsync(node: TSESTree.TypeNode): boolean {
  if (
    node.type === AST_NODE_TYPES.TSTypeReference &&
    node.typeName.type === AST_NODE_TYPES.Identifier
  ) {
    const name = node.typeName.name;
    if (name === "Promise" || name === "AsyncIterable" || name === "AsyncGenerator" || name === "AsyncIterableIterator") {
      return true;
    }
  }
  if (node.type === AST_NODE_TYPES.TSUnionType) {
    return node.types.some(t => typeContainsAsync(t));
  }
  return false;
}

/** 返回类型是否包含 null / undefined */
export function returnsNullable(
  node: TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): boolean {
  const retType = node.returnType?.typeAnnotation;
  if (!retType) return false;
  return typeContainsNullable(retType);
}

function typeContainsNullable(node: TSESTree.TypeNode): boolean {
  if (
    node.type === AST_NODE_TYPES.TSNullKeyword ||
    node.type === AST_NODE_TYPES.TSUndefinedKeyword
  ) return true;
  if (node.type === AST_NODE_TYPES.TSUnionType) {
    return node.types.some(t => typeContainsNullable(t));
  }
  if (
    node.type === AST_NODE_TYPES.TSTypeReference &&
    node.typeArguments?.params
  ) {
    return node.typeArguments.params.some(t => typeContainsNullable(t));
  }
  return false;
}

// ── JSDoc fix 构建 ──

/** 重写 @capability 行，合并 callerCaps + missingCaps，按约定顺序排列 */
export function buildJSDocFix(
  fixer: { replaceTextRange(range: [number, number], text: string): any },
  comment: TSESTree.Comment,
  callerCaps: Set<Capability>,
  missingCaps: Capability[],
) {
  const original = comment.value;
  const capMatch = original.match(/@capability(?:\s+(.*))?/);
  if (!capMatch) return null;

  const range = comment.range;
  if (!range) return null;

  const merged = new Set(callerCaps);
  for (const c of missingCaps) merged.add(c);
  const sorted = ALL_CAPABILITIES.filter(c => merged.has(c));
  const capText = sorted.length > 0 ? " " + sorted.join(" ") : "";

  const matchStart = capMatch.index!;
  const matchEnd = matchStart + capMatch[0].trimEnd().length;
  const before = original.slice(0, matchStart);
  const after = original.slice(matchEnd);
  const newValue = before + "@capability" + capText + after;

  const isBlock = comment.type === "Block";
  const newComment = isBlock ? `/*${newValue}*/` : `//${newValue}`;
  return fixer.replaceTextRange([range[0], range[1]], newComment);
}

/** 重写 @capability 行，仅保留 keepCaps 中的能力 */
export function buildJSDocFixExact(
  fixer: { replaceTextRange(range: [number, number], text: string): any },
  comment: TSESTree.Comment,
  keepCaps: Set<Capability>,
) {
  const original = comment.value;
  const capMatch = original.match(/@capability(?:\s+(.*))?/);
  if (!capMatch) return null;
  const range = comment.range;
  if (!range) return null;

  const sorted = ALL_CAPABILITIES.filter(c => keepCaps.has(c));
  const capText = sorted.length > 0 ? " " + sorted.join(" ") : "";

  const matchStart = capMatch.index!;
  const matchEnd = matchStart + capMatch[0].trimEnd().length;
  const before = original.slice(0, matchStart);
  const after = original.slice(matchEnd);
  const newValue = before + "@capability" + capText + after;

  const isBlock = comment.type === "Block";
  const newComment = isBlock ? `/*${newValue}*/` : `//${newValue}`;
  return fixer.replaceTextRange([range[0], range[1]], newComment);
}

// ── 能力追踪器 ──

export interface CapabilityTracker {
  functionStack: FunctionFrame[];
  functionCapabilities: Map<string, ResolvedCaps>;
  enterFunction(
    node: TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
    name: string | null,
  ): { resolved: ResolvedCaps; asyncMismatch: boolean; fallibleMismatch: boolean };
  exitFunction(): FunctionFrame | undefined;
  lookupCalleeCaps(calleeName: string): { caps: Set<Capability>; declared: boolean } | null;
  analyzeCall(calleeName: string): CallAnalysis | null;
  getLeadingComments(node: TSESTree.Node): TSESTree.Comment[] | undefined;
}

export function createCapabilityTracker(
  sourceCode: { getCommentsBefore(node: TSESTree.Node): TSESTree.Comment[] },
  externalCapabilities: ExternalCapabilityMap,
): CapabilityTracker {
  const functionCapabilities = new Map<string, ResolvedCaps>();
  const functionStack: FunctionFrame[] = [];

  const externalFunctionCaps = new Map<string, Set<Capability>>();
  for (const [_module, fns] of Object.entries(externalCapabilities)) {
    for (const [fnName, caps] of Object.entries(fns)) {
      externalFunctionCaps.set(fnName, new Set(caps as Capability[]));
    }
  }

  function getLeadingComments(node: TSESTree.Node): TSESTree.Comment[] | undefined {
    return sourceCode.getCommentsBefore(node);
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

    // 自身特征检测
    const encounteredCaps = new Set<Capability>();
    let asyncMismatch = false;
    let fallibleMismatch = false;

    if (returnsAsync(node) && resolved.declared) {
      encounteredCaps.add("Async");
      if (!resolved.caps.has("Async")) {
        resolved.caps.add("Async");
        asyncMismatch = true;
      }
    }
    if (returnsNullable(node) && resolved.declared) {
      encounteredCaps.add("Fallible");
      if (!resolved.caps.has("Fallible")) {
        resolved.caps.add("Fallible");
        fallibleMismatch = true;
      }
    }

    functionStack.push({ name, ...resolved, node, encounteredCaps, hasUnknownCalls: false });
    return { resolved, asyncMismatch, fallibleMismatch };
  }

  function exitFunction(): FunctionFrame | undefined {
    return functionStack.pop();
  }

  function lookupCalleeCaps(calleeName: string): { caps: Set<Capability>; declared: boolean } | null {
    const known = functionCapabilities.get(calleeName);
    if (known) return known;
    const ext = externalFunctionCaps.get(calleeName);
    if (ext) return { caps: ext, declared: true };
    const fromSuffix = extractFromSuffix(calleeName);
    if (fromSuffix) return { caps: fromSuffix, declared: true };
    if (calleeName in BUILTIN_CAPABILITIES) return { caps: new Set<Capability>(BUILTIN_CAPABILITIES[calleeName] as Capability[]), declared: true };
    return null;
  }

  function analyzeCall(calleeName: string): CallAnalysis | null {
    if (functionStack.length === 0) return null;
    const caller = functionStack[functionStack.length - 1];
    const callee = lookupCalleeCaps(calleeName);
    if (!callee) {
      caller.hasUnknownCalls = true;
      return null;
    }
    if (!callee.declared) return null;

    // 记录调用涉及的所有能力（用于 over-declaration 检测）
    for (const cap of callee.caps) caller.encounteredCaps.add(cap);

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

    return { caller, missing, absorbed };
  }

  return {
    functionStack,
    functionCapabilities,
    enterFunction,
    exitFunction,
    lookupCalleeCaps,
    analyzeCall,
    getLeadingComments,
  };
}

// ── 共享的 visitor hooks 工厂 ──

type FunctionNode = TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;

export interface VisitorCallbacks {
  onFunctionEnter?(node: FunctionNode, name: string | null, result: ReturnType<CapabilityTracker["enterFunction"]>): void;
  onFunctionExit?(frame: FunctionFrame): void;
  onUndeclared?(node: TSESTree.Identifier, name: string): void;
  onCall?(node: TSESTree.CallExpression, calleeName: string, analysis: CallAnalysis): void;
  onUnknownCall?(node: TSESTree.CallExpression, calleeName: string): void;
}

/** 生成共享的 AST visitor hooks，各规则通过回调注入自己的 report 逻辑 */
export function createVisitorHooks(tracker: CapabilityTracker, callbacks: VisitorCallbacks) {
  function doExit() {
    const frame = tracker.exitFunction();
    if (frame) callbacks.onFunctionExit?.(frame);
  }

  return {
    FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
      const name = node.id?.name ?? null;
      const result = tracker.enterFunction(node, name);
      callbacks.onFunctionEnter?.(node, name, result);
      if (name) {
        const resolved = tracker.functionCapabilities.get(name);
        if (resolved && !resolved.declared) {
          callbacks.onUndeclared?.(node.id!, name);
        }
      }
    },
    "FunctionDeclaration:exit"() { doExit(); },

    VariableDeclarator(node: TSESTree.VariableDeclarator) {
      if (
        node.init &&
        (node.init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          node.init.type === AST_NODE_TYPES.FunctionExpression) &&
        node.id.type === AST_NODE_TYPES.Identifier
      ) {
        const varDecl = node.parent;
        const comments = tracker.getLeadingComments(varDecl);
        const nameCaps = extractFromSuffix(node.id.name);
        const jsdocResult = extractFromJSDoc(comments);
        const declared = nameCaps !== null || jsdocResult !== null;
        const caps = nameCaps ?? jsdocResult?.caps ?? new Set(ALL_CAPABILITIES);

        let source: DeclarationSource;
        if (nameCaps !== null) {
          source = { kind: "suffix" };
        } else if (jsdocResult !== null) {
          source = { kind: "jsdoc", comment: jsdocResult.comment };
        } else {
          source = { kind: "undeclared" };
        }

        tracker.functionCapabilities.set(node.id.name, { caps, declared, source });
        if (!declared) {
          callbacks.onUndeclared?.(node.id, node.id.name);
        }
      }
    },

    ArrowFunctionExpression(node: TSESTree.ArrowFunctionExpression) {
      let name: string | null = null;
      if (node.parent.type === AST_NODE_TYPES.VariableDeclarator &&
        node.parent.id.type === AST_NODE_TYPES.Identifier) {
        name = node.parent.id.name;
      }
      const result = tracker.enterFunction(node, name);
      callbacks.onFunctionEnter?.(node, name, result);
    },
    "ArrowFunctionExpression:exit"() { doExit(); },

    FunctionExpression(node: TSESTree.FunctionExpression) {
      let name: string | null = node.id?.name ?? null;
      if (!name && node.parent.type === AST_NODE_TYPES.VariableDeclarator &&
        node.parent.id.type === AST_NODE_TYPES.Identifier) {
        name = node.parent.id.name;
      }
      const result = tracker.enterFunction(node, name);
      callbacks.onFunctionEnter?.(node, name, result);
    },
    "FunctionExpression:exit"() { doExit(); },

    CallExpression(node: TSESTree.CallExpression) {
      let calleeName: string | null = null;
      if (node.callee.type === AST_NODE_TYPES.Identifier) {
        calleeName = node.callee.name;
      } else if (node.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.callee.property.type === AST_NODE_TYPES.Identifier) {
        calleeName = node.callee.property.name;
      }
      if (calleeName) {
        const analysis = tracker.analyzeCall(calleeName);
        if (analysis) {
          callbacks.onCall?.(node, calleeName, analysis);
        } else if (tracker.functionStack.length > 0 && !tracker.lookupCalleeCaps(calleeName)) {
          callbacks.onUnknownCall?.(node, calleeName);
        }
      }
    },
  };
}

// 共享的 schema 定义
export const externalCapabilitiesSchema = {
  type: "object" as const,
  properties: {
    externalCapabilities: {
      type: "object" as const,
      description: "外部模块能力声明映射",
      additionalProperties: {
        type: "object" as const,
        additionalProperties: {
          type: "array" as const,
          items: { type: "string" as const },
        },
      },
    },
  },
  additionalProperties: false as const,
};
