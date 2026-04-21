---
alias:
  - import合并
  - 自带import
---

# import提取

【fts文件】中可以包含 import 语句。【编译器】从所有文件中提取 import 行，去重后合并到【编译产物】顶部。

## 写法

import 写在函数体之后（尾部追加）。模型自上而下写函数逻辑，发现需要外部依赖时直接在末尾补 import，无需切换到【index.fts】。

```
┌─ fetch-user.fts
│ /** @capability IO Async */
│ (id: string): Promise<User> => {
│   const client = new OpenAI();
│   return client.chat.completions.create({ model: "gpt-4o" });
│ }
│ import OpenAI from "openai";
└─
```

## 编译器行为

1. 对每个 .fts / .type.fts 文件，提取所有 `import` 开头的行（含 `import type`），剩余部分为函数体 / 类型体
2. 对【index.fts】同样提取 import 行，非 import 内容（常量、类型别名等）保留在原位
3. 所有 import 行按精确字符串去重
4. 去重后的 import 输出到【编译产物】最顶部（在 AUTO-GENERATED 注释之后）

## 与 index.fts 的关系

【index.fts】仍然可用，用于放置共享的常量、类型别名、re-export 等非 import 内容。import 声明既可以写在 index.fts 中，也可以写在各 .fts 文件中——编译器统一提取去重，效果一致。

## 相对路径

.fts 文件与【编译产物】 index.ts 在同一目录下，因此 .fts 中写的相对路径在编译产物中同样有效：

```
┌─ use-helper.fts
│ /** @capability */
│ (x: number): number => externalHelper(x)
│ import { externalHelper } from "../shared/helpers";
└─
```

## 去重规则

精确字符串匹配：两个文件中出现完全相同的 import 行，只保留一份。
