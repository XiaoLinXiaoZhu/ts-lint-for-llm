# 模块边界处的代码形态

## 是什么

在模块的公开入口处集中完成所有"从外部世界到内部世界"的转换：类型收窄、校验、格式归一化、敏感数据剥离。模块内部只处理已收窄的内部类型，不再和外部原始类型打交道。

模块边界是"信任边界"——跨过这条线之后，代码运行在确定性的保护下。

## 历史渊源

这是 Hexagonal Architecture（Alistair Cockburn, 2005）的端口/适配器思想的类型化版本——"端口"定义内部类型，"适配器"负责在边界处做外部 → 内部的转换。

DDD（Eric Evans, 2003）的 Anti-Corruption Layer 也是同样的思路：不让外部模型污染内部模型。

在实践中，多数代码库没有显式的边界层——HTTP handler 直接操作数据库实体，数据库实体直接返回给前端。所有层共享同一个类型。

## 对人为什么太繁琐

- 每个模块要定义自己的内部类型 + 边界转换函数——"同一个东西"写了好几遍
- 小模块觉得"专门写一层转换不值得"
- 外部类型变了，边界转换要跟着改——多了一个维护点
- 团队习惯于"一个 User 类型全栈共用"

## LLM 为什么不怕

- LLM 可以为每个模块自动生成边界层代码（parse 函数 + 内部类型定义）
- 外部类型变更时，LLM 只需修改边界转换，内部代码不受影响
- 边界层让 LLM 修改某个模块时的上下文更小——只需看内部类型，不需要理解外部模型的全部细节
- 清晰的边界让 LLM 更安全地做大规模重构——变更被限制在模块内

## TypeScript 代码举例

```typescript
// ---- 模块：订单服务 ----

// === 模块的公开接口（端口）===

// 入方向：外部世界传进来的
interface CreateOrderRequest {
  userId: string;
  items: Array<{ productId: string; quantity: number }>;
  couponCode?: string;
}

// 出方向：本模块返回给外部的
interface OrderConfirmation {
  orderId: string;
  status: string;
  total: number;
  estimatedDelivery: string;
}

// === 模块内部类型（外部看不到）===

interface InternalOrder {
  id: OrderId;
  userId: UserId;
  items: InternalOrderItem[];
  coupon: ValidCoupon | null;
  total: PositiveNumber;
  status: OrderStatus;
  createdAt: Date;
}

interface InternalOrderItem {
  productId: ProductId;
  product: Product;         // 已从数据库加载
  quantity: PositiveInteger;
  lineTotal: PositiveNumber;
}

type OrderStatus =
  | { kind: "pending" }
  | { kind: "paid"; paymentId: PaymentId }
  | { kind: "shipped"; trackingNumber: string }
  | { kind: "delivered"; deliveredAt: Date }
  | { kind: "cancelled"; reason: string };

// === 边界层：入方向转换 ===

async function parseCreateOrderRequest(
  raw: CreateOrderRequest
): Promise<Result<ParsedOrderInput, OrderInputError>> {
  // 把外部的 string → 内部的 branded types
  const userId = parseUserId(raw.userId);
  if (!userId.ok) return userId;

  const items: Result<ParsedOrderItem, OrderInputError>[] = await Promise.all(
    raw.items.map(async (item) => {
      const productId = parseProductId(item.productId);
      if (!productId.ok) return productId;

      const quantity = parsePositiveInteger(item.quantity);
      if (!quantity.ok) return quantity;

      const product = await productRepo.findById(productId.value);
      if (!product) return { ok: false as const, error: { kind: "product_not_found" as const, productId: item.productId } };

      return { ok: true as const, value: { productId: productId.value, product, quantity: quantity.value } };
    })
  );

  // 收集错误...
  const validItems = collectResults(items);
  if (!validItems.ok) return validItems;

  let coupon: ValidCoupon | null = null;
  if (raw.couponCode) {
    const couponResult = await validateCoupon(raw.couponCode);
    if (!couponResult.ok) return couponResult;
    coupon = couponResult.value;
  }

  return { ok: true, value: { userId: userId.value, items: validItems.value, coupon } };
}

// === 边界层：出方向转换 ===

function toOrderConfirmation(order: InternalOrder): OrderConfirmation {
  return {
    orderId: order.id,    // branded → plain string (TS 允许，branded 是 string 的子类型)
    status: order.status.kind,
    total: order.total,
    estimatedDelivery: estimateDelivery(order).toISOString(),
  };
  // 内部的 Product 详情、Coupon 详情、Status 的复杂联合 → 都不暴露
}

// === 模块核心逻辑：只处理内部类型 ===

function calculateOrderTotal(items: InternalOrderItem[], coupon: ValidCoupon | null): PositiveNumber {
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const discount = coupon ? applyCoupon(coupon, subtotal) : 0;
  return (subtotal - discount) as PositiveNumber;
}
// 这个函数看不到 "string" 或 "unknown"——它活在全是 branded types 的世界里
```

## 我的看法

这个感觉和之前的 port/adapter 思想是殊途同归的。

## AI 回复

是的，和 Hexagonal Architecture 的 port/adapter 殊途同归。区别在于表达方式：

- Port/Adapter 用架构图和分层目录结构来表达边界
- 本篇用**类型签名**来表达边界——边界函数的签名是 `(external type) → Result<internal type, Error>`，这个签名本身就是 port 的精确定义

后者更符合"代码即 SSOT"原则——不需要画架构图来说明哪里是边界，类型签名已经说了。也更适合 LLM 消费——LLM 读类型签名比读架构图容易得多。

## AI 回复2

**状态：归档。与 011 的 adapter/caps 机制殊途同归。**

模块边界的类型签名化在 011 中已经有具体实现：`.caps.ts` 声明文件 + `codegen.ts` 自动生成 adapter 层，本质上就是 007 说的"用类型签名定义边界"。外部模块的能力声明（`capabilities/node-fs.caps.ts`）就是 port 的精确定义。

不需要继续发散。如果要扩展到更多外部包（`@capabilities/express` 等），那是 011 体系下的推广工作。

## 我的看法2

这个应该保留，和7一样，需要想想如何规范化，以及让系统性问题对于llm来说可见（比如类似我们的加权评分）