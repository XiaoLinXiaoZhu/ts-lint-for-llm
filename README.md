# lm-linter — 断言式 TypeScript 效果追踪

> 用断言声明意图，系统验证事实，违反时输出污染链。

## 核心思想

不再需要标注每个函数的能力。系统自动推断所有函数的效果，你只需要在关键点放置断言：

```typescript
/** @assert pure */
function calculateTotal(items: readonly Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}
```

如果函数满足断言 → 无输出。
如果不满足 → 输出完整的污染链，告诉你效果从哪里来。

## 安装与使用

```bash
bun apps/cli/src/main.ts assert              # 验证所有 @assert 断言
bun apps/cli/src/main.ts infer               # 查看所有函数的推断能力
bun apps/cli/src/main.ts type                # 类型松散度检测
```

## 断言词汇

| 属性 | 含义 | 禁止的能力 |
|------|------|-----------|
| `pure` | 完全纯函数 | IO, Impure, Fallible, Async, Mutable |
| `infallible` | 不可失败 | Fallible |
| `immutable` | 不修改状态 | Mutable |
| `sync` | 同步 | Async |
| `deterministic` | 确定性 | Impure |
| `local` | 不与外部交互 | IO |

属性可组合：`@assert infallible immutable sync`

## 5 个能力

| 能力 | 含义 | 推断方式 |
|------|------|---------|
| IO | 读写外部系统 | 外部声明（builtin/.cap.ts） |
| Impure | 依赖隐式环境（时间、随机数） | 外部声明 |
| Fallible | 可能失败 | 类型推断（返回 T\|null） + 外部声明 |
| Async | 异步 | 类型推断（async/Promise） |
| Mutable | 修改引用参数 | 类型推断（非 readonly 参数） |

## 工作流

1. 在关键函数上标记 `@assert`
2. 运行 `lm-linter assert`
3. 断言不满足 → 输出污染链 → 沿链修复
4. 断言满足 → 无输出 → 代码质量已验证

## 项目结构

```
packages/core/          效果推断引擎（图构建、能力推断、断言验证）
packages/looseness/     类型松散度检测
apps/cli/              命令行交互
```

## 外部声明

对于系统看不到实现的外部函数（库函数），创建 `.cap.ts` 文件声明其 IO/Impure 能力：

```typescript
// external.cap.ts
/** @capability IO */
declare function connectDB(url: string): Promise<Connection>;

/** @capability IO Impure */
declare function generateId(): string;
```

Async/Fallible/Mutable 从 `.d.ts` 类型自动推断，无需在 `.cap.ts` 中声明。
