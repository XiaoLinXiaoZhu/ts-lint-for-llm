/**
 * JS/TS 标准库 + Node/Bun API 内置能力声明
 *
 * 按方法名匹配。同名碰撞时取保守值。
 */

import type { Capability } from "./capabilities.js";

export const BUILTIN_CAPABILITIES: Record<string, Capability[]> = {
  // ── String（纯函数）──
  trim: [], trimStart: [], trimEnd: [], slice: [], substring: [],
  split: [], join: [], replace: [], replaceAll: [],
  startsWith: [], endsWith: [], includes: [], indexOf: [], lastIndexOf: [],
  match: [], matchAll: [], search: [],
  padStart: [], padEnd: [], repeat: [],
  charAt: [], charCodeAt: [], codePointAt: [],
  toLowerCase: [], toUpperCase: [], normalize: [], at: [], concat: [],

  // ── RegExp ──
  test: [], exec: [],

  // ── Number ──
  toFixed: [], toPrecision: [], toExponential: [], toString: [],

  // ── Math（纯）──
  max: [], min: [], abs: [], floor: [], ceil: [], round: [], trunc: [],
  sqrt: [], pow: [], log2: [], log10: [], sign: [],

  // ── Math（不纯）──
  random: ["Impure"],

  // ── Array（读取类）──
  map: [], filter: [], reduce: [], reduceRight: [],
  find: [], findIndex: [], findLast: [], findLastIndex: [],
  some: [], every: [], flat: [], flatMap: [],
  toSorted: [], toReversed: [], toSpliced: [],
  forEach: [], keys: [], values: [], entries: [],
  isArray: [], of: [], from: [],

  // ── Array（变异类）──
  push: ["Mutable"], pop: ["Mutable"], shift: ["Mutable"], unshift: ["Mutable"],
  splice: ["Mutable"], sort: ["Mutable"], reverse: ["Mutable"],
  fill: ["Mutable"], copyWithin: ["Mutable"],

  // ── Object ──
  assign: ["Mutable"], freeze: ["Mutable"],
  hasOwnProperty: [], isPrototypeOf: [], propertyIsEnumerable: [],

  // ── Map / Set ──
  has: [], get: [],
  set: ["Mutable"], delete: ["Mutable"], clear: ["Mutable"], add: ["Mutable"],

  // ── Promise ──
  then: [], catch: [], finally: [],

  // ── JSON ──
  parse: ["Fallible"], stringify: [],

  // ── Type conversions ──
  String: [], Number: [], Boolean: [], Array: [],

  // ── Date（读取）──
  getTime: [], getFullYear: [], getMonth: [], getDate: [],
  getHours: [], getMinutes: [], getSeconds: [],
  toISOString: [], toTimeString: [], toDateString: [],
  toLocaleDateString: [], toLocaleTimeString: [], toLocaleString: [],

  // ── Date（不纯）──
  now: ["Impure"],

  // ── Encoding ──
  encode: [], decode: [],
  encodeURIComponent: [], decodeURIComponent: [],
  encodeURI: [], decodeURI: [],
  btoa: [], atob: [],

  // ── Console ──
  log: ["IO"], warn: ["IO"], error: ["IO"], info: ["IO"], debug: ["IO"],

  // ── Timers ──
  setTimeout: ["Impure"], setInterval: ["Impure"],
  clearTimeout: [], clearInterval: [],
  queueMicrotask: [],

  // ── Fetch ──
  fetch: ["IO", "Async", "Fallible"],

  // ── Stream ──
  getReader: [], read: ["Async"],
  enqueue: ["Mutable"], close: [],

  // ── Response ──
  json: ["Async", "Fallible"], text: ["Async"],
  blob: ["Async"], arrayBuffer: ["Async"], clone: [],

  // ── AbortSignal ──
  timeout: [], any: [], abort: [],

  // ── Node.js fs ──
  readFileSync: ["IO", "Fallible"], writeFileSync: ["IO", "Fallible"],
  mkdirSync: ["IO", "Fallible"], existsSync: ["IO"],
  readFile: ["IO", "Async", "Fallible"], writeFile: ["IO", "Async", "Fallible"],
  mkdir: ["IO", "Async", "Fallible"], appendFile: ["IO", "Async", "Fallible"],
  unlink: ["IO", "Async", "Fallible"], stat: ["IO", "Async", "Fallible"],
  readdir: ["IO", "Async", "Fallible"], rename: ["IO", "Async", "Fallible"],
  copyFile: ["IO", "Async", "Fallible"], access: ["IO", "Async", "Fallible"],

  // ── Node.js path ──
  dirname: [], basename: [], extname: [], resolve: [], relative: [],

  // ── Node.js process ──
  exit: ["IO"], cwd: ["Impure"],

  // ── Bun ──
  file: ["IO"], write: ["IO", "Async", "Fallible"], serve: ["IO"],
  exists: ["IO", "Async"],

  // ── EventEmitter ──
  on: [], off: [], once: [], emit: ["IO"],

  // ── Misc ──
  next: ["Async"],
};
