# 对人太繁琐、对 LLM 零成本的代码写法

> 核心命题：哪些曾因"对人类太麻烦"而被放弃的**代码写法**，在 LLM 写代码的时代应该重新采用？
>
> 讨论范围严格限于**代码本身的形态**。不引入新框架、新语言、新范式——而是在现有 TypeScript 中，用标注和结构约束让代码更可靠。

## 核心产出

| # | 文档 | 状态 |
|---|------|------|
| 011 | [能力标注体系](011-capability-enforcement.md) | 活跃 — JSDoc `@capability` + ESLint no-escalation 规则 + 外部模块声明 |
| 012 | [能力加权评分模型](012-capability-scoring-model.md) | 完成 — 逐行加权 × 能力数，验证了 bad→good→best 三级降分 |
| 017 | [统一评分模型](017-unified-scoring-model.md) | 完成 — 能力负担 + 类型松散度双维度，实验验证两个维度独立 |
| 018 | [能力分类](018-capability-taxonomy.md) | 完成 — 精简到 5 个核心能力（IO/Fallible/Mutable/Async/Impure），对齐 Koka 效果系统 |

## 仍在讨论

| # | 文档 | 状态 |
|---|------|------|
| 015 | [模块边界量化评估](015-module-boundary-scoring.md) | 方向确认，待实现 |
| 016 | [SSOT 规范](016-ssot-and-self-documenting-code.md) | 暂存 |

## 已知局限

- **局部最优陷阱**（017）：评分驱动贪心优化，系统性重构需要"先爬坡再下降"，LLM 不会走这条路。当前定位：评分做验证，架构规划由人来做。
- **不评估内聚性**：评分不区分"有组织的模块"和"散落的函数"。状态机模式在实验中证明了内聚+低分是可能的。

## 原则文档

- [owner-principles.md](owner-principles.md) — 核心设计原则

## 归档

001-010 的基础写法原则（穷尽检查、branded types、状态建模等）已确认并被后续实践具体化，归档在 [archive/](archive/)。

013-014（禁用 bool/null、类型评分）的结论已合并到 017 统一评分模型，归档在 [archive/](archive/)。
