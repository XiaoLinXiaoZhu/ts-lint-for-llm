# Mutable 能力：定义、问题与重新设计

## 当前定义

```typescript
Mutable: "修改参数或外部可变状态"
```

当前实现通过 builtin 方法名检测：凡是调用了 `push`、`sort`、`splice`、`set`、`delete` 等方法的函数，都被标记为需要 Mutable 能力。Mutable 被归类为 `rewritable`（不可消化），调用 Mutable 函数而自身未声明 Mutable 时报 escalation 错误。

## 问题

这个检测机制把**内部实现细节**当成了**外部可观察效果**。

### 误报案例（来自 ChatFrame 项目）

```typescript
// 误报 1: sort 作用在副本上，原数组未被修改
/** @capability */
function sortedOffsets(offsets: Offset[]): Offset[] {
  return [...offsets].sort((a, b) => a.charOffset - b.charOffset);
}
// → 报错：缺少 Mutable。实际上这是纯函数。

// 误报 2: set 作用在局部创建的 Map 上
/** @capability Mutable */  // 被迫声明
function buildTasksMap(list: ImageTaskInfo[]): Map<string, ImageTaskInfo> {
  const m = new Map<string, ImageTaskInfo>();
  if (list) for (const t of list) m.set(t.id, t);
  return m;
}
// → 用户被迫声明 Mutable。实际上这是纯函数——m 是局部创建的。

// 误报 3: push 在局部数组上，参数全是 string
/** @capability Mutable */  // 被迫声明
function checkXmlTags(content: string): string[] {
  const issues: string[] = [];
  if (/<diary/i.test(content)) issues.push("混入 <diary> 标签");
  ...
  return issues;
}
// → 被迫声明 Mutable。参数是 string，不可能被修改。issues 是局部数组。
```

### 误标的传播效应

由于 Mutable 当前是 `rewritable`（报 escalation 错误），`--fix` 会自动向上传播 Mutable 声明。这导致了大量纯函数被标记为 Mutable：

ChatFrame 项目实测：44 个函数声明了 Mutable，其中大量参数全是值类型（string/number/boolean），例如：
- `mkTimeJump(from: string, to: string, desc: string)` — 只是构造一个对象返回
- `emitBanner(stepName: string)` — 只是打印日志
- `checkXmlTags(content: string)` — 只是做正则检测

这些函数的 Mutable 是被 `--fix` 注入的，因为它们间接调用了含 `push` 的函数。**Mutable 声明已经失去了语义——它不再表示"修改调用方状态"，而是表示"调用链中某处有个 push"。**

### 真正的 Mutable

```typescript
// 真 Mutable: 修改了调用方传入的对象
/** @capability Mutable */
function pushChunk(chunks: string[], c: string): void {
  chunks.push(c);
}
// → chunks 是调用方的数据，push 修改了它。

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

## 检测方案评估

### 方案 A：非 readonly 引用参数 = 可能 Mutable

思路：如果函数参数是非 readonly 的引用类型（对象/数组/Map/Set），就标记为可能 Mutable。用户通过加 readonly 消除标记。

**ChatFrame 实测数据：**

| 指标 | 数量 | 占比 |
|------|------|------|
| 总函数 | 185 | 100% |
| 有非 readonly 引用参数 | 79 | 43% |
| 实际声明 Mutable 的 | 44 | 24% |
| **误伤（被标记但不是 Mutable）** | **35** | **44% 的标记是误伤** |

43% 的函数会被标记，其中近一半是误伤。典型误伤：

```typescript
// 只读取 story 的属性，从不修改
function buildSystemPrompt(story: Story): string {
  return `${story.premise}\n\n---\n\n${story.writingRules}`;
}
// → 被标记：story 是非 readonly 引用参数
```

#### readonly 的连锁反应

强制加 readonly 会产生**级联效应**：

```typescript
// 如果 buildSystemPrompt 改为 readonly
function buildSystemPrompt(story: Readonly<Story>): string { ... }

// 那么调用它的函数也必须传 Readonly<Story>
function buildChatMessages(story: Readonly<Story>, ...): LLMMessage[] {
  buildSystemPrompt(story); // OK
}

// 再向上传播...
function createSession(config: { story: Readonly<Story>, ... }): SessionHandle { ... }
```

ChatFrame 中有 60 个引用类型参数，其中仅 13 个是 readonly。要全部改完需要修改 47 个参数声明，且每一个都可能触发下游的级联修改。

#### readonly 的实际困难

1. **TS 标准库不一致**：`Array.from(readonlyArr)` 某些重载不接受 readonly 数组
2. **深度 readonly 语法冗长**：`Readonly<Story>` 只冻结一层，深层对象要 `DeepReadonly<Story>`，TS 没有内置这个类型
3. **泛型函数**：`function first<T>(arr: T[]): T` 改成 `arr: readonly T[]` 后，返回类型推断可能变化
4. **第三方库**：大量库的函数签名不接受 readonly 参数

#### 结论：**不采用**。误伤率过高，级联改动成本大，与 TS 生态的现实不匹配。

### 方案 B：保持方法名检测 + Mutable 改为 wrappable

思路：保留当前的 push/sort/set 检测，但把 Mutable 从 escalation（错误）降级为 absorbed（建议）。

优点：改动最小（一行代码）。
缺点：`const arr = []; arr.push(x)` 仍会产生 absorbed 建议，只是从错误变成了警告。噪声仍然很大——这些建议没有可操作性，因为局部 push 根本不需要任何修改。

#### 结论：**治标不治本**。Mutable 改为 wrappable 是对的，但如果检测机制不改，噪声仍然很高。

### 方案 C：移除 builtin Mutable 标记，纯依赖显式声明

思路：从 builtin 表中移除所有 Mutable 标记。push/sort/set 不再自动触发任何 Mutable 诊断。Mutable 完全由用户显式声明（`@capability Mutable` 或后缀 `_Mutable`），工具只验证传播关系。

优点：
- **零噪声**：不会因为内部 push 产生任何诊断
- **改动小**：只需清除 builtin 表中的 Mutable 标记

缺点：
- **无法发现未声明的 Mutable**：如果函数修改了参数但没声明 Mutable，工具不会报错
- 依赖用户自觉（但 IO/Impure 也一样依赖用户自觉——你在函数里手动发 HTTP 请求但不声明 IO，工具也无法检测）

#### 结论：**可行的即时方案**。与 IO/Impure 的检测模式一致（都依赖显式声明或调用链传播），消除了全部误报。

### 方案 D：轻量级逃逸分析（未来增强）

思路：在 scanner 中追踪 push/sort/set 的接收者对象（receiver），判断它是函数参数还是局部变量。只有当变异方法的 receiver 是参数时才标记 Mutable。

```
param.push(x)         → Mutable（param 是函数参数）
localArr.push(x)      → 不标记（localArr 是局部变量）
this.field.push(x)    → Mutable（this 是外部状态）
```

优点：精准，几乎无误报。
缺点：
- 实现复杂（需要追踪变量来源，处理别名、解构、展开运算符）
- 仍无法覆盖所有情况（如 `const ref = param; ref.push(x)` 的别名情况）

#### 结论：**最优长期方案**，但实现成本高，可作为未来增强。

## 推荐实施路径

**第一步（立即）**：方案 C + Mutable wrappable
1. `capabilities.ts`：Mutable 改为 `wrappable`
2. `builtin.ts`：移除所有 Mutable 标记（push/sort/splice/set/... → `[]`）
3. 效果：Mutable 完全由用户显式声明 + 调用链传播。调用 Mutable 函数不声明时报 absorbed 建议

**第二步（未来）**：方案 D 增强
1. `scanner.ts`：分析变异方法的 receiver 是否为函数参数
2. 自动检测未声明的参数变异，减少对用户自觉的依赖
