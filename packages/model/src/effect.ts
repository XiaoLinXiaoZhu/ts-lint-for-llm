export type Effect =
  | "io"
  | "nondeterministic"
  | "may-return-none"
  | "async"
  | "mutates-input";

export type Guarantee =
  | "pure"
  | "total"
  | "readonly"
  | "sync"
  | "deterministic"
  | "local"
  | "minimal";

export const GUARANTEE_FORBIDS: Record<Guarantee, Effect[]> = {
  pure: ["io", "nondeterministic", "may-return-none", "async", "mutates-input"],
  total: ["may-return-none"],
  readonly: ["mutates-input"],
  sync: ["async"],
  deterministic: ["nondeterministic"],
  local: ["io"],
  minimal: [],
};

export const EFFECT_DESCRIPTIONS: Record<Effect, string> = {
  io: "访问文件、网络、数据库、进程或其他外部系统",
  nondeterministic: "依赖时间、随机数、全局状态或其他隐式环境",
  "may-return-none": "返回值可能为 null、undefined 或无结果",
  async: "返回 Promise、AsyncIterable 或其他异步结果",
  "mutates-input": "可能修改调用方传入的可变引用参数",
};
