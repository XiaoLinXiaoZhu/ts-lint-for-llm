// Internal implementation file

export function pureAdd(a: number, b: number): number {
  return a + b;
}

export async function impureCalc(x: number): Promise<number> {
  const response = await fetch(`/api/calc/${x}`);
  const data = await response.json();
  return data.result;
}

export function formatResult(value: number): string {
  return `Result: ${value}`;
}
