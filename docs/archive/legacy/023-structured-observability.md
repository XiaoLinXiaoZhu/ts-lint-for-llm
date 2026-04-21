# 全面结构化可观测性 (Comprehensive Structured Observability)

## 是什么

对应用程序中的每一个有意义的操作都记录结构化数据（而非字符串），包括：
- **结构化日志**：JSON 格式，带固定字段（requestId, userId, duration, status）
- **分布式追踪**：每个请求穿过的所有服务和函数调用形成一条完整的调用链（trace），每个步骤有 spanId
- **指标 (Metrics)**：计数器、直方图、仪表盘——quantile 延迟、错误率、吞吐量

"全面"意味着不仅仅在 HTTP 入口和出口打日志，而是在每个关键业务操作、数据库查询、缓存访问、外部调用处都有追踪。

## 历史相关渊源

结构化日志的概念在 2010 年代初随着 ELK Stack (Elasticsearch + Logstash + Kibana) 的普及而兴起。

Google 的 Dapper 论文 (2010) 奠定了分布式追踪的理论基础。Twitter 的 Zipkin (2012) 和 Uber 的 Jaeger (2017) 将其开源化。OpenTelemetry (2019, 合并 OpenTracing 和 OpenCensus) 试图统一标准。

"可观测性"（Observability）一词由 Charity Majors 在 2016–2018 年间从控制理论引入软件领域并推广。

但即使到 2024 年，多数项目的可观测性仍然停留在"入口日志 + 错误日志"的水平——真正做到全链路追踪的团队是少数。

## TypeScript 代码举例

```typescript
// ---- 不可观测的代码（常见现状）----

async function processOrder(order: Order): Promise<void> {
  const user = await db.users.findById(order.userId);
  const inventory = await checkInventory(order.items);
  if (!inventory.available) throw new Error("Out of stock");
  const payment = await chargePayment(user, order.total);
  await db.orders.update(order.id, { status: "paid", paymentId: payment.id });
  await sendConfirmationEmail(user.email, order);
}
// 如果这个函数变慢了，你不知道是 DB 查询慢、库存检查慢还是支付慢

// ---- 全面可观测的代码 ----

async function processOrder(order: Order, ctx: SpanContext): Promise<void> {
  const span: Span = tracer.startSpan("processOrder", { parent: ctx });
  span.setAttributes({ orderId: order.id, userId: order.userId, itemCount: order.items.length });

  try {
    const user: User = await tracer.withSpan("db.users.findById", span, async (s: Span): Promise<User> => {
      s.setAttribute("db.table", "users");
      const result: User = await db.users.findById(order.userId);
      s.setAttribute("db.hit", result !== null);
      return result;
    });

    const inventory: InventoryResult = await tracer.withSpan("checkInventory", span, async (s: Span): Promise<InventoryResult> => {
      s.setAttribute("item_count", order.items.length);
      const result: InventoryResult = await checkInventory(order.items);
      s.setAttribute("available", result.available);
      return result;
    });

    if (!inventory.available) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: "out_of_stock" });
      throw new Error("Out of stock");
    }

    const payment: PaymentResult = await tracer.withSpan("chargePayment", span, async (s: Span): Promise<PaymentResult> => {
      s.setAttributes({ amount: order.total, currency: order.currency });
      return chargePayment(user, order.total);
    });

    await tracer.withSpan("db.orders.update", span, async (s: Span): Promise<void> => {
      s.setAttributes({ "db.table": "orders", paymentId: payment.id });
      await db.orders.update(order.id, { status: "paid", paymentId: payment.id });
    });

    await tracer.withSpan("sendConfirmationEmail", span, async (s: Span): Promise<void> => {
      s.setAttribute("recipient", user.email);
      await sendConfirmationEmail(user.email, order);
    });

    span.setStatus({ code: SpanStatusCode.OK });
  } catch (error: unknown) {
    span.recordException(error as Error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally {
    span.end();
  }
}
```

## 为什么被抛弃

1. **代码膨胀严重**：可观测性代码经常比业务逻辑还多（对比上面两版代码），信噪比极低
2. **性能开销**：每个 span 创建和上报都有成本，高吞吐场景下可观测性本身成为瓶颈
3. **维护负担**：业务逻辑改了，追踪代码也要同步改——又是双重维护问题
4. **信息过载**：全面追踪产生海量数据，大部分在排障时用不上，但存储成本很高
5. **仅部分团队需要**：小型项目用 console.log + 错误追踪服务（Sentry）就够了

## 是否应该在 LLM 时代重新启用

**应该——LLM 可以自动化可观测性代码的生成和维护。** 理由：

- "代码膨胀"是被抛弃的首要原因。LLM 可以自动为每个函数生成追踪包装代码，人类只需审查业务逻辑。
- 更好的方案：LLM 可以生成 AOP (面向切面) 风格的自动追踪装饰器，业务代码保持干净，追踪逻辑在编译时/运行时自动注入。
- 可观测性数据反过来对 LLM 调试也极其有价值：当 LLM 生成的代码在生产中出问题时，完整的调用链追踪让 LLM 能精准定位根因，而不是靠猜。
- "信息过载"问题：LLM 可以分析追踪数据，自动发现异常模式并生成摘要，而不需要人工查看原始 span。

建议：用装饰器/中间件自动注入追踪（而非在每个函数内手写），LLM 负责生成和维护这些装饰器。对关键路径手动添加业务语义的 attribute。

## 我的看法

这并没有解决编写代码本身的问题。

## AI 回复

同意。可观测性代码（追踪 span、结构化日志）是运行时基础设施问题，不是"代码应该怎么写"的问题。

不过你在 001 中提到的"在函数名中标记副作用"（`readFile_IO_BLOCKING`）和可观测性有间接关联——如果函数名就告诉你它有 IO 副作用，追踪工具可以自动对所有 `_IO` 后缀的函数注入 span，而不需要手动标注。这是一个有趣的交叉点，但主战场仍然在命名规范那边。
