import { fetchUser } from "./io-layer";
import { add } from "./pure";

// 违反：纯函数调用了 IO 函数
/** @capability */
export function badPure(): number {
  fetchUser("1");
  return 42;
}

// 违反：未声明能力
export function undeclaredFn(x: number): number {
  return x + 1;
}

// Fallible mismatch：返回 null 但未声明 Fallible
/** @capability IO */
export function findItem(id: string): string | null {
  return null;
}

// Async mismatch：返回 Promise 但未声明 Async
/** @capability IO */
export async function loadData(): Promise<string> {
  return "data";
}

// Fallible absorbed：调用了 Fallible 函数但没声明
/** @capability IO Async */
export async function safeFetch(id: string): Promise<string> {
  const user = await fetchUser(id);
  return user?.name ?? "unknown";
}

// 多余声明：声明了 Mutable 但没用到（无 unknown calls）
/** @capability Mutable */
export function pureWithExcess(x: number): number {
  return add(x, 1);
}
