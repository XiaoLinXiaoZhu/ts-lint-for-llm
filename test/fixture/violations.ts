import { fetchUser } from "./io-layer";
import { add } from "./pure";

// 纯函数调用了 IO 函数 → missing_capability
/** @capability */
export function badPure(): number {
  fetchUser("1");
  return 42;
}

// 未声明能力 → undeclared
export function undeclaredFn(x: number): number {
  return x + 1;
}

// 返回 null 但未声明 Fallible → implicit_capability
/** @capability IO */
export function findItem(id: string): string | null {
  return null;
}

// async 但未声明 Async → implicit_capability
/** @capability IO */
export async function loadData(): Promise<string> {
  return "data";
}

// 调用了 Fallible 函数但声明了 HandleFallible → 无 missing_capability
/** @capability IO Async HandleFallible */
export async function safeFetch(id: string): Promise<string> {
  const user = await fetchUser(id);
  return user?.name ?? "unknown";
}

// 多余声明：声明了 Mutable 但没用到
/** @capability Mutable */
export function pureWithExcess(x: number): number {
  return add(x, 1);
}

declare function externalApiCall(): any;

// Cap file 测试：调用了 .cap.ts 中声明的外部函数
/** @capability */
export function callsExternalApi(): void {
  externalApiCall();
}
