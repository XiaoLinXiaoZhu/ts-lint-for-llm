# 1. 系统定义

## 1.1 输入—处理—输出

输入：`tsconfig.json`、TypeScript 源码、外部 `@effect` 声明和用户选定的 `@is` 契约。

处理：AST/符号事实提取 → 调用图 → Effect 推断 → 传播与处理验证 → 结构规则。

输出：结构化 diagnostics、证据、建议、扫描统计和退出码。

## 1.2 Effect 定义

| Effect | 定义 |
| --- | --- |
| `io` | 与文件、网络、数据库、进程或外部系统交互 |
| `nondeterministic` | 依赖时间、随机数、全局状态或隐式环境 |
| `may-return-none` | 返回值可能为 `null`、`undefined` 或无结果 |
| `async` | 返回 Promise、AsyncIterable 或其他异步结果 |
| `mutates-input` | 修改调用方传入的可变引用参数 |

## 1.3 Guarantee 定义

| Guarantee | 要求 |
| --- | --- |
| `pure` | 不具有任何 Effect |
| `total` | 不产生 `may-return-none` |
| `readonly` | 不产生 `mutates-input` |
| `sync` | 不产生 `async` |
| `deterministic` | 不产生 `nondeterministic` |
| `local` | 不产生 `io` |
| `minimal` | 不存在参数透传 |
