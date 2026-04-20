/**
 * node:fs 能力适配层（自动生成，勿手动编辑）
 * 数据源: capabilities/node-fs.caps.ts
 * 生成命令: bun codegen.ts capabilities/node-fs.caps.ts node:fs
 */

export { readFileSync as readFileSync_IO_Blocking_Fallible } from "node:fs";
export { writeFileSync as writeFileSync_IO_Blocking_Fallible_Mutable } from "node:fs";
export { existsSync as existsSync_IO_Blocking } from "node:fs";
export { mkdirSync as mkdirSync_IO_Blocking_Fallible_Mutable } from "node:fs";
export { readdirSync as readdirSync_IO_Blocking_Fallible } from "node:fs";
export { statSync as statSync_IO_Blocking_Fallible } from "node:fs";
export { unlinkSync as unlinkSync_IO_Blocking_Fallible_Mutable } from "node:fs";
export { renameSync as renameSync_IO_Blocking_Fallible_Mutable } from "node:fs";
export { readFile as readFile_IO_Async_Fallible } from "node:fs";
export { writeFile as writeFile_IO_Async_Fallible_Mutable } from "node:fs";
export { mkdir as mkdir_IO_Async_Fallible_Mutable } from "node:fs";
export { readdir as readdir_IO_Async_Fallible } from "node:fs";
export { stat as stat_IO_Async_Fallible } from "node:fs";
export { unlink as unlink_IO_Async_Fallible_Mutable } from "node:fs";
export { rename as rename_IO_Async_Fallible_Mutable } from "node:fs";
export { basename } from "node:fs";
export { dirname } from "node:fs";
export { extname } from "node:fs";
export { join } from "node:fs";
