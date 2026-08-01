# 5. 验证与发布

必须通过：

```text
bun run typecheck
bun test
bun run apps/cli/src/main.ts check --tsconfig packages/engine/test/fixture/tsconfig.json
bun run apps/cli/src/main.ts audit --tsconfig packages/engine/test/fixture/tsconfig.json
```

验收重点：

- `check` 只验证显式接口期望。
- `audit` 输出文件数、函数数和结构诊断。
- `@handles` 无证据时失败。
- 外部 effect 能传播到接口。
- 透传参数有目标和重构建议。
- effects、pass-through、looseness 三类审查可以独立运行。
- 无扫描目标不能伪装成 pass。
