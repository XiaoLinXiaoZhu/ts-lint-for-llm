# 架构决策记录 (Architecture Decision Records, ADR)

## 是什么

为每一个重要的技术/架构决策写一份结构化的短文档，记录：背景、考虑过的方案、最终选择、理由、后果。文档以编号形式存放在代码仓库中（通常是 `docs/adr/` 目录），随代码一起版本管理。

## 历史相关渊源

ADR 的概念由 Michael Nygard 在 2011 年的博客文章中正式提出，但思想可追溯到更早的软件架构文档化运动。2020 年前后，Thoughtworks 在 Technology Radar 中多次推荐 ADR，GitHub 上也出现了 `adr-tools` 等 CLI 工具。

尽管被广泛推荐，实际采用率始终很低。大多数团队在项目初期写了几篇 ADR 后就停止更新，变成了"死文档"。

## TypeScript 代码举例

ADR 本身是文档而非代码，但它经常关联到代码中的结构选择。以下展示一个 ADR 驱动的代码组织：

```typescript
// docs/adr/007-use-discriminated-unions-over-class-hierarchy.md 中记录了决策：
// 用可辨识联合代替类继承来表示消息类型。
// 理由：1. 编译期穷举检查 2. 序列化简单 3. 不需要 instanceof

// 对应代码实现：
type Message =
  | { kind: "text"; content: string; timestamp: number }
  | { kind: "image"; url: string; width: number; height: number }
  | { kind: "file"; filename: string; sizeBytes: number };

function renderMessage(msg: Message): string {
  switch (msg.kind) {
    case "text":
      return `<p>${msg.content}</p>`;
    case "image":
      return `<img src="${msg.url}" width="${msg.width}" height="${msg.height}" />`;
    case "file":
      return `<a href="/download/${msg.filename}">${msg.filename} (${msg.sizeBytes}B)</a>`;
  }
}

// 如果新增消息类型，编译器会在 switch 处报错，强制更新所有处理逻辑。
// 这个决策的 trade-off（无法使用多态 dispatch）记录在 ADR-007 中。
```

## 为什么被抛弃

1. **写作负担**：写一篇好的 ADR 需要 30-60 分钟，开发者更愿意把时间花在写代码上
2. **格式仪式感**：编号、模板、状态流转等元数据维护让人疲惫
3. **死文档问题**：决策发生变化后很少有人回去更新旧 ADR，导致文档与现实脱节
4. **口头传统**：多数团队靠 Slack 讨论和口头共识做决策，没有书写的习惯
5. **回报滞后**：ADR 的价值在 6 个月甚至 2 年后新人入职时才体现，短期看不到收益

## 是否应该在 LLM 时代重新启用

**强烈应该。ADR 可能是 LLM 时代收益增幅最大的实践之一。** 理由：

- LLM 可以从 PR 描述、代码评审评论、Slack 记录中自动草拟 ADR，极大降低写作负担。
- 更关键的是：ADR 是 LLM 理解项目"为什么这样做"的最佳上下文。没有 ADR，LLM 只能看到代码是什么样的，但不知道为什么选了这个方案、拒绝了哪些替代方案。
- 当 LLM 要修改架构级代码时，ADR 能防止它无意中推翻一个经过深思熟虑的决策。
- "死文档"问题也被缓解：LLM 可以在 CI 中检测 ADR 与代码的不一致并提醒更新。

建议：让 LLM 负责 ADR 的初稿生成和持续维护，人类负责审核和决策判断。

## 我的看法

严重错误。这违背了SSOT原则，这让关键决策得再文档和代码之间来回维护，当业务逻辑变化，决策文档不能够很好的跟随代码变化。

正确的做法是 代码作为 SSOT，永远不应该有从代码向文档 的引用。这类决策应该使用注释的形式直接放在相关代码的附近，和代码一起维护。

## AI 回复

你说的对，我犯了一个基本错误。ADR 作为独立文档违反了 SSOT——决策的描述和决策影响的代码分开存放，必然会不同步。

你的纠正很清晰：**决策注释应该直接放在被决策影响的代码旁边**。比如在选择了可辨识联合而非类继承的地方，直接写注释说明为什么。这样改代码的人（无论是人还是 LLM）看到的是一个整体，不需要去别的地方找理由。

我之所以推荐 ADR，是因为我在"旧实践复兴"的框架里思考，而没有从你的核心原则（代码 = SSOT）出发。如果遵循 SSOT，ADR 作为独立文档确实是多余的中间层。

不过有一个边界情况：跨多个文件的架构决策（比如"整个项目用 Result 类型而非异常"）放在任何单个文件旁边都不合适。这类系统级决策放在 AGENTS.md / 编码规范中更合理——而你在 018 中已经认同了这个方向。
