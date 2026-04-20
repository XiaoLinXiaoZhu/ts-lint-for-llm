# 正式代码检查 (Formal Code Inspection / Fagan Inspection)

## 是什么

由 3-5 人组成的检查团队，按照严格的流程逐行审查代码：
1. **计划**：选择待检查的代码模块，分配角色（主持人、作者、审查者、记录员）
2. **概览**：作者讲解代码的背景和设计
3. **准备**：每位审查者独立阅读代码，记录发现的问题
4. **检查会议**：团队逐行过代码，讨论每个发现，记录缺陷
5. **返工**：作者修复缺陷
6. **跟进**：验证所有缺陷已修复

每次检查会议控制在 2 小时内，覆盖 200-400 行代码。

## 历史相关渊源

由 Michael Fagan 在 1976 年于 IBM 提出，发表于 IBM Systems Journal。这是软件工程史上最早被系统化研究的质量保证实践之一。

1980–1990 年代，Fagan 检查在大型企业和政府项目中被广泛采用。NASA、AT&T Bell Labs 的研究反复证实：代码检查是成本效益最高的缺陷发现方式，每人·小时发现 3-5 个缺陷。

2000 年代后，被轻量级的代码评审（code review）取代——先是 email patch review（Linux 内核风格），然后是 GitHub Pull Request 评审（2008 年后）。Pull Request 审查保留了"他人审查代码"的核心，但抛弃了正式检查的结构和纪律。

## TypeScript 代码举例

```typescript
// 以下展示 Fagan 检查中典型的检查清单 (checklist) 驱动审查

// ---- 被检查的代码 ----
async function transferFunds(
  from: Account,
  to: Account,
  amount: number,
  currency: Currency
): Promise<TransferResult> {
  const rate: number = await getExchangeRate(from.currency, currency);
  const converted: number = amount * rate;

  if (from.balance < converted) {
    return { success: false, reason: "insufficient_funds" };
  }

  from.balance -= converted;
  to.balance += amount;

  await saveAccount(from);
  await saveAccount(to);

  return { success: true, newBalance: from.balance };
}

// ---- Fagan 检查清单驱动的发现 ----

// [数据完整性] 审查者 A:
// "saveAccount(from) 成功但 saveAccount(to) 失败时怎么办？
//  from 已扣款但 to 未入账——需要事务或补偿机制。"

// [并发安全] 审查者 B:
// "from.balance 在读取后、扣减前可能被其他请求修改。
//  需要乐观锁（version 字段）或悲观锁。"

// [精度问题] 审查者 C:
// "amount * rate 用浮点运算——0.1 * 3 在 JavaScript 中不等于 0.3。
//  金融计算应使用整数分（cents）或 Decimal 库。"

// [边界条件] 主持人:
// "amount 可以是 0 或负数吗？缺少输入验证。"

// [错误处理] 审查者 A:
// "getExchangeRate 网络失败时的错误没有被 catch——
//  会变成 unhandled rejection。"
```

## 为什么被抛弃

1. **时间成本高昂**：3-5 人开 2 小时会议审查 200 行代码，对现代开发节奏来说太慢
2. **社交压力**：作者在众人面前被逐行指出错误，容易产生对抗情绪
3. **流程僵化**：计划、概览、准备、检查、返工、跟进——6 个步骤太重
4. **Pull Request 的"足够好"替代**：异步、轻量、集成在 CI 中，虽然不如 Fagan 检查彻底，但ROI 更高
5. **规模不经济**：代码产出速度远超正式检查的吞吐量，不可能全量检查

## 是否应该在 LLM 时代重新启用

**检查清单驱动的系统化审查应该复兴——但由 LLM 执行。** 理由：

- Fagan 检查的核心价值不在于"开会"，而在于**用检查清单系统地搜索缺陷类别**（并发、边界、精度、错误处理、安全……）。Pull Request 审查丢掉了这个系统性——审查者凭直觉而非清单。
- LLM 可以用检查清单逐项扫描代码，覆盖所有已知缺陷类别，不会因为疲劳或赶时间而跳过。
- LLM 不会引起社交压力——开发者更容易接受机器的建议而非同事的批评。
- "全量检查不可能"的限制也消失了——LLM 可以对每个 PR 的每行变更都做系统化检查，成本几乎为零。

建议：在 CI 中集成 LLM 审查步骤，用结构化检查清单（并发安全、数据一致性、边界条件、错误处理、安全漏洞）逐项检查。人类审查者聚焦于 LLM 难以判断的设计层面。

## 我的看法

集成prreveiw是流行的方案。

且这和代码本身无关。

## AI 回复

同意，这是 CI/流程问题，不是代码写法问题。PR review（无论是人还是 LLM 执行）不改变代码本身应该长什么样。跑题了。
