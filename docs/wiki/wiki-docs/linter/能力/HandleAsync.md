# HandleAsync

阻断能力。表示函数处理了 callee 传来的 【Async】，使异步性不再向上传播。

## 示例

```ts
/** @capability IO HandleAsync */
function scheduleLoad(): void {
  loadData()                   // loadData 返回 Promise<Data>（Async）
    .then(processData)         // fire-and-forget
    .catch(logError);          // 带错误处理
  // 自身返回 void（非 Promise），Async 不再传播
}
```

## 合法的处理方式

- await 后同步返回结果（函数自身不标 async）
- fire-and-forget + 错误处理（`.then().catch()`）
- 转为回调 / 事件模式

## 注意

HandleAsync 不能用于"否认自身的 Async"。如果函数自身是 async 或返回 Promise，它就是 【Async】 的。
