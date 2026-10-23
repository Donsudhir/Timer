"use client";

import { useCallback, useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { type Sound, alertAudio, vibrate } from "@/lib/audio";
import { formatClock, formatDuration, formatOvertime, formatPace, formatTimeOfDay } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { SECOND, autoAdvances, msToNextSecond, viewSession, type SessionView } from "@/lib/session";
import { useApp } from "@/lib/store";
import type { ActiveSession } from "@/lib/types";
import { type Units, unitsFor } from "@/lib/units";
import {
  GaugeIcon,
  KeyboardIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  SlidersIcon,
  UndoIcon,
  VolumeIcon,
} from "../icons";
import { bookProgress } from "../books";
import { useAudioReady } from "../runtime";
import { Bar, IconButton, IfKeyboard, Kbd, Sheet, cx } from "../ui";
import { AdjustSheet } from "./AdjustSheet";

function toggleRunning() {
  const s = useApp.getState();
  if (s.active?.status === "running") s.pause();
  else {
    void alertAudio.unlock();
    s.resume();
  }
}

/** Play a sound the user just triggered; the key press or tap itself unlocks audio. */
function playNow(sound: Sound) {
  if (alertAudio.ready) alertAudio.play(sound);
  else void alertAudio.unlock().then((ok) => ok && alertAudio.play(sound));
}

/**
 * Count the current page/question as done. Plays the completion sound — or the
 * session-end sound if that was the last one — distinct from the timer's chime.
 */
function completeCurrent() {
  const { active, skip, settings } = useApp.getState();
  if (!active || active.status === "finished") return;
  const before = active.pages.length;
  skip();
  const after = useApp.getState().active;
  if (!after || after.pages.length === before) return;
  const kind = after.status === "finished" ? "end" : "complete";
  if (settings.sound) playNow(kind);
  if (settings.vibration) vibrate(kind);
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && !!target.closest("input, textarea, select, [contenteditable='true']");

/**
 * Space, Enter or →: done with this one · P: pause/resume · U, Backspace or ⌘Z: undo ·
 * R: restart its timer · A: auto-advance · M: sound · ?: list shortcuts.
 */
function useShortcuts({ onHelp, onToast }: { onHelp: () => void; onToast: (text: string) => void }) {
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    // Holding a key must not race through pages.
    if (e.defaultPrevented || e.altKey || e.repeat || isTyping(e.target)) return;
    if (document.querySelector("dialog[open]")) return;
    const app = useApp.getState();
    const s = app.active;
    if (!s) return;
    const act = (fn: () => void) => {
      e.preventDefault();
      fn();
    };
    if (e.metaKey || e.ctrlKey) {
      if (e.key.toLowerCase() === "z" && !e.shiftKey) act(app.undo);
      return;
    }
    const units = unitsFor(s.mode);
    switch (e.key) {
      case " ":
      case "ArrowRight":
      case "n":
      case "N":
        return act(completeCurrent);
      case "Enter":
        // Enter still activates a focused button; elsewhere it means done.
        if (e.target instanceof HTMLElement && e.target.closest("button, a")) return;
        return act(completeCurrent);
      case "p":
      case "P":
        return act(toggleRunning);
      case "u":
      case "U":
      case "Backspace":
        return act(app.undo);
      case "r":
      case "R":
        return act(() => {
          app.restartPage();
          onToast(`${units.One} timer restarted`);
        });
      case "a":
      case "A":
        return act(() => {
          const on = !autoAdvances(s);
          app.setAutoAdvance(on);
          onToast(`Auto-advance ${on ? "on" : "off"}`);
        });
      case "m":
      case "M":
        return act(() => {
          const on = !app.settings.sound;
          app.updateSettings({ sound: on });
          onToast(`Sound ${on ? "on" : "off"}`);
        });
      case "?":
        return act(onHelp);
    }
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => onKeyDown(e);
    // Space is ours even on a focused button: stop the button's own click on key-up.
    const up = (e: KeyboardEvent) => {
      if (e.key === " " && !isTyping(e.target) && !document.querySelector("dialog[open]")) e.preventDefault();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
}

function useToast() {
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(timer);
  }, [toast]);
  const show = useCallback((text: string) => setToast((t) => ({ text, id: (t?.id ?? 0) + 1 })), []);
  return [toast, show] as const;
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
  const undo = useApp((s) => s.undo);
  const setPageMs = useApp((s) => s.setPageMs);
  const audioReady = useAudioReady((s) => s.ready);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [dismissedPace, setDismissedPace] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, showToast] = useToast();
  useShortcuts({ onHelp: () => setHelpOpen(true), onToast: showToast });

  // The ring glides to where it will be at the next whole second, taking exactly
  // that long, so it moves continuously while React renders once per second.
  const toNext = running ? msToNextSecond(session, now) : 0;
  const ringFraction = running ? viewSession(session, now + toNext).microFraction : v.microFraction;

  const suggestion = pickSuggestion(v, session, settings.adaptivePace, dismissedPace);
  // Manual advance: past the limit the clock counts up until the user presses Next.
  const overtime = !autoAdvances(session) && v.overtimeMs > 0;
  const flashKey =
    v.pagesDone > 0 || session.timeUpAt !== undefined ? `${v.pagesDone}:${session.timeUpAt ?? ""}` : null;

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
        <div className="-mr-2 flex items-center">
          <IfKeyboard>
            <IconButton label="Keyboard shortcuts (?)" onClick={() => setHelpOpen(true)}>
              <KeyboardIcon size={21} />
            </IconButton>
          </IfKeyboard>
          <IconButton label="Adjust session" onClick={() => setAdjustOpen(true)}>
            <SlidersIcon size={21} />
          </IconButton>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-5 sm:gap-10">
        <MicroRing
          fraction={ringFraction}
          transitionMs={toNext}
          pageKey={session.pageStartMs}
          flashKey={flashKey}
          paused={!running}
          overtime={overtime}
        >
          <div key={v.currentPage} className="label-caps animate-tick-in">
            {units.One} {v.currentPage}
          </div>
          <div
            className={cx(
              "my-1 text-[clamp(68px,20vw,108px)] font-extralight leading-none tracking-[-0.045em] tabular",
              !running && "animate-breathe",
              overtime && "text-behind",
            )}
            role="timer"
            aria-label={
              overtime
                ? `${formatOvertime(v.overtimeMs)} past the time for this ${units.one}`
                : `${formatClock(v.microRemaining)} left on this ${units.one}`
            }
          >
            {overtime ? formatOvertime(v.overtimeMs) : formatClock(v.microRemaining)}
          </div>
          <div className="text-[13px] text-muted">
            {!running ? "Paused" : overtime ? "Time's up · press Next" : `of ${formatPace(session.pageMs)}`}
          </div>
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
        {toast && (
          <div key={toast.id} className="flex animate-fade justify-center" role="status">
            <span className="rounded-full bg-fg px-3.5 py-1.5 text-[13px] font-medium text-bg shadow-soft">
              {toast.text}
            </span>
          </div>
        )}
      </div>

      {/* Equal side columns keep the pause button centred whatever the labels' widths. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-9 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-5 sm:gap-12">
        <RoundAction
          label="Undo"
          hint="U"
          onClick={undo}
          disabled={v.pagesDone === 0}
          className="justify-self-end"
        >
          <UndoIcon size={22} />
        </RoundAction>
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={toggleRunning}
            aria-label={running ? "Pause" : "Resume"}
            title={`${running ? "Pause" : "Resume"} (P)`}
            className="flex h-[78px] w-[78px] items-center justify-center rounded-full bg-fg text-bg shadow-soft transition-transform duration-200 hover:scale-[1.03] active:scale-95"
          >
            {running ? <PauseIcon size={28} /> : <PlayIcon size={28} className="translate-x-[2px]" />}
          </button>
          <IfKeyboard>
            <ActionLabel label={running ? "Pause" : "Resume"} hint="P" className="text-muted" />
          </IfKeyboard>
        </div>
        <RoundAction
          label={units.next}
          hint="Space"
          onClick={completeCurrent}
          emphasized={overtime && running}
          className="justify-self-start"
        >
          <NextIcon size={22} />
        </RoundAction>
      </div>

      <AdjustSheet open={adjustOpen} onClose={() => setAdjustOpen(false)} session={session} />
      <ShortcutsSheet open={helpOpen} onClose={() => setHelpOpen(false)} units={units} />
    </div>
  );
}

function ShortcutsSheet({ open, onClose, units }: { open: boolean; onClose: () => void; units: Units }) {
  const rows: Array<[keys: string[], action: string]> = [
    [["Space", "Enter"], `Done — next ${units.one}`],
    [["P"], "Pause / resume"],
    [["U", "⌫"], "Undo the last one"],
    [["R"], `Restart this ${units.one}'s timer`],
    [["A"], "Auto-advance on / off"],
    [["M"], "Sound on / off"],
    [["?"], "Show these shortcuts"],
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Shortcuts">
      <ul className="divide-y divide-line">
        {rows.map(([keys, action]) => (
          <li key={action} className="flex items-center justify-between gap-4 py-3 text-[15px]">
            <span className="text-fg-2">{action}</span>
            <span className="flex shrink-0 gap-1.5">
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[13px] leading-relaxed text-muted">
        Finishing a {units.one} plays a short, soft sound; the ringing chime means its time is up.
      </p>
    </Sheet>
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
  overtime,
  children,
}: {
  fraction: number;
  transitionMs: number;
  pageKey: number;
  /** Changes on each page turn or time-up, replaying the flash. */
  flashKey: string | null;
  paused: boolean;
  overtime: boolean;
  children: ReactNode;
}) {
  const r = 143;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="relative aspect-square w-[min(80vw,40dvh,340px)] sm:w-[min(40dvh,360px)]">
      {flashKey !== null && (
        <div
          key={flashKey}
          className="pointer-events-none absolute inset-[2.3%] animate-flash rounded-full ring-2 ring-accent"
          aria-hidden="true"
        />
      )}
      <svg viewBox="0 0 300 300" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
        <circle
          cx="150"
          cy="150"
          r={r}
          fill="none"
          stroke={overtime ? "var(--behind)" : "var(--ring-track)"}
          strokeOpacity={overtime ? 0.45 : 1}
          strokeWidth="5"
          className={cx("transition-[stroke] duration-500", overtime && !paused && "animate-breathe")}
        />
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
  hint,
  disabled,
  emphasized,
  className,
  children,
}: {
  label: string;
  /** Keyboard shortcut, shown in the tooltip and beside the label on desktop. */
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  /** Draws attention when the user needs to act (time's up, manual advance). */
  emphasized?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("flex min-w-20 flex-col items-center gap-2 pt-[11px]", className)}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        title={hint ? `${label} (${hint})` : label}
        className={cx(
          "flex h-14 w-14 items-center justify-center rounded-full shadow-soft transition duration-300 active:scale-90 disabled:pointer-events-none disabled:opacity-30",
          emphasized ? "bg-accent text-bg ring-4 ring-accent-soft" : "bg-surface text-fg ring-1 ring-line",
        )}
      >
        {children}
      </button>
      <ActionLabel
        label={label}
        hint={hint}
        className={cx(emphasized ? "text-fg" : "text-muted", disabled && "opacity-40")}
      />
    </div>
  );
}

function ActionLabel({ label, hint, className }: { label: string; hint?: string; className?: string }) {
  return (
    <span
      className={cx(
        "flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium transition-[opacity,color]",
        className,
      )}
    >
      {label}
      {hint && (
        <IfKeyboard>
          <Kbd className="h-5 min-w-5 px-1 text-[10px]">{hint}</Kbd>
        </IfKeyboard>
      )}
    </span>
  );
}
