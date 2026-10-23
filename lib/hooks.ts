"use client";

import { useEffect, useEffectEvent, useSyncExternalStore } from "react";
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

/**
 * Run `action` when Enter is pressed anywhere except where Enter already means
 * something: buttons, links, number fields, text areas and open dialogs.
 */
export function useEnterKey(action: () => void) {
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== "Enter" || e.repeat || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector("dialog[open]")) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, a, textarea, select, input[type=number]")) return;
    e.preventDefault();
    action();
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
