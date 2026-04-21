import { describe, test, expect } from "bun:test";
import { Project } from "ts-morph";
import { scoreLooseness } from "../src/looseness.js";
import { FIXTURE_TSCONFIG } from "./helpers.js";

function getLoosenessForFile(filename: string) {
  const project = new Project({ tsConfigFilePath: FIXTURE_TSCONFIG });
  const sf = project.getSourceFiles().find(f => f.getFilePath().endsWith(`/${filename}`));
  if (!sf) throw new Error(`Fixture file not found: ${filename}`);
  return scoreLooseness(sf);
}

describe("looseness: 信号检测", () => {
  const lr = getLoosenessForFile("looseness.ts");

  test("检测 any (权重 10)", () => {
    expect(lr.byType["any"]).toBeDefined();
    expect(lr.byType["any"].penalty).toBeGreaterThanOrEqual(10);
  });

  test("检测 as any (权重 8)", () => {
    expect(lr.byType["as-any"]).toBeDefined();
    expect(lr.byType["as-any"].penalty).toBe(8);
  });

  test("检测 Record<string,any> (权重 8)", () => {
    expect(lr.byType["Record<string,any>"]).toBeDefined();
    expect(lr.byType["Record<string,any>"].penalty).toBe(8);
  });

  test("检测 Object (权重 8)", () => {
    expect(lr.byType["Object"]).toBeDefined();
    expect(lr.byType["Object"].penalty).toBe(8);
  });

  test("检测 Function (权重 6)", () => {
    expect(lr.byType["Function"]).toBeDefined();
    expect(lr.byType["Function"].penalty).toBe(6);
  });

  test("检测 boolean 参数 (权重 2)", () => {
    expect(lr.byType["bool-param"]).toBeDefined();
    expect(lr.byType["bool-param"].penalty).toBe(2);
  });

  test("检测 @ts-ignore (权重 10)", () => {
    expect(lr.byType["@ts-ignore"]).toBeDefined();
    expect(lr.byType["@ts-ignore"].penalty).toBe(10);
  });

  test("检测 optional field (权重 1/个)", () => {
    expect(lr.byType["optional-field"]).toBeDefined();
    expect(lr.byType["optional-field"].count).toBe(2);
    expect(lr.byType["optional-field"].penalty).toBe(2);
  });

  test("total > 0", () => {
    expect(lr.total).toBeGreaterThan(0);
  });
});

describe("looseness: 纯净文件", () => {
  test("pure.ts 松散度为 0", () => {
    const lr = getLoosenessForFile("pure.ts");
    expect(lr.total).toBe(0);
    expect(lr.signals).toHaveLength(0);
  });
});
