import { describe, test, expect } from "bun:test";
import { resolve } from "node:path";
import { FIXTURE_TSCONFIG, FIXTURE_DIR } from "./helpers.js";

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(
    ["bun", resolve(import.meta.dir, "../src/cli.ts"), ...args],
    { stdout: "pipe", stderr: "pipe" },
  );
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

describe("cli: 基本选项", () => {
  test("--help 输出帮助并退出 0", async () => {
    const { stdout, exitCode } = await runCli(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("capability-lint");
    expect(stdout).toContain("--fix");
  });

  test("--version 输出版本并退出 0", async () => {
    const { stdout, exitCode } = await runCli(["--version"]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$|^unknown$/);
  });
});

describe("cli: JSON 输出", () => {
  test("默认输出有效 JSON", async () => {
    const { stdout, exitCode } = await runCli(["--tsconfig", FIXTURE_TSCONFIG]);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty("diagnostics");
    expect(parsed).toHaveProperty("functions");
    expect(parsed).toHaveProperty("scores");
  });

  test("--summary 只含 scores", async () => {
    const { stdout } = await runCli(["--tsconfig", FIXTURE_TSCONFIG, "--summary"]);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty("scores");
    expect(parsed).not.toHaveProperty("diagnostics");
    expect(parsed).not.toHaveProperty("functions");
  });

  test("--hint undeclared 输出含 tips", async () => {
    const { stdout } = await runCli(["--tsconfig", FIXTURE_TSCONFIG, "--summary", "--hint", "undeclared"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.scores.tips).toBeDefined();
    expect(parsed.scores.tips.length).toBeGreaterThan(0);
  });

  test("无 --hint 时 scores 中无 tips", async () => {
    const { stdout } = await runCli(["--tsconfig", FIXTURE_TSCONFIG, "--summary"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.scores.tips).toBeUndefined();
  });
});

describe("cli: 退出码", () => {
  test("有 error 级诊断 → 退出码 1", async () => {
    const { exitCode } = await runCli(["--tsconfig", FIXTURE_TSCONFIG]);
    expect(exitCode).toBe(1);
  });

  test("仅 implicit_capability → 退出码 0（只分析纯文件）", async () => {
    const { exitCode } = await runCli(["--tsconfig", FIXTURE_TSCONFIG, resolve(FIXTURE_DIR, "pure.ts")]);
    expect(exitCode).toBe(0);
  });
});

describe("cli: 位置参数过滤", () => {
  test("指定单文件只输出该文件诊断", async () => {
    const { stdout } = await runCli([
      "--tsconfig", FIXTURE_TSCONFIG,
      resolve(FIXTURE_DIR, "pure.ts"),
    ]);
    const parsed = JSON.parse(stdout);
    for (const d of parsed.diagnostics) {
      expect(d.filePath).toContain("pure.ts");
    }
  });
});

describe("cli: --fix --dry-run", () => {
  test("dry-run 不修改文件但报告变更", async () => {
    const { stderr, exitCode } = await runCli([
      "--tsconfig", FIXTURE_TSCONFIG, "--fix", "--dry-run",
    ]);
    expect(stderr).toContain("Dry run");
  });
});
