/**
 * 能力定义 — 5 个传播能力
 *
 * IO 和 Impure 无法从类型推断，只能从外部声明获取。
 * Async、Fallible、Mutable 可从 TS 类型自动推断。
 */

export type Capability = "IO" | "Impure" | "Fallible" | "Async" | "Mutable";

export const CAPABILITIES: Capability[] = ["IO", "Impure", "Fallible", "Async", "Mutable"];

/** 可从类型自动推断的能力 */
export const AUTO_INFER_CAPS: Capability[] = ["Async", "Fallible", "Mutable"];

/** 只能从外部声明获取的能力 */
export const DECLARE_ONLY_CAPS: Capability[] = ["IO", "Impure"];

/** 沿调用图向上传播的能力（全部 5 个都传播） */
export const PROPAGATE_CAPS: Capability[] = CAPABILITIES;

/**
 * 断言属性 — 用户面对的正面词汇
 * 每个属性映射到它禁止的能力集
 */
export type AssertionProperty = "pure" | "infallible" | "immutable" | "sync" | "deterministic" | "local" | "minimal";

export const ASSERTION_PROPERTIES: Record<AssertionProperty, Capability[]> = {
  pure: ["IO", "Impure", "Fallible", "Async", "Mutable"],
  infallible: ["Fallible"],
  immutable: ["Mutable"],
  sync: ["Async"],
  deterministic: ["Impure"],
  local: ["IO"],
  minimal: [],    // handled separately — not a capability constraint
};
