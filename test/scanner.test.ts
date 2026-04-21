import { describe, test, expect } from "bun:test";
import {
  findFn, findAllFns, findFnsInFile, getScan,
  getResolvedCallNames, getUnresolvedCallNames,
} from "./helpers.js";

describe("scanner: 函数 ID", () => {
  test("ID 格式为 filePath:pos", () => {
    const add = findFn("add")!;
    expect(add.id).toContain(":");
    const colonIdx = add.id.lastIndexOf(":");
    const pos = parseInt(add.id.slice(colonIdx + 1));
    expect(pos).toBeGreaterThanOrEqual(0);
  });

  test("同文件同名方法有不同 ID", () => {
    const resets = findAllFns("reset");
    expect(resets).toHaveLength(2);
    expect(resets[0].id).not.toBe(resets[1].id);
  });

  test("不同文件的同名函数有不同 ID", () => {
    // pure.ts 和 mutable.ts 都有 add
    const adds = findAllFns("add");
    expect(adds.length).toBeGreaterThanOrEqual(1);
    const ids = new Set(adds.map(f => f.id));
    expect(ids.size).toBe(adds.length);
  });
});

describe("scanner: 5 种函数形式", () => {
  test("顶层 function 声明", () => {
    expect(findFn("add")).not.toBeNull();
    expect(findFn("fetchUser")).not.toBeNull();
  });

  test("变量绑定的箭头函数", () => {
    const api = findFn("api");
    // api 是 const，但里面的 getUser/buildUrl 是 PropertyAssignment
    expect(findFn("getUser")).not.toBeNull();
    expect(findFn("buildUrl")).not.toBeNull();
  });

  test("对象字面量方法声明", () => {
    expect(findFn("increment")).not.toBeNull();
    expect(findFn("getValue")).not.toBeNull();
  });

  test("对象字面量属性箭头函数", () => {
    const getUser = findFn("getUser")!;
    expect(getUser.isDeclared).toBe(true);
    expect(getUser.declaredCaps.has("IO")).toBe(true);
  });

  test("class 方法", () => {
    expect(findFn("greet")).not.toBeNull();
    expect(findFn("greetAndLog")).not.toBeNull();
    // Worker class methods from call-resolution.ts
    expect(findFn("run")).not.toBeNull();
    expect(findFn("compute")).not.toBeNull();
  });

  test("不扫描匿名函数、node_modules、.cap.ts", () => {
    const scan = getScan();
    for (const [, fn] of scan.functions) {
      expect(fn.filePath).not.toContain("node_modules");
      expect(fn.filePath).not.toMatch(/\.cap\.ts$/);
      expect(fn.name).not.toBe("");
    }
  });
});

describe("scanner: 能力声明解析", () => {
  test("JSDoc @capability 空 = 纯函数", () => {
    const add = findFn("add")!;
    expect(add.isDeclared).toBe(true);
    expect(add.declaredCaps.size).toBe(0);
  });

  test("JSDoc @capability 多个能力", () => {
    const fetchUser = findFn("fetchUser")!;
    expect(fetchUser.declaredCaps.has("IO")).toBe(true);
    expect(fetchUser.declaredCaps.has("Fallible")).toBe(true);
    expect(fetchUser.declaredCaps.has("Async")).toBe(true);
  });

  test("JSDoc @capability Handle 能力", () => {
    const safeFetch = findFn("safeFetch")!;
    expect(safeFetch.declaredCaps.has("HandleFallible")).toBe(true);
    expect(safeFetch.declaredCaps.has("IO")).toBe(true);
    expect(safeFetch.declaredCaps.has("Async")).toBe(true);
  });

  test("后缀命名识别传播能力", () => {
    const fn = findFn("fetchUser_IO_Async")!;
    expect(fn.isDeclared).toBe(true);
    expect(fn.declaredCaps.has("IO")).toBe(true);
    expect(fn.declaredCaps.has("Async")).toBe(true);
    expect(fn.declaredCaps.size).toBe(2);
  });

  test("后缀命名识别 Handle 能力", () => {
    const fn = findFn("handler_HandleFallible_HandleAsync_HandleMutable")!;
    expect(fn.isDeclared).toBe(true);
    expect(fn.declaredCaps.has("HandleFallible")).toBe(true);
    expect(fn.declaredCaps.has("HandleAsync")).toBe(true);
    expect(fn.declaredCaps.has("HandleMutable")).toBe(true);
  });

  test("后缀命名识别所有 8 个能力", () => {
    const fn = findFn("complex_IO_Impure_Fallible_Async_Mutable")!;
    expect(fn.isDeclared).toBe(true);
    expect(fn.declaredCaps.size).toBe(5);
  });

  test("后缀优先级高于 JSDoc", () => {
    const fn = findFn("save_IO")!;
    expect(fn.isDeclared).toBe(true);
    expect(fn.declaredCaps.has("IO")).toBe(true);
    // JSDoc 中的 Mutable 被忽略
    expect(fn.declaredCaps.has("Mutable")).toBe(false);
    expect(fn.declaredCaps.size).toBe(1);
  });

  test("未声明函数: isDeclared=false, 全部传播能力", () => {
    const fn = findFn("undeclaredFn")!;
    expect(fn.isDeclared).toBe(false);
    expect(fn.declaredCaps.has("IO")).toBe(true);
    expect(fn.declaredCaps.has("Impure")).toBe(true);
    expect(fn.declaredCaps.has("Fallible")).toBe(true);
    expect(fn.declaredCaps.has("Async")).toBe(true);
    expect(fn.declaredCaps.has("Mutable")).toBe(true);
  });
});

describe("scanner: 返回类型检测", () => {
  test("async 函数 → returnsAsync", () => {
    expect(findFn("fetchUser")!.returnsAsync).toBe(true);
    expect(findFn("loadData")!.returnsAsync).toBe(true);
    expect(findFn("asyncByKeyword")!.returnsAsync).toBe(true);
  });

  test("返回 Promise → returnsAsync", () => {
    expect(findFn("asyncByReturn")!.returnsAsync).toBe(true);
  });

  test("async generator → returnsAsync", () => {
    expect(findFn("asyncGenerator")!.returnsAsync).toBe(true);
  });

  test("普通函数 → 不 returnsAsync", () => {
    expect(findFn("add")!.returnsAsync).toBe(false);
  });

  test("返回 null → returnsNullable", () => {
    expect(findFn("findItem")!.returnsNullable).toBe(true);
    expect(findFn("returnsNull")!.returnsNullable).toBe(true);
  });

  test("返回 undefined → returnsNullable", () => {
    expect(findFn("returnsUndefined")!.returnsNullable).toBe(true);
  });

  test("Promise<T | null> → returnsNullable", () => {
    expect(findFn("fetchUser")!.returnsNullable).toBe(true);
    expect(findFn("asyncNullable")!.returnsNullable).toBe(true);
  });

  test("确定返回类型 → 不 returnsNullable", () => {
    expect(findFn("add")!.returnsNullable).toBe(false);
  });
});

describe("scanner: 参数可变性检测", () => {
  test("非 readonly 引用类型 → 可变", () => {
    expect(findFn("readState")!.mutableParams).toContain("state");
    expect(findFn("firstItem")!.mutableParams).toContain("items");
    expect(findFn("takesObject")!.mutableParams).toContain("obj");
  });

  test("Readonly<T> → 不可变", () => {
    expect(findFn("readStateReadonly")!.mutableParams).toHaveLength(0);
  });

  test("readonly 数组 → 不可变", () => {
    expect(findFn("sumItems")!.mutableParams).toHaveLength(0);
    expect(findFn("takesReadonlyArr")!.mutableParams).toHaveLength(0);
  });

  test("值类型 → 不可变", () => {
    expect(findFn("add")!.mutableParams).toHaveLength(0);
    expect(findFn("takesValues")!.mutableParams).toHaveLength(0);
  });

  test("函数签名参数 → 不可变", () => {
    expect(findFn("takesCallback")!.mutableParams).toHaveLength(0);
  });

  test("ReadonlyMap → 不可变", () => {
    expect(findFn("takesReadonlyMap")!.mutableParams).toHaveLength(0);
  });

  test("Iterable → 不可变（消费型接口）", () => {
    expect(findFn("takesIterable")!.mutableParams).toHaveLength(0);
  });
});

describe("scanner: 调用解析", () => {
  test("同文件调用解析", () => {
    expect(getResolvedCallNames("callsLocalHelper")).toContain("localHelper");
  });

  test("跨文件 import 调用解析", () => {
    const names = getResolvedCallNames("badPure");
    expect(names).toContain("fetchUser");
  });

  test("多个跨文件调用", () => {
    const names = getResolvedCallNames("processAndLog");
    expect(names).toContain("add");
    expect(names).toContain("logResult");
  });

  test("链式跨文件调用", () => {
    const names = getResolvedCallNames("chainedCalls");
    expect(names).toContain("add");
    expect(names).toContain("multiply");
    expect(names).toContain("logResult");
  });

  test("对象方法内的调用解析", () => {
    const loadFn = findFn("load")!;
    const scan = getScan();
    const targetNames = loadFn.resolvedCalls.map(c => scan.functions.get(c.target)?.name);
    expect(targetNames).toContain("fetchUser");
  });

  test("class 方法内的调用解析", () => {
    const names = getResolvedCallNames("compute");
    expect(names).toContain("add");
  });

  test("未解析调用带 qualifiedName", () => {
    const logResult = findFn("logResult")!;
    const consoleCall = logResult.unresolvedCalls.find(c => c.target === "log");
    expect(consoleCall).toBeDefined();
    expect(consoleCall!.qualifiedName).toBeDefined();
  });
});

describe("scanner: 加权语句数", () => {
  test("空函数 → 0", () => {
    expect(findFn("emptyFn")!.weightedStatements).toBe(0);
    expect(findFn("emptyFn")!.statementCount).toBe(0);
  });

  test("单条 return → weight=1", () => {
    const fn = findFn("oneStatement")!;
    expect(fn.statementCount).toBe(1);
    expect(fn.weightedStatements).toBe(1);
  });

  test("if + return: depth 增加权重", () => {
    const fn = findFn("withIf")!;
    // if: 1+0+0.5=1.5, return(inside if): 1+1+0=2, return(outer): 1+0+0=1
    expect(fn.statementCount).toBe(3);
    expect(fn.weightedStatements).toBe(4.5);
  });

  test("嵌套 for→if→return 权重递增", () => {
    const fn = findFn("nestedStatements")!;
    expect(fn.statementCount).toBe(4);
    expect(fn.weightedStatements).toBe(8);
  });
});
