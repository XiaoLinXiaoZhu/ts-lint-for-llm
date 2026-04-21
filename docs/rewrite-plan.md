# 重写计划

基于 `docs/wiki/wiki-docs/` 中的规格定义，全部重写 `src/` 下的 9 个模块。

## 原则

- 能力分类、评分规则、诊断类型等均从配置派生，不硬编码到逻辑中
- 每步完成后运行测试验证，测试也同步重写

## 步骤

### Step 1 — capabilities.ts

重写能力配置，作为全局唯一配置源。后续所有模块从此读取。

```ts
interface CapabilityDef {
  kind: "propagate" | "block";
  autoDetectable: boolean;   // 是否可自动检测
  scorable: boolean;         // 是否计入评分
  blocks?: string;           // block 类型：阻断哪个传播能力
  blockedBy?: string;        // propagate 类型：被哪个阻断能力阻断
}
```

8 个能力的配置：

| 能力 | kind | autoDetectable | scorable | blocks/blockedBy |
|------|------|----------------|----------|------------------|
| IO | propagate | false | true | — |
| Impure | propagate | false | true | — |
| Fallible | propagate | true | true | blockedBy: HandleFallible |
| Async | propagate | true | true | blockedBy: HandleAsync |
| Mutable | propagate | true | true | blockedBy: HandleMutable |
| HandleFallible | block | false | false | blocks: Fallible |
| HandleAsync | block | false | false | blocks: Async |
| HandleMutable | block | false | false | blocks: Mutable |

所有下游模块通过查询配置决定行为，不硬编码 `if cap === "Fallible"` 之类的分支。

输出：`Capability` 类型、`ALL_CAPABILITIES`、`CAPABILITY_DEFS` 映射表，以及派生的便捷集合（`PROPAGATE_CAPS`、`BLOCK_CAPS`、`SCORABLE_CAPS`、`AUTO_DETECTABLE_CAPS`、`BLOCK_PAIRS`）。

### Step 2 — builtin.ts

key 从裸函数名改为 `fullyQualifiedName`：

```ts
"JSON.parse":    ["Fallible"],
"Console.log":   ["IO"],
"Math.random":   ["Impure"],
"Array.push":    [],
"Body.json":     ["Async", "Fallible"],
"fetch":         ["IO", "Async", "Fallible"],
```

全局函数（fetch、setTimeout）的 fullyQualifiedName 就是函数名本身。

### Step 3 — scanner.ts

三个核心变更：

**3a. 函数 ID 改为 `filePath:pos`**

声明阶段取 `node.getStart()`。不再维护 byName 索引和 findOwner 匹配逻辑。

```ts
const id = `${filePath}:${node.getStart()}`;
```

**3b. 调用解析走 symbol → declaration → pos**

```ts
function resolveCallTarget(call): string | null {
  const sym = call.getExpression().getSymbol();
  if (!sym) return null;
  const decl = sym.getDeclarations()[0];
  // ImportSpecifier → 追踪到源模块 export
  // 声明在 node_modules/lib → 返回 null（进入未解析流程）
  const id = `${decl.getSourceFile().getFilePath()}:${decl.getStart()}`;
  return functions.has(id) ? id : null;
}
```

调用所属函数的判定同理：取最近函数祖先的 `getStart()` + `filePath` 直接查表。

**3c. 未解析调用增加 qualifiedName**

```ts
interface CallSite {
  target: string;              // 已解析：函数ID；未解析：裸名
  qualifiedName?: string;      // symbol.getFullyQualifiedName()
  line: number;
}
```

**3d. 声明解析**

`@capability` 中的 8 个能力名统一识别，`!Cap` 语法不再支持。Handle 能力和传播能力都进入 declaredCaps。

### Step 4 — analyzer.ts

**4a. effectiveCaps 计算**

```
effectiveCaps = declaredCaps ∪ autoDetected
```

自动检测只看 `CAPABILITY_DEFS[cap].autoDetectable`，不受 Handle 能力影响。

**4b. propagatedCaps 计算**

```
propagatedCaps = effectiveCaps
  - 所有 kind=block 的能力
  - 所有被 block 的 propagate 能力（通过 BLOCK_PAIRS 查）
```

**4c. 4 种诊断**

| 诊断 | 触发 |
|------|------|
| missing_capability | callee.propagatedCaps 中有 cap，caller.effectiveCaps 中没有 cap 且没有对应 block |
| undeclared | isDeclared = false |
| unregistered | 未解析调用在 externalCaps 和 builtin 中均未命中 |
| implicit_capability | 自动检测注入了未显式声明的能力（info，不影响退出码） |

missing_capability 不再按能力类型拆分，一条诊断列出所有缺失能力。

### Step 5 — reporter.ts

- 删除 `formatPretty` 和 `formatLLM`，只保留 `formatJSON`
- 评分只计 `CAPABILITY_DEFS[cap].scorable === true` 的能力
- tips 改为按 hint 关键词筛选，不传 `--hint` 时 scores 中不含 tips
- 新增 summary 模式（只输出 scores）

### Step 6 — fixer.ts

- 执行时机移到分析之后
- 基于诊断结果修改：
  - undeclared → 加空 `@capability`
  - missing_capability 中 `kind=propagate && !autoDetectable`（IO/Impure）→ 自动补
  - missing_capability 中 `autoDetectable`（Fallible/Async/Mutable）→ 不补，保留诊断
  - 多余声明 → 移除
- `!Cap` 语法支持删除，统一用 HandleCap
- 修复后若文件变更，返回标志让 CLI 重新扫描+分析

### Step 7 — cap-file.ts

- `@capability` 解析适配 8 个能力名

### Step 8 — looseness.ts

- 无重大变化，保持现状

### Step 9 — cli.ts

- 位置参数：零或多个 file/folder，平铺
- `--tsconfig <path>`：指定 tsconfig.json
- 删除 `--json` / `--pretty` / `--llm`（固定 JSON）
- 新增 `--summary` / `--hint <keyword>`
- 执行流程：
  1. 解析参数，定位 tsconfig
  2. 扫描 → 分析 → 评分
  3. 若 `--fix`：执行修复 → 若文件变更则重新扫描+分析+评分
  4. 过滤 → 输出 JSON

### Step 10 — test/run.ts

同步重写测试，覆盖新的：
- 8 个能力名识别
- `filePath:pos` 函数 ID
- `qualifiedName` 调用解析
- 4 种诊断的触发条件
- propagatedCaps 计算（Handle 阻断传播）
- 评分不计阻断能力
- `--fix` 对不可阻断/可阻断能力的不同处理
