# @assert 参考

## 断言词汇

| 属性 | 禁止的能力 | 含义 |
|------|-----------|------|
| `pure` | IO, Impure, Fallible, Async, Mutable | 完全纯函数——给定输入总返回相同输出，无副作用 |
| `infallible` | Fallible | 不可失败——不会返回 null/undefined，不会抛异常 |
| `immutable` | Mutable | 不修改状态——不修改传入的引用类型参数 |
| `sync` | Async | 同步——不返回 Promise，不需要 await |
| `deterministic` | Impure | 确定性——不依赖时间、随机数、全局变量 |
| `local` | IO | 本地——不与外部系统交互（网络、文件、数据库） |
| `minimal` | *(独立检测)* | 接口最小——不存在穿透参数 |

属性可组合：`@assert infallible immutable sync`

## 标记位置

### 函数声明上

```typescript
/** @assert pure */
function add(a: number, b: number): number {
  return a + b;
}

/** @assert infallible sync */
const format = (name: string): string => name.trim().toUpperCase();
```

### Re-export 上（推荐用于模块边界）

```typescript
// packages/shared/src/index.ts

/** @assert pure */
export { calculateTotal } from "./math.js";

/** @assert infallible sync */
export { formatName, formatDate } from "./format.js";

/** @assert local sync */
export * from "./utils.js";
```

在 barrel file 上标记是最自然的约束声明点——它定义了模块的公开 API 承诺。

### 命名导出与 export * 的区别

| 模式 | 效果 |
|------|------|
| `export { fn }` | 断言仅施加到 `fn` |
| `export *` | 断言施加到源模块的**所有**导出函数 |

多重断言会合并（取并集约束）：如果函数本身有 `@assert sync`，re-export 又加了 `@assert infallible`，最终约束为 sync + infallible。

## 5 个能力

系统追踪的 5 个能力，断言通过禁止特定能力来表达约束：

| 能力 | 来源 | 推断方式 |
|------|------|---------|
| **IO** | 读写外部系统（网络、文件、数据库） | 外部声明（builtin 表 / .cap.ts） |
| **Impure** | 依赖隐式环境（Date.now, Math.random, 全局变量） | 外部声明 |
| **Fallible** | 可能失败（返回 null/undefined） | 类型自动推断 + 外部声明 |
| **Async** | 异步（返回 Promise） | 类型自动推断 |
| **Mutable** | 修改引用参数（非 readonly 对象/数组参数） | 类型自动推断 |

中间函数不需要标注——系统从调用图自底向上自动推断每个函数的完整能力集。

## minimal 断言

`@assert minimal` 独立于效果系统，检测接口是否存在穿透参数。

**穿透定义**：参数在函数体中的所有出现，都仅作为另一个调用的实参，自身逻辑从未读取/检查/计算它。

```typescript
/** @assert minimal */
function generateResponse(messages: string[], options: ApiOptions): string {
  const prompt = buildPrompt(messages);
  // options.model, options.temp, options.repeatPenalty 全部只被转发给 callAPI
  return callAPI(prompt, options.model, options.temp, options.repeatPenalty);
}
```

输出：
```json
{
  "functionName": "generateResponse",
  "passThroughParams": [
    { "name": "options", "forwardedTo": [{ "callee": "callAPI", "line": 4 }] }
  ]
}
```

### 全局扫描模式

```bash
lm-linter minimal --all    # 扫描所有函数，不限于有 @assert minimal 的
lm-linter minimal           # 只检查标记了 @assert minimal 的函数
```

### 不报告的情况

- `_` 前缀参数（约定为有意未使用）
- 接口/基类实现的方法（参数由接口契约决定）
- 参数只转发给标准库函数（resolve, join, stringify 等——这是正常封装）

## 输出格式

断言通过时无输出（exit code 0）。

断言不满足时输出污染链：

```json
{
  "status": "fail",
  "violations": [
    {
      "assertion": { "function": "calculateTotal", "file": "src/math.ts", "line": 15, "property": "pure" },
      "violatedBy": "IO",
      "chain": [
        { "function": "calculateTotal", "file": "src/math.ts", "line": 15, "callLine": 17 },
        { "function": "getPrice", "file": "src/pricing.ts", "line": 8, "callLine": 10 },
        { "function": "readFromCache", "file": "src/cache.ts", "line": 3 }
      ],
      "source": { "name": "readFileSync", "caps": ["IO", "Fallible"], "external": true }
    }
  ]
}
```

链条从断言函数出发，沿调用图到达携带违禁能力的源头。AI/人可以按链条决定在哪一层切断。
