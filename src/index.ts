/**
 * eslint-plugin-capability
 *
 * ESLint plugin for capability-based effect tracking.
 * Provides the `no-escalation` rule and scoring utilities.
 */

import { noEscalation } from "./rules/no-escalation.js";

export const rules = {
  "no-escalation": noEscalation,
};

export { ALL_CAPABILITIES, CAPABILITY_WORDS, ELIMINABILITY, VALID_CAPABILITY_NAMES } from "./capabilities.js";
export type { Capability } from "./capabilities.js";
