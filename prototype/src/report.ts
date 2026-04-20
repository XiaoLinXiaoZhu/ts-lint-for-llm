/**
 * 能力健康报告
 *
 * 扫描项目中所有函数，生成好/坏函数比例报告。
 *
 * 好函数: 已声明能力，且能力 ⊆ {Async, Blocking, Fallible, Mutable}（方便单测）
 * 坏函数: 未声明能力 或 能力包含 IO/Impure/ThreadLocal/Unsafe
 */

import { ESLint } from "eslint";
import { noEscalation } from "./capability-rule.js";
import { GOOD_FUNCTION_CEILING, type Capability, CAPABILITY_WORDS } from "./capabilities.js";
import * as path from "node:path";
import * as fs from "node:fs";

// ---- 类型 ----

enum FunctionGrade {
  /** 已声明，能力 ⊆ ABEM */
  Good = "good",
  /** 已声明，但含 IO/Impure/ThreadLocal/Unsafe */
  Declared = "declared",
  /** 未声明 = 全能力，最差 */
  Undeclared = "undeclared",
}

interface FunctionRecord {
  name: string;
  file: string;
  line: number;
  capabilities: Capability[];
  declared: boolean;
  grade: FunctionGrade;
}

// ---- 用 ts-morph 做轻量 AST 扫描 ----

// 不引入重依赖，直接用正则 + 简单解析提取函数和标注

function scanFile(filePath: string): FunctionRecord[] {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const records: FunctionRecord[] = [];
  const relPath = path.relative(process.cwd(), filePath);

  const VALID_CAPS = new Set(Object.keys(CAPABILITY_WORDS));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 匹配函数声明: function name(, async function name(, const name =
    let fnName: string | null = null;
    let match: RegExpMatchArray | null;

    match = line.match(/(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[\(<]/);
    if (match) fnName = match[1];

    if (!fnName) {
      match = line.match(/(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s+)?(?:\(|[a-zA-Z_$].*=>)/);
      if (match) fnName = match[1];
    }

    if (!fnName) continue;

    // 提取能力: 从函数名后缀
    const caps = new Set<Capability>();
    let declared = false;

    const suffixMatch = fnName.match(/_([A-Z][a-zA-Z]*(?:_[A-Z][a-zA-Z]*)*)$/);
    if (suffixMatch) {
      const parts = suffixMatch[1].split("_");
      const allValid = parts.every(p => VALID_CAPS.has(p));
      if (allValid) {
        parts.forEach(p => caps.add(p as Capability));
        declared = true;
      }
    }

    // 从 JSDoc @capability 提取（向上搜索最多 5 行）
    if (!declared) {
      for (let j = Math.max(0, i - 5); j < i; j++) {
        const commentLine = lines[j];
        const capMatch = commentLine.match(/@capability(?:\s+(.*))?/);
        if (capMatch) {
          declared = true;
          if (capMatch[1]) {
            for (const word of capMatch[1].trim().split(/[\s,]+/)) {
              if (VALID_CAPS.has(word)) caps.add(word as Capability);
            }
          }
          break;
        }
      }
    }

    // 分级
    let grade: FunctionGrade;
    if (!declared) {
      grade = FunctionGrade.Undeclared;
    } else {
      const hasHeavyCap = [...caps].some(c => !GOOD_FUNCTION_CEILING.has(c));
      grade = hasHeavyCap ? FunctionGrade.Declared : FunctionGrade.Good;
    }

    records.push({
      name: fnName,
      file: relPath,
      line: i + 1,
      capabilities: [...caps].sort(),
      declared,
      grade,
    });
  }

  return records;
}

// ---- 报告生成 ----

function generateReport(targetPaths: string[]): void {
  const allRecords: FunctionRecord[] = [];

  for (const target of targetPaths) {
    const stat = fs.statSync(target);
    if (stat.isFile() && target.endsWith(".ts")) {
      allRecords.push(...scanFile(target));
    } else if (stat.isDirectory()) {
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
            allRecords.push(...scanFile(full));
          }
        }
      };
      walk(target);
    }
  }

  // 统计
  const good = allRecords.filter(r => r.grade === FunctionGrade.Good);
  const declared = allRecords.filter(r => r.grade === FunctionGrade.Declared);
  const undeclared = allRecords.filter(r => r.grade === FunctionGrade.Undeclared);
  const total = allRecords.length;

  const goodPct = total ? (good.length / total * 100).toFixed(1) : "0.0";
  const declaredPct = total ? (declared.length / total * 100).toFixed(1) : "0.0";
  const undeclaredPct = total ? (undeclared.length / total * 100).toFixed(1) : "0.0";
  const healthPct = total ? ((good.length + declared.length) / total * 100).toFixed(1) : "0.0";

  // 输出
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║         能力健康报告 (Capability Health)       ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  函数总数:     ${String(total).padStart(4)}`);
  console.log(`║  ✅ 好函数:    ${String(good.length).padStart(4)}  (${goodPct}%)   能力 ⊆ ABFM，方便单测`);
  console.log(`║  🔶 已声明:    ${String(declared.length).padStart(4)}  (${declaredPct}%)   含 IO/Impure/Unsafe 等`);
  console.log(`║  ❌ 未声明:    ${String(undeclared.length).padStart(4)}  (${undeclaredPct}%)   坏函数，需要标注`);
  console.log(`║`);
  console.log(`║  健康度:       ${healthPct}%   (已声明 / 总数)`);
  console.log("╚══════════════════════════════════════════════╝");

  // 分文件明细
  const byFile = new Map<string, FunctionRecord[]>();
  for (const r of allRecords) {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file)!.push(r);
  }

  console.log("\n── 文件明细 ──\n");

  for (const [file, records] of [...byFile.entries()].sort()) {
    const fileGood = records.filter(r => r.grade === FunctionGrade.Good).length;
    const fileTotal = records.length;
    const fileHealthPct = (fileGood / fileTotal * 100).toFixed(0);
    const fileUndeclared = records.filter(r => r.grade === FunctionGrade.Undeclared).length;

    const icon = fileUndeclared === 0 ? "✅" : "❌";
    console.log(`${icon} ${file}  (${fileGood}/${fileTotal} good, ${fileHealthPct}%)`);

    for (const r of records) {
      const gradeIcon = r.grade === FunctionGrade.Good ? "  ✅"
        : r.grade === FunctionGrade.Declared ? "  🔶"
        : "  ❌";
      const capsStr = r.capabilities.length > 0 ? r.capabilities.join(", ") : "(pure)";
      const tag = r.declared ? capsStr : "UNDECLARED";
      console.log(`${gradeIcon} :${r.line}  ${r.name}  [${tag}]`);
    }
    console.log();
  }

  // CI 退出码: 未声明比例超过阈值则失败
  const maxUndeclaredPct = 20; // 可配置
  if (parseFloat(undeclaredPct) > maxUndeclaredPct) {
    console.log(`\n⛔ CI 门禁: 未声明坏函数占比 ${undeclaredPct}% 超过阈值 ${maxUndeclaredPct}%`);
    process.exit(1);
  }
}

// ---- 入口 ----

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("用法: bun src/report.ts <file-or-dir> [file-or-dir...]");
  console.error("示例: bun src/report.ts src/ test/");
  process.exit(1);
}

generateReport(targets);
