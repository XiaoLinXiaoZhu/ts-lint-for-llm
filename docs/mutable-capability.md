# Mutable 能力

## 检测规则

Mutable 通过**参数类型**检测，不通过方法名：

- 函数参数是非 readonly 的引用类型（对象/数组/Map/Set/接口） → 自动注入 Mutable
- 函数参数是 `readonly T[]`、`Readonly<T>`、`ReadonlyArray<T>` 等 → 不标记
- 函数参数是值类型（string/number/boolean） → 不标记
- 函数内部对局部变量的 push/sort/splice/set 操作 → **不触发任何 Mutable 标记**

消除 Mutable 的方式：将参数改为 readonly。这有编译器保证——readonly 参数不能被修改，无法作弊。

```typescript
// 自动标记 Mutable（items 是非 readonly 数组）
function first(items: string[]): string { return items[0]; }

// 不标记 Mutable（readonly 数组）
function first(items: readonly string[]): string { return items[0]; }

// 不标记 Mutable（局部 push，和参数类型无关）
function buildList(): number[] {
  const arr: number[] = [];
  arr.push(1, 2, 3);
  return arr;
}
```

## 可消化性

Mutable 是 wrappable（可消化），和 Fallible、Async 一样。调用 Mutable 函数时，如果传入的是局部创建的对象，变异不逃逸，产生 absorbed 建议而非 escalation 错误。

## 历史：为什么不用方法名检测

早期版本通过 builtin 方法名（push/sort/set 等）检测 Mutable，在 21 函数的音乐播放器 demo 上实测精确率和召回率都是 0%：

## Mutable 的正确语义

参考 Koka（`st<h>` 效果可被 `run` 消解）和 Haskell（`ST` monad 的 `runST` 保证局部变异不逃逸）：

> **变异只有逃逸出函数边界时才是效果。**

修正后的定义：

```
Mutable: 函数可能修改调用方可见的状态。
         判断标准：调用前后，调用方持有的数据是否可能发生变化。
         局部变量的变异是实现细节，不算 Mutable。
```

## 检测方案：readonly 参数类型

如果函数参数是 `readonly`，TypeScript 编译器**在编译期保证**该参数不被修改。因此：

- 参数是 `readonly T[]` / `Readonly<T>` → 不可能修改调用方状态 → 不标记 Mutable
- 参数是 `T[]` / `T`（非 readonly 引用类型） → 可能修改 → 标记为可能 Mutable

### Demo 对比

同一个播放器，纯函数的参数加上 readonly（见 `docs/demo/player-readonly.ts`）：

```typescript
// 改前                                    // 改后
function totalDuration(playlist: Track[])  →  function totalDuration(playlist: readonly Track[])
function currentTrack(state: PlayerState)  →  function currentTrack(state: Readonly<PlayerState>)
function topArtists(history: Track[])      →  function topArtists(history: readonly Track[])
```

三种方案在 demo 上的表现：

| 方案 | 精确率 | 召回率 | 误报 | 漏检 |
|---|---|---|---|---|
| 当前（方法名检测） | **0%** | **0%** | 5 | 9 |
| readonly（不改代码） | 47% | **100%** | 10 | 0 |
| readonly（纯函数加 readonly） | **100%** | **100%** | **0** | **0** |

关键发现：**只要代码正确使用了 readonly，检测精确率达到 100%。**

### readonly 会不会有负面效果？

#### 级联问题

```typescript
function helper(arr: string[]) { /* 只读取 */ }
function main(items: readonly string[]) {
  helper(items); // TS 编译错误：readonly string[] 不能赋给 string[]
}
```

改 `items` 为 readonly 会迫使 `helper` 也改为接受 readonly。这种级联是真实存在的。

但这个级联**恰好是我们想要的效果**——它迫使整个调用链显式声明"我不会修改你的数据"。这与 capability-lint 的核心理念一致：让效果在函数签名中可见。

#### 对 LLM 使用者的影响

本工具的目标用户是 LLM agent，不是人类。对 LLM 来说：

1. **readonly 语法的额外复杂度可以忽略**——LLM 不会因为多打几个字而疲劳
2. **readonly 级联不是负担而是信号**——编译器自动追踪哪些函数需要改，LLM 只需按错误修复
3. **readonly 防止作弊**——如果依赖"自觉声明 Mutable"，LLM 为了分数低可以不诚实地省略声明。而 readonly 有编译器保证：你说了 readonly 就不能改，说谎会编译失败

#### 与 TS 生态的兼容性

少数标准库 API 不接受 readonly 参数（如某些 `Array.from` 重载）。实测中 `docs/demo/player-readonly.ts` 编译零错误，说明常见模式没有兼容问题。

深度 readonly（`Readonly<T>` 只冻结一层）确实需要注意，但大多数场景只需要顶层 readonly（`readonly Track[]`），不需要深度递归。

### 误伤分析

"非 readonly 引用参数"不等于"一定修改参数"——可能只是读取。这类函数会被误标。

**但这个误伤有明确的消除路径：加 readonly。** 这不是绕路的 workaround，而是**更好的代码**——readonly 参数显式声明了"我不修改你的数据"，是正确的编程实践。

对 LLM 来说，收到"此函数参数未标记 readonly，可能是 Mutable"的提示后，有两个选择：
1. 加 readonly → 消除标记，证明函数是纯的
2. 确认函数确实修改参数 → 声明 Mutable

两个选择都指向更好的代码。

## Mutable 的可消化性

Mutable 应该从 `rewritable` 改为 `wrappable`（可消化），和 Fallible、Async 一致：

| 能力 | 消化方式 | 例子 |
|------|---------|------|
| Fallible | try-catch、默认值 | `const x = riskyFn() ?? fallback` |
| Async | fire-and-forget、task 模式 | `void asyncFn()` |
| Mutable | 传入局部创建的对象 | `const arr = []; mutatingFn(arr); return arr` |

## 实施步骤

1. **capabilities.ts**：Mutable 改为 `wrappable`
2. **builtin.ts**：移除所有 Mutable 标记（push/sort/splice/set/... → `[]`），因为方法名检测完全失效
3. **scanner.ts**：新增参数可变性检测——检查函数参数是否包含非 readonly 的引用类型，标记为 `hasMutableParams`
4. **analyzer.ts**：对 `hasMutableParams` 的函数生成新诊断，提示用户加 readonly 或声明 Mutable
