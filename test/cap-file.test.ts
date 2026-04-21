import { describe, test, expect } from "bun:test";
import { loadCapFiles } from "../src/cap-file.js";
import { getScan, FIXTURE_DIR } from "./helpers.js";

describe("cap-file: 加载 .cap.ts", () => {
  test("从 fixture 目录加载 .cap.ts 声明", () => {
    const entries = loadCapFiles(FIXTURE_DIR);
    expect(entries.length).toBeGreaterThan(0);
  });

  test("externalApiCall: IO Async Fallible", () => {
    const entries = loadCapFiles(FIXTURE_DIR);
    const api = entries.find(e => e.name === "externalApiCall");
    expect(api).toBeDefined();
    expect(api!.caps).toContain("IO");
    expect(api!.caps).toContain("Async");
    expect(api!.caps).toContain("Fallible");
  });

  test("externalPureUtil: 纯函数（空能力）", () => {
    const entries = loadCapFiles(FIXTURE_DIR);
    const pure = entries.find(e => e.name === "externalPureUtil");
    expect(pure).toBeDefined();
    expect(pure!.caps).toHaveLength(0);
  });

  test("source 字段指向 .cap.ts 文件", () => {
    const entries = loadCapFiles(FIXTURE_DIR);
    for (const e of entries) {
      expect(e.source).toMatch(/\.cap\.ts$/);
    }
  });
});

describe("cap-file: 集成到 scan", () => {
  test("externalCaps 包含 .cap.ts 声明", () => {
    const scan = getScan();
    expect(scan.externalCaps.has("externalApiCall")).toBe(true);
    expect(scan.externalCaps.has("externalPureUtil")).toBe(true);
  });

  test(".cap.ts 文件不被扫描为项目函数", () => {
    const scan = getScan();
    for (const [, fn] of scan.functions) {
      expect(fn.filePath).not.toMatch(/\.cap\.ts$/);
    }
  });
});
