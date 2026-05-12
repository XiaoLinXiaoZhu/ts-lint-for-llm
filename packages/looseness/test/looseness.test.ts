import { describe, test, expect } from "bun:test";
import { Project } from "ts-morph";
import { scoreLooseness } from "../src/looseness.js";

describe("looseness detection", () => {
  function scan(code: string) {
    const project = new Project({ compilerOptions: { strict: true }, useInMemoryFileSystem: true });
    const sf = project.createSourceFile("test.ts", code);
    return scoreLooseness(sf);
  }

  test("clean code has no signals", () => {
    const result = scan(`function add(a: number, b: number): number { return a + b; }`);
    expect(result.signals).toHaveLength(0);
  });

  test("detects any", () => {
    const result = scan(`const x: any = 1;`);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].type).toBe("any");
  });

  test("detects as any", () => {
    const result = scan(`const x = (1 as any);`);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].type).toBe("as-any");
  });

  test("detects unknown", () => {
    const result = scan(`function f(x: unknown) {}`);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].type).toBe("unknown");
  });

  test("detects boolean param", () => {
    const result = scan(`function f(flag: boolean) {}`);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].type).toBe("bool-param");
  });

  test("detects optional field", () => {
    const result = scan(`interface A { x?: string; }`);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].type).toBe("optional-field");
  });

  test("detects @ts-ignore", () => {
    const result = scan(`// @ts-ignore\nconst x = 1;`);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].type).toBe("@ts-ignore");
  });

  test("reports line number correctly", () => {
    const result = scan(`const a = 1;\nconst b: any = 2;`);
    expect(result.signals[0].line).toBe(2);
  });

  test("multiple signals in one file", () => {
    const result = scan(`
      const x: any = 1;
      const y: any = 2;
      function f(flag: boolean) {}
    `);
    expect(result.signals).toHaveLength(3);
  });
});
