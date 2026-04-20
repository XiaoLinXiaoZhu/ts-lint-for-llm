// 测试 Fallible 自动检测

// ── Case 1: 返回 string | null，JSDoc 漏标 Fallible → 报错 + fix ──

/** @capability IO */
function findUser(id: string): string | null {
  return null;
}

// ── Case 2: 返回 T | undefined → 报错 + fix ──

/** @capability IO */
function getConfig(key: string): number | undefined {
  return undefined;
}

// ── Case 3: 返回 T | null | undefined → 报错 + fix ──

/** @capability IO */
function lookup(key: string): { data: string } | null | undefined {
  return null;
}

// ── Case 4: Promise<T | null> → 同时检测 Async + Fallible ──

/** @capability IO */
async function fetchOptional(url: string): Promise<string | null> {
  return null;
}

// ── Case 5: 已标 Fallible → 不报错 ──

/** @capability IO Fallible */
function findUserCorrect(id: string): string | null {
  return null;
}

// ── Case 6: 返回纯类型 string → 不报错 ──

/** @capability IO */
function getName(): string {
  return "ok";
}

// ── Case 7: 后缀命名漏标 → 报错但不 fix ──

function find_IO(id: string): string | null {
  return null;
}

// ── Case 8: 未声明函数 → 不额外报 fallibleMismatch ──

function unAnnotatedNullable(): string | null {
  return null;
}

// ── Case 9: 箭头函数返回 nullable → 报错 + fix ──

/** @capability */
const tryParse = (raw: string): object | null => {
  try { return JSON.parse(raw); } catch { return null; }
};
