# Mutable

参数含非 readonly 引用类型，可能修改调用方数据。

传播可阻断：caller 调了带 Mutable 的 callee，必须声明 Mutable（传播）或声明 【HandleMutable】（阻断）。

## 【自动检测】规则

当函数的参数通过【参数可变性检测】判定为非 readonly 引用类型时，自动标记 Mutable 加入 effectiveCaps，产生 【implicit_capability】 信息。

关键区分：
- 参数类型决定是否触发 Mutable，而非函数体内的操作
- 函数体内对局部数组调用 push/sort/splice **不**触发 Mutable
- `items: string[]` 触发；`items: readonly string[]` 不触发

若已显式声明 Mutable，则不产生 implicit_capability 信息。

## 与 HandleMutable 的关系

如果函数自身参数是非 readonly 引用类型，它就是 Mutable 的。HandleMutable 处理的是 callee 传来的 Mutable（如传入局部拷贝），不影响自身的 Mutable 标记。
