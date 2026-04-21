# 文学编程 (Literate Programming)

## 是什么

由程序员同时编写面向人阅读的散文叙述和面向机器执行的代码，两者交织在同一份文档中。工具从文档中提取代码（tangle）用于编译执行，提取叙述（weave）用于生成可读的技术文档。

程序的组织顺序由叙述逻辑决定（而非编译器要求），让读者像读文章一样理解程序。

## 历史相关渊源

由 Donald Knuth 于 1984 年提出，他用文学编程写了 TeX 排版系统和 METAFONT 字体系统。工具是他自创的 WEB 系统（Pascal）和后来的 CWEB（C）。

2004–2012 年间出现了数次复兴尝试：
- Jeremy Ashkenas (CoffeeScript 作者) 在 2010 年创建了 **Docco**，用简化方式实现"代码旁边写注释"的效果
- **Jupyter Notebook**（2014，前身 IPython Notebook 2011）在数据科学领域实现了文学编程的变体
- **Eve 语言**（2016，Chris Granger）试图让编程像写文档
- Rust 社区的 `rustdoc` 和 `cargo doc` 鼓励在文档注释中嵌入可执行的代码示例

但在工业级软件开发中，文学编程始终是极小众实践。

## TypeScript 代码举例

```typescript
// ---- 传统方式：代码按编译器需要的顺序组织 ----

import { createHash } from "node:crypto";

interface RateLimiter {
  tryAcquire(key: string): boolean;
  reset(key: string): void;
}

class SlidingWindowRateLimiter implements RateLimiter {
  private windows: Map<string, number[]> = new Map();
  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}
  tryAcquire(key: string): boolean {
    const now: number = Date.now();
    const timestamps: number[] = this.windows.get(key) ?? [];
    const valid: number[] = timestamps.filter(
      (t: number): boolean => now - t < this.windowMs
    );
    if (valid.length >= this.maxRequests) return false;
    valid.push(now);
    this.windows.set(key, valid);
    return true;
  }
  reset(key: string): void {
    this.windows.delete(key);
  }
}

// ---- 文学编程方式（伪 Markdown + 代码块，概念演示）----

// # 滑动窗口限流器
//
// ## 问题
// 我们需要限制每个客户端在一段时间窗口内的请求次数。
// 固定窗口算法在窗口边界处有突增问题，所以选择滑动窗口。
//
// ## 核心数据结构
// 对每个 key 维护一个时间戳数组，记录最近的请求时刻：
//
// ```
// private windows: Map<string, number[]> = new Map();
// ```
//
// ## 判定算法
// 收到请求时：
// 1. 过滤掉超出窗口的旧时间戳
// 2. 如果剩余数量 >= 上限，拒绝
// 3. 否则记录当前时间戳，放行
//
// 这个过滤操作的时间复杂度是 O(n)，对于大多数限流场景（窗口内几十到几百个请求）可以接受。
// 如果需要 O(1)，可以改用环形缓冲区，但增加实现复杂度——当前场景不值得。
//
// ```
// tryAcquire(key: string): boolean { ... }
// ```
```

## 为什么被抛弃

1. **双重维护**：叙述和代码必须同步更新，改了代码忘了改叙述，文档就撒谎了
2. **工具链脆弱**：tangle/weave 工具与语言的构建系统、IDE、调试器整合困难
3. **程序员不愿写散文**：多数程序员的写作习惯和兴趣不在散文上，强制要求适得其反
4. **代码评审困难**：diff 里混合了散文和代码变更，审查者的认知负担加倍
5. **非线性阅读需求**：维护者通常需要跳到特定函数而非从头读——叙述式组织反而碍事

## 是否应该在 LLM 时代重新启用

**不应原样复兴，但其核心理念——"代码应伴随足够的设计推理"——应该回来。** 理由：

- LLM 可以从代码自动生成文学编程风格的叙述文档，消除"双重维护"问题。代码变了，重新生成叙述即可。
- 反过来，LLM 也可以从叙述描述直接生成代码，实现 Knuth 的理想：以人的思维顺序描述程序，让机器负责转换为编译器需要的顺序。
- Jupyter Notebook 在数据科学中的成功证明：**当"运行代码"和"解释代码"的成本都足够低时，文学编程是自然的工作方式。** LLM 把这个条件推广到了通用编程。
- 但传统的 tangle/weave 工具链不需要复兴。LLM 本身就是最好的 tangle/weave 引擎。

建议：对关键算法和复杂业务流程，用 LLM 生成伴随的"设计叙述"文档（Markdown），与代码放在同一目录下。不是每个文件都需要，只对复杂度高的核心模块生成。

## 我的看法

代码作为ssot，注释仅保留必要的动机、决策说明。

## AI 回复

同意。代码作为 SSOT，注释保留必要的动机和决策说明。文学编程试图让文档成为 SSOT，代码是派生物——这和你的原则方向相反。

不过我想追加一个思考：你在多篇里反复强调的"注释仅保留必要动机"，本身就是文学编程理念的最小化版本。Knuth 想要的是"代码旁边有充分的解释"，你想要的是"代码旁边有最小但必要的解释"。区别在于量和形式，不在于精神。只是 Knuth 的方案太重了，你的方案刚好。
