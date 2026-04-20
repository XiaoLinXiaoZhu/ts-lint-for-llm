/**
 * node:fs 的能力声明
 * 这是数据源（SSOT），adapter 文件由 codegen 从此生成
 */
import type { Capability } from "../src/capabilities.js";

const caps: Record<string, Capability[]> = {
  // 同步 IO
  readFileSync:      ["IO", "Blocking", "Fallible"],
  writeFileSync:     ["IO", "Blocking", "Fallible", "Mutable"],
  existsSync:        ["IO", "Blocking"],
  mkdirSync:         ["IO", "Blocking", "Fallible", "Mutable"],
  readdirSync:       ["IO", "Blocking", "Fallible"],
  statSync:          ["IO", "Blocking", "Fallible"],
  unlinkSync:        ["IO", "Blocking", "Fallible", "Mutable"],
  renameSync:        ["IO", "Blocking", "Fallible", "Mutable"],

  // 异步 IO
  readFile:          ["IO", "Async", "Fallible"],
  writeFile:         ["IO", "Async", "Fallible", "Mutable"],
  mkdir:             ["IO", "Async", "Fallible", "Mutable"],
  readdir:           ["IO", "Async", "Fallible"],
  stat:              ["IO", "Async", "Fallible"],
  unlink:            ["IO", "Async", "Fallible", "Mutable"],
  rename:            ["IO", "Async", "Fallible", "Mutable"],

  // 纯计算
  basename:          [],
  dirname:           [],
  extname:           [],
  join:              [],
};

export default caps;
