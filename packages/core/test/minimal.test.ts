import { describe, test, expect } from "bun:test";
import { Project } from "ts-morph";
import { scanMinimal } from "../src/minimal.js";

function scan(code: string, onlyAsserted = false) {
  const project = new Project({ compilerOptions: { strict: true }, useInMemoryFileSystem: true });
  const sf = project.createSourceFile("test.ts", code);
  return scanMinimal(sf, onlyAsserted);
}

describe("minimal / pass-through detection", () => {
  test("pure computation — no violations", () => {
    const result = scan(`function double(x: number): number { return x * 2; }`);
    expect(result.violations).toHaveLength(0);
  });

  test("param used in branch — not pass-through", () => {
    const result = scan(`function f(x: number): string { if (x > 0) return "pos"; return "neg"; }`, false);
    expect(result.violations).toHaveLength(0);
  });

  test("param only forwarded — pass-through", () => {
    const result = scan(`
      declare function inner(x: number): number;
      function outer(x: number): number { return inner(x); }
    `, false);
    // --all mode (onlyAsserted=false) should detect it
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].functionName).toBe("outer");
    expect(result.violations[0].passThroughParams[0].name).toBe("x");
    expect(result.violations[0].passThroughParams[0].forwardedTo[0].callee).toBe("inner");
  });

  test("some params forwarded, some used — only reports forwarded ones", () => {
    const result = scan(`
      declare function send(msg: string): void;
      function process(data: string, label: string): string {
        send(label);
        return data.toUpperCase();
      }
    `, false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].passThroughParams).toHaveLength(1);
    expect(result.violations[0].passThroughParams[0].name).toBe("label");
  });

  test("respects @assert minimal when onlyAsserted=true", () => {
    const result = scan(`
      declare function inner(x: number): number;
      function noAssert(x: number): number { return inner(x); }
      /** @assert minimal */
      function withAssert(x: number): number { return inner(x); }
    `, true);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].functionName).toBe("withAssert");
  });

  test("object property access forwarded", () => {
    const result = scan(`
      declare function callAPI(model: string, temp: number): string;
      function gen(options: { model: string; temp: number }): string {
        return callAPI(options.model, options.temp);
      }
    `, false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].passThroughParams[0].name).toBe("options");
  });

  test("unused param is reported", () => {
    const result = scan(`
      function f(x: number, unused: string): number { return x * 2; }
    `, false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].passThroughParams[0].name).toBe("unused");
    expect(result.violations[0].passThroughParams[0].forwardedTo).toHaveLength(0);
  });

  test("param used in return statement — not pass-through", () => {
    const result = scan(`function identity(x: number): number { return x; }`, false);
    // return x; — x is used directly in return, technically it IS just forwarded to the caller
    // but our definition says: only when it appears as a CallExpression argument
    // return is not a call → self-use
    expect(result.violations).toHaveLength(0);
  });

  test("underscore-prefixed param is ignored", () => {
    const result = scan(`
      declare function inner(x: number): number;
      function f(x: number, _unused: string): number { return inner(x); }
    `, false);
    // x is forwarded, _unused is skipped
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].passThroughParams).toHaveLength(1);
    expect(result.violations[0].passThroughParams[0].name).toBe("x");
  });

  test("stdlib-only forwarding is not reported", () => {
    const result = scan(`
      function resolvePath(workspace: string): string { return resolve(workspace); }
      declare function resolve(p: string): string;
    `, false);
    expect(result.violations).toHaveLength(0);
  });

  test("mixed stdlib and non-stdlib forwarding is reported", () => {
    const result = scan(`
      declare function resolve(p: string): string;
      declare function customProcess(p: string): void;
      function f(path: string): void {
        const resolved = resolve(path);
        customProcess(path);
      }
    `, false);
    // path goes to both resolve (stdlib) and customProcess (not stdlib)
    // so it's still reported
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].passThroughParams[0].name).toBe("path");
  });
});
