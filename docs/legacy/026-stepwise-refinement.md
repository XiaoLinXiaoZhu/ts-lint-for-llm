# 逐步求精 (Stepwise Refinement)

## 是什么

从最高层的问题描述开始，用自然语言或伪代码写出解决方案的骨架，然后逐步将每一个高层步骤细化为更具体的子步骤，直到每个步骤都可以直接翻译为编程语言代码。每一步细化都保持前一步的正确性。

这是一种**自顶向下的设计方法**：先确定"做什么"，再逐步决定"怎么做"。

## 历史相关渊源

Niklaus Wirth 在 1971 年发表的 "Program Development by Stepwise Refinement" 是这一方法的经典论文。他以一个简单的"8 皇后问题"为例，展示了如何从抽象描述逐步细化到可执行的 Pascal 代码。

Edsger Dijkstra 在 1968–1972 年间的系列论文（包括著名的 "Go To Statement Considered Harmful"）从理论层面支撑了自顶向下设计：只有结构化的程序才能被逐步求精。

1970 年代这一方法被写入几乎所有计算机科学教材，成为教学的标准方法。但 1980 年代面向对象编程兴起后，"自顶向下"被"自底向上"（先构建可复用对象再组合）和"中间向外"（从领域模型出发）所取代。

## TypeScript 代码举例

```typescript
// ---- 逐步求精过程：实现一个 Markdown 解析器 ----

// === 第 0 层：最高层抽象 ===
// function parseMarkdown(input: string): Document {
//   将输入拆分为块级元素
//   对每个块级元素解析内联元素
//   返回文档树
// }

// === 第 1 层：细化块级解析 ===
function parseMarkdown(input: string): Document {
  const lines: string[] = splitIntoLines(input);
  const blocks: Block[] = parseBlocks(lines);
  const richBlocks: Block[] = blocks.map(
    (block: Block): Block => parseInlineElements(block)
  );
  return { blocks: richBlocks };
}

// === 第 2 层：细化 parseBlocks ===
// "将行分组为块级元素"细化为：
function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let cursor: number = 0;

  while (cursor < lines.length) {
    const line: string = lines[cursor];

    if (line.startsWith("# ")) {
      blocks.push(parseHeading(line));
      cursor++;
    } else if (line.startsWith("```")) {
      const [codeBlock, newCursor] = parseCodeBlock(lines, cursor);
      blocks.push(codeBlock);
      cursor = newCursor;
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      const [list, newCursor] = parseList(lines, cursor);
      blocks.push(list);
      cursor = newCursor;
    } else if (line.trim() === "") {
      cursor++; // 跳过空行
    } else {
      const [paragraph, newCursor] = parseParagraph(lines, cursor);
      blocks.push(paragraph);
      cursor = newCursor;
    }
  }

  return blocks;
}

// === 第 3 层：细化每个解析函数 ===
function parseHeading(line: string): HeadingBlock {
  const match: RegExpMatchArray | null = line.match(/^(#{1,6})\s+(.+)$/);
  const level: number = match ? match[1].length : 1;
  const text: string = match ? match[2] : line;
  return { type: "heading", level, text, inline: [] };
}

function parseCodeBlock(lines: string[], start: number): [CodeBlock, number] {
  const langMatch: RegExpMatchArray | null = lines[start].match(/^```(\w*)$/);
  const language: string = langMatch?.[1] ?? "";
  const contentLines: string[] = [];
  let cursor: number = start + 1;

  while (cursor < lines.length && !lines[cursor].startsWith("```")) {
    contentLines.push(lines[cursor]);
    cursor++;
  }

  return [
    { type: "code", language, content: contentLines.join("\n") },
    cursor + 1, // 跳过结束的 ```
  ];
}

// ... 每个函数都是上一层某个"步骤"的细化
```

## 为什么被抛弃

1. **假设问题可以自顶向下分解**：现实中很多问题的结构只有在写了部分代码后才清晰，无法预先做全局分解
2. **与面向对象冲突**：OOP 鼓励从领域对象出发构建，而非从顶层流程出发分解
3. **过于线性**：真实的开发过程是探索性的、迭代的，不是从上到下的瀑布
4. **伪代码阶段被视为浪费**：直接写代码比先写伪代码再翻译更快
5. **测试驱动替代**：TDD 提供了另一种增量构建程序的方法，且有测试保护

## 是否应该在 LLM 时代重新启用

**应该——逐步求精是给 LLM 下达复杂任务的最佳方式。** 理由：

- LLM 在一次生成大量复杂代码时容易出错。但如果你先让 LLM 生成高层骨架（第 0 层），审核后再逐函数让 LLM 细化（第 1、2、3 层），每一步都更可控。
- 逐步求精天然产生**层次清晰的代码结构**——高层函数调用低层函数，每个函数职责单一。这恰好是最容易被 LLM 理解和修改的代码形态。
- "伪代码阶段是浪费"在 LLM 时代翻转了：伪代码是 LLM 最好的输入。写 5 行伪代码比写 50 行详细 prompt 更高效。
- 逐步求精过程中的每一层都是天然的 commit 点——可以逐层审查、逐层测试。

建议：对复杂功能采用"人写骨架 → LLM 逐步细化"的工作流。第 0 层由人用伪代码/注释/TypeScript 签名定义结构，后续每层由 LLM 填充实现，人审查后继续细化。

## 我的看法

这实际上是接口思路。

先抽象解耦的最小接口，才有接口后面不断细化实现的空间。

## AI 回复

你的解读比我更准确。我把逐步求精理解为"开发过程"（先写骨架再填充），你把它理解为"代码结构"（先定义抽象接口，接口后面才有细化空间）。

后者是一个关于**代码应该怎么写**的主张：模块应该通过抽象接口对外暴露能力，实现细节在接口后面可以随时替换。这又是最小接口原则（021）的另一个面。

我原文的"人写骨架 → LLM 逐步细化"工作流建议不是你关心的；你关心的是这种工作流产生的**代码结构本身**——清晰的接口层次，每层职责单一。
