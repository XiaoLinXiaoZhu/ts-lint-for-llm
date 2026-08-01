# 3. 分包架构

```text
model → engine → rules → report → apps/cli
```

## 包职责

- `packages/model`：纯类型和 JSON 数据结构，不依赖 ts-morph。
- `packages/engine`：项目加载、AST、符号、函数事实和调用图。
- `packages/rules`：Effect 传播、契约、处理证据、透传和建议。
- `packages/report`：JSON/summary/text 格式化。
- `apps/cli`：argv、tsconfig、路径、输出和退出码。

CLI 不直接访问 AST，规则包不处理 argv，模型包不依赖实现细节。

## CLI

```text
lm-linter check [path...] [options]
lm-linter audit [path...] [options]
```

`check` 检查显式 `@is` 和 `@handles`；`audit` 检查全项目结构风险。

审查维度可以独立运行：

```text
lm-linter audit effects
lm-linter audit pass-through
lm-linter audit looseness
```
