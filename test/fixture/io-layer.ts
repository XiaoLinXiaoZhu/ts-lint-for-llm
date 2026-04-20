import { add } from "./pure";

/** @capability Fallible Async */
export async function fetchUser(id: string): Promise<{ name: string } | null> {
  return { name: "Alice" };
}

/** @capability IO */
export function logResult(msg: string): void {
  console.log(msg);
}

// 合法：声明了 IO，调用了 IO 函数
/** @capability IO */
export function processAndLog(msg: string): void {
  const result = add(1, 2);
  logResult(`${msg}: ${result}`);
}
