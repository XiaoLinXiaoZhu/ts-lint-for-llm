/**
 * 从 .caps.ts 声明文件自动生成 re-export adapter
 *
 * 用法: bun codegen.ts capabilities/node-fs.caps.ts node:fs
 * 输出: adapters/node-fs.ts
 */

import { resolve, basename } from "node:path";
import type { Capability } from "./src/capabilities.js";

const capsFilePath = process.argv[2];
const moduleName = process.argv[3];

if (!capsFilePath || !moduleName) {
  console.error("用法: bun codegen.ts <caps-file> <module-name>");
  process.exit(1);
}

const capsModule = await import(resolve(capsFilePath));
const caps: Record<string, Capability[]> = capsModule.default;

const adapterName = basename(capsFilePath).replace(".caps.ts", "");

const lines: string[] = [
  `/**`,
  ` * ${moduleName} 能力适配层（自动生成，勿手动编辑）`,
  ` * 数据源: capabilities/${adapterName}.caps.ts`,
  ` * 生成命令: bun codegen.ts capabilities/${adapterName}.caps.ts ${moduleName}`,
  ` */`,
  ``,
];

// 收集所有需要 import 的原始名
const importNames: string[] = [];
const exports: string[] = [];

for (const [fnName, fnCaps] of Object.entries(caps)) {
  importNames.push(fnName);
  if (fnCaps.length === 0) {
    // 纯函数：直接 re-export，不加后缀
    exports.push(`export { ${fnName} } from "${moduleName}";`);
  } else {
    const suffix = fnCaps.join("_");
    const newName = `${fnName}_${suffix}`;
    exports.push(`export { ${fnName} as ${newName} } from "${moduleName}";`);
  }
}

lines.push(...exports);
lines.push(``);

const output = lines.join("\n");
const outputPath = `adapters/${adapterName}.ts`;

await Bun.write(outputPath, output);
console.log(`✅ 生成 ${outputPath}`);
console.log(`   ${Object.keys(caps).length} 个函数，其中 ${Object.values(caps).filter(c => c.length === 0).length} 个纯函数`);
