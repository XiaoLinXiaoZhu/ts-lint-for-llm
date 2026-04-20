import { ESLint } from "eslint";
import { noEscalation } from "../src/rules/no-escalation.js";
import * as path from "node:path";
import { readFileSync } from "node:fs";

const targetFile = path.resolve(import.meta.dir, "fix-example.ts");

// 先不带 fix 运行，看原始错误
const eslintCheck = new ESLint({
  overrideConfigFile: true,
  overrideConfig: {
    files: ["**/*.ts"],
    languageOptions: {
      parser: await import("@typescript-eslint/parser"),
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    plugins: {
      capability: { rules: { "no-escalation": noEscalation } },
    },
    rules: {
      "capability/no-escalation": ["error", {}],
    },
  },
});

console.log("=== Before fix ===\n");
const beforeResults = await eslintCheck.lintFiles([targetFile]);
for (const r of beforeResults) {
  for (const msg of r.messages) {
    const tag = msg.message.includes("缺少能力") ? "escalation"
      : msg.message.includes("未声明能力") ? "undeclared"
      : "absorbed";
    const fixable = msg.fix ? "✅ fixable" : "❌ no fix";
    console.log(`  line ${msg.line}: [${tag}] [${fixable}] ${msg.message}`);
  }
}

// 带 fix 运行
const eslintFix = new ESLint({
  fix: true,
  overrideConfigFile: true,
  overrideConfig: {
    files: ["**/*.ts"],
    languageOptions: {
      parser: await import("@typescript-eslint/parser"),
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    plugins: {
      capability: { rules: { "no-escalation": noEscalation } },
    },
    rules: {
      "capability/no-escalation": ["error", {}],
    },
  },
});

console.log("\n=== After fix (dry run, not writing) ===\n");
const fixResults = await eslintFix.lintFiles([targetFile]);
for (const r of fixResults) {
  if (r.output) {
    console.log("--- Fixed output ---");
    console.log(r.output);
    console.log("--- End fixed output ---");
  } else {
    console.log("(no changes)");
  }
  console.log("\nRemaining issues:");
  for (const msg of r.messages) {
    const tag = msg.message.includes("缺少能力") ? "escalation"
      : msg.message.includes("未声明能力") ? "undeclared"
      : "absorbed";
    console.log(`  line ${msg.line}: [${tag}] ${msg.message}`);
  }
}
