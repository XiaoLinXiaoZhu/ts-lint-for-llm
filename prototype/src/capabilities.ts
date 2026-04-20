/**
 * 能力词汇表
 * 用完整英文单词，而非单字母
 */
export const CAPABILITY_WORDS = {
  Async: "异步函数，包含 await",
  Blocking: "可能阻塞当前线程",
  Fallible: "可能返回错误 / 抛出异常",
  IO: "执行 I/O 操作（网络、文件、数据库）",
  Mutable: "修改参数中的可变状态",
  Impure: "有副作用（全局变量、环境变量、随机数等）",
  ThreadLocal: "依赖线程局部状态",
  Unsafe: "包含不安全操作",
} as const;

export type Capability = keyof typeof CAPABILITY_WORDS;

export const ALL_CAPABILITIES = new Set(Object.keys(CAPABILITY_WORDS)) as Set<Capability>;

/** 权限 ≤ 这个集合的函数是"好函数"（方便测试） */
export const GOOD_FUNCTION_CEILING = new Set<Capability>([
  "Async",
  "Blocking",
  "Fallible",
  "Mutable",
]);
