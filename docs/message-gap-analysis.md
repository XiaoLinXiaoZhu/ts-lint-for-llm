# 新旧实现文本提示对比 & 缺口分析

## 诊断消息

| 消息 | 状态 | 缺失内容 | 是否需要补全 |
|------|------|---------|------------|
| escalation | ✅ 完整 | — | — |
| undeclared | ⚠️ 略简 | 缺少「请添加能力后缀或 @capability 标注」中的后缀命名提示 | 补全，模型需要知道两种声明方式 |
| unregistered | ⚠️ 略简 | 旧版提示「请在 externalCapabilities 中补充」，新版因为不再依赖 ESLint，这个指引不再适用。但应指引用户如何处理 | 改为适合新架构的指引 |
| asyncMismatch | ✅ 完整 | — | — |
| fallibleMismatch | ⚠️ 缺示例 | 旧版有具体示例 `{ success: false, error: "reason" }`，新版省略了 | **需要补全**，这是 parse-don't-validate 模式的关键指引 |
| absorbed (Fallible) | ⚠️ 合并 | 旧版区分了 Fallible 和 Async absorbed，各有专门建议 | 需要拆分 |
| absorbed (Async) | ⚠️ 合并 | 同上 | 需要拆分 |
| suggestAddFallible | ❌ 缺失 | 「为 caller 补充 Fallible 声明（若失败未被 try-catch、默认值等处理）」 | **需要补全**，告诉模型什么时候该传播、什么时候该吸收 |
| suggestParseNotValidate | ❌ 缺失 | 「不补充 Fallible：将 callee 的空返回转为显式错误结构体（如 { success: false, error: "reason" }），让下游无需处理 null/undefined」 | **需要补全**，这是核心设计指引 |
| suggestAddAsync | ❌ 缺失 | 「为 caller 补充 Async 声明（若调用方需要 await 本函数的结果）」 | **需要补全** |
| suggestHandlePattern | ❌ 缺失 | 「不补充 Async：确认已通过 task/handle、fire-and-forget+错误处理 等模式在函数内部消化了异步操作」 | **需要补全**，指引 handle 模式 |

## Tips 优化建议

| Tip | 状态 | 缺失内容 | 是否需要补全 |
|-----|------|---------|------------|
| 声明能力 | ⚠️ 略简 | 缺少「纯函数用空 @capability」的说明 | 补全，模型需要知道纯函数怎么标 |
| 拆分高负担函数 | ⚠️ 缺关键信息 | 缺少「纯函数得分为 0，父函数的语句数减少即可降分」和「仅提取子能力到新函数不会降分，只有提取出能力更少的代码才有效」 | **需要补全**，这是模型最容易犯的错误——无效拆分 |
| 系统性重构 | ⚠️ 缺模式名 | 缺少「状态机模式（纯 transition 函数 + 薄 IO 层）」和「effect as data」的具体建议 | 补全，给模型具体方向 |
| 收窄接口 | ✅ | — | — |
| 优化顺序 | ⚠️ 缺场景 | 缺少「类型松散度为 0 时集中精力降 cap」的分支 | 补全 |
| 消除重复 | ❌ 缺失 | 「X, Y 在多个文件中出现。提取到共享模块可以减少总能力面积」 | 补全，跨文件分析后这个更有价值了 |

## 逐行调试能力

旧实现（ESLint）可以在编辑器中逐行查看每个函数的问题。新 CLI 工具的 JSON 输出按函数提供 diagnostics，但缺少：
- 每个函数的 `resolvedCalls` 和 `unresolvedCalls` 明细（模型需要知道调用了谁）
- 每个函数的 `effectiveCaps`（模型需要知道实际能力集）
- 函数级别的 score 明细（不只是 top 10）

建议在 JSON 输出中加入 `functions` 字段，列出每个函数的完整信息。

## 总结

**必须补全（影响模型决策质量）：**
1. fallibleMismatch 的 `{ success: false, error: "reason" }` 示例
2. absorbed 消息拆分为 Fallible/Async 各自的建议（suggest 文本）
3. 拆分高负担函数 tip 中的「无效拆分」警告
4. JSON 输出中的函数级完整信息

**建议补全（提升引导质量）：**
5. 系统性重构 tip 中的状态机/effect-as-data 模式名
6. 消除重复 tip
7. undeclared 消息中的两种声明方式说明
