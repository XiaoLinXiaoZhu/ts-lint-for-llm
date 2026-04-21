# 全量静态分析规则集 (Exhaustive Static Analysis)

## 是什么

开启静态分析工具（lint）的所有规则，将所有警告提升为错误，CI 中零容忍——任何违反都阻止合入。不是选择性地启用"团队认为重要的"规则，而是默认全开，只在有充分理由时才关闭特定规则。

## 历史相关渊源

C 语言的 lint 工具最早由 Stephen Johnson 在 1978 年创建。2004 年前后，Java 生态的 FindBugs (2004)、PMD (2002)、Checkstyle (2001) 进入成熟期，企业项目开始在 CI 中集成多个静态分析工具。

"全开"理念的巅峰是 NASA 的 JPL C 编码标准和 MISRA C（汽车行业），它们规定了极其严格的规则集，实际上禁止了 C 语言的大量特性。

2006–2012 年间，Google 和 Facebook 内部大规模部署了自研的静态分析系统（如 Google 的 Tricorder），以"全量分析 + 智能过滤"方式取得成功。但开源社区走向了另一个方向：ESLint (2013) 推崇"可配置"，团队自由选择规则。

## TypeScript 代码举例

```typescript
// .eslintrc.json 的两种理念对比：

// ❌ "选择性启用"（常见做法）: 只开几个团队认为重要的规则
// {
//   "extends": ["eslint:recommended"],
//   "rules": {
//     "no-unused-vars": "warn",    // 仅警告，不阻止合入
//     "no-console": "off"          // 允许 console
//   }
// }

// ✅ "全量启用"理念: 默认全开，逐条关闭有理由的
// {
//   "extends": [
//     "eslint:all",
//     "plugin:@typescript-eslint/all"
//   ],
//   "rules": {
//     // 仅在有书面理由时关闭规则
//     "@typescript-eslint/prefer-readonly-parameter-types": "off"
//     // ↑ 关闭理由: 强制 Readonly<T> 在每个参数上导致类型噪音过多，
//     //   且 TypeScript 编译器不会对突变做深层检查
//   }
// }

// 全量规则会捕获的典型问题：

// 规则 no-magic-numbers:
function paginate<T>(items: T[], page: number): T[] {
  // ❌ 全量规则集会报错: Magic number 20
  return items.slice((page - 1) * 20, page * 20);
}

const PAGE_SIZE: number = 20 as const;
function paginateFixed<T>(items: T[], page: number): T[] {
  // ✅ 常量有名字，意图清晰
  return items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}

// 规则 @typescript-eslint/strict-boolean-expressions:
function process(input: string | undefined): string {
  // ❌ 隐式布尔转换: undefined 和 "" 都是 falsy
  if (!input) return "default";

  // ✅ 显式检查，不会把空字符串误判为"无输入"
  if (input === undefined) return "default";
  return input.toUpperCase();
}
```

## 为什么被抛弃

1. **噪音过大**：全开规则集中有大量与项目无关或与团队风格不符的规则，误报淹没真问题
2. **配置地狱**：逐条关闭不需要的规则并写理由，初始配置成本巨大
3. **规则冲突**：某些规则互相矛盾（如 `prefer-arrow-callback` vs `func-style`），必须人为裁决
4. **虚假安全感**：全绿的 lint 报告让团队误以为代码质量高，但 lint 只能捕获表面问题
5. **升级痛苦**：lint 工具升级时新增规则自动变成错误，CI 突然大面积红灯

## 是否应该在 LLM 时代重新启用

**应该，但需要"LLM 辅助策展"模式。** 理由：

- LLM 生成的代码质量参差不齐，严格的 lint 是最高效的第一道防线——比人工代码审查快几个数量级。
- 过去"噪音过大"的问题可以由 LLM 自动修复：lint 报错后让 LLM 自动修正，人类只审查最终结果。
- 过去"配置地狱"问题：LLM 可以分析项目代码库，推荐哪些规则应开启、哪些应关闭，并自动生成带理由的配置文件。
- 关键洞察：**lint 规则对 LLM 来说不是"限制"而是"指导"**。LLM 可以在生成代码时就遵守规则，而不是生成后再修复。把规则集作为 prompt 的一部分，从源头提高生成质量。

建议：采用"全开 → LLM 辅助裁剪"策略。先 `extends: all`，然后让 LLM 分析项目特征，生成带理由注释的规则配置。CI 中 lint 错误由 LLM 自动修复，人类只审核修复结果。

## 我的看法

这个是对的。

## AI 回复

这是你认同的几篇之一。全量 lint 确实属于"改变代码写法"的范畴——lint 规则直接约束代码的形态（不允许隐式布尔转换、不允许 magic number、强制显式类型等）。

结合你在 018 中的认同（编码规范是必要途径），我觉得这两篇可以合并为一个实践建议：**AGENTS.md 中的编码规范 + 全量 lint 规则集 = LLM 的行为约束体系**。前者约束 lint 无法检查的设计决策，后者约束 lint 能检查的代码形式。
