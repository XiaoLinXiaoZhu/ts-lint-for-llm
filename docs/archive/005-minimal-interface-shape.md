# 接口形态与最小暴露

## 是什么

每个函数只接收它真正需要的数据——不传整个对象，传对象中需要的那几个字段的精确子类型。返回值也一样：只暴露调用方需要的最少信息，不多给。

这意味着：不传 `User`，传 `Pick<User, "id" | "email">`；不返回整个内部对象，返回一个只包含公开字段的窄接口。

## 历史渊源

接口隔离原则（ISP，SOLID 中的 I，Robert C. Martin 1996）就是这个思想。Parnas 1972 年的信息隐藏也是。但在实践中，传整个对象比写一个窄接口省事得多，所以大部分代码都在传整个对象。

Go 语言的"接受接口，返回结构体"（accept interfaces, return structs）惯例是这个思想的实际体现——函数声明它只需要 `io.Reader`，不在乎传进来的是文件、网络连接还是内存缓冲区。

## 对人为什么太繁琐

- 为每个函数单独定义一个输入接口——函数多了接口爆炸
- `Pick<User, "id" | "email" | "role">` 写起来啰嗦，重构时还要同步更新
- "传整个 User 又不会怎样"——多传几个字段不会导致运行时错误
- 小团队觉得"反正我们都知道函数只用了哪几个字段"

## LLM 为什么不怕

- LLM 可以分析函数体，自动推导出它实际使用的最小字段集并生成精确的参数类型
- LLM 重构时可以自动更新所有窄接口
- 窄接口是 LLM 理解函数需求的最佳信号——看到参数类型 `{ email: EmailAddress; name: string }` 比看到 `User` 更清楚函数到底需要什么

## TypeScript 代码举例

```typescript
// ---- ❌ 传整个对象：函数签名说"我需要一个 User" ----

interface User {
  id: UserId;
  email: EmailAddress;
  name: string;
  passwordHash: string;
  role: "admin" | "member" | "guest";
  preferences: UserPreferences;
  createdAt: Date;
  lastLoginAt: Date;
}

// 实际只用了 email 和 name，但签名要求传整个 User
function sendWelcomeEmail(user: User): Promise<void> {
  return emailService.send({
    to: user.email,
    subject: `Welcome, ${user.name}!`,
    template: "welcome",
  });
}

// 调用方被迫持有一个完整的 User 对象，即使它只需要发个邮件
// 测试时也要构造一个完整的 User mock——大部分字段是无关噪音

// ---- ✅ 最小接口：函数签名精确描述需求 ----

interface WelcomeEmailRecipient {
  email: EmailAddress;
  name: string;
}

function sendWelcomeEmail(recipient: WelcomeEmailRecipient): Promise<void> {
  return emailService.send({
    to: recipient.email,
    subject: `Welcome, ${recipient.name}!`,
    template: "welcome",
  });
}

// User 满足 WelcomeEmailRecipient（结构类型），所以可以直接传
// 但函数不依赖 User 的其他字段 → 改了 User.passwordHash 不影响这里
// 测试只需要 { email, name } → 零噪音

// ---- 返回值同理：只暴露调用方需要的 ----

// ❌ 返回内部对象
function getOrderSummary(orderId: OrderId): Promise<Order> {
  return db.orders.findById(orderId);
  // 调用方拿到了 Order 的所有字段，包括内部实现细节
}

// ✅ 返回窄视图
interface OrderSummary {
  readonly id: string;
  readonly status: OrderStatus;
  readonly total: number;
  readonly itemCount: number;
}

function getOrderSummary(orderId: OrderId): Promise<OrderSummary> {
  const order = await db.orders.findById(orderId);
  return {
    id: order.id,
    status: order.status,
    total: order.total,
    itemCount: order.items.length,
  };
  // 调用方看不到 order.items 的具体内容、支付详情等内部数据
}

// ---- readonly 分离：同一数据的读写视图 ----

// 写入方看到的接口
interface MutableCounter {
  value: number;
  increment(): void;
  reset(): void;
}

// 只读消费方看到的接口
interface ReadonlyCounter {
  readonly value: number;
}

class Counter implements MutableCounter {
  value: number = 0;
  increment(): void { this.value++; }
  reset(): void { this.value = 0; }
}

// 只需要读的地方，只传 ReadonlyCounter
function renderCounter(counter: ReadonlyCounter): string {
  return `Count: ${counter.value}`;
  // 编译器阻止 counter.value = 0 或 counter.reset()
}
```

## 我的看法

正确

## AI 回复

确认方向正确。最小接口配合 006（branded types）和 004（数据流窄类型）形成一个完整的策略：函数参数是精确的窄切片（005），值本身携带"已校验"的 branded 语义（006），数据在管道中每一步都有独立类型（004）。三者组合的效果是：代码的每一处都只看到它需要的信息，且这些信息已经被上游担保过。

## AI 回复2

**状态：归档。原则已确认，与能力系统有隐含关联但不需要额外发散。**

最小接口是一个通用的好实践，已确认方向。在能力系统的语境下它有一层额外含义：函数接受的参数越窄，它需要的能力就越可能更少。比如一个函数如果只接受 `ValidatedInput` 而不是 `UserInput`，它就不需要做校验，不携带 E。

但这个关联是自然的，不需要专门设计机制。归档。

## 我的看法2

这个感觉可以留着再看看如何融入一个可量化的评估体系。因为我们现在做的工作暂时是基于对于函数的处理。但是暂时没有考虑如何对类型进行处理。