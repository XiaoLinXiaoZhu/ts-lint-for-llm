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

### 穿透检测精度改进（待做）

当前已实现的误报过滤：
- `_` 前缀参数自动跳过
- 接口/基类实现的方法自动跳过（非构造函数）
- 参数只转发给 stdlib/builtin 函数时不报告
- 对象字面量方法满足类型标注时自动跳过

仍存在的误报来源（需要扩展 `classifyUsage` 的 AST 识别）：
- 参数被捕获到闭包中（`const fn = () => use(param)`）
- 参数赋值给 `this` 字段（`this.x = param`）
- 参数在模板字符串中使用（`` `${param}` ``）
- 参数作为对象字面量的值（`{ key: param }`）
- 参数在条件表达式中使用但只出现在 call arg 位置时被误判

这些 case 需要逐个在 classifyUsage 中添加对应的 parent node 类型判断。

### 评分作为可选辅助

断言是主路径，评分降为可选的全局概览（`lm-linter overview`）：
- 显示每个文件/模块的能力面积
- 建议哪些函数适合添加断言
- 不再作为优化驱动力
