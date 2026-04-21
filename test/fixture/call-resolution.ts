// 调用解析边界测试

import { add, multiply } from "./pure";
import { fetchUser, logResult } from "./io-layer";

// 同文件内调用
/** @capability */
function localHelper(x: number): number { return x + 1; }

/** @capability */
export function callsLocalHelper(): number {
  return localHelper(5);
}

// 链式跨文件调用
/** @capability IO */
export function chainedCalls(msg: string): void {
  const sum = add(1, multiply(2, 3));
  logResult(`${msg}: ${sum}`);
}

// 调用未注册外部函数 → unregistered
/** @capability IO Impure */
export function callsUnknown(): void {
  (globalThis as any).unknownFunction();
}

// 对象方法内的调用解析
/** @capability Fallible Async */
export const service = {
  /** @capability IO Fallible Async */
  load: (id: string) => fetchUser(id),
  /** @capability */
  transform: (x: number) => add(x, 1),
};

// class 内的跨文件调用
export class Worker {
  /** @capability IO */
  run(): void {
    logResult("working");
  }

  /** @capability */
  compute(a: number, b: number): number {
    return add(a, b);
  }
}
