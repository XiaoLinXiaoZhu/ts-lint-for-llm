import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

describe("IE baseline", () => {
  test("all F requirements are unique and have evidence", () => {
    const manifest = JSON.parse(readFileSync(resolve(root, "docs/ie/requirements.json"), "utf8"));
    const ids = manifest.requirements.map((item: { id: string }) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const requirement of manifest.requirements) {
      expect(requirement.id).toMatch(/^F\d{3}$/);
      expect(requirement.verification.length).toBeGreaterThan(0);
      for (const file of requirement.verification) expect(existsSync(resolve(root, file))).toBe(true);
    }
  });
});
