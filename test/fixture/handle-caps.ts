// Handle blocking capability tests

import { fetchUser } from "./io-layer";

// fetchUser propagatedCaps = {IO, Fallible, Async}

// HandleFallible: blocks Fallible from propagating
/** @capability IO Async HandleFallible */
export async function getUsername(id: string): Promise<string> {
  const user = await fetchUser(id);
  return user?.name ?? "anonymous";
}

// HandleAsync: blocks Async from propagating
/** @capability IO HandleAsync HandleFallible */
export function fireAndForget(id: string): void {
  fetchUser(id).then(() => {}).catch(() => {});
}

// Self returns null -> auto-detect Fallible
// effectiveCaps = {IO, Async, Fallible, HandleFallible}
// propagatedCaps = {IO, Async} (Fallible blocked by HandleFallible)
/** @capability IO Async HandleFallible */
export async function findOrDefault(id: string): Promise<string | null> {
  const user = await fetchUser(id);
  return user?.name ?? null;
}

// No Handle declared -> should report missing_capability for Fallible
/** @capability IO Async */
export async function missingFallible(id: string): Promise<string> {
  const user = await fetchUser(id);
  return user?.name ?? "unknown";
}

// Calls a Handle-blocked function -> only sees propagatedCaps
// getUsername propagatedCaps = {IO, Async} (no Fallible)
/** @capability IO Async */
export async function callsGetUsername(id: string): Promise<string> {
  return getUsername(id);
}
