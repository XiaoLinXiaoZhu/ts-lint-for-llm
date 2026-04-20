# 详尽的编码规范文档 (Comprehensive Coding Standards Document)

## 是什么

团队维护一份几十页甚至上百页的编码规范文档，涵盖：命名约定、文件组织、注释要求、错误处理策略、日志规范、并发模式、性能指南等。新成员入职时需要通读，代码审查时以此为裁判标准。

不是 lint 能检查的语法规则（那些用 ESLint 就行），而是更高层的设计指南和惯例。

## 历史相关渊源

1990 年代是编码规范文档的黄金时代。大企业（IBM、Microsoft、Sun）都发布了各自语言的官方编码规范，项目团队在此基础上定制自己的版本。

代表作包括：
- Sun 的 *Code Conventions for the Java Programming Language* (1997)
- Microsoft 的 .NET Framework Design Guidelines (2006, 但基于更早的内部文档)
- Google 的各语言 Style Guide（2008 年后公开，但内部使用更早）

2010 年代后，自动化格式工具（Prettier, 2017）和 lint 工具取代了规范文档中关于格式的部分。但关于设计模式、架构惯例、错误处理策略的指导无法被自动化，这部分随着规范文档的式微也丢失了。

## TypeScript 代码举例

```typescript
// 以下展示"编码规范文档"中典型条目对应的代码

// ---- 规范条目 3.2: 错误处理策略 ----
// "所有异步函数必须使用 Result 类型而非抛出异常。
//  异常仅用于不可恢复的编程错误。"

type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// ✅ 符合规范：可恢复错误用 Result
async function parseConfig(path: string): Promise<Result<Config, ConfigError>> {
  const raw: string | null = await readFile(path).catch((): null => null);
  if (raw === null) return { ok: false, error: { kind: "not_found", path } };

  try {
    const parsed: unknown = JSON.parse(raw);
    const config: Config = validateConfig(parsed);
    return { ok: true, value: config };
  } catch {
    return { ok: false, error: { kind: "invalid_format", path } };
  }
}

// ❌ 违反规范：可恢复错误用了异常
async function parseConfigBad(path: string): Promise<Config> {
  const raw: string = await readFile(path); // 可能抛出
  return JSON.parse(raw); // 可能抛出
}

// ---- 规范条目 5.1: 日志规范 ----
// "每条日志必须包含结构化的上下文字段。
//  禁止用字符串拼接。使用 logger 的 child 方法传递请求上下文。"

// ✅ 符合规范
const requestLogger: Logger = logger.child({ requestId, userId });
requestLogger.info({ orderId, amount }, "order placed");

// ❌ 违反规范
console.log(`Order ${orderId} placed by user ${userId} for amount ${amount}`);

// ---- 规范条目 7.3: 命名约定 ----
// "布尔变量用 is/has/should/can 前缀。
//  异步函数不加 Async 后缀（TypeScript 返回类型已说明）。
//  数组用复数名词。Event handler 用 on + 事件名。"

const isActive: boolean = true;           // ✅
const hasPermission: boolean = false;     // ✅
const active: boolean = true;             // ❌ 缺少前缀
const users: User[] = [];                 // ✅
const userList: User[] = [];              // ❌ 不用 List 后缀
function onOrderCreated(order: Order): void {}  // ✅
function handleOrder(order: Order): void {}     // ❌ 不明确
```

## 为什么被抛弃

1. **没人读**：几十页的文档，新人入职时翻一遍就再也不看了
2. **过时快**：技术选型变化后规范文档跟不上，但没人有动力更新
3. **主观性强**：很多条目是品味问题（"应该用 Result 类型还是异常"），团队成员各持己见
4. **Prettier + ESLint 替代**：格式和简单规则可以自动化执行，不需要文档
5. **不可执行**：设计层面的规范无法自动检查，只能靠代码审查者人肉执行——实际上经常放水

## 是否应该在 LLM 时代重新启用

**强烈应该——编码规范是 LLM 最有效的行为塑形工具。** 理由：

- **LLM 会读文档**：把编码规范放在 system prompt 或项目根目录的 AGENTS.md 中，LLM 生成的代码就会遵守这些规范。过去"没人读"的问题消失了——LLM 每次生成代码都会"重新阅读"规范。
- **LLM 能执行不可 lint 的规范**：如"使用 Result 类型而非异常"、"日志必须结构化"、"命名用 is/has 前缀"——这些 lint 不好检查的规则，LLM 可以在生成时就遵守，在审查时就检查。
- **维护成本降低**：LLM 可以从现有代码库提取隐含的规范（"这个项目 90% 的异步函数都用了 Result 类型"），自动生成或更新规范文档。
- **从"建议"变为"约束"**：当 LLM 作为代码生成器时，规范不再是"建议开发者遵守"，而是"配置 LLM 行为"——执行力从 0 变为 100%。

建议：维护一份机器可读的编码规范（放在 AGENTS.md 或 .cursor/rules 中），同时作为人类的参考和 LLM 的行为配置。规范应聚焦于设计层面的决策（错误处理策略、日志规范、模块边界），格式问题交给 Prettier/ESLint。

## 我的看法

这是必要途径，不然我们怎么希望让模型按照我们的约定编码？

## AI 回复

这是你最明确的认同之一。AGENTS.md 就是编码规范在 LLM 时代的正确载体。

现在回看整个 28 篇，我觉得真正应该讨论的问题是：**AGENTS.md 里应该写哪些"对人太繁琐但 LLM 应该遵守的代码写法规范"？** 比如：
- 所有公共函数参数和返回值使用 branded types 而非裸类型
- 所有状态组合使用可辨识联合而非布尔 flag
- 函数名编码副作用信息（`_IO` / `_BLOCKING` / `_THROWS`）
- 每个模块入口处有类型收窄工厂函数（parse, don't validate）
- 只读场景只暴露 readonly 接口

这些规则对人来说每一条都增加了负担，但对 LLM 来说是零成本的，而且直接提升了代码的可读性和安全性。这才是命题的答案所在。
