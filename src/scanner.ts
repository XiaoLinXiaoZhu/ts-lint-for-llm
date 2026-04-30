/**
 * 扫描器 — 向后兼容的 re-export barrel
 *
 * 实际实现分布在 scan/ 目录:
 *   scan/types.ts    — 类型定义
 *   scan/detect.ts   — 能力检测 + 类型推断 + 加权语句
 *   scan/calls.ts    — 调用解析
 *   scan/scanner.ts  — 项目扫描入口
 */

export type { CallSite, FunctionInfo, ProjectScan } from "./scan/types.js";
export { scanProject } from "./scan/scanner.js";
