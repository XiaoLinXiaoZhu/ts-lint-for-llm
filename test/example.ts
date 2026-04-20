// 测试用例：验证 ESLint 规则

/** @capability IO Fallible */
async function fetchUser(id: string): Promise<{ name: string }> {
  return { name: "Alice" };
}

/** @capability */
function add(a: number, b: number): number {
  return a + b;
}

// 合法：声明了 IO Fallible，可以调用 fetchUser
/** @capability IO Fallible */
async function processUser(id: string): Promise<void> {
  const user = await fetchUser(id);
  console.log(user.name);
}

// 违反：纯函数调用了 IO 函数
/** @capability */
function badPureFunction(id: string): number {
  fetchUser(id);
  return 42;
}

// 违反：未声明能力
function unAnnotatedFunction(x: number): number {
  return x + 1;
}
