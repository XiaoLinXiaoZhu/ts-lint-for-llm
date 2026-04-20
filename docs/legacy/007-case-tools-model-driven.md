# 模型驱动开发 / CASE 工具 (Model-Driven Development)

## 是什么

先用可视化模型（数据流图、实体关系图、状态机图等）描述系统的结构和行为，再由工具自动生成代码骨架。开发者在生成的骨架上填充业务逻辑。模型是"单一事实来源"，代码是模型的派生物。

## 历史相关渊源

CASE (Computer-Aided Software Engineering) 工具在 1980 年代中后期爆发。代表产品包括 Rational Rose、Excelerator、IDEF 系列工具。它们承诺"像工程师用 CAD 画图纸一样开发软件"。

1980 年代正值"软件危机"讨论的余波期。项目超支、延期、失败率居高不下，行业急切寻找"银弹"。CASE 工具被寄予厚望，市场规模在 1990 年达到峰值约 60 亿美元。

2000 年代 OMG 的 MDA (Model-Driven Architecture) 和 UML 2.0 试图复兴这一思想，但同样未能成为主流。

## TypeScript 代码举例

```typescript
// 假设从状态机模型自动生成以下代码骨架：
// 模型定义: Order 有 4 个状态，5 个转换

enum OrderState {
  Created = "CREATED",
  Paid = "PAID",
  Shipped = "SHIPPED",
  Delivered = "DELIVERED",
}

enum OrderEvent {
  Pay = "PAY",
  Ship = "SHIP",
  Deliver = "DELIVER",
  Cancel = "CANCEL",
}

// --- 以下由 CASE 工具 / 代码生成器自动生成 ---

type TransitionMap = {
  [S in OrderState]?: {
    [E in OrderEvent]?: OrderState;
  };
};

const TRANSITIONS: TransitionMap = {
  [OrderState.Created]: {
    [OrderEvent.Pay]: OrderState.Paid,
    [OrderEvent.Cancel]: undefined, // 终态，模型中标记为销毁
  },
  [OrderState.Paid]: {
    [OrderEvent.Ship]: OrderState.Shipped,
  },
  [OrderState.Shipped]: {
    [OrderEvent.Deliver]: OrderState.Delivered,
  },
};

function transition(current: OrderState, event: OrderEvent): OrderState | null {
  const nextState: OrderState | undefined = TRANSITIONS[current]?.[event];
  if (nextState === undefined) {
    return null; // 非法转换
  }
  return nextState;
}

// --- 以下由开发者手动填充 ---

function onPay(order: Order): void {
  // TODO: 调用支付网关
}

function onShip(order: Order): void {
  // TODO: 生成物流单号
}
```

## 为什么被抛弃

1. **模型与代码不同步**：实际开发中人们总是直接改代码而绕过模型，模型很快过期
2. **表达力不足**：可视化模型无法表达复杂的业务逻辑细节，开发者还是要在生成代码上大量修改
3. **工具锁定**：每个 CASE 工具有自己的格式，团队被绑定在特定供应商上
4. **往返工程失败**：理想是"改模型→重新生成代码"，但手动修改的代码在重新生成时会被覆盖
5. **敏捷运动冲击**："可工作的软件胜过详尽的文档"——直接写代码比画图快

## 是否应该在 LLM 时代重新启用

**部分应该——但形式需要彻底变化。** 理由：

- 过去 CASE 工具的核心问题是"模型和代码不同步"。LLM 让这个问题有了新解法：LLM 可以从代码反向生成模型描述，也可以从自然语言描述直接生成代码，**双向同步的成本大幅降低**。
- 但"可视化图形建模"本身不太需要复兴。LLM 更擅长处理文本化的模型（如 DSL、schema 定义、状态机表格），而非拖拽式图形。
- 真正值得复兴的是 MDD 的核心理念：**声明式规格说明 → 自动生成实现代码**。LLM 就是那个新一代的"CASE 工具"，只是输入从 UML 图变成了自然语言 + 结构化 schema。

建议：用声明式 DSL（JSON Schema, Prisma schema, XState config）定义核心模型，让 LLM 从模型生成实现代码、校验逻辑、测试用例。模型是文本格式，存在代码仓库里。

## 我的看法

使用state是对的。很多时候llm会使用大量flag来标记状态，但是这会带来可能完全不存在的状态的问题。

比如 一个简单的 是否成功，成功的话是图片还是文本模型可能会写做：
```typescript
interface Response {
  success: boolean;
  isImage: boolean;
  content: string | null;
}
```

但是失败场景下，不论是否拥有图片本质上无意义。

正确的做法是：

```typescript
interface Response = 
{
  type: "success-image"
  content: string; 
} | {
  type: "success-text";
  content: string;
} | {
  type: "error";
};
```

这样不仅仅消除了幽灵状态，还使用可辨识联合来取消了 string|null 这种不确定的类型，为下游确立了信心。

## AI 回复

你的回应把讨论从"模型驱动开发"拉回到了一个更精准的点：**用类型系统消除幽灵状态**。

你的例子非常典型——`{ success: boolean; isImage: boolean; content: string | null }` 有 2×2×2 = 8 种类型组合，但实际有意义的只有 3 种。其余 5 种是幽灵状态，每个下游消费者都必须处理（或忽略并祈祷不会遇到）。可辨识联合直接把可能性收窄到 3 种，消除了不确定性。

这和我写的"模型驱动开发"关系不大，但和你的整体论点一脉相承：**LLM 应该生成精确的类型定义，让不合法的状态在类型层面不可表示。** 这对人来说确实繁琐——每次都要想清楚所有合法状态组合然后写可辨识联合。但对 LLM 来说是零成本的。

这才是命题"对人太麻烦但值得在 LLM 时代启用"的正确例子。我原文跑到了 CASE 工具的历史叙事里，偏离了核心。