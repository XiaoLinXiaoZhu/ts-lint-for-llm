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
      "capability/no-escalation": ["error", { externalCapabilities: {} }],
    },
  },
});

const results = await eslint.lintFiles([
  path.resolve(import.meta.dir, "example-with-adapter.ts"),
]);

console.log("=== adapter 模式端到端验证 ===\n");
let issues = 0;
for (const result of results) {
  for (const msg of result.messages) {
    issues++;
    const icon = msg.message.includes("缺少能力") ? "❌" : "⚠️";
    console.log(`${icon} 第 ${msg.line} 行: ${msg.message}\n`);
  }
}
if (issues === 0) console.log("✅ 全部合法——无权限升级，无未声明坏函数");
else console.log(`\n共 ${issues} 处问题`);
