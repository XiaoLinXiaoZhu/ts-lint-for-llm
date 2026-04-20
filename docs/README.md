# 对人太繁琐、对 LLM 零成本的代码写法

> 核心命题：哪些曾因"对人类太麻烦"而被放弃的**代码写法**，在 LLM 写代码的时代应该重新采用？
>
> 讨论范围严格限于**代码本身的形态**。测试策略、开发流程、文档管理不在范围内。

## 原则文档

- [owner-principles.md](owner-principles.md) — 从第一轮评审中提炼的核心原则

## 议题索引

| # | 议题 | 核心写法 |
|---|------|---------|
| 001 | [字面量穷举与编译期完备性](001-literal-exhaustiveness.md) | `assertNever` + 映射类型穷尽，新增变体时编译器自动报所有遗漏 |
| 002 | [副作用追踪与标记](002-effect-tracking.md) | 函数名后缀 `_IO` / `_BLOCKING` / `_THROWS`，或用 branded return type 标记 |
| 003 | [错误表示与传播方式](003-error-modeling.md) | `Result<T, E>` + 错误可辨识联合，让所有错误路径在类型中可见 |
| 004 | [数据流阶段的窄类型](004-data-flow-narrow-types.md) | `RawInput → ValidatedInput → ProcessedData → OutputDTO`，每阶段独立类型 |
| 005 | [接口形态与最小暴露](005-minimal-interface-shape.md) | 函数只接收实际需要的字段子集，返回值只暴露调用方需要的窄视图，readonly by default |
| 006 | [类型收窄与 branded types](006-branded-types.md) | `UserId` ≠ `OrderId` ≠ `string`，工厂函数 parse 时校验，下游类型即信心 |
| 007 | [模块边界处的代码形态](007-module-boundary-shape.md) | 入口处集中 parse 外部→内部类型，模块内部只处理已收窄类型 |
| 008 | [状态建模与幽灵状态消除](008-state-modeling.md) | 可辨识联合替代布尔 flag 组合，每个变体只含该状态下有意义的字段 |
| 009 | [命名与标识符中的语义编码](009-semantic-naming.md) | Apps Hungarian 复兴：`rawInput` / `validatedEmail` / `sanitizedHtml` |
| 010 | [冗余信息编码](010-redundant-encoding.md) | 边界处类型+命名+注释三通道冗余，信任距离越远冗余越多 |

## 与第一轮的关系

第一轮（`docs/legacy/`）讨论了 28 个软件工程方法论，跑偏了方向。本轮纠正为聚焦代码写法本身。两轮的关系：

- 第一轮的 004/006（契约/断言）→ 本轮的 006/007（branded types / 模块边界 parse）
- 第一轮的 007（CASE 工具）→ 本轮的 008（状态建模 / 可辨识联合）
- 第一轮的 001（类型标注）→ 本轮的 002/009（副作用标记 / 语义命名）
- 第一轮的 021/024（信息隐藏/不可变）→ 本轮的 005（最小接口 / readonly）

**每篇文档末尾都有"我的看法"字段，等待你阅读并填写。**
