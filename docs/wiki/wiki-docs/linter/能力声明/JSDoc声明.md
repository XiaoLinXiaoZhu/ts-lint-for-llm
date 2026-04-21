---
alias:
  - "@capability"
---

# JSDoc声明

【能力声明】方式之一。在函数前的 JSDoc 注释中使用 `@capability` 标签。

```ts
/** @capability IO HandleFallible */
function getUsername() {}

/** @capability */
function pureCalc() {}    // 空参数 = 纯函数，零能力
```

8 个能力名（IO, Impure, Fallible, Async, Mutable, HandleFallible, HandleAsync, HandleMutable）均可列出，用空格或逗号分隔。

## 注释查找范围

1. 函数声明节点自身的前导注释
2. 若函数是 `const fn = () => {}` 形式，同时查找 VariableStatement 的前导注释
3. 若函数是对象字面量的 PropertyAssignment，查找该 PropertyAssignment 的前导注释

优先级低于【后缀命名】：只有后缀命名未匹配到任何能力时，才检查 JSDoc。
