# 能力字母表的程序化规范——设计探索

## 核心约束

1. **不改变已有函数名**——这是推广的前提，不能要求已有项目全部重命名
2. **类似 TS 之于 JS**——通过标注/声明补充能力信息，不侵入核心逻辑
3. **能对外部包补充定义**——类似 `@types/node`
4. **渐进式采用**——可以一个模块一个模块地加

## 方案排除

| 方案 | 排除理由 |
|------|---------|
| TS Decorator | 只能用在 class 方法上，不适用于普通函数 |
| Branded return type | 侵入所有函数的返回类型，已有代码要大量修改 |
| 纯 .capability.d.ts | 完全脱离源码，违反 SSOT（自己的代码不该两处维护） |

## 推荐方案：JSDoc `@capability` + ESLint 规则 + 外部包补丁文件

### 自己的代码：JSDoc 就地标注

```typescript
/** @capability I E */
async function fetchUser(id: string): Promise<User> {
  return await db.users.findById(id);
}

/** @capability A E I */
async function sendEmail(to: string, body: string): Promise<void> {
  await smtp.send({ to, body });
}

// 无标注 = 无能力 = 纯函数（最安全的默认值）
function add(a: number, b: number): number {
  return a + b;
}
```

为什么用 JSDoc 而非改名：
- 就在函数定义旁边，符合 SSOT（改函数时顺手更新标注）
- IDE 已经能渲染 JSDoc，开发者悬浮时看到能力声明
- LLM 读取源文件时自然看到标注
- 零侵入——删掉注释代码完全不受影响

**为什么用完整单词后缀（`_IO_Async_Fallible`）而非单字母缩写（`_AEI`）：**

- 对人来说完整单词看着繁琐，但对 LLM 来说是自解释的——不需要查字母表就知道含义
- LLM 生成代码时，完整单词和单字母缩写的成本差异只有 2~3 个 token，几乎可忽略
- 完整单词在代码审查时对人也更友好——`_IO_Blocking_Fallible` 一眼看出三种能力，`_IBE` 需要记住缩写表

### 外部包：补丁声明文件

```typescript
// capabilities/node-fs.cap.ts
// 类似 @types/node，但声明的是能力

export const capabilities = {
  "node:fs": {
    readFileSync: ["I", "B"],     // IO + Blocking
    readFile: ["I", "A", "E"],    // IO + Async + Fallible
    writeFileSync: ["I", "B", "M"], // IO + Blocking + Mutable(文件系统状态)
  },
  "node:crypto": {
    randomBytes: ["I"],           // IO (依赖系统熵源)
    createHash: [],               // 纯计算
  },
} as const;
```

为什么外部包用单独文件：
- 不能修改 node_modules 里的源码
- 和 `@types/*` 同理——补丁文件是对外部世界的适配器
- 可以作为社区共享包发布（`@capabilities/node`, `@capabilities/express`...）

### ESLint 规则：`capability/no-escalation`

**核心规则只有一条：调用方的能力集必须是被调方能力集的超集。**

```
❌ 第 34 行: 函数 'calculateTotal' 缺少能力 'I, E',
   但调用了需要 'I, E' 的 'fetchUser'。
   要么给 'calculateTotal' 添加 @capability I, E，
   要么重构以避免此调用。
```

## 原型验证

已在 `prototype/` 中实现了可运行的 ESLint 规则原型：

```
prototype/
├── src/capability-rule.ts   ← 规则实现（~180 行）
├── test/example.ts          ← 测试用例
└── test/run-lint.ts         ← 运行脚本
```

运行结果：
- ✅ 纯函数调用纯函数：不报错
- ✅ 声明了 `I E` 的函数调用 `I E` 函数：不报错
- ✅ 命名后缀 `_IE` 模式：也能识别
- ❌ 纯函数调用 IO 函数：报错（正确）
- ❌ 纯函数调用网络 IO 函数：报错（正确）

## 待解决的问题

### 1. 能力推断 vs 显式声明

当前方案要求每个有副作用的函数都手动标注。是否可以自动推断？

```typescript
// 如果 fetchUser 标注了 @capability I E
// 那 processUser 调用了 fetchUser → 自动推断需要 I E
// 是否要求 processUser 也必须显式声明？
```

**倾向于要求显式声明**——理由是：
- 自动推断是"隐式的"，读代码的人（和 LLM）看不到
- 显式声明是"承诺"——"我知道这个函数做 IO，我有意为之"
- 遗漏声明时 ESLint 报错，开发者被迫思考"我真的需要在这里做 IO 吗？"

### 2. 回调函数和高阶函数

```typescript
/** @capability I E */
async function fetchUser(id: string): Promise<User> { /* ... */ }

// map 本身是纯的，但传入的回调可能有能力
// 这个 processIds 需要什么能力？
async function processIds(ids: string[]): Promise<User[]> {
  return Promise.all(ids.map(id => fetchUser(id)));
}
```

这是最复杂的场景。可能的方案：
- 保守：如果函数体中出现任何有能力的调用（哪怕在回调里），整个函数需要声明该能力
- 基于原型的当前实现已经是这个行为——扫描函数体内所有 CallExpression

### 3. 类方法

```typescript
class UserService {
  /** @capability I E */
  async getUser(id: string): Promise<User> { /* ... */ }
  
  // 纯方法
  formatName(name: string): string { return name.trim(); }
}
```

JSDoc 在类方法上也能用，原型需要扩展以处理 MethodDefinition 节点。

### 4. 渐进采用策略

在已有项目中的推荐采用步骤：

1. 安装 ESLint 规则，设为 `warn`（不阻塞 CI）
2. 先标注叶子函数（直接做 IO 的函数）——工作量最小
3. 让 ESLint 的 warning 自下而上传播——每次有 warning 时决定：标注调用方 or 重构
4. 逐步将 `warn` 提升为 `error`，模块维度逐个收紧
5. 为常用外部包编写 .cap.ts 补丁文件

## 健康报告与 CI 门禁

除了逐行的 ESLint 规则校验，还实现了全局健康报告工具（`prototype/src/report.ts`），对项目中所有函数做三级分类：

| 等级 | 条件 | 含义 |
|------|------|------|
| ✅ 好函数 | 已声明，能力 ⊆ {Async, Blocking, Fallible, Mutable} | 方便单测，无外部依赖 |
| 🔶 已声明 | 已声明，但含 IO/Impure/ThreadLocal/Unsafe | 有副作用但已明确标注 |
| ❌ 未声明 | 无任何能力标注 | 坏函数，需要标注 |

报告输出示例（改造前 → 改造后）：

```
改造前: 健康度 0.0%    ⛔ CI 门禁失败
  ❌ readConfig       [UNDECLARED]
  ❌ getUser          [UNDECLARED]
  ❌ formatUserName   [UNDECLARED]
  ❌ calculateAge     [UNDECLARED]
  ...

改造后: 健康度 100.0%  ✅ CI 门禁通过
  ✅ formatUserName                          [(pure)]
  ✅ calculateAge                            [(pure)]
  ✅ generateReport                          [(pure)]
  🔶 readConfig_IO_Blocking_Fallible        [Blocking, Fallible, IO]
  🔶 getUser_IO_Async_Fallible              [Async, Fallible, IO]
  ...
```

CI 门禁：未声明坏函数占比超过可配置阈值（默认 20%）时构建失败，逼迫团队逐步消除坏函数。

## 我的看法

待更新。能力分类可能需要根据 012 的"可消除性"维度重新定义。

## AI 回复2

**状态：活跃。012 已在此基础上推进，但本篇仍有未解决问题。**

011 是当前系统的核心设计文档，012 在其基础上增加了评分模型。011 中的以下部分已被 012 继承或推进：

- **健康报告**：012 用逐行加权评分替代了函数计数，解决了"正向反馈缺失"的问题
- **好函数判定**：012 用能力得分替代了二分法（好/坏），提供了连续的质量梯度
- **原型验证**：`prototype/scoring/` 下的引擎和示例是 011 原型的延伸

仍然活跃、需要继续推进的问题：
1. **能力推断 vs 显式声明**（011 §待解决1）：倾向显式声明，但在评分模型的激励下，LLM 有动力主动声明——这个问题可能因为激励机制的引入而自然解决
2. **回调和高阶函数**（011 §待解决2）：评分模型目前不区分回调中的能力，需要后续处理
3. **类方法**（011 §待解决3）：原型尚未覆盖
4. **能力分类重定义**：012 提出了"可消除性"维度（可包装消除/可重写消除/只能隔离/固有），需要回写到 011 的能力词汇表中
