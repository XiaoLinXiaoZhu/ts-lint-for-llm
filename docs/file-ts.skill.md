# file-ts：一函数一文件的代码组织格式

一个目录 = 一个模块。目录中的 .fts / .type.fts 文件由 `fts-compile` 编译为 `index.ts`。外部消费方用标准路径导入：`import { fetchUser } from "./api"`。

## 文件名即标识符

文件名是 kebab-case，编译器自动转换为代码标识符。**文件内容不含任何名字。**

### .fts → `const` (camelCase)

| 文件名 | 编译产物标识符 |
|--------|---------------|
| `fetch-user.fts` | `export const fetchUser` |
| `build-openai-streaming-params.fts` | `export const buildOpenaiStreamingParams` |
| `_internal-validate.fts` | `const internalValidate`（`_` 前缀 = 不 export） |

### .type.fts → `type` (PascalCase)

| 文件名 | 编译产物标识符 |
|--------|---------------|
| `player-state.type.fts` | `export type PlayerState` |
| `llm-config.type.fts` | `export type LlmConfig` |

### 命名最佳实践

文件名优先用描述性长名字——`ls *.fts` 就是 API 文档：

```
build-openai-streaming-params.fts      优于  params.fts
send-private-messages-to-user.fts      优于  send.fts
classify-qq-message-event.fts          优于  classify.fts
```

## .fts 文件结构

```
┌─ fetch-user.fts ──────────────────────────────┐
│ /** @capability IO Async Fallible */           │  ← 首行：能力声明（纯函数用 /** @capability */）
│ (id: string): Promise<User | null> => {        │  ← 匿名箭头函数（不含函数名）
│   const client = new OpenAI();                 │
│   return client.users.retrieve(id);            │
│ }                                              │
│ import OpenAI from "openai";                   │  ← 尾部：import（编译器提取去重）
└────────────────────────────────────────────────┘
```

- **首行** `/** @capability ... */`：声明能力，格式与标准 .ts 一致。8 种能力见 `capability-lint --help`
- **函数体**：匿名箭头函数或匿名 `async function*()`（generator 场景）
- **尾部 import**：写到哪用到什么就在末尾补，编译器从所有文件中提取、去重、合并到产物顶部

## .type.fts 文件结构

内容是 `type X =` 右侧的类型体：

```
┌─ player-state.type.fts ───────────────────────┐
│ {                                              │
│   readonly lyrics: readonly LyricLine[];       │
│   readonly currentTime: number;                │
│   readonly playing: boolean;                   │
│ }                                              │
│ import type { LyricLine } from "../lyrics";    │  ← 同样支持尾部 import
└────────────────────────────────────────────────┘
```

## index.fts

非 import 内容原样输出到编译产物中，用于放置常量、类型别名、re-export 等共享声明。import 声明与其他文件的 import 一起去重合并。

## 同目录共享作用域

同目录下的 .fts / .type.fts 互相引用无需 import——它们编译到同一个文件中。

```
player/
  player-state.type.fts        ← 定义 PlayerState 类型
  create-player.fts            ← 函数体中直接用 PlayerState，无需 import
```

## 工具

```bash
fts-compile player/              # 编译单个目录
fts-compile --all                # 编译项目中所有 fts 目录
fts-compile --all --watch        # 监听文件变化，自动重新编译
capability-lint                  # 诊断直接指向 .fts 源文件
capability-lint --fix            # 修改 .fts 首行 @capability + 自动重编译
capability-lint --help           # 查看能力体系完整说明
```

## 迁移现有模块

### 第 1 步：建立基线

把 `math.ts` 整个移为 `math/index.fts`，内容不改：

```bash
mkdir math && mv math.ts math/index.fts
fts-compile math/
```

index.fts 原样输出为 `math/index.ts`，外部 import 路径不变。验证工具链正常。

### 第 2 步：拆分

对每个函数 write 一个 .fts，对每个类型 write 一个 .type.fts，write 精简后的 index.fts。

### 注意事项

- 箭头函数返回对象字面量时加括号：`=> ({ ... })`
- generator 用匿名 `async function*() {}`，仍然不含函数名
- 一个目录不超过 ~20 个文件，超过时按领域拆子目录
