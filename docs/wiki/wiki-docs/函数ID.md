# 函数ID

【可扫描函数】的全局唯一标识符。

## 格式

```
{filePath}:{pos}
```

- **filePath**：源文件绝对路径
- **pos**：函数声明节点的 `node.getStart()` 字符偏移量（AST 节点文本起始位置）

示例：`/src/api.ts:228`、`/src/greeter.ts:471`

## 为什么用 pos 而不是行号或名称

| 方案 | 问题 |
|------|------|
| `filePath#name` | 同文件同名函数（两个对象各有 `reset`）无法区分 |
| `filePath#name@line` | 行号在编辑后不稳定；格式不统一（顶层函数不带 @line） |
| `fullyQualifiedName` | 匿名对象方法都叫 `__object.reset`，无法区分 |
| `compilerSymbol.id` | PropertyAccess 调用侧拿到的是 transient symbol（id=0），与声明侧不一致 |
| **`filePath:pos`** | 声明节点和调用侧 `symbol.getDeclarations()[0].getStart()` 返回相同值，天然一致 |

## 声明侧与调用侧的一致性

声明阶段：对每个【可扫描函数】，取其 AST 节点的 `getStart()` 生成 ID。

调用解析阶段：对 CallExpression 取 `expr.getSymbol()`，再取 `symbol.getDeclarations()[0]`，该声明节点的 `getStart()` 和 `getSourceFile().getFilePath()` 直接构成目标函数的 ID。**无需 byName 索引，无需二次匹配。**

跨文件调用（import）：调用侧 symbol 的 declaration 可能是 ImportSpecifier，需追踪到源模块的 export symbol 取其声明节点 pos。

## 各形式验证结果

| 函数形式 | 声明侧 pos | 调用侧能否通过 symbol 回溯到同一 pos |
|----------|-----------|--------------------------------------|
| 顶层 function | ✓ | ✓ |
| const = 箭头函数 | ✓ | ✓ |
| 对象方法 | ✓ | ✓ |
| 对象属性箭头函数 | ✓ | ✓ |
| class 方法 | ✓ | ✓ |
| 同文件同名方法 | ✓ 不同 pos | ✓ 各自 pos 不同 |
| 跨文件 import 调用 | ✓ | ✓ 追踪 ImportSpecifier → 源模块 export |
