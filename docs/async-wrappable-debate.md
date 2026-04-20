# Async 是否应改为 wrappable？—— 正反方辩论

> 背景：当前 `ELIMINABILITY` 把 Fallible 归为 `wrappable`（可包装消除），Async 归为 `isolate-only`（只能隔离）。
> 争议：ChatFrame 的实际代码中存在高质量的 Async 吸收模式（task/handle、lazy stream），当前分类导致 linter 对这些合理代码报 error。

---

## 正方：应该改为 wrappable

### 核心论点

**Async 吸收在实践中已经是成熟模式，linter 不应把正确的代码标红。**

### 论据 1：ChatFrame 的 Async 吸收是高质量的

`createImageTask` 返回 task handle，`session.chat()` 返回 StreamedResult handle。两者都满足：
- 结果不丢失（通过 handle 状态或 stream 送达）
- 错误不丢失（`.catch` 写入 task.error / stream yield error event）
- 调用方不需要 async，控制流不断裂

这不是 callback 地狱，是现代的 handle-based 并发模式。Koka 的 effect handler、Rust 的 `JoinHandle`、Go 的 channel 本质上都是这个思路。

### 论据 2：和 Fallible 吸收的对称性成立

| 维度 | Fallible 吸收 | Async handle 吸收 |
|------|-------------|-----------------|
| 包装手段 | `try-catch` / `?? default` | `queueMicrotask + handle` / lazy stream |
| 结果完整性 | 拿到确定值 | 通过 handle 拿到结果 |
| 错误处理 | catch 分支处理 | `.catch` 写入 handle.error |
| 能力消除 | 函数签名不含 null | 函数签名不含 async/Promise |
| 类型安全 | 编译器验证 | handle 类型约束 |

两者结构对称。Fallible 的 try-catch 之所以被认可，不是因为"同步"这个属性，而是因为"结果完整送达 + 错误被处理"。Async handle 同样满足这两个条件。

### 论据 3：当前分类产生了不合理的 error

如果 Async 是 `isolate-only`，那以下代码会被报权限违例（error）：

```ts
// image-service.ts — createImageTask 声明为 Mutable，未声明 Async
// 但它调用了 executeTask (IO Async Mutable)
// → 报 error: 缺少 Async
```

要消除这个 error，开发者必须给 `createImageTask` 加上 Async 声明。但 `createImageTask` **就不是 async 的**——它是同步的，立即返回 task handle。强制标注 Async 是撒谎。

### 论据 4：减少心智负担

改为 wrappable 后：
- 开发者看到 absorbed 的 warn（而非 error），知道这里有 async 调用
- suggest 提示两个选择：向上传播 Async，或确认 handle 模式已正确吸收
- 不需要为了消除 error 而给同步函数贴上 Async 标签

### 风险承认

纯 fire-and-forget（不兜底错误、不拿结果）也会从 error 降为 warn。这是放松了约束。但 Fallible 也有同样的问题——`try {} catch {}` 空 catch 也能消除 Fallible，linter 不会去检查 catch 里写了什么。对吸收质量的判断，两者都需要依赖开发者的判断力。

---

## 反方：应该保持 isolate-only

### 核心论点

**Async 的传染性是 JS/TS 的语言特性，linter 应当尊重而非绕过它。放松约束的代价大于收益。**

### 论据 1：Async 吸收和 Fallible 吸收质量本质不同

Fallible 吸收后，**不确定性消失了**。`const user = findUser(id) ?? guest` 之后，后续所有代码都在确定性世界里运行。这是真正的"消除"。

Async handle 吸收后，**不确定性没有消失，只是换了个地方**。`createImageTask` 返回的 task handle 的 `status` 字段会在未来某个不确定时刻从 `"pending"` 变成 `"done"`。调用方必须处理这个时序不确定性（轮询、watch、UI 刷新）。

从信息论角度：Fallible 吸收降低了系统熵，Async handle 吸收只是把熵从函数签名移到了运行时状态。

### 论据 2：handle 模式的正确性依赖更多隐性契约

Fallible 吸收的正确性由编译器保证——`?? default` 之后类型就是 `T` 而非 `T | null`，编译器强制你处理了。

Async handle 的正确性依赖：
- handle 内部必须正确兜底错误（`.catch` 不能漏）
- 状态回写必须是原子的或线程安全的
- 调用方必须在正确时机检查 handle 状态
- 如果 handle 内部的 async 操作修改了共享状态，可能引发竞态

这些隐性契约编译器检查不了。如果 linter 也不报 error，就没有任何工具在提醒开发者"这里有异步在飞"。

### 论据 3：正方举的例子是精心设计的，不代表一般情况

`createImageTask` 和 `session.chat()` 之所以能正确吸收 Async，是因为：
- 经过了刻意的架构设计（port/adapter 分层、handle 模式）
- 有完整的错误兜底（`.catch` 写入 task.error）
- 状态回写路径简单（只改 task 对象的字段）

但大多数开发者写 fire-and-forget 时不会这么仔细。更常见的情况是：

```ts
function handleClick() {
  saveToServer(data);  // 忘了 await，忘了 .catch
  showToast("已保存");  // 实际上还没保存
}
```

如果 Async 是 wrappable，这段代码只会收到 warn，而不是 error。warn 在 CI 里通常不阻断构建，很容易被忽视。

### 论据 4：标注 Async 不是"撒谎"

正方说给 `createImageTask` 标注 Async 是"撒谎"。但能力标注描述的不是"函数自身是否 async"，而是"函数的行为是否涉及异步效果"。`createImageTask` 确实发起了异步操作——它只是不等待完成。

类比：一个函数 `launchMissile()` 内部调用了 IO 操作但不返回结果，你不会说"launchMissile 不需要标注 IO"。它的行为就是有 IO 副作用。同理，`createImageTask` 的行为就是有 Async 副作用，只是副作用被推迟了。

给它标注 `Mutable Async` 是诚实的——它告诉调用方"我会发起异步操作并改变状态"。调用方看到这个标注，会知道 task 的结果不是立即可用的。

### 论据 5：isolate-only 的 error 是有价值的信号

当 linter 对 `createImageTask` 报 error 时，它在说："注意，这里有一个 async 边界"。开发者看到后：
- 如果他确认 handle 模式是正确的 → 加上 Async 标注，error 消失
- 如果他发现自己忘了处理错误 → 补上 .catch，避免了 bug

这个"被迫审视"的过程是有价值的。改为 wrappable 后，这个审视机会就没了。

### 风险承认

保持 isolate-only 确实会导致一些"假阳性"——正确吸收了 Async 的代码也会被报 error。但假阳性的代价是多看一眼 + 加个标注，假阴性（漏掉未处理的 async）的代价是运行时 bug。在 linter 设计中，宁可偏向假阳性。

---

## 争议焦点总结

| 议题 | 正方立场 | 反方立场 |
|------|---------|---------|
| handle 模式是否"消除"了 Async | 是，结果完整送达，能力不外泄 | 否，时序不确定性只是移到了运行时 |
| 给同步函数标 Async 是否合理 | 不合理，函数就是同步的 | 合理，标注描述行为而非签名 |
| linter 应该偏向哪边 | 减少噪音，信任开发者判断 | 宁可假阳性，不放过假阴性 |
| 和 Fallible 的对称性 | 成立，结构相同 | 不成立，消除质量不同 |
| 对一般开发者的影响 | 减负，少看无意义的 error | 放松约束，增加漏网 bug 风险 |

## 关键判断点

做决定前需要回答一个问题：

**你的项目中，Async 的"好吸收"（handle 模式）和"坏吸收"（忘了 await/catch）的比例是多少？**

- 如果大多数 Async 吸收都是精心设计的 handle 模式 → 改为 wrappable 减少噪音
- 如果项目中有大量开发者会写出忘了 await 的代码 → 保持 isolate-only 作为安全网

ChatFrame 目前是前者——架构清晰，async 边界都经过设计。但如果未来项目规模扩大、贡献者增加，情况可能会变。
