# Mutable 能力：定义、问题与重新设计

## 当前定义

```typescript
Mutable: "修改参数或外部可变状态"
```

当前实现通过 builtin 方法名检测：凡是调用了 `push`、`sort`、`splice`、`set`、`delete` 等方法的函数，都被标记为需要 Mutable 能力。Mutable 被归类为 `rewritable`（不可消化），调用 Mutable 函数而自身未声明 Mutable 时报 escalation 错误。

## 问题

这个检测机制把**内部实现细节**当成了**外部可观察效果**。

三个真实误报（来自 ChatFrame 项目）：

```typescript
// 误报 1: sort 作用在副本上，原数组未被修改
/** @capability */
function sortedOffsets(offsets: Offset[]): Offset[] {
  return [...offsets].sort((a, b) => a.charOffset - b.charOffset);
}
// → 报错：缺少 Mutable。实际上这是纯函数。

// 误报 2: push 作用在局部创建的数组上
/** @capability Mutable */  // 被迫声明
function buildTasksMap(list: ImageTaskInfo[]): Map<string, ImageTaskInfo> {
  const m = new Map<string, ImageTaskInfo>();
  if (list) for (const t of list) m.set(t.id, t);
  return m;
}
// → 用户被迫声明 Mutable。实际上这是纯函数——m 是局部创建的。

// 误报 3: push 通过子函数间接调用，但操作的是局部数组
/** @capability Async */
async function drainToString(stream: AsyncIterable<string>): Promise<string> {
  const chunks: string[] = [];
  for await (const c of stream) pushChunk(chunks, c);
  return chunks.join("");
}
// → 报错：缺少 Mutable。chunks 是函数内部创建的，修改不逃逸。
```

而真正的 Mutable 应该是这样的：

```typescript
// 真 Mutable: 修改了调用方传入的对象
/** @capability Mutable */
function pushChunk(chunks: string[], c: string): void {
  chunks.push(c);
}
// → chunks 是调用方的数据，push 修改了它。调用方的状态因此改变。

// 真 Mutable: 修改了外部共享状态
/** @capability IO Mutable */
function resetSession(ctx: Ctx): void {
  ctx.session = createSession({ ... });
}
// → ctx 是外部共享状态，赋值改变了它。
```

核心区别：**变异是否逃逸出函数边界**。

## Mutable 的正确语义

参考 Koka 和 Haskell 的效果系统：

- Koka 的 `st<h>` 效果：变异绑定到堆区域 `h`。`run { var x := 0; x := x + 1; x }` 是纯的——局部堆被 `run` 消解，`st` 效果不逃逸。
- Haskell 的 `ST` monad：`runST :: (forall s. ST s a) -> a`，类型系统保证可变状态不逃逸，对外呈现纯接口。

这两个系统的共识：**变异只有逃逸出函数边界时才是效果。** 局部变量的变异是实现细节，不是能力需求。

### 修正后的定义

```
Mutable: 函数可能修改调用方可见的状态——参数对象、闭包捕获的外部变量、模块级变量。
         对函数内部创建的局部对象做任何变异操作，不算 Mutable。
```

判断标准：如果把函数看作黑盒，调用前后**调用方持有的数据**是否可能发生变化？
- 是 → Mutable
- 否 → 不是 Mutable（即使函数内部用了 push/sort/splice）

## Mutable 的可消化性

当前分类是 `rewritable`（不可消化，必须向上传播），这是错的。

Mutable 是**可消化的（wrappable）**，和 Fallible、Async 一样：

| 能力 | 消化方式 | 例子 |
|------|---------|------|
| Fallible | try-catch、默认值 | `const x = riskyFn() ?? fallback` |
| Async | fire-and-forget、task 模式 | `void asyncFn()` |
| Mutable | 传入局部创建的对象 | `const arr = []; mutatingFn(arr); return arr` |

如果 caller 只把自己创建的局部对象传给 Mutable 子函数，变异不逃逸，caller 不需要声明 Mutable。

这也解释了为什么 `drainToString` 不应该是 Mutable：它创建局部 `chunks`，传给 `pushChunk`（Mutable），变异被完全消化。

## 检测方案

### 现状：按方法名（不可行）

按 `push`/`sort`/`set` 等方法名标记 Mutable，无法区分操作对象是局部变量还是入参。这是误报的根源。

### 方案：移除 builtin Mutable 标记，改为参数类型检测

**不再通过方法名检测 Mutable。** 从 builtin 表中移除所有 Mutable 标记。

改为在 scanner 层检测函数的参数类型：
- 参数是引用类型（object/array/Map/Set/自定义对象）且**不是 readonly** → 该函数**可能**修改调用方状态
- 参数是 readonly 或值类型（string/number/boolean） → 不可能修改调用方状态

```typescript
// 非 readonly 参数 → 可能 Mutable
function process(items: string[]): void { ... }

// readonly 参数 → 不可能 Mutable
function process(items: readonly string[]): void { ... }
```

这个方案的优点：
1. **零误报**：不会因为局部 `push` 报 Mutable
2. **鼓励好实践**：用 readonly 标注入参是对意图的显式声明
3. **与 TypeScript 类型系统对齐**：readonly 就是 TS 提供的「不可变」保证
4. **检测成本低**：只需检查参数类型节点，不需要做数据流分析

局限：
- 没有类型标注的参数无法判断（当作可能 Mutable）
- 函数可能修改闭包捕获的外部变量（无法通过参数类型检测）
- 不是所有非 readonly 参数都会被修改（会有一些 false positive，但远比现在少）

### 可消化性变更

将 Mutable 从 `rewritable` 改为 `wrappable`。效果：
- 调用 Mutable 函数而自身未声明 Mutable → 报 absorbed（建议）而非 escalation（错误）
- 与 Fallible、Async 的处理方式一致
- 用户可以选择：向上传播 Mutable 声明，或确认变异已在函数内部消化

## 实施步骤

1. **capabilities.ts**：Mutable 改为 `wrappable`
2. **builtin.ts**：移除所有 Mutable 标记（push/sort/splice/set/delete/... → `[]`）
3. **scanner.ts**：新增参数可变性检测——检查函数参数是否包含非 readonly 的引用类型
4. **analyzer.ts**：新增诊断类型 `MutableParameter`，提醒参数是非 readonly 引用类型
