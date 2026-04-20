# 数据流阶段的窄类型

## 是什么

为数据在系统中流经的每个阶段定义独立的窄类型，而非全程使用一个宽类型。数据从外部进入时是"脏"的宽类型，经过校验后变成窄类型，每经过一步处理就变成更窄或语义不同的类型，直到最终输出。

类型名本身就传达了"这个数据处于什么阶段"的信息。

## 历史渊源

这个思想可以追溯到数据流编程（1970s）和管道/过滤器架构模式。Haskell 的 newtype 和 Rust 的 newtype pattern 让这种做法在类型层面零成本。

在 TypeScript/JavaScript 中，长期以来的做法是定义一个大 `User` 接口，从数据库查出来到返回给前端全程用这一个类型——甚至密码哈希也在里面，靠"记得不返回那个字段"来保安全。

## 对人为什么太繁琐

- 一份数据定义 3-5 个阶段性类型（`RawInput` → `ValidatedInput` → `EnrichedData` → `OutputDTO`），每个都要写接口
- 阶段之间要写转换函数，感觉是"同一个东西抄了好几遍"
- 字段 90% 重复，只有几个字段不同，用 `Pick`/`Omit` 组合也很啰嗦
- 小项目中一个类型全程用确实"够用"

## LLM 为什么不怕

- LLM 可以一次性生成整条数据流的所有阶段类型和转换函数
- 字段变更时 LLM 可以自动同步所有阶段的类型定义
- 类型名携带的阶段信息帮助 LLM 在生成代码时做正确判断："这里拿到的是 `ValidatedOrder`，不需要再校验"

## TypeScript 代码举例

```typescript
// ---- 用户注册的数据流 ----

// 阶段 0: 外部世界的原始输入（不可信）
interface RawRegistrationInput {
  email: unknown;
  password: unknown;
  name: unknown;
}

// 阶段 1: 校验后（已确认格式合法）
interface ValidatedRegistration {
  email: EmailAddress;        // branded type，已校验格式
  password: StrongPassword;   // branded type，已校验强度
  name: string;               // 普通 string 足够
}

// 阶段 2: 业务处理后（密码已哈希，ID 已生成）
interface ProcessedRegistration {
  id: UserId;
  email: EmailAddress;
  passwordHash: string;
  name: string;
  createdAt: Date;
}

// 阶段 3: 持久化后（多了数据库元数据）
interface PersistedUser {
  id: UserId;
  email: EmailAddress;
  passwordHash: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

// 阶段 4: 返回给客户端（去掉敏感字段）
interface UserResponse {
  id: string;
  email: string;
  name: string;
  createdAt: string; // ISO 8601
}

// ---- 每个阶段的转换函数，签名即文档 ----

function validateRegistration(raw: RawRegistrationInput): Result<ValidatedRegistration, ValidationError> {
  const email = parseEmailAddress(raw.email);
  if (!email.ok) return email;
  const password = parseStrongPassword(raw.password);
  if (!password.ok) return password;
  if (typeof raw.name !== "string" || raw.name.length === 0) {
    return { ok: false, error: { kind: "invalid_name" } };
  }
  return { ok: true, value: { email: email.value, password: password.value, name: raw.name } };
}

async function processRegistration(input: ValidatedRegistration): Promise<ProcessedRegistration> {
  return {
    id: generateUserId(),
    email: input.email,
    passwordHash: await hashPassword(input.password),
    name: input.name,
    createdAt: new Date(),
  };
}

async function persistUser(processed: ProcessedRegistration): Promise<PersistedUser> {
  return await db.users.insert({
    ...processed,
    updatedAt: processed.createdAt,
    version: 1,
  });
}

function toUserResponse(user: PersistedUser): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };
  // passwordHash 不在 UserResponse 中 → 编译器保证不会泄漏
}

// ---- 完整管道 ----

async function registerUser(raw: RawRegistrationInput): Promise<Result<UserResponse, RegistrationError>> {
  const validated = validateRegistration(raw);
  if (!validated.ok) return validated;

  const processed = await processRegistration(validated.value);
  const persisted = await persistUser(processed);
  return { ok: true, value: toUserResponse(persisted) };
}
// 每一步的输入输出类型都不同 → 不可能把阶段搞混
// passwordHash 永远不会出现在 UserResponse 中 → 不是靠记忆，是靠类型
```

## 我的看法

正确的

## AI 回复

确认方向正确。结合 001 中你朋友提供的 Rust `Raw<T>` / `Validated<T>` 泛型包装模式，数据流阶段类型可以进一步通用化——不需要为每种业务数据单独定义每个阶段的接口，而是用泛型阶段标签包装任意数据类型。这在后续规范设计中值得作为推荐模式。

## AI 回复2

**状态：归档。原则已确认，在 012 示例中直接应用。**

数据流窄类型在 012 的 example-good/best 中已经落地：`UserInput`（原始输入）→ `ValidatedInput`（校验后窄类型）→ `User`（持久化后）。这就是 004 说的"每个阶段有自己的类型"。

不需要继续发散。后续如果要泛型化（`Raw<T>` / `Validated<T>`），在 006（branded types）的框架下做，属于实现细节。

## 我的看法2

感觉和我001还是002下面的评论有交叉。
