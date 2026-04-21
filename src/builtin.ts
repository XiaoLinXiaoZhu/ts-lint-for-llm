/**
 * 内置能力表
 *
 * key = fullyQualifiedName（如 JSON.parse、Console.log、fetch）
 * 全局函数的 fullyQualifiedName 就是函数名本身。
 */

import type { Capability } from "./capabilities.js";

export const BUILTIN_CAPABILITIES: Record<string, Capability[]> = {
  // ── String（纯）──
  "String.trim": [], "String.trimStart": [], "String.trimEnd": [],
  "String.slice": [], "String.substring": [],
  "String.split": [], "String.join": [],
  "String.replace": [], "String.replaceAll": [],
  "String.startsWith": [], "String.endsWith": [],
  "String.includes": [], "String.indexOf": [], "String.lastIndexOf": [],
  "String.match": [], "String.matchAll": [], "String.search": [],
  "String.padStart": [], "String.padEnd": [], "String.repeat": [],
  "String.charAt": [], "String.charCodeAt": [], "String.codePointAt": [],
  "String.toLowerCase": [], "String.toUpperCase": [],
  "String.toLocaleLowerCase": [], "String.toLocaleUpperCase": [],
  "String.normalize": [], "String.at": [], "String.concat": [], "String.substr": [],

  // ── RegExp ──
  "RegExp.test": [], "RegExp.exec": [],

  // ── Number ──
  "Number.toFixed": [], "Number.toPrecision": [], "Number.toExponential": [],
  "Number.toString": [],

  // ── Math（纯）──
  "Math.max": [], "Math.min": [], "Math.abs": [],
  "Math.floor": [], "Math.ceil": [], "Math.round": [], "Math.trunc": [],
  "Math.sqrt": [], "Math.pow": [], "Math.log2": [], "Math.log10": [], "Math.sign": [],

  // ── Math（不纯）──
  "Math.random": ["Impure"],

  // ── Date ──
  "Date.now": ["Impure"],
  "Date.getTime": [], "Date.getFullYear": [], "Date.getMonth": [], "Date.getDate": [],
  "Date.getHours": [], "Date.getMinutes": [], "Date.getSeconds": [],
  "Date.toISOString": [], "Date.toTimeString": [], "Date.toDateString": [],
  "Date.toLocaleDateString": [], "Date.toLocaleTimeString": [], "Date.toLocaleString": [],
  "DateConstructor.now": ["Impure"],

  // ── Array（读取类）──
  "Array.map": [], "Array.filter": [], "Array.reduce": [], "Array.reduceRight": [],
  "Array.find": [], "Array.findIndex": [], "Array.findLast": [], "Array.findLastIndex": [],
  "Array.some": [], "Array.every": [], "Array.flat": [], "Array.flatMap": [],
  "Array.toSorted": [], "Array.toReversed": [], "Array.toSpliced": [],
  "Array.forEach": [], "Array.keys": [], "Array.values": [], "Array.entries": [],
  "Array.isArray": [], "Array.of": [], "Array.from": [],
  "Array.indexOf": [], "Array.lastIndexOf": [], "Array.includes": [],
  "Array.join": [], "Array.slice": [], "Array.at": [], "Array.concat": [],
  "ReadonlyArray.map": [], "ReadonlyArray.filter": [], "ReadonlyArray.reduce": [],
  "ReadonlyArray.reduceRight": [], "ReadonlyArray.find": [], "ReadonlyArray.findIndex": [],
  "ReadonlyArray.some": [], "ReadonlyArray.every": [], "ReadonlyArray.flat": [],
  "ReadonlyArray.flatMap": [], "ReadonlyArray.forEach": [], "ReadonlyArray.join": [],
  "ReadonlyArray.slice": [], "ReadonlyArray.indexOf": [], "ReadonlyArray.lastIndexOf": [],
  "ReadonlyArray.includes": [], "ReadonlyArray.at": [], "ReadonlyArray.concat": [],
  "ReadonlyArray.entries": [], "ReadonlyArray.keys": [], "ReadonlyArray.values": [],
  "ReadonlyArray.findLast": [], "ReadonlyArray.findLastIndex": [],

  // ── Array（变异类）── 局部变异不算 Mutable
  "Array.push": [], "Array.pop": [], "Array.shift": [], "Array.unshift": [],
  "Array.splice": [], "Array.sort": [], "Array.reverse": [],
  "Array.fill": [], "Array.copyWithin": [],

  // ── Object ──
  "Object.assign": [], "Object.freeze": [],
  "Object.keys": [], "Object.values": [], "Object.entries": [],
  "Object.hasOwnProperty": [], "Object.isPrototypeOf": [], "Object.propertyIsEnumerable": [],
  "ObjectConstructor.keys": [], "ObjectConstructor.values": [], "ObjectConstructor.entries": [],
  "ObjectConstructor.assign": [], "ObjectConstructor.freeze": [],

  // ── Map / Set ──
  "Map.has": [], "Map.get": [], "Map.set": [], "Map.delete": [], "Map.clear": [],
  "Set.has": [], "Set.add": [], "Set.delete": [], "Set.clear": [],
  "ReadonlyMap.has": [], "ReadonlyMap.get": [],
  "ReadonlySet.has": [],

  // ── Promise ──
  "Promise.then": [], "Promise.catch": [], "Promise.finally": [],

  // ── JSON ──
  "JSON.parse": ["Fallible"],
  "JSON.stringify": [],

  // ── Type conversions ──
  "String": [], "Number": [], "Boolean": [], "Array": [],

  // ── Encoding ──
  "encodeURIComponent": [], "decodeURIComponent": [],
  "encodeURI": [], "decodeURI": [],
  "btoa": [], "atob": [],
  "TextEncoder.encode": [], "TextDecoder.decode": [],

  // ── Console ──
  "Console.log": ["IO"], "Console.warn": ["IO"], "Console.error": ["IO"],
  "Console.info": ["IO"], "Console.debug": ["IO"],

  // ── Timers ──
  "setTimeout": ["Impure"], "setInterval": ["Impure"],
  "clearTimeout": [], "clearInterval": [],
  "queueMicrotask": [],

  // ── Fetch ──
  "fetch": ["IO", "Async", "Fallible"],

  // ── Response / Body ──
  "Body.json": ["Async", "Fallible"], "Body.text": ["Async"],
  "Body.blob": ["Async"], "Body.arrayBuffer": ["Async"],
  "Response.clone": [],
  "global.BufferConstructor.from": [],

  // ── Stream ──
  "ReadableStream.getReader": [],
  "ReadableStreamDefaultReader.read": ["Async"],
  "WritableStreamDefaultWriter.close": [],
  "ReadableStreamDefaultController.enqueue": [], "ReadableStreamDefaultController.close": [],

  // ── URLSearchParams ──
  "URLSearchParams.get": [], "URLSearchParams.set": [], "URLSearchParams.has": [],
  "URLSearchParams.append": [], "URLSearchParams.delete": [], "URLSearchParams.toString": [],

  // ── AbortSignal ──
  "AbortSignal.timeout": [], "AbortSignal.any": [], "AbortController.abort": [],

  // ── Node.js fs ──
  "readFileSync": ["IO", "Fallible"], "writeFileSync": ["IO", "Fallible"],
  "mkdirSync": ["IO", "Fallible"], "existsSync": ["IO"],
  "readFile": ["IO", "Async", "Fallible"], "writeFile": ["IO", "Async", "Fallible"],
  "mkdir": ["IO", "Async", "Fallible"], "appendFile": ["IO", "Async", "Fallible"],
  "unlink": ["IO", "Async", "Fallible"], "stat": ["IO", "Async", "Fallible"],
  "readdir": ["IO", "Async", "Fallible"], "rename": ["IO", "Async", "Fallible"],
  "copyFile": ["IO", "Async", "Fallible"], "access": ["IO", "Async", "Fallible"],
  "realpath": ["IO", "Async", "Fallible"],

  // ── Node.js path ──
  "dirname": [], "basename": [], "extname": [], "resolve": [], "relative": [],

  // ── Node.js process ──
  "exit": ["IO"], "cwd": ["Impure"], "argv": ["Impure"],

  // ── Bun ──
  "file": ["IO"], "write": ["IO", "Async", "Fallible"], "serve": ["IO"],
  "exists": ["IO", "Async"],

  // ── EventEmitter ──
  "EventEmitter.on": [], "EventEmitter.off": [], "EventEmitter.once": [],
  "EventEmitter.emit": ["IO"],
  "NCWebsocketBase.on": [],

  // ── Misc ──
  "AsyncIterator.next": ["Async"],

  // ── Bare-name fallbacks (when qualifiedName unavailable) ──
  "set": [], "get": [], "has": [], "delete": [], "clear": [], "add": [],
  "map": [], "filter": [], "reduce": [], "find": [], "some": [], "every": [],
  "forEach": [], "flat": [], "flatMap": [], "includes": [], "indexOf": [],
  "keys": [], "values": [], "entries": [],
  "join": [], "slice": [], "concat": [], "at": [],
  "push": [], "pop": [], "shift": [], "unshift": [], "splice": [], "sort": [], "reverse": [],
  "assign": [], "freeze": [],
  "split": [], "trim": [], "replace": [], "replaceAll": [],
  "startsWith": [], "endsWith": [], "match": [], "search": [],
  "toLowerCase": [], "toUpperCase": [],
  "test": [], "exec": [],
  "toFixed": [], "toString": [],
  "then": [], "catch": [], "finally": [],
  "parse": ["Fallible"], "stringify": [],
  "log": ["IO"], "warn": ["IO"], "error": ["IO"], "info": ["IO"], "debug": ["IO"],
  "random": ["Impure"], "now": ["Impure"],
  "json": ["Async", "Fallible"], "text": ["Async"],
  "blob": ["Async"], "arrayBuffer": ["Async"],
  "encode": [], "decode": [],
  "getReader": [],
  "enqueue": [], "close": [],
  "on": [], "off": [], "once": [], "emit": ["IO"],
  "from": [],
};
