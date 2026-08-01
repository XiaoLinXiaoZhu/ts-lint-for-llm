import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const cli = resolve(import.meta.dir, "../src/main.ts");
const tsconfig = resolve(import.meta.dir, "../../../packages/engine/test/fixture/tsconfig.json");

async function run(args: string[]) {
  const process = Bun.spawn(["bun", "run", cli, ...args, "--tsconfig", tsconfig], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: await new Response(process.stdout).text(),
    stderr: await new Response(process.stderr).text(),
    exitCode: await process.exited,
  };
}

describe("thin CLI", () => {
  test("help exposes check and audit", async () => {
    const process = Bun.spawn(["bun", "run", cli, "--help"], { stdout: "pipe", stderr: "pipe" });
    const stdout = await new Response(process.stdout).text();
    expect(stdout).toContain("check");
    expect(stdout).toContain("audit");
    expect(stdout).not.toContain("@assert");
    expect(await process.exited).toBe(0);
  });

  test("audit returns structured scan evidence", async () => {
    const result = await run(["audit"]);
    const data = JSON.parse(result.stdout);
    expect(data.mode).toBe("audit");
    expect(data.filesScanned).toBeGreaterThan(0);
    expect(typeof data.functionsDiscovered).toBe("number");
    expect(Array.isArray(data.diagnostics)).toBe(true);
  });

  test("audit can select each review dimension", async () => {
    for (const aspect of ["effects", "pass-through", "looseness"]) {
      const result = await run(["audit", aspect]);
      const data = JSON.parse(result.stdout);
      expect(data.mode).toBe(aspect);
      expect(Array.isArray(data.diagnostics)).toBe(true);
      if (data.diagnostics.length > 0) expect(data.status).toBe("fail");
    }
  });

  test("check returns contract diagnostics", async () => {
    const result = await run(["check"]);
    const data = JSON.parse(result.stdout);
    expect(data.mode).toBe("check");
    expect(Array.isArray(data.diagnostics)).toBe(true);
  });
});
