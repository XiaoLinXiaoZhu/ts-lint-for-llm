# implicit_capability

【诊断】类型，严重性：信息（不影响退出码）。

## 触发条件

函数通过【自动检测】获得了未显式声明的传播能力：

| 检测到的能力 | 原因 |
|-------------|------|
| 【Fallible】 | 返回类型含 null/undefined |
| 【Async】 | 函数标记 async 或返回 Promise 等 |
| 【Mutable】 | 参数通过【参数可变性检测】判定为非 readonly 引用类型 |

## 示例

### 隐式 Fallible

```ts
/** @capability IO */
function findUser(id: string): User | null {
  // implicit_capability(info): 返回类型含 null，自动标记 Fallible
  // effectiveCaps = { IO, Fallible }
  ...
}
```

### 隐式 Async

```ts
/** @capability IO */
async function loadConfig(): Promise<Config> {
  // implicit_capability(info): async 函数，自动标记 Async
  // effectiveCaps = { IO, Async }
  ...
}
```

### 不触发——已显式声明

```ts
/** @capability IO Fallible */
function findUser(id: string): User | null { ... }
// Fallible 已显式声明，不产生 implicit_capability
```

### 阻断能力不影响自动检测

```ts
/** @capability IO HandleFallible */
function findUser(id: string): User | null { ... }
// 仍产生 implicit_capability: 返回 null 是自身特征，自动检测照常标记 Fallible
// effectiveCaps = { IO, Fallible, HandleFallible }
// propagatedCaps = { IO }（Fallible 被 HandleFallible 阻断）
//
// 注意：这个用法本身有问题。函数自身返回 null 说明它是 Fallible 的源头，
// HandleFallible 用于处理 callee 传来的 Fallible，不应用在自身就是 Fallible 的函数上。
```

## 含义

纯信息：告知用户 effectiveCaps 与显式声明不一致。自动检测结果是正确的，不需要修复。

若此隐式能力在调用链上引发问题，会被 【missing_capability】 捕获。
