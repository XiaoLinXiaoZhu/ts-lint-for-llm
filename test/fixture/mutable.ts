// Mutable 参数检测测试

interface State {
  count: number;
  items: string[];
}

// 非 readonly 引用参数 → 应报 MutableParam
/** @capability */
export function readState(state: State): number {
  return state.count;
}

// readonly 引用参数 → 不应报 MutableParam
/** @capability */
export function readStateReadonly(state: Readonly<State>): number {
  return state.count;
}

// readonly 数组参数 → 不应报 MutableParam
/** @capability */
export function sumItems(items: readonly number[]): number {
  return items.reduce((a, b) => a + b, 0);
}

// 非 readonly 数组参数 → 应报 MutableParam
/** @capability */
export function firstItem(items: string[]): string {
  return items[0];
}

// 值类型参数 → 不应报 MutableParam
/** @capability */
export function add(a: number, b: number): number {
  return a + b;
}

// 声明了 Mutable + 非 readonly 参数 → 不应报 MutableParam（已声明）
/** @capability Mutable */
export function pushItem(state: State, item: string): void {
  state.items.push(item);
}

// 内部 push 在局部数组上 → 不应报 Mutable escalation（builtin 已移除 Mutable）
/** @capability */
export function buildList(n: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < n; i++) result.push(i);
  return result;
}

// 调用声明了 Mutable 的函数但自身未声明 → 应报 absorbed（wrappable）而非 escalation
/** @capability */
export function addDefault(state: State): void {
  pushItem(state, "default");
}
