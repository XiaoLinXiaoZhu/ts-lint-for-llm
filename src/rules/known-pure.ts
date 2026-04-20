/**
 * JS/TS 标准库内置能力声明
 *
 * 等同于 externalCapabilities，但随插件内置。
 * 只按方法名匹配（不区分宿主对象），和 externalCapabilities 行为一致。
 *
 * 能力分类原则：
 *   - 纯函数（无副作用、确定性、不修改输入）→ []
 *   - 修改接收者或参数 → ["Mutable"]
 *   - 可能抛异常 → ["Fallible"]
 *   - 依赖隐式环境（时间、随机数）→ ["Impure"]
 *   - 读写外部系统 → ["IO"]
 *   - 涉及异步 → ["Async"]
 */

import type { Capability } from "../capabilities.js";

export const BUILTIN_CAPABILITIES: Record<string, Capability[]> = {
  // ── String（全部纯函数，不修改原字符串）──
  trim: [],
  trimStart: [],
  trimEnd: [],
  slice: [],
  substring: [],
  substr: [],
  split: [],
  join: [],
  replace: [],
  replaceAll: [],
  startsWith: [],
  endsWith: [],
  includes: [],
  indexOf: [],
  lastIndexOf: [],
  match: [],
  matchAll: [],
  search: [],
  padStart: [],
  padEnd: [],
  repeat: [],
  charAt: [],
  charCodeAt: [],
  codePointAt: [],
  toLowerCase: [],
  toUpperCase: [],
  toLocaleLowerCase: [],
  toLocaleUpperCase: [],
  normalize: [],
  at: [],
  concat: [],

  // ── RegExp ──
  test: [],
  exec: [],

  // ── Number ──
  toFixed: [],
  toPrecision: [],
  toExponential: [],
  toString: [],

  // ── Math（纯函数）──
  max: [],
  min: [],
  abs: [],
  floor: [],
  ceil: [],
  round: [],
  trunc: [],
  sqrt: [],
  pow: [],
  log2: [],
  log10: [],
  sign: [],

  // ── Math（不纯）──
  random: ["Impure"],

  // ── Array（读取类，不修改原数组）──
  map: [],
  filter: [],
  reduce: [],
  reduceRight: [],
  find: [],
  findIndex: [],
  findLast: [],
  findLastIndex: [],
  some: [],
  every: [],
  flat: [],
  flatMap: [],
  toSorted: [],
  toReversed: [],
  toSpliced: [],
  forEach: [],
  keys: [],
  values: [],
  entries: [],
  isArray: [],
  of: [],
  from: [],

  // ── Array（变异类，修改原数组）──
  push: ["Mutable"],
  pop: ["Mutable"],
  shift: ["Mutable"],
  unshift: ["Mutable"],
  splice: ["Mutable"],
  sort: ["Mutable"],
  reverse: ["Mutable"],
  fill: ["Mutable"],
  copyWithin: ["Mutable"],

  // ── Object ──
  assign: ["Mutable"],
  freeze: ["Mutable"],
  hasOwnProperty: [],
  isPrototypeOf: [],
  propertyIsEnumerable: [],

  // ── Map / Set ──
  has: [],
  get: [],
  set: ["Mutable"],
  delete: ["Mutable"],
  clear: ["Mutable"],
  add: ["Mutable"],

  // ── Promise ──
  then: [],
  catch: [],
  finally: [],

  // ── JSON ──
  parse: ["Fallible"],
  stringify: [],

  // ── Type conversions ──
  String: [],
  Number: [],
  Boolean: [],
  Array: [],

  // ── Date（读取，依赖已有对象状态）──
  getTime: [],
  getFullYear: [],
  getMonth: [],
  getDate: [],
  getHours: [],
  getMinutes: [],
  getSeconds: [],
  toISOString: [],
  toTimeString: [],
  toDateString: [],
  toLocaleDateString: [],
  toLocaleTimeString: [],
  toLocaleString: [],

  // ── Date（依赖系统时间）──
  now: ["Impure"],

  // ── Encoding ──
  encode: [],
  decode: [],
  encodeURIComponent: [],
  decodeURIComponent: [],
  encodeURI: [],
  decodeURI: [],
  btoa: [],
  atob: [],

  // ── Console（IO）──
  log: ["IO"], // console.log; Math.log 按名碰撞，取保守值
  warn: ["IO"],
  error: ["IO"],
  info: ["IO"],
  debug: ["IO"],

  // ── Timers（Impure + IO）──
  setTimeout: ["Impure"],
  setInterval: ["Impure"],
  clearTimeout: [],
  clearInterval: [],
  queueMicrotask: [],

  // ── Fetch / Network（IO + Async + Fallible）──
  fetch: ["IO", "Async", "Fallible"],

  // ── ReadableStream / WritableStream ──
  getReader: [],
  read: ["Async"],
  enqueue: ["Mutable"],
  close: [],

  // ── Response / Request ──
  json: ["Async", "Fallible"],
  text: ["Async"],
  blob: ["Async"],
  arrayBuffer: ["Async"],
  clone: [],

  // ── AbortSignal ──
  timeout: [],
  any: [],
  abort: [],

  // ── Misc ──
  next: ["Async"],
};
