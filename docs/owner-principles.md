# LLM 时代的代码写法原则（从第一轮评审中提炼）

> 核心命题：哪些**对人类太繁琐的代码写法**在 LLM 写代码的时代应该重新采用？
> 讨论范围：代码本身的形态。测试策略、CI 流程、审查方式、文档管理等外围实践不在范围内。

---

## 原则一：信心来自类型，不来自运行时断言

代码应该建立确定的信心，这种信心来自类型约束而非层层运行时校验。

散布各层的 `assert` / `console.assert` 意味着系统性的不自信——每一层都在问"这个值合法吗？"。正确的做法是在边界处一次性 parse（而非 validate），通过 branded types / zod schema 把"已验证"的语义折叠进类型构造，下游只接收已验类型，不再重复怀疑。

```typescript
// ❌ 每层都怀疑
function withdraw(amount: number) {
  assert(amount > 0);
  assert(amount <= this.balance);
  // ...
}

// ✅ 入口处建立信心，下游信任类型
const balanceSchema = z.number().min(0);
type Balance = z.infer<typeof balanceSchema>;

function withdraw(amount: Balance): Balance { /* 不需要再校验 */ }
```

对更复杂的场景（如顺序统计树），用 branded types + 工厂函数在入口处一次性校验，核心算法只接收已验类型：

```typescript
declare const ostBrand: unique symbol;
type OrderStatisticTree = TreeNode & { readonly [ostBrand]: true };

// 入口处校验 → 内部信任
export function adoptOrderStatisticTree(root: TreeNode): OrderStatisticTree {
  checkInvariants(root);
  return root as OrderStatisticTree;
}
```

**parse, don't validate。**

---

## 原则二：消除幽灵状态——可辨识联合取代布尔 flag

LLM 倾向于用布尔 flag 组合表示状态，但这会产生类型上合法、业务上不存在的幽灵状态。

```typescript
// ❌ 8 种类型组合，只有 3 种有意义
interface Response {
  success: boolean;
  isImage: boolean;
  content: string | null;
}

// ✅ 精确 3 种状态，幽灵状态不可表示
type Response =
  | { type: "success-image"; content: string }
  | { type: "success-text"; content: string }
  | { type: "error" };
```

可辨识联合不仅消除幽灵状态，还消除了 `string | null` 这种不确定类型，为下游确立信心。

---

## 原则三：最小接口——暴露最少信息，readonly by default

接口应该暴露消费者需要的最少信息：
- 只读场景只暴露 readonly 接口
- 函数参数类型是需求的精确表达，不多不少
- 返回类型是承诺的精确表达

这实际上是两层：
1. **Data / View 分离**：同一份数据对写入者暴露可变接口，对只读消费者暴露 readonly 接口
2. **最小化接口**：如果消费者不需要写权限，就不给

不是"为了不可变而不可变"，而是因为消费者不需要那些权限所以不给。

---

## 原则四：在标识符中编码语义属性

IDE 的悬浮提示能告诉人类推断出的类型，但无法告诉 LLM 函数的副作用、阻塞性、异常行为。应该在函数名中显式标记这些语义属性。

```typescript
// 无副作用
function add(a: number, b: number): number { return a + b; }

// IO、阻塞
function readFile_IO_BLOCKING(path: string): string {
  return fs.readFileSync(path, 'utf8');
}
```

这是匈牙利命名法的语义版本（Apps Hungarian），对人来说负担大，但对 LLM 零成本，而且帮助 LLM 在调用时做出正确判断。

> 具体标记体系还需要进一步讨论。

---

## 原则五：代码是 SSOT

一切知识——架构决策、需求追溯、设计理由——都应该在代码中表达（通过注释、类型定义、命名），不要有独立的文档。

- 架构决策 → 注释放在被决策影响的代码旁边
- 需求追溯 → 代码本身（函数名、类型名）即文档，必要时加注释
- 编码规范 → AGENTS.md（这是唯一的例外：系统级约束放在项目根目录，作为 LLM 的行为配置）

永远不应该有从代码向文档的引用。注释仅保留必要的动机和决策说明。

---

## 原则六：接口先行——先抽象最小接口，才有细化空间

模块应该通过抽象接口对外暴露能力，实现细节在接口后面可以随时替换。先定义最小接口，再在接口后面不断细化实现。

如果需要兼容层，说明解耦工作做得不够好。代码应该对扩展开放、对修改封闭（开闭原则）。

---

## 原则七：LLM 的工作模式是全局一次性生成，不是增量小步

LLM 更擅长在理解全局上下文后一次性生成完整方案，而非 TDD 式的"先写测试 → 写最少代码 → 重构"小步循环。强制小步会导致每一步缺乏全局视角，最终代码像补丁堆砌。

---

## 元原则：只讨论代码的形态

讨论范围严格限于**代码本身长什么样**。以下不在范围内：
- 测试策略（PBT、变异测试、混沌工程）
- 开发流程（TDD、结对编程、代码审查）
- 文档管理（ADR、需求追溯矩阵）
- 运维实践（可观测性、部署策略）

这些可能有独立的讨论价值，但不属于"LLM 时代应该重新采用的代码写法"这一命题。
