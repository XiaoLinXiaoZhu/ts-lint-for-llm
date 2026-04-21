---
alias:
  - index
---

# index.fts

目录中的特殊文件。【编译器】将其非 import 内容原样输出到【编译产物】中（import 行参与【import提取】统一去重）。

用于放置模块级共享声明：常量、类型别名、re-export 等。

```
┌─ index.fts
│ import type { LLMConfig } from "@v11/types";
│
│ export const DEFAULT_MODEL = "gpt-4o";
└─
```

import 声明不必集中在 index.fts——各【fts文件】可以自带 import（见【import提取】）。index.fts 中的 import 与其他文件的 import 一起去重合并。
