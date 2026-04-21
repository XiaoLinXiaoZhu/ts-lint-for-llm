# HandleMutable

阻断能力。表示函数处理了 callee 传来的 【Mutable】，使变异性不再向上传播。

## 示例

```ts
/** @capability HandleMutable */
function displaySorted(items: readonly string[]): string[] {
  const copy = [...items];     // 拷贝
  sortItems(copy);             // sortItems 是 Mutable，但传入的是局部拷贝
  return copy;                 // 原 items 未被修改，Mutable 不再传播
}
```

参数是 `readonly string[]`，自身不触发 【Mutable】。内部拷贝后传给 Mutable 的 sortItems，变异被隔离在函数内部。

## 合法的处理方式

- 传入局部拷贝（`[...arr]`、`{ ...obj }`、`structuredClone()`）
- 在函数内部创建新对象传给 callee

## 注意

HandleMutable 不能用于"否认自身的 Mutable"。【Mutable】 的判定依据是参数类型：参数为非 readonly 引用类型（如 `string[]`、`State`）就是 Mutable，无论函数体内做了什么。要使自身不触发 Mutable，参数必须是值类型或 readonly 类型（如 `readonly string[]`、`Readonly<State>`）。
