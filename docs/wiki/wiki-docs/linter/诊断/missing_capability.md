# missing_capability

【诊断】类型，严重性：错误。

## 触发条件

函数 A 调用了函数 B，B 的 propagatedCaps 中存在【能力】 C，且 A 的 effectiveCaps 不包含 C。

propagatedCaps = effectiveCaps - 阻断能力 - 被阻断的传播能力。

## 诊断内容

- callee：被调函数名
- missingCaps：A 缺失的能力列表

## 示例

### 缺失不可阻断能力（IO）

```ts
/** @capability IO Fallible */
function fetchUser(id: string): User | null { ... }

/** @capability */
function process(id: string) {
  fetchUser(id);  // ✗ missing_capability: 缺少 IO
}
```

IO 不可阻断，只能补 IO。

### 缺失可阻断能力（Fallible）——两种修复方式

```ts
/** @capability IO */
function getUsername(id: string): string {
  const user = fetchUser(id);  // ✗ missing_capability: 缺少 Fallible
  return user?.name ?? "anon";
}
```

**选项 A：传播** —— 声明 Fallible

```ts
/** @capability IO Fallible */
function getUsername(id: string): string | null { ... }
```

**选项 B：阻断** —— 声明 HandleFallible（函数已兜底，不再返回 null）

```ts
/** @capability IO HandleFallible */
function getUsername(id: string): string {
  return fetchUser(id)?.name ?? "anon";
}
```

### 缺失 Async

```ts
/** @capability IO */
function loadAndProcess() {
  fetchData();  // ✗ missing_capability: 缺少 Async
}
```

传播：`@capability IO Async` — 或阻断：`@capability IO HandleAsync`

### 缺失 Mutable

```ts
/** @capability */
function display(items: string[]) {
  sortItems(items);  // ✗ missing_capability: 缺少 Mutable
}
```

传播：`@capability Mutable` — 或阻断：`@capability HandleMutable`（传入拷贝）

### 同时缺失多种能力

```ts
/** @capability */
function process(id: string) {
  fetchUser(id);
  // ✗ missing_capability: 缺少 IO, Async, Fallible
}
```

IO 必须补。Async 和 Fallible 各自选择传播或阻断。

## --fix 行为

- 不可阻断能力（IO/Impure） → 自动补声明
- 可阻断能力（Fallible/Async/Mutable） → **不自动补**（无法判断传播还是阻断），保留诊断供人决策
