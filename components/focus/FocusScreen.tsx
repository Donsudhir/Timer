"use client";

import { useEffect, useState, type ReactNode } from "react";
import { alertAudio } from "@/lib/audio";
import { formatClock, formatDuration, formatPace, formatTimeOfDay } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { SECOND, msToNextSecond, viewSession, type SessionView } from "@/lib/session";
import { useApp } from "@/lib/store";
import type { ActiveSession } from "@/lib/types";
import { type Units, unitsFor } from "@/lib/units";
import { GaugeIcon, NextIcon, PauseIcon, PlayIcon, SlidersIcon, UndoIcon, VolumeIcon } from "../icons";
import { bookProgress } from "../books";
import { useAudioReady } from "../runtime";
import { Bar, IconButton, cx } from "../ui";
import { AdjustSheet } from "./AdjustSheet";

function toggleRunning() {
  const s = useApp.getState();
  if (s.active?.status === "running") s.pause();
  else {
    void alertAudio.unlock();
    s.resume();
  }
}

/** Space: pause/resume · → or N: next page/question · U, Backspace or ⌘Z: undo. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || document.querySelector("dialog[open]")) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable='true']")) return;
      const { skip, undo } = useApp.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === "Space" && !mod) {
        if (target.closest("button, a")) return; // let the focused control handle it
        e.preventDefault();
        toggleRunning();
      } else if ((e.key === "ArrowRight" || e.key === "n") && !mod) {
        e.preventDefault();
        skip();
      } else if ((e.key === "u" || e.key === "Backspace") && !mod) {
        e.preventDefault();
        undo();
      } else if (e.key === "z" && mod && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function FocusScreen({ session }: { session: ActiveSession }) {
  const now = useNow();
  const v = viewSession(session, now);
  const running = session.status === "running";
  const units = unitsFor(session.mode);
  const settings = useApp((s) => s.settings);
  const bookPercent = useApp((s) => {
    const book = s.books.find((b) => b.id === session.bookId);
    return book ? Math.round(bookProgress(book) * 100) : null;
  });
  const skip = useApp((s) => s.skip);
  const undo = useApp((s) => s.undo);
  const setPageMs = useApp((s) => s.setPageMs);
  const audioReady = useAudioReady((s) => s.ready);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [dismissedPace, setDismissedPace] = useState<number | null>(null);
  useShortcuts();

  // The ring glides to where it will be at the next whole second, taking exactly
  // that long, so it moves continuously while React renders once per second.
  const toNext = running ? msToNextSecond(session, now) : 0;
  const ringFraction = running ? viewSession(session, now + toNext).microFraction : v.microFraction;

  const suggestion = pickSuggestion(v, session, settings.adaptivePace, dismissedPace);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pt-safe sm:px-8">
      <header className="flex items-center justify-between gap-3 pt-4 sm:pt-6">
        <div className="min-w-0 animate-fade">
          <div className="label-caps tabular">
            {bookPercent !== null
              ? `${bookPercent}% through`
              : session.mode === "practice"
                ? `Practice · ${formatDuration(session.durationMs)}`
                : "Quick session"}
          </div>
          <div className="truncate font-serif text-[19px] leading-snug tracking-[-0.01em]">{session.title}</div>
        </div>
        <IconButton label="Adjust session" onClick={() => setAdjustOpen(true)} className="-mr-2">
          <SlidersIcon size={21} />
        </IconButton>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-5 sm:gap-10">
        <MicroRing
          fraction={ringFraction}
          transitionMs={toNext}
          pageKey={session.pageStartMs}
          flashKey={v.pagesDone}
          paused={!running}
        >
          <div key={v.currentPage} className="label-caps animate-tick-in">
            {units.One} {v.currentPage}
          </div>
          <div
            className={cx(
              "my-1 text-[clamp(68px,20vw,108px)] font-extralight leading-none tracking-[-0.045em] tabular",
              !running && "animate-breathe",
            )}
            role="timer"
            aria-label={`${formatClock(v.microRemaining)} left on this ${units.one}`}
          >
            {formatClock(v.microRemaining)}
          </div>
          <div className="text-[13px] text-muted">{running ? `of ${formatPace(session.pageMs)}` : "Paused"}</div>
        </MicroRing>

        <div className="grid w-full grid-cols-2 gap-8">
          <Stat label={session.mode === "practice" ? "Test left" : "Session left"} value={formatClock(v.macroRemaining)}>
            <Bar value={v.macroProgress} smooth={running} />
          </Stat>
          <Stat
            label={units.Many}
            align="right"
            value={
              <>
                {v.pagesDone}
                <span className="text-muted">/{session.targetPages}</span>
              </>
            }
          >
            <Bar value={v.pagesProgress} marker={v.macroProgress} tone="accent" />
          </Stat>
        </div>

        <PaceLine v={v} units={units} running={running} now={now} />
      </div>

      <div className="space-y-2">
        {suggestion !== null && (
          <div className="flex animate-rise items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-[13px] shadow-soft ring-1 ring-line">
            <GaugeIcon size={18} className="shrink-0 text-muted" />
            <p className="min-w-0 flex-1 leading-snug text-fg-2">
              {suggestion < session.pageMs
                ? `To finish ${units.count(session.targetPages)} in time, try ${formatPace(suggestion)} per ${units.one}.`
                : `You're ahead — ${formatPace(suggestion)} per ${units.one} still finishes on time.`}
            </p>
            <button
              type="button"
              onClick={() => setDismissedPace(suggestion)}
              className="shrink-0 px-1 text-muted transition hover:text-fg"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={() => setPageMs(suggestion)}
              className="shrink-0 rounded-full bg-fg px-3 py-1.5 font-medium text-bg transition active:scale-95"
            >
              Apply
            </button>
          </div>
        )}
        {settings.sound && !audioReady && running && (
          <div className="flex items-center justify-center gap-2 py-1 text-[12px] text-muted">
            <VolumeIcon size={14} /> Tap anywhere to enable sound alerts
          </div>
        )}
      </div>

      <div className="flex items-start justify-center gap-9 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-5 sm:gap-12">
        <RoundAction label="Undo" onClick={undo} disabled={v.pagesDone === 0}>
          <UndoIcon size={22} />
        </RoundAction>
        <button
          type="button"
          onClick={toggleRunning}
          aria-label={running ? "Pause" : "Resume"}
          className="flex h-[78px] w-[78px] items-center justify-center rounded-full bg-fg text-bg shadow-soft transition-transform duration-200 hover:scale-[1.03] active:scale-95"
        >
          {running ? <PauseIcon size={28} /> : <PlayIcon size={28} className="translate-x-[2px]" />}
        </button>
        <RoundAction label={units.next} onClick={skip}>
          <NextIcon size={22} />
        </RoundAction>
      </div>

      <AdjustSheet open={adjustOpen} onClose={() => setAdjustOpen(false)} session={session} />
    </div>
  );
}

function pickSuggestion(
  v: SessionView,
  session: ActiveSession,
  enabled: boolean,
  dismissed: number | null,
): number | null {
  const s = v.suggestedPageMs;
  if (!enabled || s === null) return null;
  const relevant =
    (s < session.pageMs && !v.onTimeForTarget) || (s > session.pageMs && v.paceStatus === "ahead");
  if (!relevant) return null;
  if (dismissed !== null && Math.abs(dismissed - s) < 15 * SECOND) return null;
  return s;
}

function PaceLine({
  v,
  units,
  running,
  now,
}: {
  v: SessionView;
  units: Units;
  running: boolean;
  now: number;
}) {
  const count = Math.max(1, Math.round(Math.abs(v.paceDelta)));
  const label =
    v.paceStatus === "on-track"
      ? "On track"
      : `${units.count(count)} ${v.paceStatus === "ahead" ? "ahead" : "behind"}`;
  const over = v.timeToTargetMs - v.macroRemaining;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px]">
      <span className="flex items-center gap-2 font-medium text-fg-2">
        <span
          className={cx(
            "h-2 w-2 rounded-full",
            v.paceStatus === "ahead" && "bg-ahead",
            v.paceStatus === "on-track" && "bg-fg-2",
            v.paceStatus === "behind" && "bg-behind",
          )}
          aria-hidden="true"
        />
        {label}
      </span>
      {v.pagesLeft > 0 && (
        <>
          <span className="text-faint" aria-hidden="true">·</span>
          <span className="text-muted">
            {running ? `Done ≈ ${formatTimeOfDay(now + v.timeToTargetMs)}` : `${formatDuration(v.timeToTargetMs)} to go`}
            {over >= 30 * SECOND && ` · ${formatDuration(over)} over`}
          </span>
        </>
      )}
    </div>
  );
}

function MicroRing({
  fraction,
  transitionMs,
  pageKey,
  flashKey,
  paused,
  children,
}: {
  fraction: number;
  transitionMs: number;
  pageKey: number;
  flashKey: number;
  paused: boolean;
  children: ReactNode;
}) {
  const r = 143;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="relative aspect-square w-[min(80vw,40dvh,340px)] sm:w-[min(40dvh,360px)]">
      {flashKey > 0 && (
        <div
          key={flashKey}
          className="pointer-events-none absolute inset-[2.3%] animate-flash rounded-full ring-2 ring-accent"
          aria-hidden="true"
        />
      )}
      <svg viewBox="0 0 300 300" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="150" cy="150" r={r} fill="none" stroke="var(--ring-track)" strokeWidth="5" />
        <circle
          key={pageKey}
          cx="150"
          cy="150"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          style={{
            opacity: fraction <= 0.002 ? 0 : paused ? 0.45 : 1,
            transition: `stroke-dashoffset ${transitionMs}ms linear, opacity 0.4s ease`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  align = "left",
  children,
}: {
  label: string;
  value: ReactNode;
  align?: "left" | "right";
  children: ReactNode;
}) {
  return (
    <div className={cx(align === "right" && "text-right")}>
      <div className="label-caps">{label}</div>
      <div className="mb-3 mt-1 text-[30px] font-light leading-none tracking-[-0.03em] tabular sm:text-[34px]">
        {value}
      </div>
      {children}
    </div>
  );
}

function RoundAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex w-20 flex-col items-center gap-2 pt-[11px]">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-fg shadow-soft ring-1 ring-line transition active:scale-90 disabled:pointer-events-none disabled:opacity-30"
      >
        {children}
      </button>
      <span className={cx("text-[11px] font-medium text-muted transition-opacity", disabled && "opacity-40")}>
        {label}
      </span>
    </div>
  );
}
