---
alias:
  - 命令行
---

# CLI

工具的命令行入口。

## 用法

```
capability-lint [file.ts | dir/ ...] [options]
```

## 位置参数

零个或多个文件路径 / 目录路径，平铺传入。

- 传入文件或目录时，只分析这些路径涉及的文件（局部分析）。
- 不传时，分析整个项目。

项目始终通过 tsconfig.json 加载。默认使用 cwd 下的 tsconfig.json，可通过 `--tsconfig` 指定。

## 选项

| 选项 | 说明 |
|------|------|
| `--tsconfig <path>` | 指定 tsconfig.json 路径（默认：cwd 下的 tsconfig.json） |
| `--fix` | 【自动修复】 |
| `--dry-run` | 预览 --fix 变更，不写入文件（需配合 --fix） |
| `--summary` | 只输出分数和匹配的【优化建议】，不输出完整诊断和函数列表 |
| `--hint <keyword>` | 筛选【优化建议】，只返回匹配关键词的 tips（见【优化建议】） |
| `--help` | 帮助信息 |
| `--version` | 版本号 |

输出固定为 JSON 格式。需要细致 debug 时，用 `rg` / `jq` 处理 JSON 输出，或传入具体 file/folder 缩小范围。

## 执行流程

1. 解析参数，定位 tsconfig.json
2. 扫描项目 → ProjectScan
3. 分析 → AnalysisResult（含诊断）
4. 计算【类型松散度】
5. 计算评分 → ScoreSummary
6. 若 --fix，基于诊断执行【自动修复】，若文件被修改则重新执行步骤 2-5
7. 若指定了文件/目录，过滤诊断到对应范围
8. 输出 JSON（完整或 --summary）

## 退出码

- 0：无错误级【诊断】（仅有 【implicit_capability】 信息也算 0）
- 1：存在错误级诊断

## 日志

进度信息输出到 stderr（扫描耗时、函数数量、诊断数量、fix 结果），不污染 stdout 的 JSON 输出。
