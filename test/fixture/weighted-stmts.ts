// 加权语句数测试

// 单条语句: weight = 1 + 0(depth) + 0(branch) = 1
/** @capability */
export function oneStatement(): number {
  return 42;
}

// if 语句: weight(if) = 1 + 0 + 0.5 = 1.5, weight(return) = 1 + 1 + 0 = 2
// 共 2 条语句, 加权 = 3.5
/** @capability */
export function withIf(x: number): number {
  if (x > 0) {
    return x;
  }
  return 0;
}

// 嵌套: for → if → return
// for: 1 + 0 + 0.5 = 1.5
// if:  1 + 1 + 0.5 = 2.5
// return: 1 + 2 + 0 = 3
// 外层 return: 1 + 0 + 0 = 1
// 共 4 条, 加权 = 8
/** @capability */
export function nestedStatements(items: readonly number[]): number {
  for (const item of items) {
    if (item > 10) {
      return item;
    }
  }
  return 0;
}

// try-catch:
// try: 1 + 0 + 0 = 1
// expressionStmt: 1 + 1 + 0 = 2
// return(in catch/inner): 1 + 2(try+catch) + 0 = 3
// return(outer): 1 + 0 + 0 = 1
/** @capability */
export function withTryCatch(): string {
  try {
    JSON.parse("{}");
  } catch (e) {
    return "error";
  }
  return "ok";
}

// 零语句函数
/** @capability */
export function emptyFn(): void {}
