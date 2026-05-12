/**
 * CLI 集成测试 — 验证各子命令的入口和基本输出结构
 */

import { describe, test, expect } from "bun:test";
import { resolve } from "node:path";

const CLI = resolve(import.meta.dir, "../src/main.ts");
const TSCONFIG = resolve(import.meta.dir, "../../..", "packages/core/test/fixture/tsconfig.json");

async function run(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", "run", CLI, ...args, "--tsconfig", TSCONFIG], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

describe("CLI commands", () => {
  test("--help 输出帮助信息", async () => {
    const proc = Bun.spawn(["bun", "run", CLI, "--help"], { stdout: "pipe", stderr: "pipe" });
    const stdout = await new Response(proc.stdout).text();
    expect(stdout).toContain("lm-linter");
    expect(stdout).toContain("assert");
    expect(stdout).toContain("HandleFallible");
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });

  test("assert 输出有效 JSON 含 violations", async () => {
    const { stdout } = await run(["assert"]);
    const data = JSON.parse(stdout);
    expect(data.status).toBe("fail");
    expect(Array.isArray(data.violations)).toBe(true);
    expect(data.violations.length).toBeGreaterThan(0);
  });

  test("assert --summary 输出汇总格式", async () => {
    const { stdout } = await run(["assert", "--summary"]);
    const data = JSON.parse(stdout);
    expect(data.status).toBe("fail");
    expect(typeof data.totalViolations).toBe("number");
    expect(Array.isArray(data.functions)).toBe(true);
  });

  test("infer 输出函数列表", async () => {
    const { stdout } = await run(["infer"]);
    const data = JSON.parse(stdout);
    expect(typeof data.totalFunctions).toBe("number");
    expect(data.totalFunctions).toBeGreaterThan(0);
    expect(Array.isArray(data.functions)).toBe(true);
  });

  test("type 输出类型松散度", async () => {
    const { stdout } = await run(["type"]);
    const data = JSON.parse(stdout);
    expect(data.status).toBeDefined();
  });

  test("minimal --all 输出穿透参数", async () => {
    const { stdout } = await run(["minimal", "--all"]);
    const data = JSON.parse(stdout);
    expect(data.status).toBeDefined();
    expect(data.status).toBe("fail");
    expect(Array.isArray(data.functions)).toBe(true);
  });
});
