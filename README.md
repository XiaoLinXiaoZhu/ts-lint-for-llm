# eslint-plugin-capability

基于能力标注的代码质量评分系统。通过两个独立维度量化代码质量，LLM 以梯度下降的方式优化代码。

## 快速开始

### 1. 安装

```bash
# 先在 lint 仓库注册 link（一次性）
cd path/to/ts-lint-for-llm && bun link

# 在你的项目中 link 安装
cd your-project && bun link eslint-plugin-capability

# 确保有 parser（如果还没装）
bun add -d @typescript-eslint/parser
```

### 2. 跑评分报告

```bash
bunx capability-report src/
# 或指定多个目录
bunx capability-report apps/ packages/
```

### 3. 启用 ESLint 规则

创建 `eslint.config.js`：

```js
import capabilityPlugin from "eslint-plugin-capability";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    plugins: {
      capability: capabilityPlugin,
    },
    rules: {
      "capability/no-escalation": "warn",
    },
  },
];
```

## 两个评分维度

### 能力负担（Capability Burden）

度量函数携带的运行时行为复杂度。每行代码按嵌套深度加权，乘以函数声明的能力数量。

**未声明的函数被视为全能力（×5），惩罚最重。**

5 个核心能力：

| 能力 | 含义 | 消除方式 |
|------|------|---------|
| `IO` | 读写外部系统（网络、文件、数据库） | 隔离到薄 IO 层 |
| `Fallible` | 可能失败 | Parse don't validate |
| `Mutable` | 修改参数或外部可变状态 | 返回新对象 |
| `Async` | 需要 await | 提取异步部分 |
| `Impure` | 依赖隐式环境（时间、随机、全局变量） | 依赖注入 |

### 类型松散度（Type Looseness）

度量类型系统的约束缺失程度。每个松散信号按权重累加。

| 信号 | 权重 | 说明 |
|------|------|------|
| `any` | 10 | 完全无约束 |
| `@ts-ignore` / `@ts-expect-error` | 10 | 整行跳过类型检查 |
| `as any` | 8 | 类型断言绕过检查 |
| `Record<string, any>` | 8 | 键值都无约束 |
| `Object` (大写) | 8 | TS 官方不推荐，约等于 any |
| `Function` (大写) | 6 | 无参数/返回值信息 |
| `object` (小写) | 5 | 无结构信息 |
| `{}` (空类型字面量) | 5 | 约等于 object |
| `Record<string, unknown>` | 5 | 无结构但值需收窄 |
| `unknown` | 3 | 比 any 好，但仍需运行时收窄 |
| `x!` 非空断言 | 2 | 绕过 null 检查 |
| 函数参数 `boolean` | 2 | 调用处 true/false 无语义 |
| 可选字段 `?` | 1 | 缺失语义可能模糊 |

## 如何声明能力

两种方式，按优先级：

### 方式一：函数名后缀（推荐）

```typescript
async function fetchUser_IO_Async_Fallible(id: string): Promise<User> {
  return await db.users.findById(id);
}

function hashPassword_Impure(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}
```

### 方式二：JSDoc @capability

```typescript
/** @capability IO Async Fallible */
async function fetchUser(id: string): Promise<User> {
  return await db.users.findById(id);
}

/** @capability */
function add(a: number, b: number): number {
  return a + b;  // 空 @capability = 纯函数
}
```

## 如何降低分数

### 核心原则

**每一步修改后都要跑报告验证分数是否下降。如果没有下降，这次修改就是无效的，应该撤回。**

```bash
# 修改前：记录基线
bunx capability-report src/session.ts
# → TOTAL 135.0

# 修改后：验证降分
bunx capability-report src/session.ts
# → TOTAL 82.0  ✅ 降了，保留
# → TOTAL 135.0 ❌ 没降，撤回这次修改
```

支持单文件聚焦：

```bash
# 只检查一个文件
bunx capability-report src/runtime.ts

# 检查几个相关模块
bunx capability-report src/runtime.ts src/session.ts src/prompt.ts

# 检查整个目录
bunx capability-report src/
```

### 什么有效、什么无效

**无效：简单提取模板/表达式为纯函数**

把 `console.log(\`hello ${name}\`)` 拆成 `formatGreeting()` + `console.log(formatGreeting())`，IO 函数的加权行数不变（一行换一行），纯函数贡献 0 分。总分不变。

```typescript
// 前：30 分
/** @capability IO Async Fallible */
async function startServer_IO_Async_Fallible() {
  console.log(`[v11] Starting...`);
  console.log(`[v11] Model: ${config.model}`);
  await db.connect();
}

// 后：仍然 30 分——提取模板没有降分
/** @capability */
function formatModel(model: string): string { return `[v11] Model: ${model}`; }

/** @capability IO Async Fallible */
async function startServer_IO_Async_Fallible() {
  console.log(`[v11] Starting...`);
  console.log(formatModel(config.model));  // 一行换一行，加权不变
  await db.connect();
}
```

**有效：系统性重构，减少能力弥散**

能力弥散 = 一个函数携带了多种本不必要的能力。降分的关键是**让每个函数只携带它真正需要的能力**。

```typescript
// 前：一个函数同时做校验(Fallible) + 哈希(Impure) + 存储(IO)
// 3 个能力 × 30 加权行 = 90 分
/** @capability IO Fallible Impure */
async function createUser_IO_Fallible_Impure(input: UserInput): Promise<User> {
  if (!input.email.includes("@")) throw new Error("bad");    // Fallible
  const hash = crypto.hash("sha256", input.password);         // Impure
  return await db.users.create({ ...input, hash });            // IO
}

// 后：三个函数各携带一种能力
// Fallible: 1能力 × 4行 = 4，Impure: 1能力 × 2行 = 2，IO: 1能力 × 3行 = 3
// 总分 = 9（降 90%）
/** @capability Fallible */
function validateEmail(email: string): string | null {
  if (!email.includes("@")) return "invalid";
  return null;
}

/** @capability Impure */
function hashPassword_Impure(password: string): string {
  return crypto.hash("sha256", password);
}

/** @capability IO */
async function insertUser_IO(data: { email: string; hash: string }): Promise<User> {
  return await db.users.create(data);
}
```

关键区别：不是"提取表达式"，而是**把不同能力的代码段分离到不同函数中**。每个函数的能力数从 3 降到 1，这才是真正的降分。

### 降分策略（按收益排序）

**第一步：声明能力**

未声明的函数被视为全能力（×5），声明后只计实际能力。这通常一次降 60-80%。

```bash
# 从报告中找到最高分的未声明函数
bunx capability-report src/
# ⚠ src/runtime.ts:18  startRuntime  (weighted: 292)

# 给它加上 @capability，重跑确认降分
```

**第二步：拆分多能力函数**

找到携带 3+ 个能力的函数，按能力边界拆开。每减少一个能力 = 加权行数不再计入该能力得分。

**第三步：IO 薄层化**

IO 函数应该尽可能薄——只做数据进出，不做计算。计算逻辑提取为纯函数（贡献 0 分）。

**第四步：Parse don't validate（消除 Fallible 传播）**

在边界层把输入校验为窄类型，下游函数不再需要 Fallible。

**第五步：收窄松散类型**

用具体类型替代 `any`、用枚举替代 `boolean` 参数。

## 为外部模块定义能力

外部包（如 `node:fs`、`openai`）的函数没有能力标注。通过 ESLint 规则配置声明：

```js
// eslint.config.js
export default [
  {
    rules: {
      "capability/no-escalation": ["warn", {
        externalCapabilities: {
          "node:fs": {
            readFileSync: ["IO", "Fallible"],
            readFile: ["IO", "Async", "Fallible"],
            writeFileSync: ["IO", "Fallible", "Mutable"],
          },
          "node:crypto": {
            createHash: ["Impure"],
            randomBytes: ["Impure"],
          },
          "openai": {
            // chat.completions.create
            create: ["IO", "Async", "Fallible"],
          },
        },
      }],
    },
  },
];
```

当你的函数调用了这些外部函数，lint 规则会检查你是否声明了对应的能力。

## 渐进采用策略

1. **先跑报告**看基线分数，不改任何代码
2. **声明高分函数的能力**（从报告中 weighted 最高的开始）
3. **规则设为 warn**，不阻塞 CI
4. 逐步标注，观察总分趋势
5. 总分稳定后，将规则提升为 error

## 评分公式

```
行权重 = 1 + 嵌套深度 + (分支行 ? 0.5 : 0)
函数加权行数 = Σ 行权重
能力负担 = Σ 加权行数 × 能力数    （未声明函数 × 5）
松散度 = Σ 松散信号权重
```
