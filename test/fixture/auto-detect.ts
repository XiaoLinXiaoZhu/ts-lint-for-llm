// 自动检测测试

// Async: async 关键字
/** @capability Async */
export async function asyncByKeyword(): Promise<void> {}

// Async: 返回 Promise
/** @capability Async */
export function asyncByReturn(): Promise<string> { return Promise.resolve(""); }

// Async: 返回 AsyncIterable
/** @capability Fallible */
export async function* asyncGenerator(): AsyncGenerator<number> { yield 1; }

// Fallible: 返回 null
/** @capability Fallible */
export function returnsNull(): string | null { return null; }

// Fallible: 返回 undefined
/** @capability Fallible Async */
export function returnsUndefined(): string | undefined { return undefined; }

// Fallible: Promise<T | null> 泛型参数含 null
/** @capability Mutable */
export async function asyncNullable(): Promise<string | null> { return null; }

// Mutable: 非 readonly 对象参数
/** @capability */
export function takesObject(obj: { x: number }): number { return obj.x; }

// 不触发: 值类型参数
/** @capability IO Impure */
export function takesValues(a: number, b: string, c: boolean): void {}

// 不触发: 函数签名参数
/** @capability */
export function takesCallback(fn: (x: number) => void): void { fn(1); }

// 不触发: readonly 数组
/** @capability */
export function takesReadonlyArr(items: readonly string[]): void {}

// 不触发: ReadonlyMap
/** @capability */
export function takesReadonlyMap(m: ReadonlyMap<string, number>): void {}

// 不触发: Iterable
/** @capability */
export function takesIterable(it: Iterable<number>): void {}

// 已声明全部 → 无 implicit_capability
/** @capability Fallible Async Mutable */
export async function fullyDeclared(obj: { x: number }): Promise<string | null> {
  return null;
}
