// Mutable 参数检测测试

interface State {
  count: number;
  items: string[];
}

// 非 readonly 引用参数 → implicit_capability(Mutable)
/** @capability */
export function readState(state: State): number {
  return state.count;
}

// readonly 引用参数 → 不触发 Mutable
/** @capability */
export function readStateReadonly(state: Readonly<State>): number {
  return state.count;
}

// readonly 数组参数 → 不触发 Mutable
/** @capability */
export function sumItems(items: readonly number[]): number {
  return items.reduce((a, b) => a + b, 0);
}

// 非 readonly 数组参数 → implicit_capability(Mutable)
/** @capability */
export function firstItem(items: string[]): string {
  return items[0];
}

// 声明了 Mutable + 非 readonly 参数 → 不报 implicit_capability
/** @capability Mutable */
export function pushItem(state: State, item: string): void {
  state.items.push(item);
}

// 内部 push 在局部数组上 → 不触发 Mutable
/** @capability */
export function buildList(n: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < n; i++) result.push(i);
  return result;
}

// 调用了 Mutable 函数，自身未声明 Mutable 但有非 readonly 参数 → 自动注入 Mutable
/** @capability */
export function addDefault(state: State): void {
  pushItem(state, "default");
}

// HandleMutable: 调用了 Mutable 函数，声明 HandleMutable 阻断传播
/** @capability HandleMutable */
export function sortedCopy(items: readonly number[]): number[] {
  const copy = [...items];
  copy.sort();
  return copy;
}
