# 命名与标识符中的语义编码

## 是什么

在标识符（变量名、函数名、类型名）中编码 IDE 和类型系统无法表达的语义属性：数据的可信度、值的来源、操作的副作用类别、值所处的生命周期阶段。

不是 `Systems Hungarian`（在名字里写数据类型，如 `strName`——这毫无意义因为类型系统已经有了），而是 `Apps Hungarian`（在名字里写语义属性，如 `unsanitizedHtml` vs `sanitizedHtml`——这是类型系统表达不了的）。

## 历史渊源

Charles Simonyi 在 1976 年于 Xerox PARC 提出匈牙利命名法，原意是标记**语义类别**：`rw` = 行索引，`col` = 列索引，混用时一眼可见。但在传播过程中被曲解为标记数据类型（`iCount`, `szName`），变成了无用的噪音，最终被社区抛弃。

Joel Spolsky 在 2005 年的博文 "Making Wrong Code Look Wrong" 中试图纠正这个误解，提倡 Apps Hungarian——用前缀区分 `us` (unsafe string) 和 `s` (safe string)。但在 IDE 时代，社区已经不愿意在名字里塞信息了。

## 对人为什么太繁琐

- 命名本身就是编程中最难的事之一，再加前缀/后缀更累
- 前缀体系需要团队共识——`unsafe` / `raw` / `untrusted` 用哪个？
- 重构时语义可能变化，名字要跟着改——一个函数从"不安全"变成"安全"，名字里的前缀也要改
- 长名字降低可读性——`unsanitizedUserInputEmailString` 谁受得了

## LLM 为什么不怕

- LLM 可以在生成代码时自动根据上下文选择正确的语义前缀
- LLM 重构时可以批量更新名字——语义变了，名字跟着变
- LLM 阅读代码时，语义化命名是极强的上下文信号——看到 `rawUserInput` 就知道不能直接拼进 SQL
- 长名字对 LLM 没有可读性负担——LLM 不是用眼睛扫描代码的

## TypeScript 代码举例

```typescript
// ---- 数据可信度前缀 ----

// raw: 完全不可信，来自外部世界
function handleRequest(rawBody: unknown): Response { /* ... */ }

// validated: 已通过格式校验
function processOrder(validatedOrder: ValidatedOrder): ProcessedOrder { /* ... */ }

// sanitized: 已做安全处理（XSS/SQL 注入防护）
function renderPage(sanitizedHtml: SanitizedHtml): string { /* ... */ }

// trusted: 来自已认证的内部来源
function executeAdminAction(trustedUserId: AuthenticatedUserId): void { /* ... */ }

// ---- 值来源标记 ----

// fromDb: 来自数据库的值（可能过期）
const fromDbUser: PersistedUser = await db.users.findById(id);

// fromCache: 来自缓存（可能过期且可能不存在）
const fromCacheUser: PersistedUser | null = cache.get(id);

// computed: 当前计算出的值（最新的）
const computedTotal: PositiveNumber = calculateTotal(items);

// ---- 副作用后缀（参考 002） ----

function readConfig_IO_BLOCKING(path: string): Config { /* ... */ }
function fetchUser_IO(id: UserId): Promise<User> { /* ... */ }
function calculateTax_PURE(amount: PositiveNumber, rate: TaxRate): PositiveNumber { /* ... */ }

// ---- 生命周期阶段 ----

// 连接对象的生命周期
function createConnection(): UninitializedConnection { /* ... */ }
function initializeConnection(conn: UninitializedConnection): OpenConnection { /* ... */ }
function closeConnection(conn: OpenConnection): ClosedConnection { /* ... */ }
// 类型名本身就是生命周期文档

// ---- 安全相关的语义区分 ----

// 未转义 vs 已转义
type UnsafeHtml = string & { readonly __unsafeHtml: true };
type SafeHtml = string & { readonly __safeHtml: true };

function escapeHtml(unsafe: UnsafeHtml): SafeHtml {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;") as SafeHtml;
}

function renderTemplate(content: SafeHtml): string {
  return `<div>${content}</div>`;
  // 只接受 SafeHtml → 编译器阻止传入未转义的内容
}

// ❌ renderTemplate(userInput as any)         → 需要 code review 才能发现
// ❌ renderTemplate(unsafeContent)             → 编译错误
// ✅ renderTemplate(escapeHtml(unsafeContent)) → 类型安全

// ---- 对照：不做语义编码时的代码 ----

// 看这个函数签名能判断 html 需不需要转义吗？
function render(html: string): string { return `<div>${html}</div>`; }
// 答案是不能。调用者必须去读实现或文档才知道。
// LLM 生成调用代码时也无从判断——可能直接传未转义的字符串进去。
```

## 我的看法

正确

## AI 回复

确认方向正确。结合 002 中你提出的能力字母表，语义命名在这套体系中有两层：

1. **函数名后缀的能力字母**（`_AEI`）：标记副作用，有强制规则（权限传播）
2. **变量/参数名的语义前缀**（`raw` / `validated` / `sanitized`）：标记数据可信度，与 branded types 互为补充

在有 branded types 的场景下，语义命名是冗余通道（010 讨论的）；在 branded types 覆盖不到的地方（比如函数名的副作用标记），语义命名是唯一通道。两者各有职责，不冲突。
