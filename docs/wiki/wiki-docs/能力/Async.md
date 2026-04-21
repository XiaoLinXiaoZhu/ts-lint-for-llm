# Async

返回 Promise/AsyncIterable，调用方需要 await。

传播可阻断：caller 调了带 Async 的 callee，必须声明 Async（传播）或声明 【HandleAsync】（阻断）。

## 【自动检测】规则

当函数满足以下任一条件时，自动标记 Async 加入 effectiveCaps：

- 函数标记了 `async` 关键字
- 返回类型文本匹配 `Promise<`、`AsyncIterable<`、`AsyncGenerator<`、`AsyncIterableIterator<` 前缀

自动检测产生 【implicit_capability】 信息。

## 与 HandleAsync 的关系

如果函数自身是 async 或返回 Promise，它就是 Async 的。HandleAsync 处理的是 callee 传来的 Async，不影响自身的 Async 标记。

【内置能力表】中声明了 Async 的典型 API：fetch, json(), text(), read, next 等。
