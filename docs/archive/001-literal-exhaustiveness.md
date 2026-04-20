# 字面量穷举与编译期完备性

## 是什么

对所有可辨识联合、枚举、字面量类型的分支处理做编译期穷举检查——确保每一种可能都被显式处理，遗漏任何一种时编译器报错。配合 `never` 类型做穷尽性守卫（exhaustiveness guard），让新增变体时所有未处理的地方自动报错。

这在过去被认为"太啰嗦"：明明加个 `default` 就能编译通过，为什么要逐一列出每个 case？

## 历史渊源

ML 系语言（1973）和 Haskell（1990）从一开始就强制模式匹配穷尽。Rust 的 `match` 也强制穷尽。但在 C/Java/JavaScript 的 `switch` 传统中，`default` 分支是常态，穷尽被视为过度严格。

TypeScript 在 2.0（2016）引入可辨识联合后，穷尽检查成为可能，但社区习惯仍是写 `default: throw new Error("unexpected")`——运行时兜底而非编译期保证。

## 对人为什么太繁琐

- 每新增一个联合变体，要去所有 switch/if-else 处逐一添加处理逻辑
- 大型代码库中一个联合可能在几十个地方被 switch，改一处漏一处
- `default` 兜底省事且"够用"，心理上觉得穷尽是过度工程

## LLM 为什么不怕

- LLM 可以全局搜索所有处理该联合的位置，逐一补全新分支
- LLM 新增变体时可以同时更新所有消费处——这对人来说是最痛苦的跨文件批量修改
- 编译器的 `never` 错误精确指向遗漏位置，LLM 可以直接从报错定位并修复

## TypeScript 代码举例

```typescript
// 穷尽性守卫：如果 switch 遗漏了某个 case，这里会编译报错
function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}

type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "rectangle"; width: number; height: number }
  | { kind: "triangle"; base: number; height: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.radius ** 2;
    case "rectangle":
      return shape.width * shape.height;
    case "triangle":
      return (shape.base * shape.height) / 2;
    default:
      return assertNever(shape);
      // 如果新增 { kind: "polygon"; ... }，这里编译报错：
      // Argument of type '{ kind: "polygon"; ... }' is not assignable to parameter of type 'never'
  }
}

// ---- 更进一步：用映射类型做穷尽，连 switch 都不需要 ----

type AreaCalculator = {
  [K in Shape["kind"]]: (shape: Extract<Shape, { kind: K }>) => number;
};

// 如果漏了任何一个 kind，这里直接编译报错
const calculators: AreaCalculator = {
  circle: (s) => Math.PI * s.radius ** 2,
  rectangle: (s) => s.width * s.height,
  triangle: (s) => (s.base * s.height) / 2,
};

function area(shape: Shape): number {
  return (calculators[shape.kind] as (s: Shape) => number)(shape);
}

// ---- 穷尽的事件处理 ----

type AppEvent =
  | { type: "user:login"; userId: string }
  | { type: "user:logout"; userId: string }
  | { type: "order:created"; orderId: string; total: number }
  | { type: "order:cancelled"; orderId: string; reason: string };

type EventHandler = {
  [E in AppEvent["type"]]: (event: Extract<AppEvent, { type: E }>) => void;
};

// 新增事件类型时，这个对象立刻报错——强制你补全处理逻辑
const handlers: EventHandler = {
  "user:login": (e) => console.log(`Login: ${e.userId}`),
  "user:logout": (e) => console.log(`Logout: ${e.userId}`),
  "order:created": (e) => console.log(`Order ${e.orderId}: $${e.total}`),
  "order:cancelled": (e) => console.log(`Cancelled ${e.orderId}: ${e.reason}`),
};
```

## 我的看法

赞同。这里还有我朋友提供的来自rust的例子：

### 示例：用类型保证"未验证的数据不会被当作已验证的"

```rust
struct Raw<T>(T);
struct Validated<T>(T);

fn rvs_parse_email_E(raw: Raw<String>) -> Result<Validated<Email>, ParseError>
async fn rvs_send_email_AEI(email: &Validated<Email>, body: &str) -> Result<(), SendError>
```

`rvs_send_email_AEI` 只接受 `Validated<Email>`，从类型层面杜绝了未验证邮箱被发送的可能性。

## AI 回复

Rust 的例子比我的 TypeScript 版本更清晰地展示了核心思想：`Raw<T>` 和 `Validated<T>` 是泛型包装器，把"数据处于什么阶段"编码进类型——而且函数名里的 `_E`、`_AEI` 后缀同时标记了副作用，把 002（副作用标记）和 006（branded types）在一行签名里统一了。

TypeScript 没有 Rust 的 newtype 零成本抽象，但 branded types + 泛型包装可以做到类似效果：

```typescript
type Raw<T> = T & { readonly __stage: "raw" };
type Validated<T> = T & { readonly __stage: "validated" };
```

这比我例子中每个阶段单独定义接口更通用——`Raw<Email>` 和 `Raw<PhoneNumber>` 共享同一套"未校验"的语义，不需要为每种数据重复定义阶段类型。这个模式值得在后续的规范化工作中采用。

## AI 回复2

**状态：归档。已被后续实践具体化。**

穷尽性检查本身是一个已确认的基础工具，不需要继续发散。它在后续实践中已经自然融入了多个具体场景：

- 003（错误建模）中 Result 的 error 分支用穷尽检查强制处理
- 008（状态建模）中可辨识联合用穷尽检查消除幽灵状态
- 012（评分模型）中能力分类用枚举而非字符串，编译期保证完备性

Rust 的 `Raw<T>` / `Validated<T>` 泛型阶段包装模式已被 012 的 example-good/best 中的 `ValidatedInput` 类型部分采纳——后续如果要通用化，在 006（branded types）框架下做即可，不需要回到 001 发散。

## 我的看法2

其实我这里有两个更加激进的想法，就是：

### 全面禁用 bool 类型

- 强制用枚举或者 union type 来表示状态，比 bool 清晰多了，一看就知道有哪几种状态
- 避免了那种 `isLoading`, `isError`, `isSuccess` 一堆 bool 互斥的混乱情况
- 状态机的逻辑会更明确，不容易出现非法的状态组合

### 全面禁用 ? 和 string | null 

- 强制使用可辨别类型窄化
- 传递参数使用名称而非开关（比如不是 是否xx，而是 处理模式：xx）

---

但是我仍然在想具体怎么落地，以及是否有副作用。

