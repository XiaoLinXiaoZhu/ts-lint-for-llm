import { describe, test, expect } from "bun:test";
import { BLOCK_CAPS, PROPAGATE_CAPS } from "../src/capabilities.js";
import { getScores, getResult, getScan, getLoosenessMap, findFn, FIXTURE_DIR } from "./helpers.js";
import { generateTips, formatJSON, computeScores } from "../src/reporter.js";
import { dirname } from "node:path";

describe("reporter: 评分计算", () => {
  const scores = getScores();

  test("totalFunctions > 0", () => {
    expect(scores.totalFunctions).toBeGreaterThan(0);
  });

  test("totalPure > 0（有纯函数）", () => {
    expect(scores.totalPure).toBeGreaterThan(0);
  });

  test("totalCap > 0", () => {
    expect(scores.totalCap).toBeGreaterThan(0);
  });

  test("totalLoose > 0", () => {
    expect(scores.totalLoose).toBeGreaterThan(0);
  });

  test("totalUndeclared > 0（有未声明函数）", () => {
    expect(scores.totalUndeclared).toBeGreaterThan(0);
  });

  test("topFunctions 最多 10 个", () => {
    expect(scores.topFunctions.length).toBeGreaterThan(0);
    expect(scores.topFunctions.length).toBeLessThanOrEqual(10);
  });

  test("topFunctions 按 score 降序", () => {
    for (let i = 1; i < scores.topFunctions.length; i++) {
      expect(scores.topFunctions[i - 1].score).toBeGreaterThanOrEqual(scores.topFunctions[i].score);
    }
  });

  test("fileScores 按 (capScore + looseScore) 降序", () => {
    for (let i = 1; i < scores.fileScores.length; i++) {
      const prev = scores.fileScores[i - 1];
      const curr = scores.fileScores[i];
      expect(prev.capScore + prev.looseScore).toBeGreaterThanOrEqual(curr.capScore + curr.looseScore);
    }
  });
});

describe("reporter: 评分只计 scorable 能力", () => {
  const scores = getScores();

  test("capScores 中无阻断能力", () => {
    for (const blockCap of BLOCK_CAPS) {
      const val = scores.capScores[blockCap];
      expect(val === undefined || val === 0).toBe(true);
    }
  });

  test("纯函数 score = 0", () => {
    const addScore = scores.allFunctions.find(f => f.name === "add");
    expect(addScore).toBeDefined();
    expect(addScore!.score).toBe(0);
    expect(addScore!.caps).toHaveLength(0);
  });

  test("未声明函数按 5 个传播能力计分", () => {
    const undeclared = scores.allFunctions.find(f => f.name === "undeclaredFn");
    expect(undeclared).toBeDefined();
    expect(undeclared!.caps).toHaveLength(5);
    expect(undeclared!.score).toBe(undeclared!.weightedStatements * 5);
  });

  test("Handle 能力不计入 function score", () => {
    const safeFetch = scores.allFunctions.find(f => f.name === "safeFetch");
    expect(safeFetch).toBeDefined();
    expect(safeFetch!.caps).not.toContain("HandleFallible");
  });

  test("totalCap = 所有函数 score 之和", () => {
    const sum = scores.allFunctions.reduce((s, f) => s + f.score, 0);
    expect(scores.totalCap).toBeCloseTo(sum, 1);
  });
});

describe("reporter: tips 生成", () => {
  const scores = getScores();
  const cwd = dirname(FIXTURE_DIR);

  test("不传 hint → 返回所有匹配的 tips", () => {
    const tips = generateTips(scores, cwd);
    expect(tips.length).toBeGreaterThan(0);
  });

  test("--hint undeclared → 只返回 undeclared 相关 tip", () => {
    const tips = generateTips(scores, cwd, "undeclared");
    expect(tips.length).toBeGreaterThan(0);
    expect(tips.every(t => t.includes("未声明"))).toBe(true);
  });

  test("--hint nonexistent → 返回空", () => {
    const tips = generateTips(scores, cwd, "nonexistent");
    expect(tips).toHaveLength(0);
  });
});

describe("reporter: JSON 输出", () => {
  const cwd = dirname(FIXTURE_DIR);

  test("完整输出含 diagnostics, functions, scores", () => {
    const json = formatJSON(getResult(), getScores(), cwd);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveProperty("diagnostics");
    expect(parsed).toHaveProperty("functions");
    expect(parsed).toHaveProperty("scores");
    expect(Array.isArray(parsed.diagnostics)).toBe(true);
    expect(Array.isArray(parsed.functions)).toBe(true);
  });

  test("--summary 只含 scores", () => {
    const json = formatJSON(getResult(), getScores(), cwd, { summary: true });
    const parsed = JSON.parse(json);
    expect(parsed).toHaveProperty("scores");
    expect(parsed).not.toHaveProperty("diagnostics");
    expect(parsed).not.toHaveProperty("functions");
  });

  test("filePath 是相对路径", () => {
    const json = formatJSON(getResult(), getScores(), cwd);
    const parsed = JSON.parse(json);
    for (const d of parsed.diagnostics) {
      expect(d.filePath).not.toMatch(/^\//);
    }
    for (const f of parsed.functions) {
      expect(f.filePath).not.toMatch(/^\//);
    }
  });

  test("scores 含 tips 字段（当设置时）", () => {
    const scoresWithTips = { ...getScores(), tips: ["test tip"] };
    const json = formatJSON(getResult(), scoresWithTips, cwd);
    const parsed = JSON.parse(json);
    expect(parsed.scores.tips).toEqual(["test tip"]);
  });

  test("scores 无 tips 字段（未设置时）", () => {
    const json = formatJSON(getResult(), getScores(), cwd);
    const parsed = JSON.parse(json);
    expect(parsed.scores.tips).toBeUndefined();
  });
});
