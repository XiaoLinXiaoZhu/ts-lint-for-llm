/**
 * helpers.ts 单元测试 — 重点验证 isInScope 路径比较
 */
import { describe, test, expect } from "bun:test";
import { resolve } from "node:path";
import { isInScope } from "../src/helpers.js";

describe("isInScope", () => {
  const cwd = resolve(".");

  test("空 paths 返回 false（paths.some 对空数组恒为 false）", () => {
    expect(isInScope(resolve("src/main.ts"), [])).toBe(false);
  });

  test("精确文件匹配（反斜杠）", () => {
    const fp = resolve("src/main.ts");
    expect(isInScope(fp, ["src/main.ts"])).toBe(true);
  });

  test("精确文件匹配（正斜杠 — 模拟 ts-morph 输出）", () => {
    const fp = resolve("src/main.ts").replace(/\\/g, "/");
    expect(isInScope(fp, ["src/main.ts"])).toBe(true);
  });

  test("目录匹配（正斜杠）", () => {
    const fp = resolve("src/commands/type.ts").replace(/\\/g, "/");
    expect(isInScope(fp, ["src/"])).toBe(true);
  });

  test("目录不匹配", () => {
    const fp = resolve("src/commands/type.ts").replace(/\\/g, "/");
    expect(isInScope(fp, ["test/"])).toBe(false);
  });

  test("文件名部分匹配不算通过", () => {
    const fp = resolve("src/main.ts").replace(/\\/g, "/");
    // "main" 不是目录，且 "main" !== 完整路径
    expect(isInScope(fp, ["main.ts"])).toBe(false);
  });

  test("多个 paths 中有一个匹配即通过", () => {
    const fp = resolve("src/main.ts").replace(/\\/g, "/");
    expect(isInScope(fp, ["test/", "src/main.ts", "other/"])).toBe(true);
  });
});
