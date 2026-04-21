# 系统化重构目录 (Systematic Refactoring Catalog)

## 是什么

将代码重构分解为离散的、有命名的、有固定步骤的操作，每步都有前置条件和后置检查。开发者不是随意改代码，而是选择一个命名重构手法（如 "Extract Method", "Replace Conditional with Polymorphism"），按照规定步骤执行，每步之后运行测试确认行为不变。

## 历史相关渊源

Martin Fowler 在 1999 年出版 *Refactoring: Improving the Design of Existing Code*，书中列举了 72 种重构手法，每种都有"动机、做法、示例"三部分。这本书定义了"重构"这个词在软件行业的精确含义。

2000–2004 年间，IDE 开始内置重构工具：Eclipse (Java) 在 2001 年率先支持 "Extract Method"、"Rename" 等自动化重构。IntelliJ IDEA 随后将其做到极致。

但 Fowler 书中 72 种手法里只有约 10 种被 IDE 自动化了。其余（如 "Replace Type Code with State/Strategy"、"Decompose Conditional"、"Introduce Parameter Object"）仍需手动执行，且步骤繁多。

2010 年代后，开发者越来越少参照目录重构，而是凭经验直觉改代码——速度更快但风险更大。

## TypeScript 代码举例

```typescript
// ---- 重构手法: "Replace Conditional with Polymorphism" ----
// 按照 Fowler 的步骤化操作

// 重构前:
function calculatePay(employee: Employee): number {
  switch (employee.type) {
    case "engineer":
      return employee.baseSalary + employee.bonus;
    case "manager":
      return employee.baseSalary + employee.bonus + employee.teamSize * 500;
    case "intern":
      return employee.baseSalary * 0.5;
    default:
      throw new Error(`Unknown type: ${employee.type}`);
  }
}

// 步骤 1: 创建多态类层次（但用可辨识联合更 TypeScript 化）
interface Engineer { kind: "engineer"; baseSalary: number; bonus: number }
interface Manager { kind: "manager"; baseSalary: number; bonus: number; teamSize: number }
interface Intern { kind: "intern"; baseSalary: number }
type Employee = Engineer | Manager | Intern;

// 步骤 2: 为每个类型创建计算函数
function calculateEngineerPay(e: Engineer): number {
  return e.baseSalary + e.bonus;
}
function calculateManagerPay(e: Manager): number {
  return e.baseSalary + e.bonus + e.teamSize * 500;
}
function calculateInternPay(e: Intern): number {
  return e.baseSalary * 0.5;
}

// 步骤 3: 替换 switch 为分派
function calculatePay(employee: Employee): number {
  switch (employee.kind) {
    case "engineer": return calculateEngineerPay(employee);
    case "manager": return calculateManagerPay(employee);
    case "intern": return calculateInternPay(employee);
  }
}

// 步骤 4: 运行测试确认行为不变
// 步骤 5: 考虑是否需要进一步重构（如将函数合入各类型模块）

// ---- 重构手法: "Introduce Parameter Object" ----

// 重构前: 参数过多
function createReport(
  startDate: Date, endDate: Date,
  department: string, includeInactive: boolean,
  sortBy: string, limit: number
): Report { /* ... */ }

// 重构后: 参数对象
interface ReportParams {
  dateRange: { start: Date; end: Date };
  department: string;
  includeInactive: boolean;
  sortBy: string;
  limit: number;
}

function createReport(params: ReportParams): Report { /* ... */ }
```

## 为什么被抛弃

1. **步骤繁琐**：一个"Replace Conditional with Polymorphism"可能需要 10+ 个微步骤，每步都要运行测试
2. **IDE 只自动化了简单的**：Rename、Extract 可以自动化，但结构性重构仍需手动
3. **命名记忆负担**：72 种手法的名字和适用场景需要大量学习
4. **实际中的"快速重构"**：有经验的开发者可以一步到位，不需要按步骤走
5. **敏捷团队的时间压力**：Sprint 中没有专门的"重构时间"，重构总是在做功能的间隙顺手进行

## 是否应该在 LLM 时代重新启用

**应该——LLM 是理想的"重构目录执行引擎"。** 理由：

- LLM 可以记住所有 72+ 种重构手法及其步骤——人类不需要记忆。
- LLM 可以识别代码中的"坏味道"（code smell）并推荐适用的重构手法——人类不需要判断。
- LLM 可以按步骤执行重构，每步后运行测试——保证行为不变。这比人类的"一步到位"更安全。
- 系统化重构的真正价值是**可审计性**：每一步变更都很小、有命名、可回退。这在 LLM 大规模修改代码时尤其重要——比起 LLM 一次性重写整个文件，按命名步骤重构更可控。

建议：让 LLM 在执行重构时遵循 Fowler 目录的步骤化流程，每步生成一个独立 commit。代码审查者可以逐 commit 验证变更的安全性。

## 我的看法

这和代码本身无关属于测试策略。可以记录一下，但是本质无关。

## AI 回复

同意。重构是代码变更的过程方法，不是代码的最终形态。"代码应该怎么写"和"代码应该怎么改"是两个不同的问题。这篇讨论的是后者，不在你的范围内。