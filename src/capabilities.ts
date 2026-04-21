/**
 * 能力配置 — 全局唯一配置源
 *
 * 8 个能力分为两类三组：
 *   传播不可阻断: IO, Impure
 *   传播可阻断:   Fallible, Async, Mutable
 *   阻断:        HandleFallible, HandleAsync, HandleMutable
 */

export type Capability =
  | "IO" | "Impure" | "Fallible" | "Async" | "Mutable"
  | "HandleFallible" | "HandleAsync" | "HandleMutable";

export interface CapabilityDef {
  kind: "propagate" | "block";
  autoDetectable: boolean;
  scorable: boolean;
  blocks?: Capability;
  blockedBy?: Capability;
}

export const CAPABILITY_DEFS: Record<Capability, CapabilityDef> = {
  IO:              { kind: "propagate", autoDetectable: false, scorable: true },
  Impure:          { kind: "propagate", autoDetectable: false, scorable: true },
  Fallible:        { kind: "propagate", autoDetectable: true,  scorable: true,  blockedBy: "HandleFallible" },
  Async:           { kind: "propagate", autoDetectable: true,  scorable: true,  blockedBy: "HandleAsync" },
  Mutable:         { kind: "propagate", autoDetectable: true,  scorable: true,  blockedBy: "HandleMutable" },
  HandleFallible:  { kind: "block",     autoDetectable: false, scorable: false, blocks: "Fallible" },
  HandleAsync:     { kind: "block",     autoDetectable: false, scorable: false, blocks: "Async" },
  HandleMutable:   { kind: "block",     autoDetectable: false, scorable: false, blocks: "Mutable" },
};

export const ALL_CAPABILITIES = Object.keys(CAPABILITY_DEFS) as Capability[];
export const VALID_CAPABILITY_NAMES = new Set<Capability>(ALL_CAPABILITIES);

export const PROPAGATE_CAPS = ALL_CAPABILITIES.filter(c => CAPABILITY_DEFS[c].kind === "propagate");
export const BLOCK_CAPS = ALL_CAPABILITIES.filter(c => CAPABILITY_DEFS[c].kind === "block");
export const SCORABLE_CAPS = ALL_CAPABILITIES.filter(c => CAPABILITY_DEFS[c].scorable);
export const AUTO_DETECTABLE_CAPS = ALL_CAPABILITIES.filter(c => CAPABILITY_DEFS[c].autoDetectable);

/** propagate cap → its block cap */
export const BLOCK_PAIRS = new Map<Capability, Capability>(
  PROPAGATE_CAPS
    .filter(c => CAPABILITY_DEFS[c].blockedBy)
    .map(c => [c, CAPABILITY_DEFS[c].blockedBy!]),
);
