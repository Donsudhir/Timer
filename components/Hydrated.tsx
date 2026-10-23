"use client";

import type { ReactNode } from "react";
import { useHydrated } from "@/lib/hooks";

/** Renders children only on the client, after hydration (local data and clock are client-only). */
export function Hydrated({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return useHydrated() ? children : fallback;
}

/** Standard page column for the secondary screens. */
export function PageColumn({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-2xl animate-rise px-5 pt-8 sm:px-8 md:pt-10">{children}</div>;
}
