/**
 * 评分报告的共享类型
 */

import type { CapabilityResult, FunctionScore } from "./capability-scorer.js";
import type { LoosenessResult } from "./looseness-scorer.js";

export interface FileResult {
  file: string;
  capability: CapabilityResult;
  looseness: LoosenessResult;
}

export interface Summary {
  totalCap: number;
  totalLoose: number;
  totalFunctions: number;
  totalPure: number;
  totalUndeclared: number;
  capScores: Record<string, number>;
  looseByType: Record<string, { count: number; penalty: number }>;
  allFunctions: Array<FunctionScore & { file: string }>;
}

export interface Tip {
  priority: number;
  text: string;
}

export interface ReportData {
  results: FileResult[];
  summary: Summary;
  tips: Tip[];
}

/** 报告输出适配器 */
export interface ReporterPort {
  (data: ReportData): void;
}
