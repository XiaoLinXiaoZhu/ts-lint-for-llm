# 代码复杂度强制门禁 (Cyclomatic Complexity Gates)

## 是什么

在 CI/CD 管道中强制检查每个函数的圈复杂度（Cyclomatic Complexity），超过阈值（通常 10 或 15）则构建失败，不允许合入。圈复杂度衡量的是函数中独立执行路径的数量——每个 if/else/switch/loop 都增加一个分支。

## 历史相关渊源

圈复杂度由 Thomas J. McCabe 于 1976 年提出，但真正被工具化执行是在 1980 年代中后期。美国国防部和航空航天领域的 Ada 项目率先将复杂度门禁纳入编码标准（如 DO-178B 航空软件安全标准）。

1980 年代末，许多商业 CASE 工具（如 Logiscope、McCabe IQ）开始提供自动化的复杂度度量。这在军工、金融等受监管行业一度是强制要求。

2000 年代后，ESLint 的 `complexity` 规则让 JavaScript 社区也能做类似的事，但大多数团队将其设为 warning 而非 error，实际上形同虚设。

## TypeScript 代码举例

```typescript
// ❌ 圈复杂度 = 12，超过阈值。门禁拒绝合入。
function processOrder(order: Order): Result {
  if (!order.items.length) return { status: "empty" };
  if (order.total < 0) return { status: "invalid" };
  if (order.customer.isBlocked) return { status: "blocked" };

  let discount: number = 0;
  if (order.coupon) {
    if (order.coupon.type === "percent") {
      discount = order.total * order.coupon.value / 100;
    } else if (order.coupon.type === "fixed") {
      discount = order.coupon.value;
    } else if (order.coupon.type === "bogo") {
      discount = order.items.reduce(
        (min: number, item: OrderItem): number => Math.min(min, item.price), Infinity
      );
    }
    if (order.coupon.minPurchase && order.total < order.coupon.minPurchase) {
      discount = 0;
    }
  }

  const finalTotal: number = order.total - discount;
  if (finalTotal > order.customer.creditLimit) return { status: "over_limit" };
  if (order.shipping === "express" && !order.customer.isPremium) {
    return { status: "express_not_available" };
  }
  return { status: "ok", total: finalTotal };
}

// ✅ 重构后：拆分为多个低复杂度函数
function validateOrder(order: Order): string | null {
  if (!order.items.length) return "empty";
  if (order.total < 0) return "invalid";
  if (order.customer.isBlocked) return "blocked";
  return null;
}

function calculateDiscount(order: Order): number {
  if (!order.coupon) return 0;
  if (order.coupon.minPurchase && order.total < order.coupon.minPurchase) return 0;

  const calculators: Record<CouponType, (order: Order) => number> = {
    percent: (o: Order): number => o.total * o.coupon!.value / 100,
    fixed: (o: Order): number => o.coupon!.value,
    bogo: (o: Order): number =>
      o.items.reduce((min: number, item: OrderItem): number => Math.min(min, item.price), Infinity),
  };
  return calculators[order.coupon.type](order);
}

function processOrder(order: Order): Result {
  const validationError: string | null = validateOrder(order);
  if (validationError) return { status: validationError };

  const finalTotal: number = order.total - calculateDiscount(order);
  if (finalTotal > order.customer.creditLimit) return { status: "over_limit" };
  if (order.shipping === "express" && !order.customer.isPremium) return { status: "express_not_available" };
  return { status: "ok", total: finalTotal };
}
```

## 为什么被抛弃

1. **数字游戏**：开发者为了过门禁而机械拆分函数，拆出来的函数只被调用一次，反而降低可读性
2. **阈值争论**：10 太严？15 太松？团队在数字上争论不休，消耗政治资本
3. **不衡量真正的复杂性**：嵌套深度、认知复杂度、数据流复杂度等同样重要，单一度量不够
4. **工具误报**：简单的 switch-case（处理枚举的每个分支）会被标记为高复杂度，但实际上很清晰
5. **敏捷运动反仪式**：2000 年代敏捷社区倾向于"信任开发者的判断"，反对硬性的度量门禁

## 是否应该在 LLM 时代重新启用

**应该，但应升级为认知复杂度 (Cognitive Complexity) 门禁。** 理由：

- LLM 生成的代码有明显倾向：把所有逻辑塞进一个函数。缺少门禁时，代码审查者可能因为"反正能跑"而放过。
- LLM 自己在处理高复杂度函数时也会出错——上下文窗口中的分支越多，LLM 越容易遗漏边界条件。保持低复杂度对 LLM 的后续维护也有利。
- 过去"机械拆分"的问题可以由 LLM 来做得更合理——LLM 能理解语义并提取有意义的子函数，而非机械切割。
- Sonar 的 Cognitive Complexity（2017 年提出）比 McCabe 的圈复杂度更符合直觉，避免了 switch-case 误报问题。

建议：在 CI 中用 ESLint 的 `sonarjs/cognitive-complexity` 规则设置门禁（阈值 15），结合 LLM 辅助重构。

## 我的看法

感觉没有必要，有的时候圈复杂度就是会比较高。只能说作为一个参考。

## AI 回复

接受你的判断。圈复杂度门禁确实更像一个"开发流程规则"而非"代码写法"。有些逻辑本身就复杂（比如编译器的 parser、复杂的业务规则引擎），硬压复杂度数字只会导致机械拆分。

而且回到你的核心命题——这不改变代码长什么样。一个函数圈复杂度是 8 还是 15，对 LLM 的读写能力没有质的区别。真正改变 LLM 读写质量的是类型精度、命名信息量、状态的可辨识性——这些才是"代码写法"层面的东西。