---
alias:
  - type.fts
  - 类型文件
---

# type.fts文件

一类型一文件。文件内容是 `type X =` 右侧的类型体，不含 `type` 关键字和类型名。

## 编译语义

```
{filename}.type.fts  →  export type {PascalCase(filename)} = {文件内容}
```

【编译器】从文件名按【文件命名】规则提取 PascalCase 标识符。按【可见性】决定是否加 `export`。

对象类型、联合类型、简单别名均可。

## 示例

```
┌─ lyric-line-with-timestamp.type.fts
│ {
│   readonly time: number;
│   readonly text: string;
│ }
└─
```

编译产物：

```ts
export type LyricLineWithTimestamp = {
  readonly time: number;
  readonly text: string;
}
```
