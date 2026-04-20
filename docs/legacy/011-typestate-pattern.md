# Typestate 模式 / 协议类型检查

## 是什么

用类型系统编码对象的状态转换协议，使得在错误状态下调用方法会导致**编译期错误**而非运行时异常。对象的类型随着操作而改变——一个"未连接的Socket"和"已连接的Socket"是不同的类型，因此在"未连接的Socket"上调用 `send()` 在编译时就会报错。

## 历史相关渊源

Typestate 的概念由 Robert Strom 和 Shaham Yemini 在 1986 年的论文中提出。学术研究在 2005–2012 年间密集出现（Aldrich et al., Plaid 语言）。

Rust 语言（2010 年启动，2015 年 1.0）通过所有权系统在实践中实现了部分 typestate 理念——`move` 语义使得已转移所有权的值无法再被使用。

TypeScript 社区在 2016–2020 年间也出现了用泛型和条件类型模拟 typestate 的实验（Builder 模式、状态机类型）。但由于实现复杂度极高，始终是类型体操爱好者的玩具，未进入生产实践。

## TypeScript 代码举例

```typescript
// ---- 用泛型模拟 Typestate：HTTP 请求构建器 ----

// 状态标记类型
type HasURL = { url: true };
type NoURL = { url: false };
type HasMethod = { method: true };
type NoMethod = { method: false };

type RequestState = { url: boolean; method: boolean };

class RequestBuilder<S extends RequestState> {
  private config: { url?: string; method?: string; headers: Record<string, string>; body?: string };

  private constructor(config: Partial<typeof RequestBuilder.prototype.config>) {
    this.config = { headers: {}, ...config } as any;
  }

  static create(): RequestBuilder<{ url: false; method: false }> {
    return new RequestBuilder({});
  }

  // 设置 URL: 将 url 状态从 false 变为 true
  url(url: string): RequestBuilder<S & { url: true }> {
    return new RequestBuilder({ ...this.config, url }) as any;
  }

  // 设置方法: 将 method 状态从 false 变为 true
  method(method: string): RequestBuilder<S & { method: true }> {
    return new RequestBuilder({ ...this.config, method }) as any;
  }

  // headers 在任何状态下都可以设置
  header(key: string, value: string): RequestBuilder<S> {
    const headers: Record<string, string> = { ...this.config.headers, [key]: value };
    return new RequestBuilder({ ...this.config, headers }) as any;
  }

  // send 只有在 url 和 method 都设置后才可调用
  send(this: RequestBuilder<{ url: true; method: true }>): Promise<Response> {
    return fetch(this.config.url!, { method: this.config.method!, headers: this.config.headers });
  }
}

// ✅ 编译通过：url 和 method 都已设置
const response1 = RequestBuilder.create()
  .url("https://api.example.com/data")
  .method("POST")
  .header("Content-Type", "application/json")
  .send();

// ❌ 编译错误：缺少 method
// const response2 = RequestBuilder.create()
//   .url("https://api.example.com/data")
//   .send();
// Error: The 'this' context of type 'RequestBuilder<{ url: true; method: false }>'
//   is not assignable to type 'RequestBuilder<{ url: true; method: true }>'
```

## 为什么被抛弃

1. **类型体操**：TypeScript 中实现 typestate 需要大量泛型技巧，代码可读性极差
2. **类型错误信息不友好**：编译器报错是"Type A is not assignable to Type B"而非"你忘了设置 URL"
3. **IDE 支持差**：自动补全在复杂泛型类型上经常失灵或卡顿
4. **组合爆炸**：状态维度增加时，类型数量指数增长（3 个布尔标记 = 8 种类型组合）
5. **过度工程**：多数场景用运行时检查就足够了，为了把检查提前到编译期不值得付出这么多复杂度

## 是否应该在 LLM 时代重新启用

**应该，但由 LLM 生成和维护 typestate 模板，人类只使用。** 理由：

- Typestate 最大的价值是**让错误使用不可能发生**——这对 LLM 生成的代码尤其重要，因为 LLM 经常在调用顺序上犯错。
- Typestate 的最大成本是**编写和维护复杂的泛型类型**——这恰好是 LLM 擅长的。人类描述状态转换规则，LLM 生成泛型实现。
- LLM 还可以生成更好的错误信息（通过 TypeScript 的 `@ts-expect-error` 和自定义错误类型）。
- 组合爆炸问题可以由 LLM 自动管理——当新状态维度加入时，LLM 自动更新所有类型组合。

建议：对有明确状态转换协议的 API（数据库连接、HTTP 客户端、工作流引擎），让 LLM 从状态机描述生成 typestate 实现。对普通 CRUD 代码不使用。

## 我的看法

参考我在 [004](004-design-by-contract.md) 中的看法，系统应该建立一种确定的信心，这种信心应该来自于类型约束。因此这里是完全正确的。

## AI 回复

你把 011 和 004 串起来了——"信心来自类型约束"。Typestate 和 branded types 是同一思想在不同场景的表现：

- Branded types (004/006)：在入口处校验值的属性，用类型标记"已验证"
- Typestate (011)：在类型层面编码对象的状态转换，让非法调用序列在编译时报错

两者都是"让不合法的操作不可表示"。对人来说写 typestate 的泛型确实是类型体操，但对 LLM 来说生成和维护这些泛型是低成本的。这正好符合命题——"对人太繁琐但 LLM 不怕"。
