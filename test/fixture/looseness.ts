// 类型松散度测试

/** @capability */
export function looseAny(x: any): any {
  return x;
}

/** @capability */
export function looseAsAny(x: unknown): string {
  return x as any;
}

/** @capability Mutable */
export function looseRecord(data: Record<string, any>): void {}

/** @capability Mutable */
export function looseObject(obj: Object): void {}

/** @capability */
export function looseFunction(fn: Function): void {}

/** @capability */
export function looseBoolParam(flag: boolean): void {}

// @ts-ignore
const ignored = "test";

interface Loose {
  name?: string;
  age?: number;
}
