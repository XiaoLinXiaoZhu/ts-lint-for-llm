/** @effect io */
declare function readFileSync(path: string): string;

export function read(path: string): string {
  return readFileSync(path);
}

/** @is pure total readonly sync */
export function pure(x: number): number {
  return x * 2;
}

/** @is total */
/** @handles may-return-none */
export function parseOrDefault(input: string): string {
  return parse(input) ?? "fallback";
}

declare function parse(input: string): string | undefined;

export function mutate(input: { value: number }): void {
  input.value = 1;
}

export function wrapper(input: string): string {
  return readFileSync(input);
}

/** @is pure */
export function badPure(input: string): string {
  return readFileSync(input);
}

type Loose = { optional?: string; value: any };
export function flag(enabled: boolean): Loose {
  return { optional: enabled ? "yes" : undefined, value: enabled };
}
