---
alias:
  - fts
  - 函数文件
---

# fts文件

一函数一文件。文件内容是一个【匿名表达式】，不含函数名。

## 编译语义

```
{filename}.fts  →  export const {camelCase(filename)} = {文件内容}
```

【编译器】从文件名按【文件命名】规则提取 camelCase 标识符。按【可见性】决定是否加 `export`。

## 能力声明

首行若为 `/** @capability ... */`，编译器原样保留。格式与标准 .ts 的 JSDoc 一致，见【能力声明】。

## 作用域

同目录下的 .fts / 【type.fts文件】【同目录共享作用域】，互相引用无需 import。外部依赖在【index.fts】中声明。

## 示例

```
┌─ toggle-player-playing-state.fts
│ /** @capability */
│ (state: Readonly<ImmutablePlayerState>): ImmutablePlayerState =>
│   ({ ...state, playing: !state.playing })
└─
```

编译产物：

```ts
/** @capability */
export const togglePlayerPlayingState =
(state: Readonly<ImmutablePlayerState>): ImmutablePlayerState =>
  ({ ...state, playing: !state.playing })
```
