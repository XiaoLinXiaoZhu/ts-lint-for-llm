import { describe, test, expect } from "bun:test";
import {
  ALL_CAPABILITIES, CAPABILITY_DEFS, PROPAGATE_CAPS, BLOCK_CAPS,
  SCORABLE_CAPS, AUTO_DETECTABLE_CAPS, BLOCK_PAIRS, VALID_CAPABILITY_NAMES,
  type Capability,
} from "../src/capabilities.js";

describe("capabilities 配置", () => {
  test("共 8 个能力", () => {
    expect(ALL_CAPABILITIES).toHaveLength(8);
  });

  test("5 个传播能力", () => {
    expect(PROPAGATE_CAPS).toEqual(["IO", "Impure", "Fallible", "Async", "Mutable"]);
  });

  test("3 个阻断能力", () => {
    expect(BLOCK_CAPS).toEqual(["HandleFallible", "HandleAsync", "HandleMutable"]);
  });

  test("scorable 能力 = 5 个传播能力", () => {
    expect(SCORABLE_CAPS).toEqual(PROPAGATE_CAPS);
  });

  test("autoDetectable 能力 = Fallible, Async, Mutable", () => {
    expect(AUTO_DETECTABLE_CAPS).toEqual(["Fallible", "Async", "Mutable"]);
  });

  test("BLOCK_PAIRS 映射正确", () => {
    expect(BLOCK_PAIRS.get("Fallible")).toBe("HandleFallible");
    expect(BLOCK_PAIRS.get("Async")).toBe("HandleAsync");
    expect(BLOCK_PAIRS.get("Mutable")).toBe("HandleMutable");
    expect(BLOCK_PAIRS.get("IO")).toBeUndefined();
    expect(BLOCK_PAIRS.get("Impure")).toBeUndefined();
  });

  test("每个传播能力的 kind=propagate, scorable=true", () => {
    for (const cap of PROPAGATE_CAPS) {
      const def = CAPABILITY_DEFS[cap];
      expect(def.kind).toBe("propagate");
      expect(def.scorable).toBe(true);
    }
  });

  test("每个阻断能力的 kind=block, scorable=false, autoDetectable=false", () => {
    for (const cap of BLOCK_CAPS) {
      const def = CAPABILITY_DEFS[cap];
      expect(def.kind).toBe("block");
      expect(def.scorable).toBe(false);
      expect(def.autoDetectable).toBe(false);
    }
  });

  test("block 能力的 blocks 字段指向对应传播能力", () => {
    expect(CAPABILITY_DEFS["HandleFallible"].blocks).toBe("Fallible");
    expect(CAPABILITY_DEFS["HandleAsync"].blocks).toBe("Async");
    expect(CAPABILITY_DEFS["HandleMutable"].blocks).toBe("Mutable");
  });

  test("不可阻断传播能力无 blockedBy", () => {
    expect(CAPABILITY_DEFS["IO"].blockedBy).toBeUndefined();
    expect(CAPABILITY_DEFS["Impure"].blockedBy).toBeUndefined();
  });

  test("VALID_CAPABILITY_NAMES 含全部 8 个", () => {
    expect(VALID_CAPABILITY_NAMES.size).toBe(8);
    for (const cap of ALL_CAPABILITIES) {
      expect(VALID_CAPABILITY_NAMES.has(cap)).toBe(true);
    }
  });
});
