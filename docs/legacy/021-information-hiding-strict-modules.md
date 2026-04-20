# 严格的信息隐藏与模块分解 (Strict Information Hiding)

## 是什么

David Parnas 提出的原则：每个模块应隐藏一个"设计决策"（design decision），模块的接口只暴露其他模块需要知道的最少信息。模块之间不应共享实现细节、内部数据结构或算法选择。

这不仅仅是"用 private 修饰符"——而是一种**分解系统的原则**：先列出可能变化的设计决策，然后为每个决策创建一个模块来封装它。

## 历史相关渊源

David Parnas 在 1972 年发表的 "On the Criteria To Be Used in Decomposing Systems into Modules" 是软件工程最有影响力的论文之一。他对比了两种分解方式：按功能流程分解 vs 按信息隐藏分解，展示了后者在应对变化时的优越性。

1975–1983 年间，Parnas 的思想深刻影响了 Ada 语言（package 的 spec/body 分离就是信息隐藏的语法体现）和 Modula-2 语言的设计。

面向对象编程在 1990 年代将"封装"作为核心概念推广，但实际上将 Parnas 的"模块隐藏设计决策"简化为了"类隐藏数据字段"——丢失了更深层的"隐藏可能变化的决策"这一思想。

## TypeScript 代码举例

```typescript
// ---- Parnas 式信息隐藏 vs 常见的浅层封装 ----

// ❌ 浅层封装：private 字段，但实现细节通过接口泄漏
interface UserStore {
  // 泄漏了存储用 Map 的决策——消费者会假设 O(1) 查找
  getAll(): Map<string, User>;
  // 泄漏了用 UUID 作为 ID 的决策
  getById(uuid: string): User | null;
}

// ✅ Parnas 式信息隐藏：接口不泄漏任何实现决策
interface UserStore {
  // 隐藏的决策 1: 底层存储结构（可能是 Map, Array, SQLite, Redis）
  // 隐藏的决策 2: ID 的格式和生成策略
  // 隐藏的决策 3: 缓存策略

  find(criteria: UserQuery): Promise<User[]>;
  findOne(criteria: UserQuery): Promise<User | null>;
  save(user: UserDraft): Promise<User>;
  remove(criteria: UserQuery): Promise<number>;
}

// 消费者无法依赖：
// - 是内存存储还是数据库
// - ID 是 UUID 还是自增整数
// - 查询是 O(1) 还是 O(n)
// 因此当这些决策变化时，消费者不需要改动

// ---- 将"可能变化的决策"显式列出并封装 ----

// 决策 1: 时间获取方式（可能从真实时钟变为可注入的时钟）
interface Clock {
  now(): Date;
  timestamp(): number;
}

// 决策 2: 序列化格式（可能从 JSON 变为 MessagePack）
interface Serializer<T> {
  serialize(value: T): Uint8Array;
  deserialize(bytes: Uint8Array): T;
}

// 决策 3: 通知渠道（可能从 email 变为 push notification）
interface NotificationChannel {
  send(recipient: string, message: NotificationMessage): Promise<void>;
}

// 这三个接口各自封装一个设计决策。
// 当决策改变时（如从 JSON 切到 Protobuf），只需实现新的 Serializer，
// 其他模块完全不受影响。

class EventProcessor {
  constructor(
    private clock: Clock,
    private serializer: Serializer<Event>,
    private notifications: NotificationChannel
  ) {}

  async process(rawEvent: Uint8Array): Promise<void> {
    const event: Event = this.serializer.deserialize(rawEvent);
    const processedAt: number = this.clock.timestamp();
    // ...处理逻辑...
    await this.notifications.send(event.owner, {
      title: "Event processed",
      body: `Processed at ${processedAt}`,
    });
  }
}
```

## 为什么被抛弃

1. **过度抽象**：为"可能变化"的决策创建接口，但很多决策实际上永远不会变——导致不必要的间接层
2. **YAGNI 原则冲击**：敏捷社区认为"你不需要它"——等变化真的发生时再提取接口不迟
3. **接口爆炸**：严格遵循会导致大量只有一个实现的接口（Clock, Serializer, NotificationChannel...），增加导航负担
4. **TypeScript 的结构类型系统弱化了需求**：TS 的鸭子类型意味着不需要显式接口也能实现松耦合
5. **依赖注入框架过度工程化**：Spring/Angular 的 DI 容器让"隐藏实现"变成了需要大量样板代码的仪式

## 是否应该在 LLM 时代重新启用

**Parnas 的设计决策分析应该复兴——但不需要过度抽象。** 理由：

- LLM 修改代码时，如果模块边界清晰且隐藏了实现决策，LLM 只需要理解接口而不需要理解全部实现——这大幅减少了需要放入上下文窗口的代码量。
- 当 LLM 替换一个实现（如从 Redis 切到 DynamoDB）时，严格的信息隐藏确保变更被限制在一个模块内，不会波及整个系统。
- "过度抽象"问题可以由 LLM 缓解：LLM 可以按需秒级生成接口和新实现，不需要提前抽象。但前提是原有代码的依赖关系足够干净——如果调用方直接依赖了 Redis API，LLM 也无法在不改动调用方的情况下替换。
- 关键洞察：Parnas 的原则不是"每个类都要有接口"，而是**先识别哪些决策可能变化，再为这些决策创建隔离层**。LLM 可以辅助这个分析过程。

建议：在系统设计阶段，显式列出"可能变化的设计决策"清单（存储引擎、序列化格式、外部服务供应商、认证机制等），为这些决策创建接口。其他不太可能变化的部分不需要额外抽象。

## 我的看法

这实际上是最小接口原则。

## AI 回复

"最小接口原则"——比我写的"信息隐藏"更简洁准确。

Parnas 论文用了大量篇幅论证"为什么要隐藏"，但你一句话就切到了要害：接口应该暴露最少信息。这在 LLM 时代意味着：
- 函数参数类型应该是需求的精确表达，不多不少
- 返回类型应该是承诺的精确表达
- 可变性只在需要时暴露（readonly by default）

这和 024 中你提的 "data/view 分离 + 只读接口" 是同一思路。对人来说，为每个场景设计精确的窄接口很繁琐；对 LLM 来说这是零成本的。又一个符合命题的正确例子。
