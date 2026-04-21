// 对象方法和 class 方法扫描测试

import { fetchUser } from "./io-layer";

// ── 对象字面量：PropertyAssignment + ArrowFunction ──

/** @capability IO Async Fallible */
export const api = {
  /** @capability IO Async Fallible */
  getUser: (id: string) => fetchUser(id),
  /** @capability */
  buildUrl: (path: string) => `/api${path}`,
};

// ── 闭包返回的对象字面量：MethodDeclaration ──

interface Counter {
  increment(): void;
  getValue(): number;
}

/** @capability */
export function createCounter(init: number): Counter {
  let value = init;
  return {
    /** @capability Mutable */
    increment() { value++; },
    /** @capability */
    getValue() { return value; },
  };
}

// ── 同文件同名方法：两个不同对象各有一个 reset ──

/** @capability */
export function buildA() {
  return {
    /** @capability IO */
    reset() { fetchUser("reset-a"); },
  };
}

/** @capability */
export function buildB() {
  return {
    /** @capability */
    reset() { /* pure */ },
  };
}

// ── 调用对象方法的函数 ──

/** @capability IO Async Fallible */
export function callApiGetUser(): any {
  return api.getUser("1");
}

// ── class 方法 ──

export class Greeter {
  private name: string;
  constructor(name: string) { this.name = name; }

  /** @capability */
  greet(): string { return `Hello, ${this.name}`; }

  /** @capability IO */
  greetAndLog(): string {
    const msg = this.greet();
    fetchUser(msg);
    return msg;
  }
}
