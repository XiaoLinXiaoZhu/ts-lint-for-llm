# HandleFallible

阻断能力。表示函数处理了 callee 传来的 【Fallible】，使可失败性不再向上传播。

## 示例

```ts
/** @capability IO HandleFallible */
function getUsername(id: string): string {
  const user = fetchUser(id);       // fetchUser 返回 User | null（Fallible）
  return user?.name ?? "anonymous";  // 兜底了，自身返回确定的 string
}
```

getUsername 调了 Fallible 的 fetchUser，但通过 `?? "anonymous"` 处理了 null。自身返回 string（非 null），Fallible 不再传播。caller 调 getUsername 时不需要关心 Fallible。

## 合法的处理方式

- 提供默认值（`?? fallback`）
- try-catch 捕获
- 转换为 `Result<T, E>` 显式错误结构体
- 提前 parse 校验

## 注意

HandleFallible 不能用于"否认自身的 Fallible"。如果函数自身返回 `T | null`，它就是 【Fallible】 的，HandleFallible 不改变这一点。要去掉自身的 Fallible，必须改签名使其不返回 null。
