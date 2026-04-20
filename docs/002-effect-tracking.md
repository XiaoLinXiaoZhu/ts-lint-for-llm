# 副作用追踪与标记

## 是什么

在函数签名或命名中显式标记该函数会产生哪些副作用：IO 操作、阻塞调用、抛出异常、修改外部状态等。让调用者在不阅读实现的情况下就能判断一个函数的行为特征。

## 历史渊源

Haskell 的 IO Monad（1990s）是最极端的形式——副作用必须在类型中声明，纯函数和有副作用的函数在类型层面完全隔离。Java 的 checked exceptions（1996）试图在签名中声明异常，但因为过于繁琐被社区抛弃。C++ 的 `noexcept`（2011）、Rust 的 `unsafe` 标记都是部分方案。

在动态语言和 TypeScript 中，副作用完全不可见——一个函数签名 `(x: string) => number` 不告诉你它是否读了文件、发了网络请求、修改了全局变量。

## 对人为什么太繁琐

- 每个函数都要思考"它有什么副作用"并手动标记，这是额外的认知负担
- 重构时副作用可能变化（原来是纯计算，加了一行日志就变成了 IO），标记维护成本高
- 标记体系没有语言层面的强制——全靠自觉，一处遗漏就破坏信任
- Java checked exceptions 的前车之鉴让社区对"声明副作用"心有余悸

## LLM 为什么不怕

- LLM 可以通过静态分析自动判断一个函数是否有 IO、是否阻塞、是否抛出异常，然后自动标记
- LLM 在重构后可以自动更新标记——副作用变了，标记跟着变
- LLM 在调用时可以利用标记做正确判断："这个函数标记了 _BLOCKING，不应该在事件循环中直接调用"

## TypeScript 代码举例

```typescript
// ---- 方案 A：在函数名中编码副作用后缀 ----

// 纯函数：无后缀
function calculateTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

// IO + 异步
async function fetchUser_IO(userId: UserId): Promise<User> {
  return await db.users.findById(userId);
}

// IO + 阻塞（同步 IO）
function readConfig_IO_BLOCKING(path: string): Config {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

// 修改外部状态
function incrementCounter_MUTATES(counter: Counter): void {
  counter.value++;
}

// 可能抛出异常（非 Result 返回）
function parseJSON_THROWS(raw: string): unknown {
  return JSON.parse(raw); // 无效 JSON 时抛出 SyntaxError
}

// ---- 方案 B：用类型系统编码副作用 ----

// 标记类型
declare const _IO: unique symbol;
declare const _PURE: unique symbol;

type IO<T> = T & { readonly [_IO]: true };
type Pure<T> = T & { readonly [_PURE]: true };

// 在返回类型中标记
function calculateTotal(items: CartItem[]): Pure<number> {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0) as Pure<number>;
}

async function fetchUser(userId: UserId): Promise<IO<User>> {
  const user = await db.users.findById(userId);
  return user as IO<User>;
}

// 高阶函数可以约束"只接受纯函数"
function memoize<A extends unknown[], R>(fn: (...args: A) => Pure<R>): (...args: A) => Pure<R> {
  const cache = new Map<string, Pure<R>>();
  return (...args: A): Pure<R> => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key)!;
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

// ---- 方案 C：用 JSDoc 标签 ----

/**
 * @pure
 */
function calculateTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

/**
 * @effect IO
 * @effect ASYNC
 */
async function fetchUser(userId: UserId): Promise<User> {
  return await db.users.findById(userId);
}

/**
 * @effect IO
 * @effect BLOCKING
 * @throws {SyntaxError} 配置文件格式错误时
 */
function readConfig(path: string): Config {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}
```

## 我的看法

赞同。这里还有一个延伸的想法：副作用隔离

### 能力字母表

| 字母 | 名称 | 含义 | 反面含义 |
|------|------|------|---------|
| `A` | **Async** | 异步函数，包含 `await` | 同步 |
| `B` | **Blocking** | 可能阻塞当前线程（等待 I/O、锁、sleep、大量计算） | 非阻塞 |
| `E` | **Fallible** | 可能返回错误 / 抛出异常 | 不会失败 |
| `I` | **IO** | 执行 I/O 操作（网络、文件、数据库） | 纯计算 |
| `M` | **Mutable** | 修改参数中的可变状态 | 只读 |
| `P` | **imPure** | 有副作用（修改/读取全局变量、环境变量、随机数等等） | 纯函数 |
| `T` | **ThreadLocal** | 依赖线程局部状态，不可跨线程共享 | 线程安全 / 无状态 |
| `U` | **Unsafe** | 包含不安全操作（裸指针、FFI、transmute） | 安全代码 |

其中，权限小于等于 ABEM 的函数为好函数，因为它们方便单元测试。如果一个函数需要 ABEM 以外的权限，那么它不是好函数。

**唯一规则：有字母的函数可以调用没有该字母的函数；没有该字母的函数不可调用有该字母的函数。**

我在想是不是可以用一些方法对该模式进行强制规范化。

这里我想要让它类似 ts 对于 js 一样，通过标注声明函数类型，然后通过d.ts 能够对于外部包补充定义，并且最终可以通过类型校验检查是否有反模式，以及通过审查和重构降低坏函数的比例。

## AI 回复

能力字母表是这一轮最重要的产出之一。我原文只是模糊地提了 `_IO` / `_BLOCKING` 后缀，你把它体系化成了一张完整的字母表，而且给出了关键的判定规则：

1. **权限传播规则**：有字母的函数可以调用没有该字母的函数，反过来不行。这就是 Haskell IO Monad 的核心约束，但用命名后缀实现——不需要语言层面的支持。
2. **好函数判定**：权限 ≤ ABEM 的是好函数（方便测试），超出的不是好函数。这给了一个具体的质量度量标准。

你提到的"能否强制规范化"的想法非常值得展开。我想到几种可行路径：

- **ESLint 自定义规则**：扫描函数名后缀声明的能力字母，检查函数体中是否调用了含有未声明字母的函数。比如 `foo_E()` 调用了 `bar_I()`，但 `foo` 没有声明 `I` → 报错。
- **TypeScript compiler plugin**：在类型层面做检查，用 branded return types 标记能力，让编译器阻止权限升级。
- **d.ts 补充定义**：你提到的对外部包补充能力声明——这非常像 `@types/node` 为 JS 库补 TS 类型，只不过这里补的是副作用标签。

这套体系如果落地，可能是本轮讨论中最具可操作性的成果。是否要开一个专项来设计具体的实现方案？