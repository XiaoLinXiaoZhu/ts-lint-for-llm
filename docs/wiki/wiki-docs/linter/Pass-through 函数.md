# Pass-through 函数

自身逻辑极少、主要工作是转发调用到另一个函数的函数。

## 定义

一个函数 F 是 pass-through，当满足：

- 【加权语句数】 ≤ 3
- 恰好 1 个已解析的被调用者
- 自身增加的业务逻辑为 0 或极少

## 检测信号

- `ws ≤ 3` 且 `calleeCount = 1`：**单调用转发**（只是重命名了一次调用）
- `ws ≤ 3` 且 `calleeCount = 2` 且 `totalCalls = calleeCount`：**纯路由**（if-else 分发）
- `own ≈ 0` 但 `effectiveCaps > 0`：能力完全来自 callee 传播
- `isDeclared = true` 且 `declaredCaps = []`：声明为纯函数但实际是转发

## 为什么有害

每个 【Pass-through 函数】 不增加业务价值，但在调用链上增加一跳。累积效果是【间接税】——理解一个功能需要追踪十几个函数。

## ChatFrame-v11 实例

用户操作 "发消息→LLM→回复" 的调用链：

```
onMessage → runAction → planAction → classify → resolveInput
→ routeCommand → routeChat → executeActionPlan → mapStreamEvents
→ classifyEvent → llm.generate() → execAction → doStream → send → sendOne
```

其中纯 pass-through：`resolveInput`(ws=0)、`routeCommand`(ws=12)、`routeChat`(ws=2)、`execAction`(ws=5.5)、`doStream`(ws=6.5)、`send`(ws=3.5)。

## 在递归评分中的表现

【递归组合评分】下，pass-through 的 `own` 很小但 `inherited` 很大，总分不再被隐藏。

例如 `resolveInput`（own=0, 1 callee）：
- 当前评分：0（"完美"）
- 递归评分（DECAY=0.5）：21.4（"你隐藏了 21.4 分的复杂度"）

## 建议

- 单调用转发（`ws ≤ 3, calleeCount = 1`）：应内联到 caller
- 纯路由（`ws ≤ 5, calleeCount ≥ 2`）：考虑用策略模式或映射表替代

## 相关

- 【间接税】
- 【递归组合评分】
- 【评分公式缺陷】
