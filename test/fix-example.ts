// 测试用例：验证 --fix 自动传播能力

// ── callee 声明 ──

/** @capability IO Async */
function fetchData_IO_Async(url: string): Promise<string> {
  return Promise.resolve("data");
}

/** @capability Fallible */
function parseJSON_Fallible(raw: string): object {
  return JSON.parse(raw);
}

/** @capability Mutable */
function mutateState_Mutable(state: { count: number }): void {
  state.count++;
}

// ── Case 1: JSDoc caller 缺少 IO Async，应该被 fix 补全 ──

/** @capability Fallible */
function processData(url: string): void {
  const raw = fetchData_IO_Async(url);
  parseJSON_Fallible("{}");
}

// ── Case 2: JSDoc 空标注的纯函数调用 Mutable 函数，应该被 fix ──

/** @capability */
function pureCaller(): void {
  mutateState_Mutable({ count: 0 });
}

// ── Case 3: 后缀命名 caller 缺少能力，不做 fix ──

function handler_Fallible(url: string): void {
  fetchData_IO_Async(url);
}

// ── Case 4: 未声明函数，不做 fix ──

function unAnnotated(url: string): void {
  fetchData_IO_Async(url);
}

// ── Case 5: 缺少 Fallible（wrappable），不做 fix ──

/** @capability IO */
function ioCaller(): void {
  parseJSON_Fallible("{}");
}
