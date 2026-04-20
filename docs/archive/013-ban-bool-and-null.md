# 全面禁用 bool 和 nullable——强制枚举与可辨识联合

> 来源：001（穷尽性检查）+ 008（状态建模）的交叉延伸，由用户在"我的看法2"中提出。

## 核心主张

两条激进规则：

### 1. 全面禁用 bool 类型

用枚举或 union type 替代所有 boolean 参数和状态字段。

```typescript
// ❌ bool flag：调用侧看不出含义，多个 bool 互斥时出现幽灵状态
function fetchData(useCache: boolean, retry: boolean) { ... }

// ✅ 枚举：自解释，不可能出现非法组合
type CachePolicy = "use-cache" | "skip-cache";
type RetryPolicy = "retry-once" | "no-retry";
function fetchData(cache: CachePolicy, retry: RetryPolicy) { ... }
```

```typescript
// ❌ 多个 bool 互斥
interface Request {
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
}
// 存在 { isLoading: true, isError: true, isSuccess: true } 这种幽灵状态

// ✅ 可辨识联合：状态机精确
type Request =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | { status: "success"; data: Data };
```

### 2. 全面禁用 `?` 可选和 `| null`

用可辨识联合或具名缺失状态替代。

```typescript
// ❌ nullable：调用者不知道 null 意味着"未加载"还是"不存在"还是"出错了"
function getUser(id: string): User | null { ... }

// ✅ 具名状态：null 的语义被显式化
type UserResult =
  | { found: true; user: User }
  | { found: false; reason: "not-exists" | "deleted" | "permission-denied" };
function getUser(id: string): UserResult { ... }
```

```typescript
// ❌ 可选参数：开关语义模糊
function sendEmail(to: string, cc?: string) { ... }

// ✅ 具名模式
type Recipients =
  | { mode: "single"; to: string }
  | { mode: "with-cc"; to: string; cc: string };
function sendEmail(recipients: Recipients) { ... }
```

## 预期收益

- **消除幽灵状态**：bool 组合产生的 2^n 种状态中大部分不合法，枚举只定义合法状态
- **自解释调用**：`fetchData("use-cache", "retry-once")` 比 `fetchData(true, false)` 可读性强
- **穷尽检查生效**：switch 上的 union type 配合 `assertNever` 能在编译期捕获遗漏分支
- **对 LLM 友好**：枚举值是文本，LLM 读代码时能直接理解语义；bool 需要追溯参数名才能理解含义

## 待讨论

1. **落地边界在哪？** 比如 `Array.prototype.includes()` 返回 `boolean`，标准库的 bool 返回值不可能全部替换。规则应该限定在"用户定义的函数参数和状态字段"吗？
2. **性能和代码量**：每个 bool 变成 union type 会增加类型定义量。对 LLM 来说这不是问题（它能自动生成），但需要确认不会让类型文件膨胀到影响可读性。
3. **ESLint 规则可行性**：能否写一个 ESLint 规则检测函数参数中的 `boolean` 类型和 `?` 可选参数，提示替换为枚举？
4. **与评分模型的关系**：这个规则目前在能力评分模型（012）之外。是否应该在评分中体现——比如 bool 参数的函数权重更高？还是作为独立的 lint 规则，不进入评分？
5. **副作用**：有没有场景是 bool 确实比枚举更合适的？比如 `enabled: boolean` 这种纯开关。

## 我的看法

不是，这里定义的是内部的代码，对于外部的代码确实是不可控的。而且这里主要关注的是函数的输入和输出。

你能尝试类似苏格拉底式的，尝试举几个反例来证明它的弊端吗？这有助于我们辩证的看待。

## AI 回复

明确了——规则范围是内部代码的函数输入输出，不管外部库。下面用反例来考验这两条规则。

### 反例：禁用 bool 可能过度的场景

**1. 谓词函数的返回值**

```typescript
// 禁 bool 后要写成这样？
type ContainsResult = "contains" | "not-contains";
function contains(arr: number[], target: number): ContainsResult { ... }

// 但下游使用时反而更啰嗦
if (contains(arr, 5) === "contains") { ... }
// 原本：
if (contains(arr, 5)) { ... }
```

谓词函数（返回"是/否"的纯判断）的 bool 返回值语义完全清晰——函数名本身就是谓词（`contains`、`isValid`、`hasPermission`）。强制替换为枚举没有信息增益，反而破坏了语言的惯用模式（`if` 条件、`filter` 回调都期望 bool）。

**2. 双态开关确实只有两种状态**

```typescript
// 这个 bool 真的只有两种状态，没有幽灵态
interface Feature {
  enabled: boolean;
}
// 强制替换为枚举：
type FeatureState = "enabled" | "disabled";
// 信息增益为零，代码量翻倍
```

当一个值确实只有两种互斥状态、且状态含义从字段名就能读出来时，bool 比枚举简洁且无歧义。

**3. 逻辑运算不友好**

```typescript
// bool 可以直接参与逻辑运算
const canProceed = isLoggedIn && hasPermission && !isBanned;

// 枚举版本：
const canProceed =
  loginState === "logged-in" &&
  permission === "granted" &&
  banStatus === "not-banned";
// 更冗长，且每个枚举值的命名要额外设计
```

### 反例：禁用 nullable 可能过度的场景

**4. 集合查找的"不存在"语义**

```typescript
// Map.get() 返回 T | undefined，这是语言层面的约定
const value = map.get(key); // T | undefined

// 强制包装为可辨识联合？
type MapResult<T> = { found: true; value: T } | { found: false };
// 每次 map.get 都要包一层，成本太高
```

标准库和语言内置的 nullable 模式（`Map.get`、`Array.find`、`?.` 链式调用）已经被 TypeScript 的类型收窄很好地支持了（`if (value !== undefined)`）。强制替换会和语言的惯用模式冲突。

**5. "可选"和"缺失"确实是同一件事**

```typescript
interface CreateUserOptions {
  nickname?: string;  // 用户可以不提供昵称
}
// 这里 ? 的语义就是"调用方可以不传"，没有歧义
// 强制替换为 { mode: "with-nickname"; nickname: string } | { mode: "no-nickname" }
// 过度设计，违反最小惊讶原则
```

### 辩证结论

两条规则的核心价值在于消除**多 bool 互斥的幽灵状态**和**null 含义模糊**的场景。但如果无差别地禁用所有 bool 和 nullable，会在以下场景产生不必要的摩擦：

| 场景 | bool/nullable 合理 | 枚举/联合更好 |
|------|-------------------|-------------|
| 谓词返回值 (`isX`, `hasX`, `contains`) | ✅ | |
| 双态开关 (`enabled`) | ✅ | |
| 逻辑组合 (`&&`, `\|\|`, `!`) | ✅ | |
| 标准库交互 (`Map.get`, `Array.find`) | ✅ | |
| 可选参数（真正的"可以不传"） | ✅ | |
| 多个互斥的布尔 flag | | ✅ |
| null 有多种可能的语义 | | ✅ |
| 函数参数中的模式选择 | | ✅ |
| 状态机 | | ✅ |

可能的落地方式：不是"全面禁用"，而是一条 ESLint 规则检测**可疑模式**——比如同一个 interface 中出现 2 个以上 boolean 字段、或者函数有 2 个以上 boolean 参数——然后建议替换。单个 bool 谓词和可选参数不触发。

## 我的看法2

感觉这里你的很多判断都有一个前提是“人来维护”，而不是对于ai来说。

我们的总命题是：哪些曾因"对人类太麻烦"而被放弃的**代码写法**，在 LLM 写代码的时代应该重新采用？

可能需要再看看。

## AI 回复2

你说得对，上一轮反例的论据几乎全部基于"人的维护成本"——代码量翻倍、啰嗦、违反最小惊讶——这些在 LLM 时代不再是有效的反对理由。重新从 LLM 视角审视。

### 修正：bool 参数的真正问题不是"啰嗦"，而是"调用处信息丢失"

```typescript
// LLM 读到这行，必须跳转到函数定义才知道三个 bool 分别控制什么
sendNotification(userId, "订单已发货", true, false, true)

// LLM 读到这行，调用处就是文档，不需要跳转
sendNotification(userId, "订单已发货", { channel: "push", priority: "high", persist: "save-to-inbox" })
```

这直接违反 SSOT 原则——调用处应该自包含。LLM 的上下文窗口有限，每次跳转到定义都消耗 token 和注意力。枚举参数把语义编码在值里，调用处自解释。

### 逐条重审

**反例1 谓词返回值**（部分保留）：`contains(arr, 5)` 返回 bool 仍然合理，因为函数名本身就是谓词，bool 的语义已经编码在名字里。但这只限于纯二值谓词。校验函数（validate, check）应该返回具体原因而非 bool——`"valid" | "invalid-email" | "too-short"` 比 `boolean` 信息量大得多。

**反例2 双态开关**（部分保留）：单个 `enabled: boolean` 在当下合理。但 LLM 视角下有一个新论据——从一开始用枚举意味着未来加状态时不需要重构（`"enabled" | "disabled"` → `"enabled" | "disabled" | "paused"`）。不过这属于推测性设计，暂不强制。

**反例3 逻辑运算**（撤回）：`isLoggedIn && hasPermission` 对 LLM 确实不比 `loginState === "logged-in" && permission === "granted"` 更难理解。"冗长"不是 LLM 的障碍。如果已经因为其他原因从 bool 换成了枚举，逻辑运算自然适应。

**反例4 集合查找**（撤回）：用户已经明确规则范围是内部代码，外部库的 `Map.get` 返回 `T | undefined` 不在讨论范围内。

**反例5 可选参数**（细化）：关键区分——`nickname?: string`（"可以不传"，语义单一）合理；`status?: string`（不传意味着什么？默认？未知？被删除？）不合理，应该用联合。判断标准：缺失值的语义是否只有"不提供"一种解释。

### 修正后的规则

**bool：**

| 场景 | 结论 | 理由 |
|------|------|------|
| 纯二值谓词返回值（`contains`, `isEven`） | bool 合理 | 函数名即语义，语言约定（filter/if 期望 bool） |
| 函数参数 | 应该用枚举 | 调用处 `true/false` 无语义，违反 SSOT |
| 状态字段（单个） | 建议枚举 | 防止 bool 增殖，演化友好 |
| 多个互斥 bool | 必须用枚举 | 幽灵状态 |

**nullable：**

| 场景 | 结论 | 理由 |
|------|------|------|
| 外部库返回 | 不管 | 范围之外 |
| 内部函数返回 null 表示缺失 | 应该用联合 | null 的原因对 LLM 不可见 |
| 配置项可选参数（语义仅"可以不传"） | `?` 合理 | 缺失语义单一 |
| 有业务含义的缺失 | 必须用联合 | 缺失原因需要穷尽 |

核心判断标准变成了一个：**如果 LLM 在调用处无法理解这个值的全部含义，就应该用枚举/联合替代 bool/null。**