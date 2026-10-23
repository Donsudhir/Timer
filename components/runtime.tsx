"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { alertAudio, vibrate } from "@/lib/audio";
import { formatClock } from "@/lib/format";
import {
  MINUTE,
  type ReconcileResult,
  msToNextSecond,
  upcomingAlerts,
  viewSession,
} from "@/lib/session";
import { STORAGE_KEY, useApp, useClock } from "@/lib/store";
import { unitsFor } from "@/lib/units";
import { setWakeLock } from "@/lib/wakelock";

const AUDIO_HORIZON_MS = 30 * MINUTE;
const IDLE_HEARTBEAT_MS = 20_000;
const APP_TITLE = "PagePace";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** The deferred install prompt (Chromium only), captured as early as possible. */
export const useInstallPrompt = create<{ event: BeforeInstallPromptEvent | null }>(() => ({ event: null }));

/** Whether the browser has let us start audio yet (needs a user gesture). */
export const useAudioReady = create<{ ready: boolean }>(() => ({ ready: false }));

/**
 * Drives the live session. Ticks on whole seconds of the session clock while
 * running (so both countdowns change on the same frame), reconciles after
 * reloads and background throttling, keeps pre-scheduled chimes in sync, and
 * manages the wake lock and tab title. Renders nothing.
 */
function SessionEngine() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let titled = false;

    const notify = (result: ReconcileResult) => {
      if (!result.advanced && !result.finished) return;
      const { settings } = useApp.getState();
      const s = result.session;
      const kind = result.finished ? "end" : "page";
      const last = result.finished ? s.endedAt : s.pages[s.pages.length - 1]?.at;
      // The audio clock usually played this already; fall back if it couldn't.
      if (settings.sound && last !== undefined && !alertAudio.played(last)) {
        alertAudio.play(kind);
      }
      if (settings.vibration && document.visibilityState === "visible") vibrate(kind);
    };

    const updateTitle = (now: number) => {
      const s = useApp.getState().active;
      if (s && s.status !== "finished") {
        const v = viewSession(s, now);
        const ref = unitsFor(s.mode).ref(v.currentPage);
        document.title =
          s.status === "running" ? `${formatClock(v.microRemaining)} · ${ref}` : `Paused · ${ref}`;
        titled = true;
      } else if (titled) {
        document.title = APP_TITLE;
        titled = false;
      }
    };

    const schedule = () => {
      clearTimeout(timer);
      const { active, settings } = useApp.getState();
      const now = Date.now();
      alertAudio.setVolume(settings.volume);
      alertAudio.sync(
        active && settings.sound ? upcomingAlerts(active, now, AUDIO_HORIZON_MS) : [],
      );
      setWakeLock(!!active && active.status === "running" && settings.keepAwake);
      updateTitle(now);
      if (useAudioReady.getState().ready !== alertAudio.ready) {
        useAudioReady.setState({ ready: alertAudio.ready });
      }
      const delay =
        active?.status === "running" ? msToNextSecond(active, now) + 4 : IDLE_HEARTBEAT_MS;
      timer = setTimeout(run, delay);
    };

    const run = () => {
      const now = Date.now();
      const result = useApp.getState().tick(now);
      useClock.setState({ now });
      if (result) notify(result);
      schedule();
    };

    const unsubscribe = useApp.subscribe((state, prev) => {
      if (state.active !== prev.active || state.settings !== prev.settings) {
        useClock.setState({ now: Date.now() });
        schedule();
      }
    });

    const onVisibility = () => run();

    const unlock = () => {
      if (alertAudio.ready) return;
      alertAudio.unlock().then((ready) => {
        useAudioReady.setState({ ready });
        if (ready) schedule();
      });
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) useApp.persist.rehydrate();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onVisibility);
    // Audio may only start from a user activation; on touch that is pointerup.
    const gestures = ["pointerdown", "pointerup", "touchend", "keydown"] as const;
    gestures.forEach((g) => window.addEventListener(g, unlock, true));
    window.addEventListener("storage", onStorage);
    run();

    return () => {
      clearTimeout(timer);
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
      gestures.forEach((g) => window.removeEventListener(g, unlock, true));
      window.removeEventListener("storage", onStorage);
      setWakeLock(false);
    };
  }, []);

  return null;
}

function ThemeController() {
  const theme = useApp((s) => s.settings.theme);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      const root = document.documentElement;
      root.classList.toggle("dark", dark);
      root.style.colorScheme = dark ? "dark" : "light";
      const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", bg));
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  return null;
}

function PwaSupport() {
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      useInstallPrompt.setState({ event: e as BeforeInstallPromptEvent });
    };
    const onInstalled = () => useInstallPrompt.setState({ event: null });
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}

export function Runtime() {
  return (
    <>
      <SessionEngine />
      <ThemeController />
      <PwaSupport />
    </>
  );
}

