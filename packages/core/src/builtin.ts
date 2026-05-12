/**
 * 内置能力表
 *
 * 只声明无法从类型推断的能力（IO/Impure），
 * 以及 .d.ts 类型不完整导致无法自动推断的 Async/Fallible。
 */

import type { Capability } from "./capabilities.js";

export const BUILTIN_CAPABILITIES: Record<string, Capability[]> = {
  // ── Math ──
  "Math.random": ["Impure"],

  // ── Date ──
  "Date.now": ["Impure"],
  "DateConstructor.now": ["Impure"],

  // ── Console ──
  "Console.log": ["IO"],
  "Console.warn": ["IO"],
  "Console.error": ["IO"],
  "Console.info": ["IO"],
  "Console.debug": ["IO"],

  // ── Timers ──
  "setTimeout": ["Impure"],
  "setInterval": ["Impure"],

  // ── Fetch ──
  "fetch": ["IO", "Async", "Fallible"],

  // ── Response / Body ──
  "Body.json": ["Async", "Fallible"],
  "Body.text": ["Async"],
  "Body.blob": ["Async"],
  "Body.arrayBuffer": ["Async"],

  // ── JSON ──
  "JSON.parse": ["Fallible"],

  // ── Node.js fs ──
  "readFileSync": ["IO", "Fallible"],
  "writeFileSync": ["IO", "Fallible"],
  "mkdirSync": ["IO", "Fallible"],
  "existsSync": ["IO"],
  "readFile": ["IO", "Async", "Fallible"],
  "writeFile": ["IO", "Async", "Fallible"],
  "mkdir": ["IO", "Async", "Fallible"],
  "readdir": ["IO", "Async", "Fallible"],
  "stat": ["IO", "Async", "Fallible"],
  "unlink": ["IO", "Async", "Fallible"],
  "rename": ["IO", "Async", "Fallible"],
  "copyFile": ["IO", "Async", "Fallible"],
  "access": ["IO", "Async", "Fallible"],

  // ── Node.js process ──
  "exit": ["IO"],
  "cwd": ["Impure"],

  // ── Bun ──
  "file": ["IO"],
  "write": ["IO", "Async", "Fallible"],
  "serve": ["IO"],
  "exists": ["IO", "Async"],

  // ── EventEmitter ──
  "EventEmitter.emit": ["IO"],

  // ── Stream ──
  "ReadableStreamDefaultReader.read": ["Async"],

  // ── Bare-name fallbacks ──
  "log": ["IO"],
  "warn": ["IO"],
  "error": ["IO"],
  "random": ["Impure"],
  "now": ["Impure"],
  "parse": ["Fallible"],
  "json": ["Async", "Fallible"],
  "text": ["Async"],
  "emit": ["IO"],
};
