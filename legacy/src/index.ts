/**
 * eslint-plugin-capability
 *
 * ESLint plugin for capability-based effect tracking.
 * Rules:
 *   - no-escalation: capability escalation violations (error)
 *   - fallible-absorbed: Fallible absorption suggestions (warn)
 *   - async-absorbed: Async absorption suggestions (warn)
 */

import { noEscalation } from "./rules/no-escalation.js";
import { fallibleAbsorbed } from "./rules/fallible-absorbed.js";
import { asyncAbsorbed } from "./rules/async-absorbed.js";

export const rules = {
  "no-escalation": noEscalation,
  "fallible-absorbed": fallibleAbsorbed,
  "async-absorbed": asyncAbsorbed,
};

export { ALL_CAPABILITIES, CAPABILITY_WORDS, ELIMINABILITY, VALID_CAPABILITY_NAMES } from "./capabilities.js";
export type { Capability } from "./capabilities.js";
