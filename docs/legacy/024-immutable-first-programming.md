# 默认不可变编程 (Immutable-First Programming)

## 是什么

所有数据结构默认不可变——变量用 `const` 声明，对象和数组创建后不再修改，"更新"操作返回新副本而非原地修改。只有在有明确性能需求或语义需要时才使用可变状态，并在注释中说明理由。

## 历史相关渊源

不可变性是函数式编程的核心原则，可追溯到 1958 年的 Lisp。但在主流命令式语言中推广不可变性是 2012–2018 年间的趋势：

- **Immutable.js** (2014, Facebook)：为 JavaScript 提供持久化不可变数据结构
- **Redux** (2015)：强制 React 状态不可变，通过纯函数 reducer 更新
- **Elm** (2012)：纯函数式前端语言，所有数据都不可变
- **Rust** (2015 稳定版)：变量默认不可变，可变需要 `mut` 标记
- TypeScript 的 `readonly` 修饰符和 `as const` 断言

2018–2020 年间，React 社区从 Redux (显式不可变) 转向 hooks + Immer (内部可变但接口不可变) 再到 Zustand/Jotai (更灵活的状态管理)，严格不可变的热度有所下降。

## TypeScript 代码举例

```typescript
// ---- 严格不可变风格 ----

// 所有接口字段 readonly
interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly preferences: Readonly<UserPreferences>;
  readonly tags: readonly string[];
}

// "更新"返回新对象
function updateUserName(user: User, newName: string): User {
  return { ...user, name: newName };
}

function addTag(user: User, tag: string): User {
  return { ...user, tags: [...user.tags, tag] };
}

// 集合操作返回新数组，不修改原数组
function removeInactive(users: readonly User[]): readonly User[] {
  return users.filter((u: User): boolean =>
    u.tags.includes("active")
  );
}

// 配合 TypeScript 的 Readonly 工具类型做深层不可变
type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

type ImmutableConfig = DeepReadonly<{
  database: {
    host: string;
    port: number;
    credentials: { user: string; password: string };
  };
  features: { enableNewUI: boolean; maxRetries: number };
}>;

// 编译错误示例:
// const config: ImmutableConfig = loadConfig();
// config.database.port = 5433;     // ❌ Cannot assign to 'port' because it is a read-only property
// config.features = { ... };       // ❌ Cannot assign to 'features' because it is a read-only property

// ---- 不可变的状态更新链 ----

interface AppState {
  readonly users: readonly User[];
  readonly selectedUserId: string | null;
  readonly loading: boolean;
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "USER_LOADED":
      return {
        ...state,
        users: [...state.users, action.payload],
        loading: false,
      };
    case "USER_SELECTED":
      return { ...state, selectedUserId: action.payload };
    case "USER_REMOVED":
      return {
        ...state,
        users: state.users.filter((u: User): boolean => u.id !== action.payload),
        selectedUserId:
          state.selectedUserId === action.payload ? null : state.selectedUserId,
      };
    default:
      return state;
  }
}
```

## 为什么被抛弃

1. **性能问题**：深层嵌套对象的不可变更新需要大量拷贝，GC 压力大
2. **TypeScript 的 readonly 不够深**：`readonly` 只作用于一层，深层需要 `DeepReadonly` 这种体操类型
3. **扩展运算符的冗长**：`{ ...state, nested: { ...state.nested, field: newValue } }` 在深层嵌套时可读性很差
4. **Immer 的替代**：Immer (2018) 让你写看起来可变的代码但产出不可变结果，减少了显式不可变的动力
5. **过度工程**：很多对象生命周期很短或只在一个函数内使用，不可变带来的安全性没有实际收益

## 是否应该在 LLM 时代重新启用

**应该，默认不可变让 LLM 生成的代码更安全。** 理由：

- LLM 经常犯的一类错误是**意外修改共享状态**——函数 A 拿到一个对象引用，意外修改后影响了函数 B。不可变性从根本上消除这类 bug。
- LLM 生成不可变更新代码的冗长问题可以忽略——LLM 不在乎打字量。深层嵌套的 spread 对人来说可读性差，但 LLM 生成和读取都没有问题。
- `DeepReadonly` 类型体操对 LLM 来说很简单——LLM 可以为每个接口自动生成深层只读版本。
- 不可变代码更容易被 LLM 分析和推理：没有副作用的函数，输入决定输出，不需要追踪状态变化历史。

建议：项目默认启用 ESLint 的 `functional/immutable-data` 和 `functional/no-let` 规则（或等价规则）。在需要性能优化的热路径上显式标注 `// mutable for performance` 并豁免规则。

## 我的看法

感觉是实际上是两层：
1. data 和 view 分离。对于只读函数只提供只读数据。
2. 最小化接口。如果一个东西只是需要暴露一个只读的接口，那么就应该只提供 readonly 的数据。

## AI 回复

你把不可变编程拆解成了两个更精确的原则：

1. **Data/View 分离**：同一份数据对不同消费者暴露不同接口——写入者看到可变接口，只读消费者看到 readonly 接口
2. **最小接口**：如果消费者只需要读，就只给 readonly。不是"所有东西都 readonly"，而是"按需暴露最少权限"

这比我写的"默认不可变"更精确。"默认不可变"是一条毯子式规则，你的拆解指向了背后的原因：**不是为了不可变而不可变，而是因为消费者不需要写权限所以不给**。

这也回到了最小接口原则（021）。你的 28 篇评价其实在反复说同一件事：**类型应该精确表达需求和承诺，多一分不给（readonly），少一分不行（branded type 保证已校验）**。
