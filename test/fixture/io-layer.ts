import { add } from "./pure";

/** @capability IO Fallible Async */
export async function fetchUser(id: string): Promise<{ name: string } | null> {
  return { name: "Alice" };
}

/** @capability IO */
export function logResult(msg: string): void {
  console.log(msg);
}

/** @capability IO */
export function processAndLog(msg: string): void {
  const result = add(1, 2);
  logResult(`${msg}: ${result}`);
}
