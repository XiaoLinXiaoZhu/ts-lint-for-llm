# 严格的 TDD 红-绿-重构循环 (Strict TDD)

## 是什么

Test-Driven Development 的严格形式要求：
1. **红**：先写一个会失败的测试（不写任何实现代码）
2. **绿**：写最少量的代码让测试通过（不多写一行）
3. **重构**：在测试保护下重构代码（不改变行为）

严格 TDD 禁止在没有失败测试的情况下编写任何实现代码。每个循环应在 1-5 分钟内完成。

## 历史相关渊源

TDD 由 Kent Beck 在 1999–2003 年间系统化阐述，2002 年出版的 *Test-Driven Development: By Example* 是奠基之作。

其思想根源更早——Kent Beck 声称灵感来自 1960 年代 NASA 的 Mercury 项目，以及 Dijkstra 的"程序的正确性必须与程序一起构造"的理念。

2003–2008 年是 TDD 的狂热期，许多敏捷咨询公司将其作为"必须遵守的纪律"推广。Robert C. Martin (Uncle Bob) 提出了"TDD 的三条法则"进一步强化了严格性。

2014 年 David Heinemeier Hansson (DHH) 发表 "TDD is dead" 激发了大辩论。此后社区逐渐接受"TDD 是有用的工具但不是宗教"的立场。

## TypeScript 代码举例

```typescript
// ---- 严格 TDD 过程演示：实现一个 Stack ----

// === 循环 1: 红 → 绿 ===

// 红：写测试
// test("new stack is empty", () => {
//   const stack = new Stack<number>();
//   expect(stack.isEmpty()).toBe(true);
// });

// 绿：最少代码通过
class Stack<T> {
  isEmpty(): boolean {
    return true; // 硬编码——严格 TDD 要求"最少量代码"
  }
}

// === 循环 2: 红 → 绿 ===

// 红：写下一个测试
// test("stack with one push is not empty", () => {
//   const stack = new Stack<number>();
//   stack.push(1);
//   expect(stack.isEmpty()).toBe(false);
// });

// 绿：不得不引入真正的实现
class Stack<T> {
  private items: T[] = [];
  push(item: T): void {
    this.items.push(item);
  }
  isEmpty(): boolean {
    return this.items.length === 0;
  }
}

// === 循环 3: 红 → 绿 ===

// 红：
// test("pop returns last pushed item", () => {
//   const stack = new Stack<number>();
//   stack.push(42);
//   expect(stack.pop()).toBe(42);
// });

// 绿：
class Stack<T> {
  private items: T[] = [];
  push(item: T): void {
    this.items.push(item);
  }
  pop(): T {
    return this.items.pop()!;
  }
  isEmpty(): boolean {
    return this.items.length === 0;
  }
}

// === 循环 4: 红 → 绿 ===

// 红：
// test("pop on empty stack throws", () => {
//   const stack = new Stack<number>();
//   expect(() => stack.pop()).toThrow("Stack is empty");
// });

// 绿：
class Stack<T> {
  private items: T[] = [];
  push(item: T): void {
    this.items.push(item);
  }
  pop(): T {
    if (this.items.length === 0) throw new Error("Stack is empty");
    return this.items.pop()!;
  }
  isEmpty(): boolean {
    return this.items.length === 0;
  }
}

// === 重构阶段 ===
// 在所有测试通过的保护下，可以安全重构：
// - 提取 peek() 方法
// - 添加 size getter
// - 不改变任何已有行为
```

## 为什么被抛弃

1. **节奏太慢**：对于已经知道如何实现的功能，"先写失败测试"感觉是浪费时间
2. **"最少代码"原则反直觉**：硬编码 `return true` 来通过第一个测试让开发者觉得在做无意义的工作
3. **不适合探索性编程**：当你不确定 API 应该长什么样时，先写测试会锁定错误的接口
4. **测试驱动设计被过度神化**：TDD 确实能驱动更好的接口设计，但并非唯一途径
5. **遗留代码困境**：对没有测试的遗留代码，不可能用 TDD 方式添加功能——要先写测试就需要先重构，要重构又需要先有测试

## 是否应该在 LLM 时代重新启用

**核心纪律应该复兴，但工作流要调整。** 理由：

- 严格 TDD 最大的好处不是"先写测试"本身，而是**产生了高质量的测试套件作为副产品**。在 LLM 时代，这个副产品比以往更重要——测试是验证 LLM 生成代码正确性的基石。
- LLM 可以从函数签名瞬间生成测试套件（红阶段），然后生成实现（绿阶段），最后重构。整个 TDD 循环在 LLM 辅助下可以在秒级完成，"节奏太慢"的问题消失了。
- 但"最少代码"原则在 LLM 时代确实不需要——LLM 可以直接生成完整实现，不需要通过硬编码来"小步前进"。
- 最有价值的模式：**人写测试（表达意图），LLM 写实现（满足测试）**。这保证了测试的独立性——测试不是由同一个"作者"生成的。

建议：采用"人写测试 → LLM 写实现"或"LLM 先生成测试 → 人审核测试 → LLM 生成实现"的流程。核心原则是测试和实现不应由同一方（无论是人还是 LLM）在同一次交互中生成。

## 我的看法

不符合实际工作流。它要求我们构建完备的test断言后才开始不断写代码。

但是实际llm写代码时，更倾向于一次性重写，而不是逐步类似扩散模型一样逐步生成。

而且这里可能带来一个严重的问题——代码的每一部分都没有在一个全局的视角下完成设计，这可能导致每一部分无法构建足够的信息。导致各个地方反复校验以满足测试，整体代码像是使用补丁堆砌而否构建心智模型。

## AI 回复

你的批评很到位。我犯了一个关于 LLM 工作模式的认知错误。

我假设 LLM 可以像人一样"小步前进"——先写一个测试，再写一点实现，再写一个测试。但现实是 LLM 更擅长在理解全局上下文后一次性生成完整方案。强制拆成 TDD 小步会导致每一步都缺乏全局视角，最终代码像补丁堆砌。

你描述的"无法构建心智模型"问题，本质上是说：TDD 的增量式方法假设知识是逐步积累的，但 LLM 的知识是一次性摄入的。把 LLM 塞进 TDD 循环 = 用错误的抽象约束工具。

回到代码本身——TDD 不改变代码的最终形态，只改变代码的生成过程。这也不在你的讨论范围内。