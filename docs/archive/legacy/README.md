# 被抛弃的软件工程实践：LLM 时代是否应该重新启用？

> 很多过去因"对人类太麻烦"而被放弃的软件工程实践，在 LLM 写代码的时代是否应该重新启用？

共 28 个议题，覆盖 1968–2024 年的软件工程历史。每篇文档包含：是什么、历史渊源、TypeScript 代码举例、为什么被抛弃、是否应该重新启用、**你的看法**（待填写）。

---

## 按时代索引

### 1968–1975: 结构化编程与软件危机
| # | 议题 | 我的结论 |
|---|------|---------|
| 026 | [逐步求精 (Stepwise Refinement)](026-stepwise-refinement.md) | 应该复兴，是给 LLM 下达复杂任务的最佳方式 |
| 027 | [代码走查 / 桌面检查 (Desk Checking)](027-desk-checking.md) | 应该复兴，LLM 是完美的桌面检查执行者 |
| 028 | [严格结构化编程 (Strict SESE)](028-strict-structured-programming.md) | 不原样复兴，但"可组合控制流"理念值得保留 |

### 1975–1983: 形式化方法与程序验证
| # | 议题 | 我的结论 |
|---|------|---------|
| 019 | [形式化规格说明 (Formal Specification)](019-formal-specification.md) | 核心思想应复兴，用代码而非数学符号表达 |
| 020 | [程序正确性证明 (Correctness Proofs)](020-program-correctness-proofs.md) | 不需要完整证明，但循环不变式注释应该回来 |
| 021 | [严格信息隐藏 (Strict Information Hiding)](021-information-hiding-strict-modules.md) | Parnas 的设计决策分析应该复兴 |

### 1983–1990: Ada / 契约式设计 / CASE 工具
| # | 议题 | 我的结论 |
|---|------|---------|
| 004 | [契约式设计 (Design by Contract)](004-design-by-contract.md) | 应该复兴，LLM 消除了最大的两个痛点 |
| 005 | [复杂度强制门禁 (Complexity Gates)](005-cyclomatic-complexity-gates.md) | 应该复兴，升级为认知复杂度 |
| 006 | [大量断言 (Liberal Assertions)](006-liberal-assertions.md) | 应该复兴，特别是 LLM 生成的代码中 |
| 007 | [模型驱动开发 / CASE 工具](007-case-tools-model-driven.md) | 部分复兴，声明式 DSL → LLM 生成代码 |

### 1990–1997: UML / 瀑布全盛期 / 代码审查制度化
| # | 议题 | 我的结论 |
|---|------|---------|
| 016 | [详尽 UML 前期设计 (BDUF)](016-big-design-up-front-uml.md) | 精神复兴，媒介从 UML 变为 TS 接口 + 文本 |
| 017 | [需求可追溯性矩阵](017-requirements-traceability.md) | 应该复兴，LLM 消除了维护成本 |
| 018 | [详尽编码规范文档](018-coding-standards-document.md) | 强烈应该复兴，是 LLM 最有效的行为塑形工具 |

### 1997–2004: XP / 敏捷运动 / 重构革命
| # | 议题 | 我的结论 |
|---|------|---------|
| 012 | [结对编程 (Pair Programming)](012-pair-programming.md) | 不原样复兴，LLM 就是虚拟领航员 |
| 013 | [严格 TDD 红-绿-重构](013-strict-tdd-cycle.md) | 核心纪律应复兴，但工作流需调整 |
| 014 | [正式代码检查 (Fagan Inspection)](014-formal-code-inspection.md) | 检查清单驱动审查应复兴，由 LLM 执行 |
| 015 | [系统化重构目录](015-systematic-refactoring-catalog.md) | 应该复兴，LLM 是理想的重构执行引擎 |

### 2004–2012: 静态分析复兴 / 类型系统热潮 / DSL
| # | 议题 | 我的结论 |
|---|------|---------|
| 008 | [变异测试 (Mutation Testing)](008-mutation-testing.md) | 应该复兴，LLM 改变了变异测试的经济学 |
| 009 | [文学编程 (Literate Programming)](009-literate-programming.md) | 不原样复兴，但"代码伴随设计推理"应回来 |
| 010 | [全量静态分析规则集](010-exhaustive-lint-rules.md) | 应该复兴，LLM 辅助策展 + 自动修复 |
| 011 | [Typestate 模式](011-typestate-pattern.md) | 应该复兴，由 LLM 生成和维护 |

### 2012–2020: DevOps / 微服务 / 不可变基础设施
| # | 议题 | 我的结论 |
|---|------|---------|
| 022 | [混沌工程 (Chaos Engineering)](022-chaos-engineering.md) | 应该复兴，LLM 降低了实施门槛 |
| 023 | [全面结构化可观测性](023-structured-observability.md) | 应该复兴，LLM 自动生成追踪代码 |
| 024 | [默认不可变编程](024-immutable-first-programming.md) | 应该复兴，让 LLM 生成的代码更安全 |
| 025 | [API 版本化与兼容性契约](025-api-versioning-contracts.md) | 应该复兴，是 LLM 安全修改代码的前提 |

### 2020–2024: AI 辅助编程前夜
| # | 议题 | 我的结论 |
|---|------|---------|
| 001 | [全量显式类型标注](001-exhaustive-type-annotations.md) | 应该复兴，至少在 API 边界和关键数据流 |
| 002 | [基于属性的测试 (PBT)](002-property-based-testing.md) | 应该复兴，LLM 解决了属性提炼的瓶颈 |
| 003 | [架构决策记录 (ADR)](003-architecture-decision-records.md) | 强烈应该复兴，收益增幅最大的实践之一 |

---

## 按结论分类

### 强烈应该复兴 ⭐
- 003 架构决策记录 (ADR)
- 018 详尽编码规范文档
- 004 契约式设计

### 应该复兴 ✅ (22 篇)
001, 002, 005, 006, 008, 010, 011, 013, 014, 015, 016, 017, 019, 020, 021, 022, 023, 024, 025, 026, 027, 007

### 不原样复兴，但核心理念值得保留 ⚠️
- 009 文学编程
- 012 结对编程
- 028 严格结构化编程

---

**每篇文档末尾都有"我的看法"字段留空，等待你阅读并填写。**

---

## AI 反思：我根本理解错了命题

### 我理解的命题
"哪些被放弃的**软件工程方法论和开发流程**可以在 LLM 时代复兴？"

### 你实际的命题
"哪些对人类太繁琐的**代码写法**可以在 LLM 时代重新采用？"

这两个问题的区别是根本性的。前者讨论的是开发过程（TDD、结对编程、代码审查、ADR），后者讨论的是**代码本身长什么样**（命名规范、类型精度、接口设计）。

### 28 篇中真正切题的

只有少数几篇真正触及了"代码写法"：
- **001** 全量类型标注 → 你延伸到了"在函数名中编码副作用"
- **004/006** 契约式设计/断言 → 你纠正为"用 branded types 在入口处建立信心"
- **007** CASE 工具 → 你纠正为"用可辨识联合消除幽灵状态"
- **011** Typestate → 你认同为"信心来自类型约束"
- **018** 编码规范 → 你认同 AGENTS.md 是载体
- **021/024** 信息隐藏/不可变 → 你纠正为"最小接口原则"

### 你的评价中浮现的统一理论

你的 28 条评价不是 28 个独立判断，而是**同一个思想的反复表达**：

> **代码应该通过精确的类型系统建立确定性。校验在边界处一次性完成（parse, don't validate），通过 branded types / 可辨识联合把"已验证"的语义编码进类型，下游代码在类型约束的保护下工作，不需要重复怀疑。接口暴露最少信息（最小接口 + readonly by default）。这些实践对人来说繁琐，但对 LLM 来说是零成本的。**

### 我遗漏的真正符合命题的实践

你举的 `readFile_IO_BLOCKING` 例子指向了一个我完全没覆盖的方向——**在标识符中编码语义属性**。类似的"对人太繁琐但 LLM 不怕"的代码写法可能还包括：

1. **匈牙利命名法的语义版本**：`unsafeUserInput` vs `validatedEmail` vs `sanitizedHtml`
2. **每个数据流阶段定义独立的窄类型**：`RawRequest → ValidatedRequest → AuthenticatedRequest → ProcessedResult`
3. **函数签名中的副作用标记**：`_IO`, `_BLOCKING`, `_THROWS`, `_MUTATES`
4. **为每个 string/number 创建 branded type**：`UserId`, `OrderId`, `EmailAddress` 而非裸 `string`
5. **穷尽的可辨识联合替代所有布尔 flag 组合**

这些才是你要的答案——改变代码的形态，对人类负担大但 LLM 零成本。我应该从这个方向重新展开头脑风暴。
