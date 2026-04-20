# eslint-plugin-capability

基于能力标注的代码质量评分系统。通过两个独立维度量化代码质量，LLM 以梯度下降的方式优化代码。

## 快速开始

### 1. 安装

在你的项目中：

```bash
# 安装本插件（从本地路径）
bun add -d eslint-plugin-capability@link:../ts-lint-for-llm

# 如果还没安装 eslint 和 parser
bun add -d eslint @typescript-eslint/parser
```

### 2. 跑评分报告

不需要任何配置，直接扫描：

```bash
bun <lint-repo>/src/scoring/report.ts src/
```

输出示例：

```
╔══════════════════════════════════════════════════╗
║          Capability Health Report                ║
╠══════════════════════════════════════════════════╣
║  Files scanned:       29
║  Functions:           72
║  Pure functions:       0
║  Undeclared:          72
║
║  ── Capability Burden ──        (越低越好)
║    IO             1937.5  ████████████████████
║    Fallible       1937.5  ████████████████████
║    ...
║    TOTAL          9687.5
║
║  ── Type Looseness ──           (越低越好)
║    any                  ×  2  =    20
║    optional-field       × 15  =    15
║    TOTAL                          51
╚══════════════════════════════════════════════════╝
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
      // 检查能力权限传播：调用方必须声明被调方的所有能力
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
| `Record<string, any>` | 8 | 键值都无约束 |
| `unknown` | 3 | 比 any 好，但仍需运行时收窄 |
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

### 第一步：声明能力（降幅最大）

未声明的函数被视为全能力（×5），声明后只计实际能力。这通常能一次降 60-80%。

```typescript
// 前：未声明，加权行 120 × 5能力 = 600 分
async function fetchUser(id: string) { ... }

// 后：声明了 2 个能力，120 × 2 = 240 分（-60%）
/** @capability IO Fallible */
async function fetchUser(id: string) { ... }
```

### 第二步：拆分函数、隔离能力

把一个大函数拆成多个小函数，每个只携带必要的能力。

```typescript
// 前：一个函数做校验 + IO + 哈希，携带 IO + Fallible + Impure
/** @capability IO Fallible Impure */
async function registerUser(input: UserInput): Promise<User> {
  if (!input.email.includes("@")) throw new Error("bad email");
  const hash = crypto.createHash("sha256").update(input.password).digest("hex");
  return await db.users.create({ ...input, passwordHash: hash });
}

// 后：拆成三个函数
/** @capability Fallible */
function validateEmail(email: string): string | null {
  return email.includes("@") ? null : "invalid email";
}

/** @capability Impure */
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

/** @capability IO Fallible */
async function registerUser_IO_Fallible(input: ValidatedInput): Promise<User> {
  return await db.users.create({ ...input, passwordHash: hashPassword(input.password) });
}
```

### 第三步：提取纯函数

纯函数（无能力）对能力负担贡献为 **零**。把计算逻辑从有能力的函数中提取出来。

```typescript
// 纯函数：不管多复杂，能力负担 = 0
/** @capability */
function buildEmailBody(name: string, role: string): string {
  // 50 行复杂的字符串拼接逻辑...
  return body;
}
```

### 第四步：收窄类型（降低松散度）

```typescript
// 前：松散度 +10
function process(data: any) { ... }

// 后：松散度 0
function process(data: UserInput) { ... }
```

```typescript
// 前：布尔参数，松散度 +2，调用处 process(data, true) 无语义
function process(data: UserInput, sendEmail: boolean) { ... }

// 后：枚举参数，松散度 0，调用处 process(data, "send-email") 自解释
function process(data: UserInput, notify: "send-email" | "skip") { ... }
```

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
