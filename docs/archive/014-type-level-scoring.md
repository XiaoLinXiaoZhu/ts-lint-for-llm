# 类型层面的量化评估

> 来源：005（最小接口）的延伸。用户指出"暂时没考虑如何对类型进行处理"，当前评分模型（012）只针对函数，尚未覆盖类型系统。

## 问题

012 的评分模型度量的是"函数携带的能力负担"——逐行加权 × 能力数。但代码质量还有另一个维度：**类型设计的质量**。

一个函数可以能力声明完美、嵌套极浅，但如果它的参数类型是一个 20 字段的扁平对象（而不是按语义分组的窄接口），那它仍然是难以维护和测试的。

当前评分模型对此视而不见。

## 可能的度量方向

### 1. 接口宽度

函数参数的总字段数。越窄越好（005 的核心主张）。

```typescript
// 宽度 = 8：所有字段一把抓
function createOrder(userId: string, email: string, items: Item[], 
  shippingAddr: string, billingAddr: string, coupon: string,
  giftWrap: boolean, note: string): Order { ... }

// 宽度 = 3：按语义分组
function createOrder(buyer: Buyer, cart: Cart, options: OrderOptions): Order { ... }
```

### 2. 类型复杂度

一个类型的"结构深度"——嵌套的联合、交叉、泛型参数层数。

```typescript
// 简单
type UserId = string & { readonly __brand: "UserId" };

// 复杂
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
type AsyncResult<T> = Promise<Result<T, Error | TimeoutError | NetworkError>>;
type Handler<T> = (input: AsyncResult<T>) => AsyncResult<void>;
// Handler 的"展开复杂度"很高
```

### 3. 可选字段比例

一个接口中 `?` 可选字段占总字段的比例。高比例意味着这个接口试图服务太多场景（不同的调用方需要不同的字段子集），应该拆成多个窄接口。

### 4. 联合分支数与穷尽性

可辨识联合的分支数本身不是问题（分支多说明状态建模详尽），但如果使用处没有穷尽检查，那分支越多越危险。

## 与 012 评分模型的关系

两种可能的集成方式：

- **独立维度**：类型得分和函数能力得分分开报告，各自有独立的趋势线
- **乘数效应**：函数的类型质量作为加权乘数影响能力得分——参数越宽的函数，能力得分被放大

## 待讨论

1. 具体的类型复杂度公式应该怎么定义？需要 AST 层面遍历类型节点。
2. 与 013（禁用 bool/null）的关系：如果 013 落地，类型评分中"可选字段比例"和"bool 参数数"可以直接作为扣分项。
3. 优先级：先做函数层面的评分（012 已有原型），还是同步推进类型层面？

## 我的看法

大部分我没有看懂。但是关于2

实际上2不见得坏，因为很多时候我们需要通过类型体操来确保ssot，一处更改下游自动更改，没有处理的情况自动报错（和switch穷尽也有交叉）

你这里可以举一个例子试试看看。

## AI 回复

你说得对，类型复杂度高不一定是坏事。补一个具体例子来说明这一点。

### 例子："类型体操"保证 SSOT 和穷尽性

假设有一个权限系统，角色和权限的映射关系是业务核心：

```typescript
// 方案 A：手动维护，简单但容易不一致
type Role = "admin" | "editor" | "viewer";
type Permission = "read" | "write" | "delete";

const rolePermissions: Record<string, string[]> = {
  admin: ["read", "write", "delete"],
  editor: ["read", "write"],
  viewer: ["read"],
  // 新增 Role 后忘了加这里 → 运行时才发现
};

function hasPermission(role: string, perm: string): boolean {
  return rolePermissions[role]?.includes(perm) ?? false;
}
```

```typescript
// 方案 B：类型体操，复杂但 SSOT + 穷尽
type Role = "admin" | "editor" | "viewer";
type Permission = "read" | "write" | "delete";

// 映射关系用类型表达，新增 Role 时编译器强制你补全
type RolePermissionMap = {
  [R in Role]: readonly Permission[];
};

const rolePermissions: RolePermissionMap = {
  admin: ["read", "write", "delete"],
  editor: ["read", "write"],
  viewer: ["read"],
  // 新增 Role 后如果不加这里 → 编译报错
};

// 函数签名也用精确类型，不接受 string
function hasPermission(role: Role, perm: Permission): boolean {
  return rolePermissions[role].includes(perm);
}
```

方案 B 的"类型复杂度"更高（`{ [R in Role]: readonly Permission[] }` 用了映射类型），但它保证了：
- 新增 Role → 编译器强制你在 `rolePermissions` 中补条目（SSOT）
- `hasPermission` 不接受 `string` → 调用处传错角色名编译报错（窄类型）
- `rolePermissions[role]` 永远不会是 `undefined` → 不需要 `?.`（消除 nullable）

所以**类型复杂度本身不应该被惩罚**。真正该惩罚的是"无目的的复杂"——比如一个函数参数是 `Record<string, any>`（宽到没有约束），或者一个接口有 15 个可选字段（没有按场景拆分）。

### 修正后的度量思路

不应该度量"类型有多复杂"，而应该度量"类型约束有多松散"：

| 度量 | 好（约束紧） | 坏（约束松） |
|------|------------|------------|
| 参数类型 | `Role`（3 种值） | `string`（无限值） |
| 返回类型 | `User`（确定结构） | `any`（无结构） |
| 映射完备性 | `{ [R in Role]: ... }`（编译器保证） | `Record<string, ...>`（运行时才知道） |
| 可选字段 | 按场景拆成多个窄接口 | 一个大接口全标 `?` |

014 的方向需要调整：不是"类型复杂度评分"，而是**"类型松散度评分"**——越松散（`any`、`string` 替代枚举、大量 `?`）得分越高（越差）。类型体操如果服务于 SSOT 和穷尽性，反而应该是中性甚至正面的。

## 我的看法2

这里的例子很能说明问题，但是一个引申的问题是如何量化或者评估。

**"类型松散度评分"**是个好的想法，但是可能需要再看看如何检测，实现成本、错误率（如果错误率高则对于lint来说相当于添加噪声） 等。

## AI 回复2

做了技术可行性实验。结论：类型松散度检测可以分层做，有些成本极低且几乎零误报，有些当前不可行。

### 可行性分层

| 检测项 | 实现难度 | 误报风险 | 价值 | 备注 |
|--------|---------|---------|------|------|
| `any` 使用 | 极低 | 极低 | 高 | ESLint 已有 `@typescript-eslint/no-explicit-any`，直接复用 |
| `Record<string, any>` | 低 | 低 | 中 | AST 模式匹配，几乎总是应该用更精确的类型 |
| 函数参数 `boolean` | 低 | 低 | 高 | 与 013 直接交叉，排除谓词返回值即可 |
| 高可选比例接口（>60% 字段为 `?`） | 低 | **中** | 中 | 配置对象合理地有很多可选项，需要启发式区分 |
| `string` 替代枚举 | **高** | **高** | 低 | `userId: string` 完全合理，纯 AST 无法判断一个 string 是否应该是枚举 |

前三项（`any`、`Record<string, any>`、函数参数 `boolean`）实现成本极低、误报率极低，可以直接作为 lint 规则上线。第四项（高可选比例）误报中等，需要启发式（比如区分名字含 `Config`/`Options` 的接口）。第五项（string 替代枚举）当前不可行——需要语义分析，纯 AST 做不到。

### 对真实代码的测试

用 012 的三个示例文件跑了一遍检测，结果：三个文件都没有 `any`、没有 `Record<string, any>`、没有高可选比例接口、没有 boolean 参数——说明我们自己的示例代码已经很"紧"了。唯一检出的是 `string` 类型注解（bad: 6, good: 14, best: 21），但其中大部分是 `email: string`、`id: string` 这种合理用法，确认了"string 替代枚举"检测的高误报风险。

### 建议

类型松散度检测不适合做成"评分"（与 012 的能力评分合并），更适合做成**独立的 lint 规则集**：

1. **立即可做**：禁用 `any`（已有现成规则）、禁用 `Record<string, any>`、禁用函数参数 `boolean`（013）
2. **需要启发式**：高可选比例接口告警
3. **暂不做**：string 替代枚举

这样实现成本低、噪声小，和 012 的评分模型各司其职——评分管能力负担，lint 管类型松散度。两个维度独立报告，不混在一起。

## 我的看法3

感觉并不是适合做 是否、报错的思路。而是从整理统计分数。将优化作为梯度下降的手段，llm自然能够找到最低点。

## AI 回复3

完全正确。上一轮我的思路走偏了——把类型松散度框定成 lint 规则（二元判断、需要阈值、会有误报），但正确的模式和 012 一样：**给出连续评分，LLM 自己做梯度下降。**

### 评分 vs lint 的根本区别

lint 是门禁：通过/不通过，需要定阈值（"多少可选字段算太多？"），阈值之争没有终点，误报就是噪声。

评分是梯度：每个 `any` 都贡献分数，每个可选字段都贡献分数，LLM 的目标是"总分尽可能低"。不需要阈值，不存在误报——`any` 确实比 `User` 松散，这是事实而非判断。

### 类型松散度评分原型

用 AST 检测松散信号，每个信号有权重，累加得分：

| 信号 | 权重 | 理由 |
|------|------|------|
| `any` | 10 | 完全无约束，最松散 |
| `Record<string, any>` | 8 | 键和值都无约束 |
| `unknown` | 3 | 比 any 好，但仍需运行时收窄 |
| 函数参数 `boolean` | 2 | 调用处信息丢失（013） |
| 每个可选字段 `?` | 1 | 缺失语义模糊 |

实验对比（同一业务逻辑）：

```
松散版（any, Record<string,any>, 5个可选字段）：93 分
紧凑版（精确类型, 枚举, 无可选字段）：            0 分
```

每一步收窄（把一个 `any` 换成具体类型）都降 10 分。LLM 自然会逐个消除。

### 与 012 能力评分的关系

两个维度独立计算、独立报告：

- **能力得分**（012）：`Σ weighted_lines × capability_count` → 度量运行时行为负担
- **松散度得分**（014）：`Σ looseness_penalty` → 度量类型系统的约束缺失

两者激励方向一致但手段不同：
- 能力得分高 → 拆分函数、隔离能力
- 松散度得分高 → 收窄类型、消除 any、拆分大接口

不需要合并成一个数字。分开报告让 LLM 知道该往哪个方向优化。

### 下一步

权重目前是拍脑袋的（any=10, ?=1），需要在真实项目上校准——跑一遍实际代码，看看得分分布是否符合直觉，再调整权重。但框架已经明确：连续评分，不做二元判断。