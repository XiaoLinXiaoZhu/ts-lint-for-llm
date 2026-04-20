# API 版本化与向后兼容性契约 (API Versioning & Backward Compatibility Contracts)

## 是什么

对每个公开 API（HTTP 接口、库的公共函数、消息格式）维护显式的版本号和兼容性承诺：
- **语义化版本**：MAJOR（破坏性变更）、MINOR（向后兼容的新功能）、PATCH（bug 修复）
- **兼容性测试**：自动化测试确保新版本不破坏旧版本的客户端
- **弃用流程**：先标记为 `@deprecated`，至少保留 N 个版本后才移除
- **变更日志**：每个版本的所有变更都有结构化记录

## 历史相关渊源

API 版本化在 2000 年代的 SOAP/WSDL Web Services 时代就有了，但流程笨重。

REST API 的版本化（URL 路径 /v1/ vs /v2/ vs Header 版本）在 2012–2015 年间成为热议话题。Stripe (2012) 和 Twilio 树立了 API 版本化的行业标杆。

npm 的 semver 规范（2013 年 semver 2.0.0）让 JavaScript 库的版本化有了统一标准。但实际遵守程度参差不齐——很多库在 MINOR 版本中引入了破坏性变更。

2016–2020 年间，消费者驱动契约测试 (Consumer-Driven Contract Testing) 工具如 Pact (2013) 试图自动化兼容性验证，但采用率始终有限。

## TypeScript 代码举例

```typescript
// ---- API 版本化的类型安全实现 ----

// 为不同版本定义不同的响应类型
interface UserResponseV1 {
  id: number;
  name: string;
  email: string;
}

interface UserResponseV2 {
  id: string;         // 从 number 改为 string (UUID)
  name: string;
  email: string;
  avatar_url: string; // 新增字段
  created_at: string; // 新增字段
}

// 版本路由
type ApiVersion = "v1" | "v2";

function serializeUser(user: InternalUser, version: ApiVersion): UserResponseV1 | UserResponseV2 {
  switch (version) {
    case "v1":
      return {
        id: user.legacyNumericId,
        name: user.name,
        email: user.email,
      };
    case "v2":
      return {
        id: user.uuid,
        name: user.name,
        email: user.email,
        avatar_url: user.avatarUrl ?? "",
        created_at: user.createdAt.toISOString(),
      };
  }
}

// ---- 弃用标记与迁移指引 ----

/**
 * @deprecated since v2.0.0. Use `getUserByUUID` instead.
 * Will be removed in v3.0.0.
 * Migration: replace getUser(numericId) with getUserByUUID(uuid).
 * Lookup table: GET /api/v2/users/legacy-id/{numericId} returns UUID.
 */
function getUser(id: number): Promise<UserResponseV1> {
  console.warn(`[DEPRECATION] getUser(number) is deprecated. Use getUserByUUID(string).`);
  return getUserLegacy(id);
}

function getUserByUUID(uuid: string): Promise<UserResponseV2> {
  return getUserInternal(uuid);
}

// ---- 契约测试 ----

// 确保 V1 响应始终满足旧客户端的期望
function contractTestV1(response: unknown): void {
  const r = response as Record<string, unknown>;
  console.assert(typeof r.id === "number", "V1 contract: id must be number");
  console.assert(typeof r.name === "string", "V1 contract: name must be string");
  console.assert(typeof r.email === "string", "V1 contract: email must be string");
  // V1 不应包含 V2 的新字段（避免旧客户端混淆）
  console.assert(!("avatar_url" in r), "V1 contract: must not include avatar_url");
}
```

## 为什么被抛弃

1. **维护多版本的成本**：同时维护 V1 和 V2 的序列化逻辑、测试、文档，开发成本翻倍
2. **版本选择困难**："这是 MAJOR 还是 MINOR 变更？"——团队在语义化版本的判定上经常争论
3. **内部 API 不值得**：团队内部的微服务接口，版本化的仪式感太重
4. **GraphQL 的替代论**："用 GraphQL 就不需要版本了"——字段级别的增减不影响旧查询
5. **Move fast and break things**：初创公司文化不愿意为向后兼容付出代价

## 是否应该在 LLM 时代重新启用

**应该，严格版本化是 LLM 安全修改代码的前提条件。** 理由：

- 当 LLM 修改一个被其他模块/服务调用的函数时，如果没有版本化和兼容性契约，LLM 无法判断修改是否安全——它不知道有多少调用方依赖了旧的行为。
- LLM 可以自动化版本化的苦力活：自动检测破坏性变更（参数类型改变、字段删除）、自动生成迁移代码、自动更新变更日志。
- 契约测试可以由 LLM 自动生成和维护：从 API 的 TypeScript 类型自动生成契约断言，在 CI 中验证。
- "维护多版本"的成本在 LLM 时代大幅降低——LLM 可以同时生成 V1 和 V2 的兼容层代码。

建议：对公开 API 和跨模块接口使用严格的语义化版本。让 LLM 在 PR 审查时自动检测破坏性变更并提醒升级版本号。内部 API 可以用更轻量的方式（在类型变更时自动运行契约测试）。

## 我的看法

向后兼容思想在llm编程中是严重的错误行为。它会带来严重的维护负担。

实际上，如果需要设计兼容层，意味着解耦工作做的不够好。代码始终只应该对于拓展开放，但是对于编辑封闭（SOLID原则）

## AI 回复

你的批评很直接：向后兼容 = 维护负担，而且**如果需要兼容层，说明解耦没做好**。

你引用的开闭原则（对扩展开放，对修改封闭）指出了正确方向：API 的设计应该允许增加新功能而不修改旧接口。如果做到了这一点，就不需要版本化——因为旧客户端不受影响。

我写这篇时把"版本化"当作解决方案，但你指出版本化本身就是问题的症状。真正的解决方案是设计出不需要版本化的接口——这回到了最小接口原则和精确类型定义。

这篇确实和"代码写法"的命题也不太相关。
