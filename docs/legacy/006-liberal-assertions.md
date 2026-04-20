# 防御式编程中的大量断言 (Liberal Use of Assertions)

## 是什么

在函数内部的关键点插入断言（assert），检查那些"按理说不应该发生"的条件。不是输入校验（那是前置条件），而是在算法执行过程中验证中间状态的一致性。目的是让 bug 在最接近根因的位置立即暴露，而非传播到远处才崩溃。

## 历史相关渊源

断言的思想可追溯到 1970 年代的 Hoare Logic，但工程化实践在 1980 年代 C 语言的 `assert.h` 普及后开始。

Ada 语言（1983 年标准化）更进一步，内置了 `pragma Assert` 和丰富的约束检查。美国国防部的 Ada 项目要求在关键代码中密集使用断言，作为提高可靠性的手段。

Steve Maguire 的 *Writing Solid Code*（1993）和 Steve McConnell 的 *Code Complete*（1993/2004）都大力提倡"每 10 行代码至少考虑一个断言"的风格。

2000 年代后，断言逐渐被单元测试替代——"把检查放在测试里而不是生产代码里"成为共识。

## TypeScript 代码举例

```typescript
interface TreeNode {
  value: number;
  left: TreeNode | null;
  right: TreeNode | null;
  size: number; // 以此节点为根的子树大小
}

function findKth(root: TreeNode, k: number): number {
  // 前置条件
  console.assert(k >= 1 && k <= root.size, `k=${k} out of range [1, ${root.size}]`);

  const leftSize: number = root.left?.size ?? 0;

  // 中间断言：子树大小应与左右子树一致
  const rightSize: number = root.right?.size ?? 0;
  console.assert(
    root.size === leftSize + rightSize + 1,
    `Size invariant broken: ${root.size} !== ${leftSize} + ${rightSize} + 1`
  );

  if (k <= leftSize) {
    // 断言：左子树不应为空，因为 k <= leftSize 且 leftSize > 0
    console.assert(root.left !== null, "left child is null but leftSize > 0");
    return findKth(root.left!, k);
  } else if (k === leftSize + 1) {
    return root.value;
  } else {
    // 断言：右子树不应为空
    console.assert(root.right !== null, "right child is null but k > leftSize + 1");
    return findKth(root.right!, k - leftSize - 1);
  }
}
```

## 为什么被抛弃

1. **代码噪音**：断言分散在业务逻辑中间，打断阅读流
2. **生产安全性争议**：断言在生产环境中触发会导致崩溃，很多人宁可让程序"带病运行"也不要崩溃
3. **TypeScript 没有零成本断言**：不像 C/C++ 可以用 `NDEBUG` 宏编译期剥离，JS 的 console.assert 始终执行
4. **类型系统替代**：TypeScript 的类型收窄（narrowing）和可辨识联合可以在编译期消除很多需要断言的场景
5. **测试替代论**：同契约式设计——"在测试里检查，不要在生产代码里检查"

## 是否应该在 LLM 时代重新启用

**应该，特别是在 LLM 生成的代码中。** 理由：

- LLM 生成的代码经常在"正常路径"上正确，但在边界条件上出错。断言是最廉价的运行时捕获网——比写一个完整的测试用例成本低得多。
- 断言同时也是 LLM 理解代码意图的内联文档："这里的 size 应该等于左加右加一"比任何注释都精确。
- LLM 可以自动生成断言。给定一段算法代码，LLM 能推导出中间状态应满足的不变式并插入断言。
- 对于"生产环境崩溃"的担忧：可以用构建工具（如 babel 插件）在生产构建中移除所有 `console.assert`，实现零成本。

建议：在算法密集的代码（排序、树操作、状态机、并发逻辑）中密集使用断言。业务 CRUD 代码中不需要。

## 我的看法

参考我在 [004](004-design-by-contract.md) 中的看法，系统应该建立一种确定的信心，这种信心应该来自于类型约束。

我更愿意**专门定义新类型**：在边界上把外部世界的「任意 `TreeNode` + 任意 `number`」消费掉，产出只在内部模块之间传递的名义类型；**下游只认这些类型，不再做一遍遍的运行时校验**——不是「没有检查」，而是检查被折叠进**构造**里，阅读算法的人看到的是「这里已经是合法的顺序统计树 / 树内排名」，心智负担从「每一步都怀疑」变成「入口已担保」。

TypeScript 没有真正的依赖类型，子树指针与 `size` 的代数关系无法完全写进类型里；因此子递归里仍可能出现 `as`（把子节点视为同样已验的树、把右子树的新排名视为 `InTreeRank`）。这不矛盾：**可证明的部分用新类型表达意图**，其余由**文档化不变式 + 单次入口验证**背书，仍优于在热路径上铺满 `console.assert`。

这里举例的代码应该改写为：

```typescript
interface TreeNode {
  value: number;
  left: TreeNode | null;
  right: TreeNode | null;
  size: number;
}

declare const ostBrand: unique symbol;
/** 已在入口处递归校验：size === 左子 size + 右子 size + 1，且子指针与 size 一致 */
export type OrderStatisticTree = TreeNode & { readonly [ostBrand]: true };

declare const rankBrand: unique symbol;
/** 已与某棵 `OrderStatisticTree` 在构造时配对校验过：1 <= k <= tree.size */
export type InTreeRank = number & { readonly [rankBrand]: true };

function checkOrderStatisticInvariants(node: TreeNode): void {
  const leftSize = node.left?.size ?? 0;
  const rightSize = node.right?.size ?? 0;
  if (node.size !== leftSize + rightSize + 1) {
    throw new Error(`size invariant: ${node.size} !== ${leftSize} + ${rightSize} + 1`);
  }
  if (node.left !== null) checkOrderStatisticInvariants(node.left);
  if (node.right !== null) checkOrderStatisticInvariants(node.right);
}

/** 外部世界进入内部的唯一闸口之一：任意树 → 顺序统计树 */
export function adoptOrderStatisticTree(root: TreeNode): OrderStatisticTree {
  checkOrderStatisticInvariants(root);
  return root as OrderStatisticTree;
}

/** 外部世界进入内部的唯一闸口之二：任意 k → 树内排名（必须显式带上已验的树） */
export function inTreeRank(tree: OrderStatisticTree, k: number): InTreeRank {
  if (!Number.isInteger(k) || k < 1 || k > tree.size) {
    throw new RangeError(`k=${k} out of [1, ${tree.size}]`);
  }
  return k as InTreeRank;
}

/** 下游：只接收已验类型；不在此重复 k 范围或 size 恒等式 */
export function findKth(tree: OrderStatisticTree, k: InTreeRank): number {
  const leftSize = tree.left?.size ?? 0;

  if (k <= leftSize) {
    // 不变式：k>=1 且 k<=leftSize ⇒ leftSize>=1 ⇒ 左子非空，且子树仍满足顺序统计不变式
    return findKth(tree.left as OrderStatisticTree, k);
  }
  if (k === leftSize + 1) return tree.value;
  // 同理，排名落入右子树时右子非空且新排名仍在 [1, right.size]
  const next = (k - leftSize - 1) as InTreeRank;
  return findKth(tree.right as OrderStatisticTree, next);
}

/** 对外 API：仍接收「脏数据」，但立刻折叠进新类型再交给核心 */
export function findKthFromRaw(root: TreeNode, k: number): number {
  const tree = adoptOrderStatisticTree(root);
  return findKth(tree, inTreeRank(tree, k));
}
```

也就是说：**密集断言把「每一步都问一遍是不是」摊在算法里**；我更愿意把同样信息**收束成少数几个构造子 + 名义类型**，让核心逻辑读起来像「在已知合法的对象上操作」。密集断言对 LLM 草稿仍有价值；落库时则优先用「新类型表达已验命题」，与 [004](004-design-by-contract.md) 里「信心来自类型」同一条线，只是这里用 branding/工厂而不是 zod。

## AI 回复

你的重写版本让我清楚地看到了两种范式的差异：

| 密集断言 | Branded Types + 工厂 |
|---------|---------------------|
| 每一步都怀疑 | 入口担保，内部信任 |
| 断言散布在算法中间 | 校验集中在构造函数 |
| 读者心智负担：这里可能出错吗？ | 读者心智负担：这是已验合法的 |
| 运行时捕获 | 编译期 + 入口处运行时 |

你的 `OrderStatisticTree` + `InTreeRank` 例子特别有说服力：核心 `findKth` 函数变得干净了，不再有 assert 打断阅读流，同时类型名本身就在传达"这棵树已经过完整性校验"的信息。

你也诚实地承认了 TypeScript 的限制——子递归里的 `as` 是不得已的妥协，因为 TS 没有依赖类型来表达"子树也满足同一不变式"。但这个妥协是局部的、文档化的，比到处撒 assert 好得多。

我对这篇的结论应该是：**断言适合 LLM 草稿阶段的快速验证，但落库的代码应该用 branded types 表达已验命题，把断言收束到入口处的工厂函数里。** 这和 004 是同一条线。