# Roadmap

## 已完成

### v0.1 — 断言式效果追踪

核心观念转变：从"标注所有函数"到"断言关键点"。

- [x] 5 个能力定义：IO, Impure, Fallible, Async, Mutable
- [x] 断言词汇：pure, infallible, immutable, sync, deterministic, local
- [x] 调用图构建（ts-morph AST 分析）
- [x] 自动能力推断（类型检测 + 调用图传播）
- [x] 断言验证 + 污染链输出
- [x] 外部声明（builtin + .cap.ts）
- [x] 类型松散度检测（独立维度）
- [x] Monorepo 结构（packages/core, packages/looseness, apps/cli）

## 计划中

### 接口最小化断言 — `@assert minimal`

**核心思路**：和效果断言相同范式——用户标记意图，系统验证事实，违反时输出证据链。

检测层次：
1. **完全未使用的参数** — 参数在函数体中从未出现
2. **对象参数中未使用的字段** — 只有部分字段被 `.` 访问
3. **穿透参数** — 参数只出现在转发给另一个 call 的位置，自身逻辑从未读取

技术定义：
> 参数 P 是穿透的 ⟺ P 在函数体中的所有出现，都是作为另一个 CallExpression 的实参

输出格式（断言不满足时）：
```
@assert minimal 不满足:
  3 个参数是穿透的：
    options.model         → 仅转发给 callAPI (line 4)
    options.temp          → 仅转发给 callAPI (line 4)
    options.repeatPenalty → 仅转发给 callAPI (line 4)
```

与效果断言的统一：
- 效果断言追踪 EFFECTS 依赖，接口断言追踪 INFORMATION 依赖
- 都是：用户标记意图 → 系统验证事实 → 违反时输出证据链
- `@assert pure minimal` 可组合使用

### 评分作为可选辅助

断言是主路径，评分降为可选的全局概览（`lm-linter overview`）：
- 显示每个文件/模块的能力面积
- 建议哪些函数适合添加断言
- 不再作为优化驱动力
