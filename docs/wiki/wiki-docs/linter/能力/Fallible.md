# Fallible

返回类型含 null 或 undefined——函数可能失败。

传播可阻断：caller 调了带 Fallible 的 callee，必须声明 Fallible（传播）或声明 【HandleFallible】（阻断）。

## 【自动检测】规则

当函数的返回类型满足以下任一条件时，自动标记 Fallible 加入 effectiveCaps：

- 返回类型本身是 null 或 undefined
- 返回类型是联合类型且其中某个成员是 null 或 undefined
- 返回类型的泛型参数（如 `Promise<T | null>` 中的 T）包含 null 或 undefined

自动检测产生 【implicit_capability】 信息。

## 与 HandleFallible 的关系

如果函数自身返回 `T | null`，它就是 Fallible 的——这是签名决定的客观事实，HandleFallible 不会改变这一点。HandleFallible 处理的是 callee 传来的 Fallible，不影响自身的 Fallible 标记。

【内置能力表】中声明了 Fallible 的典型 API：JSON.parse, fetch, readFileSync 等。
