// suffix naming tests

export function fetchUser_IO_Async(id: string): void {}

export function getConfig_IO_HandleFallible(): string { return ""; }

// no suffix match, no JSDoc -> undeclared
export function pureCalc(x: number): number { return x + 1; }

// suffix takes priority over JSDoc
/** @capability Mutable */
export function save_IO(data: string): void {}

// all 8 caps work in suffixes
export function complex_IO_Impure_Fallible_Async_Mutable(): void {}

export function handler_HandleFallible_HandleAsync_HandleMutable(): void {}
