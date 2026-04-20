# 状态建模与幽灵状态消除

## 是什么

用可辨识联合精确建模所有合法状态组合，使得业务上不可能存在的状态在类型层面不可构造。不用布尔 flag 组合表示状态，不用 `| null` 表示"可能有可能没有"的模糊语义。

每一种状态变体只包含该状态下有意义的字段——不存在"这个字段在某些状态下无意义但类型上可以访问"的情况。

## 历史渊源

ML 语言家族的代数数据类型（ADT, 1973）从一开始就是这种建模方式。Elm 社区在 2016 年 Richard Feldman 的演讲 "Making Impossible States Impossible" 中把这个思想推广到了前端社区。

TypeScript 的可辨识联合（2016，TS 2.0）让这种建模在 JS 生态中成为可能。但实际中大多数代码仍然用 `boolean` flag + `nullable` 字段的组合。

## 对人为什么太繁琐

- 设计可辨识联合需要提前想清楚所有合法状态组合——"先加个 boolean 以后再说"更快
- 变体多了之后联合类型很长，每个变体的接口都要单独定义
- 状态变更要"创建新对象"（因为变体类型不同），不能直接改字段
- LLM 和初级开发者习惯性地写 `boolean` + `null`，需要刻意对抗

## LLM 为什么不怕

- LLM 可以从需求描述中分析所有合法状态组合，一次性生成完整的可辨识联合
- LLM 不怕联合类型很长——可以为几十个变体逐一定义接口和处理分支
- 配合穷尽性检查（001），新增状态时 LLM 能自动找到并补全所有处理位置

## TypeScript 代码举例

```typescript
// ---- ❌ 布尔 flag：幽灵状态遍地 ----

interface Connection {
  isConnected: boolean;
  isAuthenticated: boolean;
  socket: WebSocket | null;
  userId: string | null;
  lastPingAt: Date | null;
  error: string | null;
}

// isAuthenticated: true 但 userId: null → 幽灵状态
// isConnected: false 但 socket 不是 null → 幽灵状态
// error 有值但 isConnected 也是 true → 幽灵状态
// 总共 2 × 2 × 2^n 种类型组合，大部分在业务中不存在

// ---- ✅ 可辨识联合：只有合法状态可构造 ----

type Connection =
  | {
      state: "disconnected";
      // 没有 socket, userId, lastPingAt → 不可访问无意义的字段
    }
  | {
      state: "connecting";
      socket: WebSocket;
      // 正在连接，还没认证 → 没有 userId
    }
  | {
      state: "connected";
      socket: WebSocket;
      userId: string;
      lastPingAt: Date;
      // 已连接已认证 → 所有字段都有意义
    }
  | {
      state: "error";
      error: string;
      lastAttemptAt: Date;
      // 出错状态 → 没有 socket（已关闭）
    };

// 每种状态只包含该状态下有意义的字段
// 不可能构造出"已认证但没有 userId"的值

// ---- 状态转换也变得类型安全 ----

function handleMessage(conn: Connection & { state: "connected" }, msg: Message): Connection {
  // 参数类型保证只有已连接状态才能处理消息
  // 不需要运行时检查 if (conn.state !== "connected") throw ...
  switch (msg.type) {
    case "ping":
      return { ...conn, lastPingAt: new Date() };
    case "disconnect":
      conn.socket.close();
      return { state: "disconnected" };
    case "error":
      conn.socket.close();
      return { state: "error", error: msg.reason, lastAttemptAt: new Date() };
  }
}

// ---- 更复杂的例子：异步操作的状态 ----

type AsyncData<T, E> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T; fetchedAt: Date }
  | { status: "error"; error: E; failedAt: Date };

// 相比 { loading: boolean; data: T | null; error: E | null }：
// - 不可能 loading=true 且 data 有值
// - 不可能 error 和 data 同时有值
// - 每种状态下可用的字段一目了然

function renderAsync<T, E>(state: AsyncData<T, E>, render: (data: T) => string): string {
  switch (state.status) {
    case "idle":    return "Ready";
    case "loading": return "Loading...";
    case "success": return render(state.data);  // state.data 在这里确定存在
    case "error":   return `Error: ${state.error}`;
  }
}

// ---- 枚举替代布尔 flag ----

// ❌
interface Task {
  isUrgent: boolean;
  isBlocked: boolean;
  isArchived: boolean;
}
// 8 种组合，"既 urgent 又 archived"有意义吗？

// ✅
type TaskPriority = "urgent" | "normal" | "low";
type TaskLifecycle = "active" | "blocked" | "archived";

interface Task {
  priority: TaskPriority;
  lifecycle: TaskLifecycle;
}
// 3 × 3 = 9 种组合，每种都有意义
// 如果"archived 的 task 不能是 urgent"，可以进一步用联合收窄
```

## 我的看法

正确

## AI 回复

确认方向正确。状态建模 + 穷尽性检查（001）+ 错误联合（003）形成了一个"不可能遗漏任何分支"的三角：数据状态用可辨识联合建模（008），错误用可辨识联合建模（003），所有联合的处理都用 `assertNever` 做穷尽守卫（001）。三者配合让"忘了处理某种情况"从运行时 bug 变成编译时错误。
