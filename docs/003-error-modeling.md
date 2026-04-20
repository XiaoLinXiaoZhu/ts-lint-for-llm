# 错误表示与传播方式

## 是什么

用类型系统显式建模所有错误路径——函数签名精确告诉调用者"可能出什么错"以及"错误长什么样"。不依赖 `throw` 这种在类型中不可见的控制流，而是用 Result 类型 / 可辨识联合把错误作为返回值的一部分。

## 历史渊源

Haskell 的 `Either` / Rust 的 `Result<T, E>` / Go 的 `(value, error)` 多返回值都是这一思路。Java 的 checked exceptions 试图解决同样的问题但方案太重。

TypeScript 社区在 2018 年前后出现了 `neverthrow`、`fp-ts` 的 `Either` 等库，但始终是小众实践——因为 TypeScript 原生的 `try/catch` 更符合 JavaScript 生态的惯例，而且手动包装每个可能出错的调用太繁琐。

## 对人为什么太繁琐

- 每个可能失败的函数都要包装成 `Result<T, E>` 返回，调用链上每一层都要解包
- 错误类型的定义本身就是工作量——每个函数的错误联合类型可能不同，组合时类型膨胀
- 和生态冲突：Node.js 标准库、大多数 npm 包都用 throw，要在边界处转换
- `try/catch` 配合 `unknown` 类型在实际中"够用"

## LLM 为什么不怕

- LLM 可以自动为每个函数生成错误联合类型，分析所有可能的失败路径
- LLM 可以自动在边界处把 throw 风格转换为 Result 风格（包装第三方库）
- LLM 组合多个 Result 时可以自动推导联合错误类型，不需要人手动写
- 最关键：Result 类型让错误在类型中可见——LLM 在生成调用代码时，看到返回 `Result<User, NotFoundError | AuthError>` 就知道必须处理两种错误

## TypeScript 代码举例

```typescript
// ---- 基础 Result 类型 ----

type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// ---- 错误建模为可辨识联合 ----

type UserError =
  | { kind: "not_found"; userId: string }
  | { kind: "suspended"; userId: string; until: Date }
  | { kind: "rate_limited"; retryAfterMs: number };

type PaymentError =
  | { kind: "insufficient_funds"; available: number; required: number }
  | { kind: "card_expired"; lastFour: string }
  | { kind: "gateway_timeout" };

// ---- 函数签名精确声明错误 ----

async function getUser(id: UserId): Promise<Result<User, UserError>> {
  const user = await db.users.findById(id);
  if (!user) return { ok: false, error: { kind: "not_found", userId: id } };
  if (user.suspendedUntil && user.suspendedUntil > new Date()) {
    return { ok: false, error: { kind: "suspended", userId: id, until: user.suspendedUntil } };
  }
  return { ok: true, value: user };
}

async function chargeUser(
  user: User,
  amount: number
): Promise<Result<Payment, PaymentError>> {
  if (user.balance < amount) {
    return {
      ok: false,
      error: { kind: "insufficient_funds", available: user.balance, required: amount },
    };
  }
  // ...
  return { ok: true, value: payment };
}

// ---- 组合：错误类型自动联合 ----

type OrderError = UserError | PaymentError | { kind: "empty_cart" };

async function placeOrder(
  userId: UserId,
  cart: CartItem[]
): Promise<Result<Order, OrderError>> {
  if (cart.length === 0) {
    return { ok: false, error: { kind: "empty_cart" } };
  }

  const userResult = await getUser(userId);
  if (!userResult.ok) return userResult; // UserError 自动成为 OrderError 的一部分

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const payResult = await chargeUser(userResult.value, total);
  if (!payResult.ok) return payResult; // PaymentError 同理

  return { ok: true, value: { id: newId(), items: cart, total, payment: payResult.value } };
}

// ---- 调用方：编译器强制处理所有错误分支 ----

const result = await placeOrder(userId, cart);
if (!result.ok) {
  switch (result.error.kind) {
    case "not_found":       return res.status(404).json({ message: "User not found" });
    case "suspended":       return res.status(403).json({ message: `Suspended until ${result.error.until}` });
    case "rate_limited":    return res.status(429).json({ retryAfter: result.error.retryAfterMs });
    case "insufficient_funds": return res.status(402).json({ available: result.error.available });
    case "card_expired":    return res.status(400).json({ message: "Card expired" });
    case "gateway_timeout": return res.status(502).json({ message: "Payment gateway timeout" });
    case "empty_cart":      return res.status(400).json({ message: "Cart is empty" });
  }
}
// result.value 在这里已经被 narrowed 为 Order
```

## 我的看法

正确的

## AI 回复

确认方向正确。Result + 错误可辨识联合让错误路径在类型中完全可见——配合 001 的穷尽性检查，调用方被编译器强制处理每一种错误，遗漏任何一种都报错。这和 008（状态建模）是同一个思想在不同维度的应用：008 消除数据状态的幽灵态，003 消除错误处理的遗漏态。
