# 程序正确性证明 (Program Correctness Proofs)

## 是什么

用数学方法严格证明一段程序满足其规格说明。典型方法包括：
- **Hoare Logic**：用 `{P} S {Q}` 三元组（前条件 P、程序 S、后条件 Q）逐行推导正确性
- **循环不变式 (Loop Invariants)**：证明循环的每次迭代都维持某个性质，循环结束时该性质加上终止条件得到期望结果
- **归纳法**：对递归程序用数学归纳法证明正确性

## 历史相关渊源

Tony Hoare 在 1969 年发表的 "An Axiomatic Basis for Computer Programming" 奠定了理论基础。Edsger Dijkstra 在 1976 年的 *A Discipline of Programming* 中系统阐述了如何用推理而非测试来建立程序正确性。

1975–1983 年间，程序验证被视为解决软件危机的希望。NSF 和 DARPA 大量资助验证研究。Gries 的 *The Science of Programming* (1981) 试图将验证技术教给普通程序员。

但 1979 年 DeMillo, Lipton, Perlis 发表的 "Social Processes and Proofs of Theorems and Programs" 提出了尖锐批评：程序证明不像数学证明那样能被社区验证，因为它们太长、太无聊、没有洞察力。这场论战标志着学术界对工业级程序验证的信心转折。

2010 年代后，自动化定理证明和 SMT 求解器（如 Z3）使部分验证可以自动化，但范围仍限于安全关键领域。

## TypeScript 代码举例

```typescript
// ---- 用循环不变式"证明"二分查找的正确性 ----

function binarySearch(sortedArr: number[], target: number): number {
  let lo: number = 0;
  let hi: number = sortedArr.length - 1;

  // 循环不变式 (Loop Invariant):
  // 如果 target 存在于 sortedArr 中，那么 target 在 sortedArr[lo..hi] 范围内。
  // 即: 对所有 i < lo, sortedArr[i] < target
  //     对所有 i > hi, sortedArr[i] > target

  while (lo <= hi) {
    // 不变式在此处成立
    console.assert(lo >= 0 && hi < sortedArr.length, `Bounds: lo=${lo}, hi=${hi}`);

    const mid: number = lo + Math.floor((hi - lo) / 2);
    // 证明 mid 在范围内: lo <= mid <= hi (因为 hi >= lo 且整数除法向下取整)
    console.assert(mid >= lo && mid <= hi, `Mid out of range: mid=${mid}`);

    const midVal: number = sortedArr[mid];

    if (midVal === target) {
      return mid;
      // 正确性: 直接找到了 target
    } else if (midVal < target) {
      lo = mid + 1;
      // 不变式维护: sortedArr[mid] < target, 数组有序，
      // 所以 sortedArr[0..mid] 都 < target, 新范围 [mid+1..hi] 仍包含 target(如果存在)
    } else {
      hi = mid - 1;
      // 不变式维护: sortedArr[mid] > target, 数组有序，
      // 所以 sortedArr[mid..n-1] 都 > target, 新范围 [lo..mid-1] 仍包含 target(如果存在)
    }

    // 终止性证明: hi - lo 在每次迭代中严格减少（因为 lo 增加或 hi 减少）
  }

  // 循环结束时 lo > hi, 加上不变式:
  // "target 在 sortedArr[lo..hi] 中" 但 lo > hi 即范围为空 → target 不存在
  return -1;
}

// ---- 用归纳法"证明"递归函数的正确性 ----

// 规格: factorial(n) = n! for n >= 0
function factorial(n: number): number {
  console.assert(Number.isInteger(n) && n >= 0, `PRE: n must be non-negative integer, got ${n}`);

  // 基础情况 (Base Case): factorial(0) = 1 = 0! ✓
  if (n === 0) return 1;

  // 归纳步骤 (Inductive Step):
  // 假设 factorial(n-1) 正确返回 (n-1)!
  // 则 n * factorial(n-1) = n * (n-1)! = n! ✓
  const result: number = n * factorial(n - 1);

  // 终止性: n 在每次递归调用中严格减少，且 n >= 0, 所以一定到达基础情况
  return result;
}
```

## 为什么被抛弃

1. **证明比代码还长**：一个 20 行函数的正确性证明可能需要 200 行推理
2. **证明本身可能有错**：手工证明和手工代码一样容易出错，而验证证明的正确性又是另一个难题
3. **不适用于 I/O 和副作用**：Hoare Logic 的经典形式只适用于纯计算，现实程序充满网络调用、数据库操作、用户交互
4. **自动化不足**：1980 年代的自动定理证明器能力有限，大量推理仍需手工
5. **经济上不可行**：只有航空航天和军工项目的预算能支撑逐行证明

## 是否应该在 LLM 时代重新启用

**完整的形式化证明不需要——但"证明思维"融入代码注释应该复兴。** 理由：

- LLM 可以自动为循环生成不变式注释、为递归函数生成归纳论证——这不是完整的数学证明，但足以帮助人类和 LLM 理解算法的正确性推理。
- 循环不变式是理解循环代码的最佳工具。LLM 修改循环代码时，如果有不变式注释，就能验证修改是否破坏了正确性推理。
- SMT 求解器（Z3）可以自动验证简单的断言，LLM + Z3 的组合可以实现"半自动化验证"：LLM 生成断言，Z3 检查是否成立。
- 对于算法密集的代码（排序、搜索、并发数据结构），不变式注释的价值远超普通注释。

建议：对包含循环和递归的算法代码，要求 LLM 在注释中写出循环不变式和终止性论证。不需要完整的 Hoare Logic 证明，只需要人可读的正确性推理。

## 我的看法

parse instead of validate。还是那句话，类型定义是构建项目信心的必要途径。

## AI 回复

"parse instead of validate" 是一个精确的总结。

Hoare Logic 说的是 `{P} S {Q}`——如果前条件 P 成立，执行 S 后后条件 Q 成立。你用类型系统实现了同样的事：branded type 就是 P（"这个值已经通过校验"），函数签名约束了 S 的输入输出类型，返回类型就是 Q。

区别在于 Hoare 用数学推理保证 P→Q，你用类型系统+运行时校验在入口处保证 P，然后用编译器保证 S 的输入类型匹配。后者不如前者"完备"，但工程可行性高几个数量级。

回到命题：如果要说"哪种对人太繁琐的代码写法应该在 LLM 时代复兴"，答案不是"在注释里写循环不变式"（这是我给的），而是"**为每个数据流阶段定义精确的窄类型**"（这是你一直在说的）。后者对人繁琐，对 LLM 零成本。

