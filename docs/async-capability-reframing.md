# 重新定义 Async 能力：从"实现传染"到"契约传播"

## 问题起源

当前模型把 Async 当作一种"传染性"能力：调用了 Async 函数 → 调用方也必须声明 Async。
这个定义和 `async/await` 的语法传染性直觉一致，但在实践中遇到了矛盾：

```ts
// createImageTask 是同步函数，返回 ImageTask（不是 Promise）
// 但它内部调用了 async 的 executeTask
// 当前模型：报 error，要求标注 Async
// 实际情况：这个函数对调用方就是同步的
function createImageTask(...): ImageTask { ... }
```

问题出在哪里？

## 关键观察

**Async 从来不是通过"调用"传播的，而是通过"返回类型"传播的。**

对比其他能力的传播机制：

| 能力 | 传播条件 | 传播载体 |
|------|---------|---------|
| IO | 调用了 IO 函数 → 你也有 IO | 调用行为本身（副作用已发生） |
| Mutable | 修改了外部状态 → 你也有 Mutable | 调用行为本身（状态已改变） |
| Impure | 读了隐式环境 → 你也有 Impure | 调用行为本身（依赖已产生） |
| Fallible | 调用了 Fallible 函数 → **可能**有 Fallible | 返回值（null/undefined 传递给调用方） |
| Async | 调用了 Async 函数 → **可能**有 Async | 返回值（Promise 传递给调用方） |

IO、Mutable、Impure 通过调用行为传播——函数一执行，副作用就发生了，无论你用不用返回值。
Fallible 和 Async 通过返回值传播——如果你处理了返回值中的不确定性，能力就不外泄。

这不是巧合。**Fallible 和 Async 都是关于"返回值携带的不确定性"的能力：**
- Fallible：返回值可能是 null（值的不确定性）
- Async：返回值可能是 Promise（时间的不确定性）

两者的消除方式完全对称：
- Fallible：把 `T | null` 在函数内部解析为 `T`，调用方看到确定的值
- Async：把 `Promise<T>` 在函数内部消化掉（handle/fire-and-forget），调用方看到同步的返回

## 新定义

> **Async 能力 = 函数的返回类型要求调用方进行异步等待（返回 Promise 或 AsyncIterable）。**
>
> 如果函数内部使用了异步操作，但返回值不要求调用方等待，则 Async 已被内部消化。

用这个定义重新审视 ChatFrame 的代码：

### 返回 Promise → Async 外泄，必须声明

```ts
// persist.ts — 返回 Promise，调用方必须 await
async function saveState(key: string, state: SessionState): Promise<void> {
  await mkdir(...);
  await writeFile(...);
}
// → 正确声明了 IO Async
```

这类函数是 Async 传播链的主体。占 ChatFrame 中声明了 Async 的函数的绝大多数（30/31）。

### 不返回 Promise → Async 已消化，不应要求声明

```ts
// image-service.ts — 返回 ImageTask（同步），async 在内部消化
function createImageTask(...): ImageTask {
  const task = registerTask(sid, now);
  queueMicrotask(() => executeTask(task, ...).catch(...));
  return task;
}
// → 不应该被要求声明 Async，因为调用方不需要 await

// session.ts — 返回 StreamedResult（同步对象），stream 是惰性的
chat(userText: string): StreamedResult {
  return { stream: streamLLM(llm, msgs, ...), commit() { ... } };
}
// → 不应该被要求声明 Async，因为调用方拿到的是同步对象
```

这类函数在 ChatFrame 中只有 2 个，但它们恰好是架构的关键边界点。

## 这个定义改变了什么

### 对 ELIMINABILITY 分类的影响

不需要改 ELIMINABILITY。改的是传播规则本身：

**当前规则**：调用了声明 Async 的函数 → 缺少 Async → 报 escalation

**新规则**：调用了声明 Async 的函数 → 自己的返回类型包含 Promise/AsyncIterable → 缺少 Async → 报 escalation
　　　　　调用了声明 Async 的函数 → 自己的返回类型不含 Promise → Async 已消化 → 不报 escalation

换句话说：**Async 的传播判断从"是否调用"变为"是否在返回类型中暴露"。** 和 Fallible 的判断方式完全一致（Fallible 也是看返回类型是否包含 null/undefined）。

### 对 linter 行为的影响

Async 的处理方式变得和 Fallible 完全对称：

| 场景 | Fallible | Async（新定义） |
|------|---------|----------------|
| 调用了有此能力的函数 | 检查返回类型是否含 null | 检查返回类型是否含 Promise |
| 返回类型外泄了不确定性 | 报 escalation（error） | 报 escalation（error） |
| 返回类型不含不确定性 | 视为已吸收（不报/warn） | 视为已吸收（不报/warn） |
| --fix | 补充 Fallible 声明 | 补充 Async 声明 |

### 对 `collectImages` 这类函数的影响

```ts
async function collectImages(total: number, fn: (i: number) => Promise<Maybe<TaskImage>>): Promise<TaskImage[]> {
  const out: TaskImage[] = [];
  for (let i = 0; i < total; i++) pushOk(out, await fn(i));
  return out;
}
```

`collectImages` 返回 `Promise<TaskImage[]>` → 调用方必须 await → Async 外泄 → 需要声明 Async。

这是正确的。返回 Promise 就意味着调用方的控制流被影响了。

### 对 `streamLLM` 的影响

```ts
function streamLLM(llm: LLMPort, msgs, acc, errPfx): AsyncIterable<string> {
  return mapAsyncStream(llm.generate(msgs), acc, errPfx);
}
```

`streamLLM` 返回 `AsyncIterable<string>` → 调用方必须 `for await` → Async 外泄 → 需要声明 Async。

但 `chat()` 把 `streamLLM` 的返回值包在 `StreamedResult.stream` 里返回。`chat()` 自己的返回类型是 `StreamedResult`（不是 Promise/AsyncIterable），所以 Async 在 `chat()` 这一层被消化了。

调用方拿到 `StreamedResult` 后，如果要消费 `.stream`，**那时候**才需要处理 Async。Async 的传播链在 `chat()` 处断开，在消费 `.stream` 处重新开始。这完全合理。

## 我的看法

这个重新定义解决了之前辩论中的核心矛盾，因为它把 Async 从一个模糊的概念（"涉及异步操作"）变成了一个精确的、可机械判断的属性（"返回类型是否包含 Promise/AsyncIterable"）。

之前的辩论之所以僵持，是因为双方对"Async 是什么"的理解不同：
- 正方理解为接口契约（返回类型） → 自然得出 wrappable
- 反方理解为实现行为（是否发起异步操作） → 自然得出 isolate-only

新定义明确站在了"接口契约"一边，原因是：

1. **和类型系统对齐**。TypeScript 已经在类型层面区分了 `T` 和 `Promise<T>`。linter 的 Async 判断应该和类型系统一致，而不是发明自己的语义。

2. **和其他能力的判断方式一致**。Fallible 的"自动检测"就是看返回类型是否含 null/undefined。Async 用同样的机制（看返回类型是否含 Promise）是自然的延伸。

3. **可机械判断**。"函数是否在内部发起了异步操作"需要深度控制流分析（queueMicrotask、.then、事件注册都算吗？）。"返回类型是否包含 Promise"只需要看签名，零歧义。

4. **消除了"标注撒谎"问题**。给 `createImageTask()` 标注 `Async` 在新定义下是错的——它的返回类型就不是 Promise。这符合直觉。

### 需要注意的边界

有一类函数在新定义下会漏网：

```ts
function badFireAndForget(): void {
  fetch('/api/save', { method: 'POST', body: data });
  // 返回 void，不是 Promise → 新定义下不需要 Async
  // 但这里的 async 操作没有任何错误处理
}
```

这确实是个问题。但注意：这个函数会被 `no-escalation` 报 **IO** 违例（它调用了 IO 函数 `fetch` 但没声明 IO）。IO 是 `isolate-only` 的，必须声明。所以这个 bad case 不会漏网——它只是从"缺 Async"变成了"缺 IO"被抓住。

真正漏网的极端情况是：**函数已经声明了 IO，但 fire-and-forget 了一个 async IO 调用而不做任何错误处理**。这种情况下 Async 不报了，但 IO 已经标了。实际上这种 case 更应该被一条专门的"未处理的 Promise"规则（类似 TypeScript 的 `no-floating-promises`）来覆盖，而不是靠 Async 能力传播来间接捕获。
