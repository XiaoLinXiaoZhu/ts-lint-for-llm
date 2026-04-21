# 混沌工程 (Chaos Engineering)

## 是什么

主动向系统注入故障（杀死进程、注入网络延迟、模拟磁盘满、断开依赖服务），观察系统是否如预期般优雅降级。不是等故障自然发生后被动修复，而是在可控条件下提前暴露脆弱点。

核心原则：定义系统的"稳态行为"指标，构造假说（"当 X 服务挂了，整体延迟增加不超过 200ms"），运行实验验证假说。

## 历史相关渊源

Netflix 在 2010 年迁移到 AWS 后创建了 Chaos Monkey（随机杀死生产实例），2011 年开源。2012 年发展为 Simian Army（包括 Latency Monkey, Conformity Monkey 等）。

2014 年 Netflix 的 Casey Rosenthal 将这一实践系统化为 "Chaos Engineering" 学科，2017 年出版了 *Chaos Engineering: System Resiliency in Practice*。

Gremlin (2016) 和 LitmusChaos (2018) 等商业/开源工具使混沌工程更易落地。但在中小型团队中，混沌工程始终是"知道但没做"的状态——太吓人了。

## TypeScript 代码举例

```typescript
// 混沌工程不直接改变业务代码结构，但它要求代码具备"可注入故障"的能力

// ---- 可注入故障的 HTTP 客户端 ----

enum FaultType {
  None = "none",
  Latency = "latency",
  Error = "error",
  Timeout = "timeout",
}

interface ChaosConfig {
  fault: FaultType;
  latencyMs: number;
  errorRate: number; // 0-1
}

class ResilientHttpClient {
  constructor(
    private baseClient: HttpClient,
    private chaos: ChaosConfig = { fault: FaultType.None, latencyMs: 0, errorRate: 0 }
  ) {}

  async get<T>(url: string): Promise<T> {
    // 混沌注入点
    await this.injectFault();
    
    // 业务逻辑：带重试和超时的请求
    const controller: AbortController = new AbortController();
    const timeoutId: NodeJS.Timeout = setTimeout((): void => controller.abort(), 5000);

    try {
      const response: Response = await this.baseClient.fetch(url, {
        signal: controller.signal,
      });
      return await response.json() as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async injectFault(): Promise<void> {
    switch (this.chaos.fault) {
      case FaultType.Latency:
        await new Promise((r) => setTimeout(r, this.chaos.latencyMs));
        break;
      case FaultType.Error:
        if (Math.random() < this.chaos.errorRate) {
          throw new Error("Chaos: injected error");
        }
        break;
      case FaultType.Timeout:
        await new Promise(() => {}); // 永远不 resolve
        break;
    }
  }
}

// ---- 混沌实验脚本 ----

async function chaosExperiment(): Promise<void> {
  // 1. 定义稳态：正常情况下 p99 延迟 < 200ms
  const baseline: LatencyStats = await measureLatency(normalClient, 100);
  console.assert(baseline.p99 < 200, `Baseline p99 too high: ${baseline.p99}ms`);

  // 2. 注入故障：下游服务增加 100ms 延迟
  const chaosClient: ResilientHttpClient = new ResilientHttpClient(httpClient, {
    fault: FaultType.Latency,
    latencyMs: 100,
    errorRate: 0,
  });

  // 3. 验证假说：系统 p99 延迟增加不超过 150ms
  const chaosStats: LatencyStats = await measureLatency(chaosClient, 100);
  const degradation: number = chaosStats.p99 - baseline.p99;
  console.assert(
    degradation < 150,
    `Hypothesis failed: degradation ${degradation}ms > 150ms threshold`
  );
}
```

## 为什么被抛弃

1. **恐惧因素**：在生产环境主动制造故障？管理层和运维团队的本能反应是拒绝
2. **需要成熟的基础设施**：没有自动扩容、健康检查、断路器的系统，混沌实验 = 自杀
3. **投入大**：需要搭建实验平台、定义稳态指标、设计实验——在功能开发压力下排不上优先级
4. **只适合大规模分布式系统**：单体应用没有"部分故障"的概念，混沌工程无用武之地
5. **结果难以消化**：实验发现了脆弱点，但修复可能需要架构级改动——发现问题容易，修复困难

## 是否应该在 LLM 时代重新启用

**应该，LLM 降低了混沌工程的实施门槛。** 理由：

- LLM 可以分析代码中的外部依赖调用，自动识别故障注入点，生成混沌测试配置——降低了"设计实验"的成本。
- LLM 可以从故障注入点自动生成对应的"优雅降级"代码（断路器、重试、降级响应），同时修复发现的脆弱点。
- 更重要的是：LLM 生成的代码可能引入新的脆弱点（遗漏超时、忘记重试、没有断路器），混沌测试可以系统地暴露这些遗漏。
- "只适合大规模系统"的限制在 2024 年已经弱化——即使小型项目也在调用多个外部 API（支付、邮件、AI 接口），每个都是潜在故障点。

建议：在集成测试中加入故障注入层，LLM 自动为每个外部依赖生成 "正常/延迟/错误/超时" 四种测试场景。不需要在生产环境跑——先在测试环境验证降级行为。

## 我的看法

这和代码本身无关属于测试策略。可以记录一下，但是本质无关。

## AI 回复

同意，测试/运维策略，不改变代码写法。跑题了。
