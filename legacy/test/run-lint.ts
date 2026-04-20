import { ESLint } from "eslint";
import { noEscalation } from "../src/rules/no-escalation.js";
import * as path from "node:path";

const eslint = new ESLint({
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

const results = await eslint.lintFiles([path.resolve(import.meta.dir, "example.ts")]);

console.log("=== Capability Lint Results ===\n");

let escalations = 0;
let undeclared = 0;

for (const result of results) {
  for (const msg of result.messages) {
    if (msg.message.includes("缺少能力")) {
      escalations++;
      console.log(`❌ escalation | line ${msg.line}: ${msg.message}\n`);
    } else if (msg.message.includes("未声明能力")) {
      undeclared++;
      console.log(`⚠  undeclared | line ${msg.line}: ${msg.message}\n`);
    }
  }
}

console.log("---");
console.log(`Escalation violations: ${escalations}`);
console.log(`Undeclared functions:  ${undeclared}`);
console.log(`Total issues:          ${escalations + undeclared}`);
