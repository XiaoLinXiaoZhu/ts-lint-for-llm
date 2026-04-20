/**
 * 测试套件：验证 capability-lint 所有核心功能
 */

import { resolve } from "node:path";
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { scanProject, type ProjectScan } from "../src/scanner.js";
import { analyze, DiagnosticKind, type AnalysisResult } from "../src/analyzer.js";
import { scoreLooseness } from "../src/looseness.js";
import { computeScores } from "../src/reporter.js";
import { applyFixes } from "../src/fixer.js";
import { Project } from "ts-morph";

const FIXTURE = resolve(import.meta.dir, "fixture/tsconfig.json");
let scan: ProjectScan;
let result: AnalysisResult;

function setup() {
  scan = scanProject(FIXTURE);
  result = analyze(scan);
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function findFn(name: string) {
  for (const [id, fn] of scan.functions) {
    if (fn.name === name) return fn;
  }
  return null;
}

function findDiags(fnName: string, kind?: DiagnosticKind) {
  return result.diagnostics.filter(d =>
    d.functionName === fnName && (kind === undefined || d.kind === kind)
  );
}

// ══ 测试 ══

setup();

console.log("\n── 1. Scanner: 函数扫描 ──");
{
  assert(findFn("add") !== null, "扫描到 pure.ts 的 add");
  assert(findFn("multiply") !== null, "扫描到 pure.ts 的 multiply");
  assert(findFn("fetchUser") !== null, "扫描到 io-layer.ts 的 fetchUser");
  assert(findFn("badPure") !== null, "扫描到 violations.ts 的 badPure");
  assert(findFn("undeclaredFn") !== null, "扫描到 violations.ts 的 undeclaredFn");
}

console.log("\n── 2. Scanner: 能力声明解析 ──");
{
  const add = findFn("add")!;
  assert(add.isDeclared, "add 已声明");
  assert(add.declaredCaps.size === 0, "add 是纯函数", `caps: [${[...add.declaredCaps]}]`);

  const fetchUser = findFn("fetchUser")!;
  assert(fetchUser.isDeclared, "fetchUser 已声明");
  assert(fetchUser.declaredCaps.has("IO"), "fetchUser 声明了 IO");
  assert(fetchUser.declaredCaps.has("Fallible"), "fetchUser 声明了 Fallible");

  const undeclaredFn = findFn("undeclaredFn")!;
  assert(!undeclaredFn.isDeclared, "undeclaredFn 未声明");
}

console.log("\n── 3. Scanner: 返回类型检测 ──");
{
  const fetchUser = findFn("fetchUser")!;
  assert(fetchUser.returnsAsync, "fetchUser returnsAsync");
  assert(fetchUser.returnsNullable, "fetchUser returnsNullable");

  const add = findFn("add")!;
  assert(!add.returnsAsync, "add 不 returnsAsync");
  assert(!add.returnsNullable, "add 不 returnsNullable");

  const findItem = findFn("findItem")!;
  assert(findItem.returnsNullable, "findItem returnsNullable");
  assert(!findItem.returnsAsync, "findItem 不 returnsAsync");

  const loadData = findFn("loadData")!;
  assert(loadData.returnsAsync, "loadData returnsAsync");
}

console.log("\n── 4. Scanner: 跨文件调用解析 ──");
{
  const badPure = findFn("badPure")!;
  assert(badPure.resolvedCalls.length > 0, "badPure 有 resolved calls", `got ${badPure.resolvedCalls.length}`);
  const callsFetchUser = badPure.resolvedCalls.some(c => c.target.includes("fetchUser"));
  assert(callsFetchUser, "badPure 解析到了对 fetchUser 的调用");

  const processAndLog = findFn("processAndLog")!;
  const callsAdd = processAndLog.resolvedCalls.some(c => c.target.includes("add"));
  const callsLogResult = processAndLog.resolvedCalls.some(c => c.target.includes("logResult"));
  assert(callsAdd, "processAndLog 解析到了对 add 的调用");
  assert(callsLogResult, "processAndLog 解析到了对 logResult 的调用");
}

console.log("\n── 5. Analyzer: escalation 检测 ──");
{
  const diags = findDiags("badPure", DiagnosticKind.Escalation);
  assert(diags.length > 0, "badPure 报了 escalation", `got ${diags.length}`);
  assert(diags.some(d => d.missingCaps?.includes("IO")), "badPure 缺少 IO");
}

console.log("\n── 6. Analyzer: undeclared 检测 ──");
{
  const diags = findDiags("undeclaredFn", DiagnosticKind.Undeclared);
  assert(diags.length === 1, "undeclaredFn 报了 undeclared");
}

console.log("\n── 7. Analyzer: mismatch 检测 ──");
{
  const fallibleMismatch = findDiags("findItem", DiagnosticKind.FallibleMismatch);
  assert(fallibleMismatch.length === 1, "findItem 报了 FallibleMismatch");

  const asyncMismatch = findDiags("loadData", DiagnosticKind.AsyncMismatch);
  assert(asyncMismatch.length === 1, "loadData 报了 AsyncMismatch");
}

console.log("\n── 8. Analyzer: absorbed 检测 ──");
{
  const diags = findDiags("safeFetch", DiagnosticKind.Absorbed);
  assert(diags.length > 0, "safeFetch 报了 absorbed（Fallible）");
}

console.log("\n── 9. Looseness 评分 ──");
{
  const project = new Project({ tsConfigFilePath: FIXTURE });
  const sf = project.getSourceFiles().find(f => f.getFilePath().includes("looseness.ts"));
  assert(sf !== undefined, "找到 looseness.ts");
  if (sf) {
    const lr = scoreLooseness(sf);
    assert(lr.total > 0, "looseness total > 0", `got ${lr.total}`);
    assert(lr.byType["any"] !== undefined, "检测到 any");
    assert(lr.byType["as-any"] !== undefined, "检测到 as any");
    assert(lr.byType["Record<string,any>"] !== undefined, "检测到 Record<string,any>");
    assert(lr.byType["Object"] !== undefined, "检测到 Object");
    assert(lr.byType["Function"] !== undefined, "检测到 Function");
    assert(lr.byType["bool-param"] !== undefined, "检测到 boolean 参数");
    assert(lr.byType["@ts-ignore"] !== undefined, "检测到 @ts-ignore");
    assert(lr.byType["optional-field"] !== undefined, "检测到 optional field");
  }
}

console.log("\n── 10. 评分计算 ──");
{
  const project = new Project({ tsConfigFilePath: FIXTURE });
  const looseMap = new Map<string, ReturnType<typeof scoreLooseness>>();
  for (const sf of project.getSourceFiles()) {
    if (!sf.getFilePath().includes("node_modules")) {
      looseMap.set(sf.getFilePath(), scoreLooseness(sf));
    }
  }
  const scores = computeScores(scan, result, looseMap);
  assert(scores.totalFunctions > 0, "totalFunctions > 0");
  assert(scores.totalPure > 0, "totalPure > 0 (add, multiply 是纯函数)");
  assert(scores.totalCap > 0, "totalCap > 0");
  assert(scores.totalLoose > 0, "totalLoose > 0");
  assert(scores.topFunctions.length > 0, "topFunctions 非空");
  assert(scores.fileScores.length > 0, "fileScores 非空");
}

console.log("\n── 11. --fix 自动修复 ──");
{
  // 备份 violations.ts，修复后检查，再还原
  const violationsPath = resolve(import.meta.dir, "fixture/violations.ts");
  const original = readFileSync(violationsPath, "utf8");
  const mutablePath = resolve(import.meta.dir, "fixture/mutable.ts");
  const mutableOriginal = readFileSync(mutablePath, "utf8");

  const fixResult = applyFixes(scan, result);
  const fixed = readFileSync(violationsPath, "utf8");

  // 验证修复内容
  const hasIO = fixed.includes("@capability IO") && !original.match(/@capability IO\b.*\bfindItem/);
  assert(fixResult.capsAdded > 0 || fixResult.capsRemoved > 0, "--fix 产生了修改", `+${fixResult.capsAdded} -${fixResult.capsRemoved}`);

  // 还原
  writeFileSync(violationsPath, original);
  writeFileSync(mutablePath, mutableOriginal);
}

console.log("\n── 12. .cap.ts 外部能力声明 ──");
{
  // cap file 应该被加载
  assert(scan.externalCaps.size > 0, "加载了 .cap.ts 声明", `size=${scan.externalCaps.size}`);

  // externalApiCall 应该在 externalCaps 中
  const ext = scan.externalCaps.get("externalApiCall");
  assert(ext !== undefined, "externalApiCall 在 externalCaps 中");
  if (ext) {
    assert(ext.caps.includes("IO"), "externalApiCall 有 IO");
    assert(ext.caps.includes("Async"), "externalApiCall 有 Async");
    assert(ext.caps.includes("Fallible"), "externalApiCall 有 Fallible");
  }

  // callsExternalApi 调用了 externalApiCall，应该报 escalation（缺 IO）
  const diags = findDiags("callsExternalApi", DiagnosticKind.Escalation);
  assert(diags.length > 0, "callsExternalApi 报了 escalation（缺 IO）", `got ${diags.length}`);

  // externalApiCall 不应该出现在 unregistered 中
  const unreg = findDiags("callsExternalApi", DiagnosticKind.Unregistered);
  const unregForApi = unreg.filter(d => d.callee === "externalApiCall");
  assert(unregForApi.length === 0, "externalApiCall 不报 unregistered");
}

console.log("\n── 13. Mutable: 参数可变性检测 ──");
{
  // 非 readonly 引用参数 → mutableParams 非空
  const readState = findFn("readState")!;
  assert(readState.mutableParams.length > 0, "readState 有非 readonly 引用参数", `got [${readState.mutableParams}]`);
  assert(readState.mutableParams.includes("state"), "readState 的 state 参数被检出");

  // readonly 引用参数 → mutableParams 为空
  const readStateRo = findFn("readStateReadonly")!;
  assert(readStateRo.mutableParams.length === 0, "readStateReadonly 无非 readonly 引用参数");

  // readonly 数组参数 → mutableParams 为空
  const sumItems = findFn("sumItems")!;
  assert(sumItems.mutableParams.length === 0, "sumItems 的 readonly number[] 不触发");

  // 非 readonly 数组参数 → mutableParams 非空
  const firstItem = findFn("firstItem")!;
  assert(firstItem.mutableParams.length > 0, "firstItem 的 string[] 参数被检出");

  // 值类型参数 → mutableParams 为空
  const addFn = findFn("add")!;
  assert(addFn.mutableParams.length === 0, "add 的值类型参数不触发");

  // 声明了 Mutable → 不报 MutableParam 诊断
  const pushItem = findFn("pushItem")!;
  assert(pushItem.mutableParams.length > 0, "pushItem 有非 readonly 引用参数");
  const pushItemDiags = findDiags("pushItem", DiagnosticKind.MutableParam);
  assert(pushItemDiags.length === 0, "pushItem 已声明 Mutable，不报 MutableParam");
}

console.log("\n── 14. Mutable: wrappable 行为 ──");
{
  // 局部 push 不再报 Mutable escalation（builtin 已移除 Mutable）
  const buildList = findFn("buildList")!;
  const buildDiags = findDiags("buildList", DiagnosticKind.Escalation);
  const mutableEsc = buildDiags.filter(d => d.missingCaps?.includes("Mutable"));
  assert(mutableEsc.length === 0, "buildList 的局部 push 不报 Mutable escalation");

  // addDefault 有非 readonly 引用参数 → 自动注入 Mutable → 调用 pushItem 不报 escalation
  const addDefault = findFn("addDefault")!;
  const addDefaultMutableParam = findDiags("addDefault", DiagnosticKind.MutableParam);
  assert(addDefaultMutableParam.length > 0, "addDefault 自动注入 Mutable（非 readonly 参数）");
  const escDiags = findDiags("addDefault", DiagnosticKind.Escalation).filter(d => d.missingCaps?.includes("Mutable"));
  assert(escDiags.length === 0, "addDefault 调用 Mutable 函数不报 escalation（已自动注入）");
}

// ══ 汇总 ══

console.log(`\n${"═".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
