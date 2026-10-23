"use client";

import { useApp } from "@/lib/store";
import { FocusScreen } from "./FocusScreen";
import { SessionSummary } from "./SessionSummary";
import { SetupScreen } from "./SetupScreen";

export function Home() {
  const active = useApp((s) => s.active);
  if (!active) return <SetupScreen />;
  if (active.status === "finished") return <SessionSummary session={active} />;
  return <FocusScreen session={active} />;
}
