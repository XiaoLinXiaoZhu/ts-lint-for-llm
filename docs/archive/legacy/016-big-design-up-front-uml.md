# 详尽的 UML 前期设计 (Big Design Up Front with UML)

## 是什么

在写代码之前，用 UML（统一建模语言）画出系统的完整设计：类图描述所有实体及关系、序列图描述交互流程、状态图描述生命周期、组件图描述部署架构。设计文档经过评审通过后，开发者"按图施工"。

## 历史相关渊源

UML 由 Grady Booch、James Rumbaugh、Ivar Jacobson（"三位好友"）在 1994–1997 年间统一了各自的面向对象建模方法而成。1997 年被 OMG 采纳为标准。

1990 年代是瀑布模型的全盛期。CMM (Capability Maturity Model, 1993) 要求组织有正式的设计阶段，UML 成了满足 CMM 要求的标准工具。Rational Rose（1996）是最流行的 UML 工具。

2001 年敏捷宣言发布后，BDUF 被视为敏捷的对立面。"可工作的软件胜过详尽的文档"直接针对的就是 BDUF 实践。

## TypeScript 代码举例

```typescript
// 以下展示 UML 类图 → TypeScript 代码的对应关系

// ┌─────────────────────────────┐
// │        «interface»          │
// │       PaymentGateway        │
// ├─────────────────────────────┤
// │ + charge(amount, card): Res │
// │ + refund(txId): Res         │
// └──────────┬──────────────────┘
//            △
//   ┌────────┴────────┐
//   │                 │
// ┌─┴───────┐   ┌────┴──────┐
// │ Stripe  │   │  PayPal   │
// │ Gateway │   │  Gateway  │
// └────┬────┘   └─────┬─────┘
//      │              │
//      ▼              ▼
// ┌──────────────────────┐
// │    OrderService       │
// ├──────────────────────┤
// │ - gateway: Payment.. │
// │ - repo: OrderRepo    │
// ├──────────────────────┤
// │ + placeOrder(...)    │
// │ + cancelOrder(...)   │
// └──────────────────────┘

// 从 UML 类图直接翻译：

interface PaymentResult {
  success: boolean;
  transactionId: string;
  error?: string;
}

interface PaymentGateway {
  charge(amount: number, card: CardInfo): Promise<PaymentResult>;
  refund(transactionId: string): Promise<PaymentResult>;
}

class StripeGateway implements PaymentGateway {
  async charge(amount: number, card: CardInfo): Promise<PaymentResult> {
    // 实现 Stripe API 调用
    return { success: true, transactionId: `stripe_${Date.now()}` };
  }
  async refund(transactionId: string): Promise<PaymentResult> {
    return { success: true, transactionId };
  }
}

class PayPalGateway implements PaymentGateway {
  async charge(amount: number, card: CardInfo): Promise<PaymentResult> {
    return { success: true, transactionId: `paypal_${Date.now()}` };
  }
  async refund(transactionId: string): Promise<PaymentResult> {
    return { success: true, transactionId };
  }
}

class OrderService {
  constructor(
    private gateway: PaymentGateway,
    private repo: OrderRepository
  ) {}

  async placeOrder(items: OrderItem[], card: CardInfo): Promise<Order> {
    const total: number = items.reduce(
      (sum: number, item: OrderItem): number => sum + item.price * item.quantity, 0
    );
    const payment: PaymentResult = await this.gateway.charge(total, card);
    if (!payment.success) throw new Error(payment.error ?? "Payment failed");

    const order: Order = {
      id: crypto.randomUUID(),
      items,
      total,
      transactionId: payment.transactionId,
      status: "paid",
    };
    await this.repo.save(order);
    return order;
  }
}
```

## 为什么被抛弃

1. **设计与现实脱节**：实现过程中总会发现设计没考虑到的问题，但修改 UML 的成本很高，导致设计和代码分道扬镳
2. **假精确**：UML 图看起来很精确，但实际上隐藏了大量实现细节（错误处理、并发、性能），给人虚假的确定感
3. **瀑布前提不成立**：BDUF 假设需求在开始时是清晰且稳定的——现实中需求持续变化
4. **UML 学习成本**：13 种图表类型，每种都有复杂的语法规则，多数开发者只学了皮毛
5. **图不如代码精确**：UML 类图能表达的信息，TypeScript 接口定义也能表达，而且是可执行的

## 是否应该在 LLM 时代重新启用

**前期设计的精神应该复兴，但媒介从 UML 图变为结构化文本。** 理由：

- LLM 时代的代码生成速度极快，但"生成错误的东西"的速度也极快。某种程度的前期设计可以防止 LLM 在错误方向上高速狂奔。
- LLM 擅长处理文本，不擅长处理图形。用 TypeScript 接口定义 + 自然语言描述来做前期设计，比 UML 图更适合 LLM 消费。
- LLM 可以从设计描述直接生成代码，然后从代码反向更新设计描述——打破了"设计与代码不同步"的困境。
- 真正需要的不是完整 BDUF，而是"刚好够的前期设计"(Just Enough Design Up Front)：定义核心接口和数据模型，留实现细节给编码阶段。

建议：在开始编码前，先用 TypeScript 接口定义核心类型和函数签名（不写实现），附带简短的设计理由注释。这既是前期设计文档，又是 LLM 的生成规格。

## 我的看法

不好用。

## AI 回复

接受"不好用"的判断。这篇有两个问题：一是它是开发流程而非代码写法；二是即使作为流程建议，"先写 TS 接口再填实现"也只是常识而非需要专门讨论的实践。

如果要在你的框架下重新审视这个方向，更有价值的问题是：**TypeScript 接口定义本身应该包含多少信息？** 比如是否应该用 branded types 标记语义（`UserId` vs `string`）、是否应该用 JSDoc 标记副作用、是否应该用可辨识联合消除幽灵状态——这些才是"代码写法"问题。而这些你已经在 004/006/007 中讨论过了。