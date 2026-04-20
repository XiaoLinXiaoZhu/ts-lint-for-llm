# ✅ 任务完成

## 总结

## 反馈：从 LLM 梯度下降优化器的角度

最终分数 573.5（从 1159 降低 50.5%），tsc 通过，35 项测试通过。

---

### 工具做对的事

**`score = ws × numCaps` 是一个优秀的损失函数。** 它有两个正交的优化轴（减少能力数、减少语句数），乘法关系让消除一个 capability 产生强梯度信号。纯函数 score=0 是天然的吸引子——LLM 的每次纯函数提取都能得到即时、可预测的回报。

**Mutable 通过参数类型检测是正确的设计选择。** 它把"全量 readonly"这种人类不愿做但 LLM 能轻松做的事变成了有明确回报的优化动作：加一个 `Readonly<>`，跑一次 linter，score 下降，commit。这正是"对人类太麻烦而被放弃、但 LLM 时代应该重新采用"的编码实践。

**Fallible 通过返回值 `T | null | undefined` 检测，同理。** 之前我的反馈说"太灵敏"是从人类视角出发的。但对 LLM 来说，把 `string | null` 改成 `{ ok: true, value: string } | { ok: false }` 再改调用点是纯机械操作，且能消除一个 capability——这是合理的优化方向。工具在这里把 Result type 模式从"风格偏好"变成了可量化的收益。

---

### 核心问题：`--fix` 掩盖了 `mutable_param` 的梯度信号

这是我浪费最多轮次的地方。过程：

1. 初次运行看到 Mutable: 655.5
2. 运行 `--fix`，它给 ~60 个函数写入了 `@capability Mutable`
3. 再次运行，`mutable_param` 诊断消失（因为已声明）
4. 我看到函数仍然有 Mutable 但没有诊断解释为什么 → 错误归因到函数体的 `let`/`push`
5. 花了 5+ 轮做无效重构

**对 LLM 优化器来说，`--fix` 不应该写入 auto-detected 的 capability。** Auto-detected 能力（Mutable、Fallible、Async）应该始终由 linter 实时计算，而非固化到声明中。`--fix` 只应该写入通过调用链传播的、用户主动声明的能力（IO、Impure）。否则 `--fix` 就像在梯度下降中把 loss 的一个分量冻结了——优化器看不到它可以改变。

具体建议：`--fix` 写入 Mutable 时，使用不同的标记（如 `@capability Mutable(auto)`），让后续运行仍然产生 `mutable_param` 诊断。或者更简单：**`--fix` 永远不写入 Mutable/Fallible/Async，只写入 IO/Impure。**

---

### `--llm` 输出应该面向"下一步操作"而非"当前状态"

LLM 优化器需要的不是完整的诊断列表，而是 **sorted action list**：

```
Action 1: Add Readonly<> to param 'inner' (type LLMPort) in withLogging
  File: packages/llm/logging.ts:57
  Expected saving: -23.5 (removes Mutable from 3-cap function, ws=23.5)

Action 2: Extract pure helper from createOpenAIAdapter (ws=34, 1 cap)
  File: packages/llm/adapter.ts:51
  Lines 67-73 are pure computation (buildCreateParams)
  Expected saving: ~-7 per extracted statement

Action 3: Change return type of usageFromChunk from LLMUsage|undefined to Result<LLMUsage>
  File: packages/llm/adapter.ts:12
  Expected saving: -1 (removes Fallible from 1-cap function, ws=1)
```

每个 action 包含：文件位置、具体操作、预期分数变化。LLM 按 expected saving 降序执行，每步验证。这比让 LLM 自己从 raw diagnostics 推断下一步有效得多。

---

### external.cap.ts 全局名称匹配：对 LLM 优化器是错误信号源

`declare function createSession()` 同时匹配了 `@v11/core.createSession`（IO）和 `api.createSession`（IO Async）。这导致其中一个的能力声明必然是错的——LLM 可能基于错误的能力链做出无效优化。

对 LLM 来说这特别危险：它看到 `createSession` 调用被标记为某种能力，尝试优化，score 不变，无法理解为什么。这是损失函数中的噪声。

建议最低限度支持按调用来源区分：用文件路径或模块名限定。

---

### 这个工具激励的"对人类太麻烦但 LLM 应该采用"的写法

| 写法 | 人类放弃的原因 | LLM 的成本 | 工具如何激励 |
|------|----------------|-----------|------------|
| 全量 `readonly` 字段 + `Readonly<>` 参数 | 打字多、嵌套类型要 DeepReadonly | 机械替换，tsc 验证 | 消除 Mutable，乘法降分 |
| Result 类型替代 `null/undefined` | 定义类型 + 改调用点的样板代码 | 机械重构 | 消除 Fallible |
| 1-2 语句的 IO shell + 纯逻辑 helper | 函数数量爆炸，导航困难 | 命名和拆分是 LLM 强项 | 纯函数 score=0 |
| 每个函数 `@capability` 声明 | 维护负担，容易过时 | `--fix` 自动化 | 精确的能力追踪 |
| 显式 `Readonly<>` 包装外部库类型 | 不了解库的内部结构 | ts-morph 解析 + 试错 | 消除 Mutable 传播 |

---

## 下一步

当前改动未 commit。可以继续优化（主要方向：Result 类型消除 Fallible 29 分、进一步纯函数提取降低 IO/Async 函数的 ws），或先整理 commit。`external.cap.ts` 的命名冲突问题（如 `createSession` 同名不同义）建议优先修复。
