"use client";

import { useSyncExternalStore } from "react";
import { useClock } from "./store";

const noopSubscribe = () => () => {};

/**
 * False during the server render and hydration, true afterwards. Anything that
 * reads localStorage-backed state or the clock renders behind this, so the
 * server HTML and the first client render always match.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Current time from the shared clock (ticks on whole seconds of the session). */
export function useNow(): number {
  return useClock((s) => s.now);
}
