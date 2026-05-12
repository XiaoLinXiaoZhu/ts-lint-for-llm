export { type Capability, type AssertionProperty, CAPABILITIES, PROPAGATE_CAPS, ASSERTION_PROPERTIES } from "./capabilities.js";
export { type FunctionNode, type CallSite, type FunctionInfo, type ProjectGraph, buildGraph } from "./graph.js";
export { type InferredCaps, inferAll } from "./infer.js";
export { type Assertion, type AssertionViolation, type ViolationChain, checkAssertions } from "./assert.js";
export { BUILTIN_CAPABILITIES } from "./builtin.js";
export { loadCapFiles, type ExternalCapEntry } from "./cap-file.js";
export { scanMinimal, type PassThroughParam, type MinimalViolation, type MinimalResult } from "./minimal.js";
