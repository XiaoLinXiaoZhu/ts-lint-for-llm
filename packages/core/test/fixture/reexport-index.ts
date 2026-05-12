// Barrel file with assertions on re-exports

/** @assert pure */
export { pureAdd } from "./reexport-math.js";

/** @assert pure */
export { impureCalc } from "./reexport-math.js";

/** @assert sync infallible */
export { formatResult } from "./reexport-math.js";
