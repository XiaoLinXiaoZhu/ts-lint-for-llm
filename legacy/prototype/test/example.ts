// ==============================
// 测试：能力字母表 v2
// 能力用完整英文单词，未标注 = 全能力（坏函数）
// ==============================

// ---- 已标注的函数 ----

/** @capability IO Fallible */
async function fetchUser(id: string): Promise<{ name: string }> {
  return { name: "Alice" };
}

// 命名后缀模式（首选）
async function saveUser_IO_Fallible(user: { name: string }): Promise<void> {}

async function sendEmail_IO_Async_Fallible(to: string, body: string): Promise<void> {}

// 纯函数：用 @capability 声明空集（等价于标注了"我是纯的"）
/** @capability */
function add(a: number, b: number): number {
  return a + b;
}

// ---- 合法调用 ----

// processUser 声明了 IO Fallible，可以调用 fetchUser (IO Fallible) 和 saveUser (IO Fallible)
async function processUser_IO_Fallible(id: string): Promise<void> {
  const user = await fetchUser(id);
  user.name = user.name.toUpperCase();
  await saveUser_IO_Fallible(user);
}

// 纯函数调用纯函数
/** @capability */
function double(x: number): number {
  return add(x, x);
}

// ---- 违反：能力升级 ----

// add 是纯函数（空能力集），但调用了 fetchUser (IO Fallible)
// 应报错: escalation
/** @capability */
function badPureFunction(id: string): number {
  fetchUser(id);
  return 42;
}

// ---- 违反：未声明（坏函数）----

// 无标注 → 全能力 → 报 undeclared 警告
function unAnnotatedFunction(x: number): number {
  return x + 1;
}

// 箭头函数同理
const unAnnotatedArrow = (x: number): number => x + 1;
