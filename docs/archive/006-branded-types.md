# 类型收窄与 Branded Types

## 是什么

为语义不同但底层类型相同的值创建不可互换的类型标签。`UserId` 和 `OrderId` 底层都是 `string`，但在类型层面互不兼容——传错了编译器立刻报错。配合工厂函数（parse 函数），在创建时完成校验，之后类型本身就携带"已校验"的语义。

## 历史渊源

Haskell 的 `newtype`（1990s）是零成本的类型包装器。Ada 的 `type Meters is new Float;`（1983）更早。Rust 的 newtype pattern（`struct UserId(String)`）同理。

TypeScript 没有语言层面的 nominal typing，但社区在 2017 年前后发展出了 branded types 模式（用 `unique symbol` 做标签），以及 zod/io-ts 等运行时校验库来桥接运行时和编译期。

## 对人为什么太繁琐

- 每个语义类型都要声明 brand symbol + 类型别名 + 工厂函数——三件套样板代码
- 创建值时必须走工厂函数，不能直接写字面量
- 和第三方库交互时要在边界处转换——第三方返回的是 `string`，你需要 `UserId`
- "反正 TypeScript 的类型只在编译期存在，string 就是 string"的心态

## LLM 为什么不怕

- LLM 可以批量生成 brand 声明 + 工厂函数的样板代码
- LLM 在边界处自动插入 parse 调用——从第三方 API 拿到 `string` 后立刻转成 `UserId`
- branded type 让 LLM 在生成代码时不可能犯"把 OrderId 传给需要 UserId 的函数"这种错误
- 重构时 LLM 可以通过编译器错误自动找到所有需要更新的位置

## TypeScript 代码举例

```typescript
// ---- 基础 branded type 模式 ----

declare const userIdBrand: unique symbol;
type UserId = string & { readonly [userIdBrand]: true };

declare const orderIdBrand: unique symbol;
type OrderId = string & { readonly [orderIdBrand]: true };

// 工厂函数（parse, don't validate）
function parseUserId(raw: string): Result<UserId, { kind: "invalid_user_id"; raw: string }> {
  if (!raw.startsWith("usr_") || raw.length !== 20) {
    return { ok: false, error: { kind: "invalid_user_id", raw } };
  }
  return { ok: true, value: raw as UserId };
}

function parseOrderId(raw: string): Result<OrderId, { kind: "invalid_order_id"; raw: string }> {
  if (!raw.startsWith("ord_") || raw.length !== 20) {
    return { ok: false, error: { kind: "invalid_order_id", raw } };
  }
  return { ok: true, value: raw as OrderId };
}

// 编译器保护
function getOrder(orderId: OrderId): Promise<Order> { /* ... */ }

const userId: UserId = parseUserId("usr_abc123def456ghi7").value!;
// getOrder(userId);  // ❌ 编译错误：UserId 不能赋给 OrderId

// ---- 带约束的数值 branded type ----

declare const positiveBrand: unique symbol;
type PositiveNumber = number & { readonly [positiveBrand]: true };

declare const percentBrand: unique symbol;
type Percentage = number & { readonly [percentBrand]: true };

function parsePositive(n: number): Result<PositiveNumber, { kind: "not_positive" }> {
  if (n <= 0) return { ok: false, error: { kind: "not_positive" } };
  return { ok: true, value: n as PositiveNumber };
}

function parsePercentage(n: number): Result<Percentage, { kind: "not_percentage" }> {
  if (n < 0 || n > 100) return { ok: false, error: { kind: "not_percentage" } };
  return { ok: true, value: n as Percentage };
}

// 函数签名精确表达约束
function applyDiscount(price: PositiveNumber, discount: Percentage): PositiveNumber {
  return (price * (1 - discount / 100)) as PositiveNumber;
}

// ---- 用 zod 简化工厂 ----

import { z } from "zod";

const EmailAddress = z
  .string()
  .email()
  .transform((s) => s.toLowerCase())
  .brand<"EmailAddress">();

type EmailAddress = z.infer<typeof EmailAddress>;

const StrongPassword = z
  .string()
  .min(8)
  .regex(/[A-Z]/, "需要大写字母")
  .regex(/[0-9]/, "需要数字")
  .brand<"StrongPassword">();

type StrongPassword = z.infer<typeof StrongPassword>;

// 使用：在系统边界处 parse
function handleRegistration(body: unknown) {
  const email = EmailAddress.parse(body.email);       // 成功则为 EmailAddress 类型
  const password = StrongPassword.parse(body.password); // 成功则为 StrongPassword 类型
  // 下游函数只接收 branded types → 不可能传入未校验的值
  return createUser(email, password);
}

// ---- 组合：branded types + 数据流阶段 ----

// 未校验的外部输入
interface RawApiKey { raw: string }

// 校验后
declare const validApiKeyBrand: unique symbol;
type ValidApiKey = string & { readonly [validApiKeyBrand]: true };

// 已鉴权
declare const authenticatedBrand: unique symbol;
type AuthenticatedApiKey = ValidApiKey & { readonly [authenticatedBrand]: true };

// 逐步收窄
function validateApiKey(raw: RawApiKey): Result<ValidApiKey, InvalidKeyError> { /* ... */ }
async function authenticateApiKey(key: ValidApiKey): Promise<Result<AuthenticatedApiKey, AuthError>> { /* ... */ }

// 需要鉴权的函数只接受 AuthenticatedApiKey
async function fetchSecretData(key: AuthenticatedApiKey): Promise<SecretData> { /* ... */ }
```

## 我的看法

正确

## AI 回复

确认方向正确。Branded types 是这一轮多篇文档的底层基础设施——002 的副作用标记可以用 branded return types 实现，003 的 Result 类型可以和 branded error types 组合，004 的数据流阶段本质上就是一系列逐步收窄的 branded types，009 的语义命名在有 branded types 的情况下变成了锦上添花而非必须。

如果要在这 10 篇中选一篇作为整套体系的"地基"，就是这篇。

## AI 回复2

**状态：归档。作为底层基础设施已确认，具体应用散布在其他篇目中。**

如 AI 回复1 所说，这篇是整套体系的"地基"。但它本身作为概念已经完备，不需要继续发散。

后续如果有实现工作（比如在 prototype 中引入 branded types 做阶段标记），那是工程任务，不是概念探索。归档。

## 我的看法2

我没有看懂你的回复是什么意思。