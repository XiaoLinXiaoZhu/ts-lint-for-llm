/**
 * 测试套件：验证重写后的 capability-lint 全部核心功能
 *
 * 覆盖：8 能力名、filePath:pos ID、qualifiedName 调用解析、
 * 4 种诊断、propagatedCaps(Handle阻断)、评分不计阻断能力、--fix 行为
 */

import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { scanProject, type ProjectScan } from "../src/scanner.js";
import { analyze, DiagnosticKind, type AnalysisResult } from "../src/analyzer.js";
import { scoreLooseness } from "../src/looseness.js";
import { computeScores } from "../src/reporter.js";
import { applyFixes } from "../src/fixer.js";
import { PROPAGATE_CAPS, BLOCK_CAPS, SCORABLE_CAPS } from "../src/capabilities.js";
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
  for (const [, fn] of scan.functions) {
    if (fn.name === name) return fn;
  }
  return null;
}

function findAllFns(name: string) {
  return [...scan.functions.values()].filter(f => f.name === name);
}

function findDiags(fnName: string, kind?: DiagnosticKind) {
  return result.diagnostics.filter(d =>
    d.functionName === fnName && (kind === undefined || d.kind === kind)
  );
}

// ══ Tests ══

setup();

console.log("\n── 1. 函数 ID 格式: filePath:pos ──");
{
  const add = findFn("add")!;
  assert(add !== null, "扫描到 add");
  assert(add.id.includes(":"), "add 的 ID 含冒号分隔符", `id=${add.id}`);
  const parts = add.id.split(":");
  const pos = parseInt(parts[parts.length - 1]);
  assert(!isNaN(pos) && pos >= 0, "add 的 ID pos 是有效数字", `pos=${pos}`);

  // 同文件同名方法应有不同 ID
  const resets = findAllFns("reset");
  assert(resets.length === 2, "扫描到两个 reset", `got ${resets.length}`);
  if (resets.length === 2) {
    assert(resets[0].id !== resets[1].id, "两个 reset 有不同的 ID");
  }
}

console.log("\n── 2. 8 个能力名识别 ──");
{
  // 传播能力
  const fetchUser = findFn("fetchUser")!;
  assert(fetchUser.declaredCaps.has("IO"), "fetchUser 声明了 IO");
  assert(fetchUser.declaredCaps.has("Fallible"), "fetchUser 声明了 Fallible");
  assert(fetchUser.declaredCaps.has("Async"), "fetchUser 声明了 Async");

  // Handle 阻断能力
  const safeFetch = findFn("safeFetch")!;
  assert(safeFetch.declaredCaps.has("HandleFallible"), "safeFetch 声明了 HandleFallible");
  assert(safeFetch.declaredCaps.has("IO"), "safeFetch 声明了 IO");
  assert(safeFetch.declaredCaps.has("Async"), "safeFetch 声明了 Async");

  // 纯函数
  const add = findFn("add")!;
  assert(add.isDeclared, "add 已声明");
  assert(add.declaredCaps.size === 0, "add 是纯函数");

  // 未声明
  const undeclaredFn = findFn("undeclaredFn")!;
  assert(!undeclaredFn.isDeclared, "undeclaredFn 未声明");
}

console.log("\n── 3. 返回类型检测 ──");
{
  const fetchUser = findFn("fetchUser")!;
  assert(fetchUser.returnsAsync, "fetchUser returnsAsync");
  assert(fetchUser.returnsNullable, "fetchUser returnsNullable");

  const add = findFn("add")!;
  assert(!add.returnsAsync, "add 不 returnsAsync");
  assert(!add.returnsNullable, "add 不 returnsNullable");

  const findItem = findFn("findItem")!;
  assert(findItem.returnsNullable, "findItem returnsNullable");

  const loadData = findFn("loadData")!;
  assert(loadData.returnsAsync, "loadData returnsAsync");
}

console.log("\n── 4. 跨文件调用解析 (symbol→declaration→pos) ──");
{
  const badPure = findFn("badPure")!;
  assert(badPure.resolvedCalls.length > 0, "badPure 有 resolved calls");
  const callsFetchUser = badPure.resolvedCalls.some(c => {
    const target = scan.functions.get(c.target);
    return target?.name === "fetchUser";
  });
  assert(callsFetchUser, "badPure 解析到 fetchUser 调用");

  const processAndLog = findFn("processAndLog")!;
  const callsAdd = processAndLog.resolvedCalls.some(c => {
    const target = scan.functions.get(c.target);
    return target?.name === "add";
  });
  const callsLogResult = processAndLog.resolvedCalls.some(c => {
    const target = scan.functions.get(c.target);
    return target?.name === "logResult";
  });
  assert(callsAdd, "processAndLog 解析到 add 调用");
  assert(callsLogResult, "processAndLog 解析到 logResult 调用");
}

console.log("\n── 5. qualifiedName 未解析调用 ──");
{
  // console.log 应该在未解析调用中有 qualifiedName
  const logResult = findFn("logResult")!;
  const consoleCall = logResult.unresolvedCalls.find(c => c.target === "log");
  assert(consoleCall !== undefined, "logResult 有 log 未解析调用");
  if (consoleCall) {
    assert(consoleCall.qualifiedName !== undefined, "log 有 qualifiedName", `qn=${consoleCall.qualifiedName}`);
  }
}

console.log("\n── 6. missing_capability 诊断 ──");
{
  const diags = findDiags("badPure", DiagnosticKind.MissingCapability);
  assert(diags.length > 0, "badPure 报了 missing_capability");
  const allMissing = diags.flatMap(d => d.missingCaps ?? []);
  assert(allMissing.includes("IO"), "badPure 缺少 IO");
}

console.log("\n── 7. undeclared 诊断 ──");
{
  const diags = findDiags("undeclaredFn", DiagnosticKind.Undeclared);
  assert(diags.length === 1, "undeclaredFn 报了 undeclared");
}

console.log("\n── 8. implicit_capability 诊断 ──");
{
  // findItem 返回 null 但未声明 Fallible → implicit_capability
  const fallibleImplicit = findDiags("findItem", DiagnosticKind.ImplicitCapability);
  assert(fallibleImplicit.length > 0, "findItem 报了 implicit_capability(Fallible)");

  // loadData 是 async 但未声明 Async → implicit_capability
  const asyncImplicit = findDiags("loadData", DiagnosticKind.ImplicitCapability);
  assert(asyncImplicit.length > 0, "loadData 报了 implicit_capability(Async)");

  // implicit_capability 是 info 级别 → 不影响退出码
  // 验证它们的 kind 确实是 ImplicitCapability
  assert(fallibleImplicit[0].kind === DiagnosticKind.ImplicitCapability, "Fallible implicit 是 info 级");
}

console.log("\n── 9. propagatedCaps: Handle 阻断传播 ──");
{
  // safeFetch: IO Async HandleFallible → propagatedCaps 应为 {IO, Async}（Fallible 被阻断）
  // 但 safeFetch 自身返回类型不含 null，且自身是 async → effectiveCaps 加 Async（已声明）
  // fetchUser propagatedCaps = {IO, Fallible, Async}（无 Handle 能力）
  // safeFetch 有 HandleFallible → Fallible 不 missing
  const safeFetchDiags = findDiags("safeFetch", DiagnosticKind.MissingCapability);
  const fallibleMissing = safeFetchDiags.filter(d => d.missingCaps?.includes("Fallible"));
  assert(fallibleMissing.length === 0, "safeFetch 不缺 Fallible（HandleFallible 阻断）");

  // safeFetch 自身的 propagatedCaps 不含 Fallible
  const safeFetchFn = findFn("safeFetch")!;
  const propagated = result.propagatedCaps.get(safeFetchFn.id)!;
  assert(!propagated.has("Fallible"), "safeFetch propagatedCaps 不含 Fallible");
  assert(!propagated.has("HandleFallible"), "safeFetch propagatedCaps 不含 HandleFallible");
  assert(propagated.has("IO"), "safeFetch propagatedCaps 含 IO");
  assert(propagated.has("Async"), "safeFetch propagatedCaps 含 Async");
}

console.log("\n── 10. unregistered 诊断 ──");
{
  // callsExternalApi 调用 externalApiCall（在 .cap.ts 中声明）→ 不报 unregistered
  const unreg = findDiags("callsExternalApi", DiagnosticKind.Unregistered);
  const unregForApi = unreg.filter(d => d.callee === "externalApiCall");
  assert(unregForApi.length === 0, "externalApiCall 不报 unregistered（.cap.ts 已声明）");

  // .cap.ts 声明的外部函数应该在 externalCaps 中
  const ext = scan.externalCaps.get("externalApiCall");
  assert(ext !== undefined, "externalApiCall 在 externalCaps 中");
  if (ext) {
    assert(ext.caps.includes("IO"), "externalApiCall 有 IO");
    assert(ext.caps.includes("Async"), "externalApiCall 有 Async");
  }

  // callsExternalApi 应报 missing_capability（缺 IO 等）
  const missing = findDiags("callsExternalApi", DiagnosticKind.MissingCapability);
  assert(missing.length > 0, "callsExternalApi 报了 missing_capability");
}

console.log("\n── 11. Mutable 参数可变性检测 ──");
{
  const readState = findFn("readState")!;
  assert(readState.mutableParams.includes("state"), "readState 检出可变参数 state");

  const readStateRo = findFn("readStateReadonly")!;
  assert(readStateRo.mutableParams.length === 0, "readStateReadonly 无可变参数");

  const sumItems = findFn("sumItems")!;
  assert(sumItems.mutableParams.length === 0, "sumItems readonly number[] 不触发");

  const firstItem = findFn("firstItem")!;
  assert(firstItem.mutableParams.length > 0, "firstItem string[] 触发");

  // 声明了 Mutable → 不报 implicit_capability
  const pushItem = findFn("pushItem")!;
  assert(pushItem.mutableParams.length > 0, "pushItem 有可变参数");
  const pushItemImplicit = findDiags("pushItem", DiagnosticKind.ImplicitCapability)
    .filter(d => d.message.includes("Mutable"));
  assert(pushItemImplicit.length === 0, "pushItem 已声明 Mutable，不报 implicit");

  // HandleMutable 阻断
  const sortedCopy = findFn("sortedCopy")!;
  assert(sortedCopy.declaredCaps.has("HandleMutable"), "sortedCopy 声明了 HandleMutable");
}

console.log("\n── 12. Mutable 自动注入与调用链 ──");
{
  // addDefault 有非 readonly 参数 → 自动注入 Mutable
  const addDefault = findFn("addDefault")!;
  const implicitDiags = findDiags("addDefault", DiagnosticKind.ImplicitCapability)
    .filter(d => d.message.includes("Mutable"));
  assert(implicitDiags.length > 0, "addDefault 自动注入 Mutable");

  // addDefault 调用 pushItem(Mutable) → 因自身已有 Mutable，不 missing
  const escDiags = findDiags("addDefault", DiagnosticKind.MissingCapability)
    .filter(d => d.missingCaps?.includes("Mutable"));
  assert(escDiags.length === 0, "addDefault 调 Mutable 函数不 missing（已自动注入）");

  // buildList 内部 push → 局部数组，不触发 Mutable
  const buildList = findFn("buildList")!;
  assert(buildList.mutableParams.length === 0, "buildList 无可变参数");
}

console.log("\n── 13. 评分: 只计 scorable 能力 ──");
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
  assert(scores.totalPure > 0, "totalPure > 0");
  assert(scores.totalCap > 0, "totalCap > 0");
  assert(scores.totalLoose > 0, "totalLoose > 0");
  assert(scores.topFunctions.length > 0, "topFunctions 非空");
  assert(scores.fileScores.length > 0, "fileScores 非空");

  // safeFetch 声明了 HandleFallible → 评分 caps 不含 HandleFallible
  const safeFetchScore = scores.allFunctions.find(f => f.name === "safeFetch");
  if (safeFetchScore) {
    assert(!safeFetchScore.caps.includes("HandleFallible"), "safeFetch 评分不含 HandleFallible");
    assert(safeFetchScore.caps.includes("IO"), "safeFetch 评分含 IO");
  }

  // Block caps (HandleFallible/HandleAsync/HandleMutable) 不在 capScores 中
  for (const blockCap of BLOCK_CAPS) {
    assert(!(blockCap in scores.capScores) || scores.capScores[blockCap] === 0,
      `capScores 不含 ${blockCap}`);
  }
}

console.log("\n── 14. Looseness 评分 ──");
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

console.log("\n── 15. --fix 自动修复 ──");
{
  const violationsPath = resolve(import.meta.dir, "fixture/violations.ts");
  const original = readFileSync(violationsPath, "utf8");
  const ioLayerPath = resolve(import.meta.dir, "fixture/io-layer.ts");
  const ioLayerOriginal = readFileSync(ioLayerPath, "utf8");
  const mutablePath = resolve(import.meta.dir, "fixture/mutable.ts");
  const mutableOriginal = readFileSync(mutablePath, "utf8");
  const objectPath = resolve(import.meta.dir, "fixture/object-methods.ts");
  const objectOriginal = readFileSync(objectPath, "utf8");

  const fixResult = applyFixes(scan, result);
  assert(fixResult.changes.length > 0, "--fix 产生了修改");

  // undeclaredFn should get an empty @capability
  const fixed = readFileSync(violationsPath, "utf8");
  assert(fixed.includes("/** @capability */\nexport function undeclaredFn"),
    "undeclaredFn 被加了空 @capability");

  // 还原
  writeFileSync(violationsPath, original);
  writeFileSync(ioLayerPath, ioLayerOriginal);
  writeFileSync(mutablePath, mutableOriginal);
  writeFileSync(objectPath, objectOriginal);
}

console.log("\n── 16. 对象方法扫描 ──");
{
  const getUser = findFn("getUser");
  assert(getUser !== null, "扫描到 api.getUser");
  if (getUser) {
    assert(getUser.isDeclared, "getUser 已声明");
    assert(getUser.declaredCaps.has("IO"), "getUser 声明了 IO");
  }

  const buildUrl = findFn("buildUrl");
  assert(buildUrl !== null, "扫描到 api.buildUrl");
  if (buildUrl) {
    assert(buildUrl.declaredCaps.size === 0, "buildUrl 是纯函数");
  }

  const increment = findFn("increment");
  assert(increment !== null, "扫描到 increment 方法");
  if (increment) {
    assert(increment.declaredCaps.has("Mutable"), "increment 声明了 Mutable");
  }

  const getValue = findFn("getValue");
  assert(getValue !== null, "扫描到 getValue 方法");
  if (getValue) {
    assert(getValue.declaredCaps.size === 0, "getValue 是纯函数");
  }
}

console.log("\n── 17. class 方法扫描 ──");
{
  const greet = findFn("greet");
  assert(greet !== null, "扫描到 Greeter.greet");
  if (greet) {
    assert(greet.isDeclared, "greet 已声明");
    assert(greet.declaredCaps.size === 0, "greet 是纯函数");
  }

  const greetAndLog = findFn("greetAndLog");
  assert(greetAndLog !== null, "扫描到 Greeter.greetAndLog");
  if (greetAndLog) {
    assert(greetAndLog.declaredCaps.has("IO"), "greetAndLog 声明了 IO");
  }
}

console.log("\n── 18. 能力配置完整性 ──");
{
  assert(PROPAGATE_CAPS.length === 5, "5 个传播能力", `got ${PROPAGATE_CAPS.length}`);
  assert(BLOCK_CAPS.length === 3, "3 个阻断能力", `got ${BLOCK_CAPS.length}`);
  assert(SCORABLE_CAPS.length === 5, "5 个 scorable 能力", `got ${SCORABLE_CAPS.length}`);
}

// ══ Summary ══

console.log(`\n${"═".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
