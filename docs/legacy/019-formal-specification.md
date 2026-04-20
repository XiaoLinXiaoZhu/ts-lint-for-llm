# 形式化规格说明 (Formal Specification)

## 是什么

用数学符号精确描述软件系统"应该做什么"（而非"怎么做"）。规格说明定义了系统的状态空间、操作的前后状态关系、以及必须满足的不变式。规格说明是无歧义的——不像自然语言需求文档那样有解释空间。

## 历史相关渊源

形式化规格说明在 1970 年代末成为学术热点：
- **Z 语言** (1977, Jean-Raymond Abrial, Oxford)：基于集合论和一阶谓词逻辑
- **VDM** (Vienna Development Method, 1970s, IBM Vienna Lab)：最早的形式化方法之一
- **B Method** (1980s, Abrial)：Z 的后继，支持自动精化到代码

1980 年代英国政府要求国防项目使用形式化方法。IBM 的 CICS 项目（1990 年代）用 Z 语言做规格说明，被认为是工业界最成功的形式化方法案例之一。

2000 年代后，除了安全关键领域（航空、核电、密码学），形式化方法在工业界几乎消失。Amazon 在 2014 年发表的 TLA+ 经验报告是少数例外。

## TypeScript 代码举例

```typescript
// Z 语言中对一个简单集合的规格说明大致如下（伪语法）：
//
// ┌─ AddElement ──────────────────────────┐
// │ ΔSet                                   │
// │ element? : Element                     │
// ├────────────────────────────────────────┤
// │ element? ∉ items                       │  ← 前置条件
// │ items' = items ∪ { element? }          │  ← 后置条件
// │ size' = size + 1                       │
// └────────────────────────────────────────┘

// 将形式化规格翻译为 TypeScript，规格成为类型和运行时检查的组合：

// 规格说明：一个不允许重复的有界集合
interface BoundedSetSpec<T> {
  // 状态不变式
  // INV: items.size <= capacity
  // INV: size === items.size

  readonly capacity: number;
  readonly size: number;

  // 操作规格（前置条件 → 后置条件）
  // PRE:  !contains(element) && size < capacity
  // POST: contains(element) && size === old(size) + 1
  add(element: T): void;

  // PRE:  contains(element)
  // POST: !contains(element) && size === old(size) - 1
  remove(element: T): void;

  contains(element: T): boolean;
}

// 实现（带有从规格直接翻译的断言）
class BoundedSet<T> implements BoundedSetSpec<T> {
  private items: Set<T> = new Set();

  constructor(readonly capacity: number) {
    console.assert(capacity > 0, `Spec: capacity must be > 0, got ${capacity}`);
  }

  get size(): number {
    return this.items.size;
  }

  private checkInvariant(): void {
    console.assert(this.items.size <= this.capacity, "INV violated: size > capacity");
  }

  add(element: T): void {
    // PRE
    console.assert(!this.contains(element), "PRE violated: element already exists");
    console.assert(this.size < this.capacity, "PRE violated: set is full");

    const oldSize: number = this.size;
    this.items.add(element);

    // POST
    console.assert(this.contains(element), "POST violated: element not added");
    console.assert(this.size === oldSize + 1, "POST violated: size not incremented");
    this.checkInvariant();
  }

  remove(element: T): void {
    // PRE
    console.assert(this.contains(element), "PRE violated: element not found");

    const oldSize: number = this.size;
    this.items.delete(element);

    // POST
    console.assert(!this.contains(element), "POST violated: element still present");
    console.assert(this.size === oldSize - 1, "POST violated: size not decremented");
    this.checkInvariant();
  }

  contains(element: T): boolean {
    return this.items.has(element);
  }
}
```

## 为什么被抛弃

1. **数学门槛极高**：Z 语言需要集合论和谓词逻辑基础，绝大多数程序员没有这个训练
2. **规模不可扩展**：对 100 行代码写规格可以，对 10 万行系统做完整形式化规格不现实
3. **工具支持弱**：形式化验证工具（如 Z/EVES, Isabelle）学习曲线陡峭，与主流开发工具链不集成
4. **回报难以量化**：写规格的时间通常超过写代码的时间，管理层很难接受
5. **敏捷不兼容**：形式化规格假设需求稳定且完整，与迭代式开发冲突

## 是否应该在 LLM 时代重新启用

**核心思想应该复兴——精确的前/后条件和不变式——但用代码而非数学符号表达。** 理由：

- LLM 可以从自然语言需求自动生成"半形式化"规格（TypeScript 接口 + 断言 + JSDoc），不需要人掌握 Z 语言。
- 形式化规格的真正价值是**消除歧义**。当 LLM 从模糊的自然语言生成代码时，一份精确的规格说明可以作为仲裁标准——生成的代码满足规格吗？
- LLM 还可以从规格自动生成测试：每个前置条件生成边界测试，每个后置条件生成验证断言，每个不变式生成属性测试。
- Amazon 的 TLA+ 经验证明：即使在工业界，形式化方法对发现并发和分布式系统中的微妙 bug 仍然不可替代。LLM 可以降低 TLA+ 的使用门槛。

建议：对关键模块（支付、权限、状态机、并发），用 TypeScript 接口 + 注释写"半形式化规格"——明确列出状态不变式、每个操作的前后条件。让 LLM 从规格生成实现和测试。

## 我的看法

使用类型定义构建项目信心，实际上和这个是殊途同归的。

## AI 回复

你说"殊途同归"点到了关键：形式化规格说明想要达成的目标——**精确描述系统行为，消除歧义**——在 TypeScript 中可以通过精确的类型定义来实现。

Z 语言用集合论符号写前后条件；你的方案用 branded types + zod schema 表达同样的约束，但约束是可执行的、与代码一体的、编译器能检查的。形式化规格本身不需要复兴，但它的目标（精确性）通过类型系统在 LLM 时代变得可行了。

这和你的核心论点一致：不是复兴旧方法论，而是用现代类型系统实现旧方法论想要但做不到的事。
