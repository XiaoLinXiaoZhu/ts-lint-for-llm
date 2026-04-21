---
alias:
  - fts-lint
  - linter支持
---

# linter联动

【CLI】对【编译产物】运行时，自动识别 `// AUTO-GENERATED` 头部，将【诊断】和【函数得分】的路径从 index.ts 重映射到对应的【fts文件】。

## 路径重映射

从【编译产物】中的 `// ── {stem} ──` 分隔注释提取源文件名 stem，按【文件命名】规则转换为标识符后与函数名匹配。stem 保留【可见性】的 `_` 前缀，因此 `_internal-helper` 能正确映射回 `_internal-helper.fts`。

映射后 filePath 指向 .fts / .type.fts 源文件，行号固定为 1。

## 能力声明识别

【fts文件】首行的 `/** @capability ... */` 与标准 .ts 的【JSDoc声明】格式一致。【编译器】原样保留到【编译产物】，linter 无需特殊处理即可识别。

## --fix

【自动修复】对 .fts 文件的行为：

| 【诊断】 | 修复动作 |
|----------|----------|
| 【undeclared】 | 在文件首行插入 `/** @capability */` |
| 【missing_capability】不可阻断 | 替换首行 JSDoc，补入缺失能力 |
| 【missing_capability】可阻断 | 不自动补，保留诊断 |
| 多余声明 | 替换首行 JSDoc，移除多余能力 |

修复 .fts 文件后，自动重新编译该目录的【编译产物】，再 re-scan 输出修复后的结果。

## 工作流

```
fts-compile --all           ← 编译所有 fts 目录
capability-lint             ← 诊断指向 .fts 文件
capability-lint --fix       ← 直接修改 .fts 文件 + 自动重编译
```
