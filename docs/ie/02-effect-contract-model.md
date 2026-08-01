# 2. Effect 与接口契约

## 2.1 自动推断优先

本地函数不需要逐函数声明副作用。工具从函数定义推断：

- `async`：函数修饰符和返回类型。
- `may-return-none`：返回类型和调用结果。
- `mutates-input`：参数符号的真实写入。
- 调用效果：由下游函数和外部源头传播。

只有无法从本地代码推断的源头使用 `@effect`。

## 2.2 `@is`

`@is` 是模型或开发者指定的接口期望，不是事实声明：

```ts
/** @is pure total readonly */
export function transform(input: Input): Output {}
```

工具将期望与推断结果比较，报告实际来源和调用路径。

## 2.3 `@handles`

处理声明必须有证据：

```ts
/** @handles may-return-none */
function parseOrDefault(input: string): Value {
  return parse(input) ?? fallback;
}
```

没有默认值、异常转换、隔离副本或输出收敛证据时，报告 `unproven-handling`。

处理声明不能否认函数自身产生的 Effect。

## 2.4 传播

```text
函数效果 = 自身效果 + 下游效果 - 已证明处理的效果
```

所有 Effect 默认沿调用图向上传播。模型应优先缩小副作用边界，而不是用标签隐藏传播。
