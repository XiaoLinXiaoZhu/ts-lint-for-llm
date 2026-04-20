/**
 * 能力词汇表（5 个核心能力）
 *
 * 对齐 Koka 语言的效果系统：
 *   IO ≈ io, Fallible ≈ exn, Mutable ≈ st, Async ≈ async, Impure ≈ ndet
 */

export const CAPABILITY_WORDS = {
  IO: "读写外部系统（网络、文件、数据库）",
  Fallible: "可能失败（校验失败、解析失败、网络错误）",
  Mutable: "修改参数或外部可变状态",
  Async: "返回 Promise/AsyncIterable，调用方需要 await",
  Impure: "依赖隐式环境（时间、随机数、全局变量）",
} as const;

export type Capability = keyof typeof CAPABILITY_WORDS;

export const ALL_CAPABILITIES = Object.keys(CAPABILITY_WORDS) as Capability[];
export const VALID_CAPABILITY_NAMES = new Set(ALL_CAPABILITIES);

/**
 * 能力的消除性分类
 *   wrappable: 可在函数内部消化，不传播到调用方
 *   rewritable: 需要重写原函数才能消除
 *   isolate-only: 业务固有需求，只能缩小携带面积
 */
export const ELIMINABILITY: Record<Capability, "wrappable" | "rewritable" | "isolate-only"> = {
  Fallible: "wrappable",
  Async: "wrappable",
  Mutable: "rewritable",
  Impure: "rewritable",
  IO: "isolate-only",
};
