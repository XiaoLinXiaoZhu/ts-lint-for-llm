# LM Linter IE 产品基线

本目录是重写后唯一有效的产品文档入口。实现只存在于 `packages/*` 和 `apps/cli`，文档、需求、DFMEA、验证和变更记录都必须回链到这里。

## 产品定义

LM Linter 为模型提供 TypeScript 工程质量事实：

1. 从源码推断 Effect。
2. 沿调用图传播 Effect。
3. 检查用户选择的 `@is` 接口期望。
4. 验证 `@handles` 是否真的消费了副作用。
5. 审计参数透传和结构性复杂度。
6. 输出证据和可执行重构方向，而不是单一总分。

## 注解协议

```ts
/** @is pure total readonly sync */
/** @handles may-return-none */
/** @effect io nondeterministic */
```

旧的 `@assert`、`@capability`、`Fallible`、`Mutable`、`Capability` 不再属于规范。

## 文档

- [01-system-definition.md](./01-system-definition.md)：系统边界和术语
- [02-effect-contract-model.md](./02-effect-contract-model.md)：Effect、`@is`、`@handles`、传播
- [03-package-architecture.md](./03-package-architecture.md)：分包和依赖方向
- [04-dfmea.md](./04-dfmea.md)：设计失效模式
- [05-verification.md](./05-verification.md)：测试和发布门槛
- [06-change-control.md](./06-change-control.md)：F 编号和变更控制
- [requirements.json](./requirements.json)：唯一需求清单
