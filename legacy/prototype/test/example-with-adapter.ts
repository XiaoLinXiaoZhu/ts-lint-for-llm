// ==============================
// 端到端示例：使用 adapter 的业务代码
// ==============================

// 从 adapter 导入（而非直接 import "node:fs"）
// 调用处一眼可见能力: readFileSync 需要 IO + Blocking + Fallible
import { readFileSync_IO_Blocking_Fallible, basename } from "../adapters/node-fs.js";

// ---- 纯函数：无后缀 ----

/** @capability */
function parseConfig(raw: string): Record<string, unknown> {
  return JSON.parse(raw);
}

/** @capability */
function getFileName(path: string): string {
  return basename(path);  // basename 是纯函数，OK
}

// ---- 有能力的函数：后缀声明 ----

function loadConfig_IO_Blocking_Fallible(path: string): Record<string, unknown> {
  // readFileSync_IO_Blocking_Fallible 需要 IO+Blocking+Fallible
  // loadConfig 也声明了 IO+Blocking+Fallible → 合法
  const raw = readFileSync_IO_Blocking_Fallible(path, "utf8");
  return parseConfig(raw as string);
}

// ---- 调用处的可读性 ----

function startApp_IO_Blocking_Fallible(): void {
  // 读这行代码时，不需要跳到 loadConfig 的定义就能知道：
  //   1. 它做了 IO（读文件）
  //   2. 它是同步阻塞的
  //   3. 它可能失败
  const config = loadConfig_IO_Blocking_Fallible("./config.json");
  console.log(config);
}
