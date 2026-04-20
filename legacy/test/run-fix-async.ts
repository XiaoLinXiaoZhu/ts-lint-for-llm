import { ESLint } from "eslint";
import { noEscalation } from "../src/rules/no-escalation.js";
import * as path from "node:path";

const targetFile = path.resolve(import.meta.dir, "fix-async.ts");

const config = {
  overrideConfigFile: true as const,
  overrideConfig: {
    files: ["**/*.ts"],
    languageOptions: {
      parser: await import("@typescript-eslint/parser"),
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    plugins: { capability: { rules: { "no-escalation": noEscalation } } },
    rules: { "capability/no-escalation": ["error", {}] as const },
  },
};

console.log("=== Before fix ===\n");
const check = new ESLint(config);
for (const r of await check.lintFiles([targetFile])) {
  for (const msg of r.messages) {
    const fixable = msg.fix ? "fixable" : "no-fix";
    console.log(`  L${msg.line}: [${fixable}] ${msg.message}`);
  }
}

console.log("\n=== After fix ===\n");
const fixer = new ESLint({ ...config, fix: true });
for (const r of await fixer.lintFiles([targetFile])) {
  if (r.output) {
    console.log(r.output);
  } else {
    console.log("(no changes)");
  }
  if (r.messages.length) {
    console.log("Remaining:");
    for (const msg of r.messages) console.log(`  L${msg.line}: ${msg.message}`);
  }
}
