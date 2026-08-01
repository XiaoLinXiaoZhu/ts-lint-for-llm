import type { Effect, Guarantee } from "./effect.js";

export interface Contract {
  guarantees: Guarantee[];
  handles: Effect[];
  source: "is" | "handles" | "effect";
}

export interface HandlingEvidence {
  effect: Effect;
  proven: boolean;
  evidence: string[];
}
