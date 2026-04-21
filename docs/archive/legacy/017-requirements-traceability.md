# 需求可追溯性矩阵 (Requirements Traceability Matrix)

## 是什么

建立一个表格/矩阵，把每一条需求（用户故事、功能规格）与实现它的代码模块、验证它的测试用例一一对应。目标是随时能回答：
- 这条需求被哪些代码实现了？
- 这段代码是为了满足哪条需求？
- 这条需求被哪些测试覆盖了？
- 如果需求变了，哪些代码和测试需要同步修改？

## 历史相关渊源

需求追溯性的概念来自 1970 年代的国防软件标准（DOD-STD-2167, 1985）。在 CMM 和 ISO 9001 认证体系中，需求追溯是合规性的硬性要求。

1990 年代是需求追溯的鼎盛期。工具如 IBM DOORS (1993)、RequisitePro (1997) 专门管理需求追溯矩阵。航空航天、医疗器械、汽车行业至今仍在使用。

2000 年代后，敏捷社区基本抛弃了正式的追溯矩阵。用户故事替代了详细需求规格，"可工作的软件"替代了文档化追溯。

## TypeScript 代码举例

```typescript
// 需求追溯矩阵的代码化实现（而非 Excel 表格）

// 需求定义（可以从 Jira/Linear 自动同步）
const REQUIREMENTS = {
  "REQ-001": "用户可以用邮箱注册账号",
  "REQ-002": "密码必须至少8位且包含大小写字母和数字",
  "REQ-003": "注册后发送验证邮件",
  "REQ-004": "同一邮箱不能重复注册",
} as const;

// 在代码中标注需求关联（通过注释或装饰器）
// @traces REQ-001, REQ-002, REQ-004
async function registerUser(email: string, password: string): Promise<RegisterResult> {
  // @traces REQ-004
  const existing: User | null = await userRepo.findByEmail(email);
  if (existing) return { success: false, error: "email_taken" };

  // @traces REQ-002
  if (!isValidPassword(password)) return { success: false, error: "weak_password" };

  const user: User = await userRepo.create({ email, passwordHash: await hash(password) });

  // @traces REQ-003
  await emailService.sendVerification(user.email, user.verificationToken);

  return { success: true, userId: user.id };
}

// @traces REQ-002
function isValidPassword(password: string): boolean {
  const minLength: boolean = password.length >= 8;
  const hasUpper: boolean = /[A-Z]/.test(password);
  const hasLower: boolean = /[a-z]/.test(password);
  const hasDigit: boolean = /[0-9]/.test(password);
  return minLength && hasUpper && hasLower && hasDigit;
}

// 测试中也标注需求关联
// describe("registerUser", () => {
//   // @verifies REQ-001
//   test("creates user with valid email and password", ...);
//
//   // @verifies REQ-002
//   test("rejects password shorter than 8 chars", ...);
//   test("rejects password without uppercase", ...);
//   test("rejects password without digit", ...);
//
//   // @verifies REQ-003
//   test("sends verification email after registration", ...);
//
//   // @verifies REQ-004
//   test("rejects duplicate email", ...);
// });
```

## 为什么被抛弃

1. **维护成本极高**：需求变更时要同步更新矩阵、代码标注、测试标注——三处维护
2. **粒度问题**：需求太粗（"用户可以注册"）则追溯无意义，太细则数量爆炸
3. **虚假合规**：很多团队填矩阵只是为了过审计，追溯关系并不真实
4. **敏捷不兼容**：用户故事频繁变化、拆分、合并，追溯关系难以维护
5. **工具孤岛**：需求在 Jira，代码在 Git，测试在 Jest——跨工具追溯困难

## 是否应该在 LLM 时代重新启用

**应该，因为 LLM 消除了追溯的维护成本。** 理由：

- LLM 可以自动分析代码和测试，推断它们对应的需求——不需要人工标注。"这个函数验证密码长度，对应 REQ-002"这种推理对 LLM 来说很简单。
- 反过来，当需求变更时，LLM 可以自动识别受影响的代码和测试——这是需求追溯的核心价值。
- 追溯矩阵还能帮助 LLM 理解修改的完整范围："如果 REQ-002 从 8 位改为 12 位，需要改 isValidPassword 函数和 3 个测试用例。"
- "工具孤岛"问题：LLM 可以同时读取 Jira 描述、Git 代码、测试文件，自动建立跨工具的追溯关系。

建议：用 LLM 自动生成和维护追溯矩阵（存为 JSON 或 Markdown 表格），在 PR 审查时自动检查"这个变更关联了哪些需求"和"这些需求的测试是否都更新了"。

## 我的看法

这和代码作为ssot，必要的动机、todo等直接写在代码中。不要有单独的说明文档如出一辙。

## AI 回复

同意。需求追溯矩阵 = 代码之外的独立文档 = 违反 SSOT。和 003 (ADR) 是同一个错误。

如果需求信息需要保留，它应该以 TODO/注释的形式存在于代码中（"// 此处实现了用户注册流程 REQ-001"），而不是存在于一个独立的 JSON 矩阵里。但实际上，如果代码本身足够清晰（函数叫 `registerUser`，类型叫 `RegistrationResult`），连这种注释都不需要——代码即文档。
