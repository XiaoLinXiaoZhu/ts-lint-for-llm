# .fts/.tts 工作空间协议——AI 原生的代码组织格式

> 来源：对 ChatFrame-v11 的实际开发场景分析。核心发现：AI 操作代码的最大瓶颈不是"写"，而是"定位和修改"——read 130 行文件只为改 4 行代码，edit 操作有状态依赖且可能破坏相邻代码。本协议通过"一函数一文件 + 文件名即名字"彻底消除这两个问题。

## 核心语义

三种文件，完全对称：

| 后缀 | 文件内容 | 编译产物 |
|------|---------|---------|
| `.fts` | 匿名函数表达式 | `export const {filename} = {content}` |
| `.tts` | 类型体 | `export type {Filename} = {content}` |
| `index.fts` | import 语句 | 原样输出 |

**SSOT：名字只在文件名中存在。** 文件内容不含任何名字——不含 `function xxx`，不含 `type Xxx =`。编译器从文件名提取标识符并拼接。

## 格式规范

### .fts（函数）

```
┌─ toggle-play.fts
│ (state: Readonly<PlayerState>): PlayerState =>
│   ({ ...state, playing: !state.playing })
└─
```

- 文件内容是一个匿名表达式（箭头函数、匿名 `function*()`、或其他值表达式）
- 首行 `//` 注释为能力声明，编译为 `/** @capability ... */`
- 纯函数可省略首行注释
- 同目录下的 .fts/.tts 共享作用域（互相引用无需 import）

### .tts（类型）

```
┌─ player-state.tts
│ {
│   readonly lyrics: readonly LyricLine[];
│   readonly currentTime: number;
│   readonly playing: boolean;
│   readonly activeLine: number;
│ }
└─
```

- 文件内容是 `type X =` 右侧的类型体
- 对象类型、联合类型、简单别名均可

### index.fts（外部依赖）

```
import type { StreamEvent, LLMConfig } from "@v11/types";
import OpenAI from "openai";
```

所有外部包的 import 集中声明于此，编译器原样输出到产物顶部。

### 可见性

- 文件名不以 `_` 开头 → `export`（公开）
- 文件名以 `_` 开头 → 不 export（模块内部）

## 编译

编译器（`proto/fts-compiler/compile.ts`，约 120 行）将一个目录合并为一个 `.gen.ts` 文件：

```
player/
  lyric-line.tts
  player-state.tts
  display-line.tts
  create-player.fts       →    player.gen.ts
  tick.fts                      （标准 TypeScript，
  seek.fts                       带 import/export，
  toggle-play.fts                可直接 tsc 编译）
  render.fts
  index.fts
```

编译产物是标准 TypeScript——tsc、linter、IDE 直接消费，无需任何工具链改动。

## 实验数据

用歌词滚动播放器做了完整的双版本对比（代码在 `proto/`）。

### 文件结构

| | 标准 module | .fts/.tts |
|---|---|---|
| 文件数 | 1 (player.ts, 145行) | 15 (中位数 5行, 最大 11行) |
| 函数名出现次数 | 2 (定义 + export) | 1 (仅文件名) |
| import/export 行数 | ~10 | 0 |

### 添加功能（seekByText 歌词反查跳转）

| | 标准 module | .fts |
|---|---|---|
| 操作 | read 145行 → edit 插入 | write 2 个新文件 |
| 需要阅读的代码 | 145 行 | 0 行 |
| 触碰已有文件 | 是（player.ts） | 否 |
| 操作幂等性 | 否（依赖文件当前状态） | 是 |

### 修复 lint 告警（6 个函数参数缺少 Readonly）

| | 标准 module | .fts |
|---|---|---|
| 操作 | 6 次串行 edit | 6 次并行 write（一个 batch） |
| 交互轮次 | 6+ 轮 | 1 轮 |
| capScore | 43.5 → 需逐个修 | 43.5 → 15.0（一次搞定） |
| 纯函数比 | 4/11 | 10/11 |

### ChatFrame-v11 全量预估（98 函数 / 14 文件 / 1001 行）

最大收益模块 runtime.ts（211 行 / 31 函数）：
- 改 routeCommand：read 211行 → write 4行，阅读量降 98%
- 加新命令：read 211行 + edit → write 新文件，阅读量降 100%
- 批量修复 20 个 lint 告警：20+ 轮串行 → 1 轮并行 write

## 与能力标注体系的协同

.fts 天然与 011-capability-enforcement 对齐：

- **一个 .fts = 一个函数 = 一组 `@capability` 标注 = 一个评分单元**
- 首行 `// IO Async` 注释直接编译为 `/** @capability IO Async */`
- linter 诊断可以映射回 .fts 文件名——AI 看到告警直接 write 对应文件

## 设计决策记录

### 为什么是匿名表达式而非 `function xxx`？

SSOT。函数名在文件名中已经存在一次，如果文件内容再写一次 `function togglePlay`，改名时要同步两处。`const {filename} = (匿名表达式)` 的编译语义让名字只存在于文件名。

### 为什么不用箭头函数统一所有场景？

JavaScript 箭头函数不支持 generator（`function*`）。async generator 必须写 `async function*(...)` 形式的匿名函数表达式。ChatFrame 中 92% 函数用箭头，8% 的 generator 用匿名 `function*()`——两者都不含名字，SSOT 不受影响。

如需完全消除 `function*` 关键字，可引入流组合子库（map/flatMap/concat/catchMap），将 generator 封装为基础设施。

### 为什么 .tts 而非 .fts 中写 type？

类型和函数的编译语义不同（`type X = body` vs `const x = body`），用不同后缀让编译器做正确的拼接。同时 `ls *.tts` 可以单独看到所有类型定义。

### 为什么整个目录编译为一个 .ts？

不需要处理文件间 import 关系——同目录 = 同作用域。编译器只做拼接、加 export、加能力注释，不需要 AST 解析或符号解析。这让编译器保持在 120 行以内。

## 风险分析

### 1. 循环依赖不可见

同目录的 .fts 共享作用域，编译产物是一个文件，所以函数 A 调用 B、B 调用 A 不会报错。在标准模块中这种循环依赖至少会被 `import` 拓扑暴露出来。

**缓解**：linter 的能力传播分析（011）可以检测循环调用链。此外，纯函数之间的循环调用本身不常见——如果出现，通常意味着需要提取公共函数。

### 2. 目录过大时可读性下降

如果一个目录有 50+ 个 .fts 文件，`ls` 本身变成了噪音。

**缓解**：子目录分层。一个目录 = 一个模块，超过 ~20 个文件时拆成子目录。编译器可以递归支持子目录编译。实际上 ChatFrame 最大的 runtime.ts（31 函数）拆开后就接近上限——但 31 个文件比 1 个 211 行文件对 AI 仍然更友好。

### 3. 编译产物中函数顺序影响可用性

JavaScript 的 `const` 没有提升（hoisting），不像 `function` 声明。如果 A 在文件中出现在 B 之前但 A 调用了 B，运行时可能报错。

**缓解**：当前编译器按字母序排列（类型优先、私有优先）。可以增强为拓扑排序——扫描函数体中引用的同目录符号，确保被依赖方先出现。但实际上，`const` 箭头函数作为表达式赋值，只要在调用时（而非定义时）被引用方已经初始化即可。模块顶层的函数定义在模块加载时全部执行，所以只有"模块加载期间"的互相引用才有问题——这在实践中极少出现。

### 4. generator 的 `function*` 仍需要关键字

8% 的函数（async generator）无法用箭头表达，需要写 `async function*(...)` 匿名函数表达式。这是 JavaScript 语言层面的限制。

**缓解**：流组合子库可以将 generator 封装为基础设施，业务 .fts 100% 纯箭头。或接受这 8% 的例外——它们仍然满足 SSOT（无名字）。

### 5. 人类开发者的 IDE 体验

.fts/.tts 不是标准 TypeScript 文件，IDE 不能直接提供类型检查和自动补全。人类查看和编辑这些文件时没有 IntelliSense。

**缓解**：
- 人类阅读编译产物 .gen.ts（标准 TS，完整 IDE 支持）
- 人类在极少情况下需要直接编辑 .fts——AI 负责写，人负责审阅产物
- IDE 可配置 .fts/.tts 使用 TypeScript 语法高亮（内容是合法 TS 片段）
- 未来可开发轻量级 LSP 插件：读取编译产物的类型信息，反向提供给 .fts 编辑器

### 6. 与现有工具链的兼容性

测试框架、打包工具、CI 流水线期望 .ts 文件。

**缓解**：编译产物就是标准 .ts，所有工具链照常工作。.fts/.tts 只是源码格式，不进入运行时。`bun compile.ts dir/` 作为 build step 加入 CI 即可——类似 TypeScript 的 `tsc` 步骤。

## 未来方向

### 文件相似度驱动的自动重构

一函数一文件的格式天然适合相似度分析——每个文件是一个独立单元，可以直接计算函数签名和函数体的结构相似度。当两个 .fts 文件的参数模式和逻辑结构高度相似时，自动建议提取公共函数或泛型化。这在标准模块中需要先做 AST 拆分才能比较，.fts 中零成本。

### linter 诊断直接映射到 .fts 文件

当前 linter 报告 `player.gen.ts:97`，需要人工追溯到 `seek-by-text.fts`。编译器可以生成 source map 或在产物中嵌入 `// @source seek-by-text.fts` 注释，让 linter 直接报告 `seek-by-text.fts:2`。AI 看到诊断后直接 write 对应文件，形成闭环。

### 跨目录引用

当前编译器只支持同目录共享作用域。跨目录引用需要在 `index.fts` 中 import。未来可支持 `../common/` 这样的相对目录引用，编译器自动生成跨模块 import。
