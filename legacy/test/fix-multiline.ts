// 测试多行 JSDoc 注释场景

/** @capability IO Async */
function fetchData_IO_Async(url: string): Promise<string> {
  return Promise.resolve("data");
}

/** @capability Mutable */
function mutateState_Mutable(state: { count: number }): void {
  state.count++;
}

// ── Case A: 多行 JSDoc，capability 单独一行 ──

/**
 * 处理数据
 * @capability Fallible
 */
function processA(url: string): void {
  fetchData_IO_Async(url);
}

// ── Case B: 多行 JSDoc，capability 和其他 tag 共存 ──

/**
 * @param url 地址
 * @capability IO
 * @returns void
 */
function processB(url: string): void {
  mutateState_Mutable({ count: 0 });
}

// ── Case C: 多行 JSDoc，空 capability ──

/**
 * 纯函数
 * @capability
 */
function processC(url: string): void {
  fetchData_IO_Async(url);
}

// ── Case D: 能力顺序混乱 Async IO → 应该排序成 IO Async ──

/** @capability Async IO Fallible */
function processD(url: string): void {
  mutateState_Mutable({ count: 0 });
}
