// 测试 Async 自动检测

/** @capability IO */
async function fetchUser(id: string): Promise<{ name: string }> {
  return { name: "Alice" };
}

// ── Case 1: async 关键字但漏标 Async（JSDoc）→ 应报错 + fix ──

/** @capability IO */
async function getData(url: string): Promise<string> {
  return "data";
}

// ── Case 2: Promise 返回类型但漏标 Async（JSDoc）→ 应报错 + fix ──

/** @capability IO */
function getDataPromise(url: string): Promise<string> {
  return Promise.resolve("data");
}

// ── Case 3: async + 已标 Async → 不报错 ──

/** @capability IO Async */
async function getDataCorrect(url: string): Promise<string> {
  return "data";
}

// ── Case 4: 后缀命名 async 但没有 Async 后缀 → 报错但不 fix ──

async function handler_IO(url: string): Promise<string> {
  return "data";
}

// ── Case 5: 未声明的 async → 不额外报 asyncMismatch（已经是全能力） ──

async function unAnnotatedAsync(): Promise<void> {
  await fetchUser("1");
}

// ── Case 6: caller 调用 Case 1 的函数 → 传播链应看到真实 Async ──

/** @capability IO */
function callerOfGetData(): void {
  getData("http://example.com");
}

// ── Case 7: async 箭头函数漏标 ──

/** @capability IO */
const asyncArrow = async (url: string): Promise<string> => {
  return "data";
};
