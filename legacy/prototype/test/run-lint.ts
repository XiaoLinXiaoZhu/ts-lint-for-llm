import { ESLint } from "eslint";
import { noEscalation } from "../src/capability-rule.js";
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
      "capability/no-escalation": ["error", {
        // 外部包能力声明（在实际项目中从 .caps.ts 加载）
        externalCapabilities: {
          "node:fs": {
            readFileSync: ["IO", "Blocking", "Fallible"],
            readFile: ["IO", "Async", "Fallible"],
          },
          "node:crypto": {
            createHash: [],  // 纯计算
            randomBytes: ["IO"],
          },
        },
      }],
    },
  },
});

const results = await eslint.lintFiles([
  path.resolve(import.meta.dir, "example.ts"),
]);

console.log("=== 能力权限校验结果 (v2) ===\n");

let escalations = 0;
let undeclared = 0;

for (const result of results) {
  for (const msg of result.messages) {
    if (msg.message.includes("缺少能力")) {
      escalations++;
      console.log(`❌ 权限升级 | 第 ${msg.line} 行: ${msg.message}\n`);
    } else if (msg.message.includes("未声明能力")) {
      undeclared++;
      console.log(`⚠️  坏函数   | 第 ${msg.line} 行: ${msg.message}\n`);
    } else {
      console.log(`?  第 ${msg.line} 行: ${msg.message}\n`);
    }
  }
}

console.log("---");
console.log(`权限升级违反: ${escalations}`);
console.log(`未声明坏函数: ${undeclared}`);
console.log(`总计: ${escalations + undeclared} 处问题`);
