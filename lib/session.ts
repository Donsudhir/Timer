import type { ActiveSession, EndReason, SessionRecord } from "./types";

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;

export const PAGE_MS_MIN = 15 * SECOND;
export const PAGE_MS_MAX = 60 * MINUTE;
export const PAGE_MS_STEP = 15 * SECOND;
export const DURATION_MS_MIN = 5 * MINUTE;
export const DURATION_MS_MAX = 12 * HOUR;

/** Pace changes never leave the current page with less than this. */
const PAGE_CHANGE_GRACE_MS = 3 * SECOND;

export const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

/** Round to whole seconds so both timers tick over on the same instant. */
const alignSecond = (ms: number) => Math.round(ms / SECOND) * SECOND;

export const clampPageMs = (ms: number) =>
  clamp(alignSecond(ms), PAGE_MS_MIN, PAGE_MS_MAX);

export const clampDurationMs = (ms: number) =>
  clamp(alignSecond(ms), DURATION_MS_MIN, DURATION_MS_MAX);

/** Raw elapsed time, not clamped to the session length. */
function rawElapsed(s: ActiveSession, now: number): number {
  if (s.status === "running" && s.resumedAt !== null) {
    return s.accumulatedMs + Math.max(0, now - s.resumedAt);
  }
  return s.accumulatedMs;
}

export function elapsedAt(s: ActiveSession, now: number): number {
  return Math.min(s.durationMs, rawElapsed(s, now));
}

/** Wall-clock time at which the running session reaches `elapsed`. */
export function epochAtElapsed(s: ActiveSession, elapsed: number): number {
  const base = s.resumedAt ?? s.endedAt ?? 0;
  return base + (elapsed - s.accumulatedMs);
}

function finishAt(
  s: ActiveSession,
  elapsed: number,
  reason: EndReason,
  now: number,
): ActiveSession {
  const endedAt = s.status === "running" ? epochAtElapsed(s, elapsed) : now;
  return {
    ...s,
    status: "finished",
    accumulatedMs: elapsed,
    resumedAt: null,
    endedAt,
    endReason: reason,
  };
}

export interface ReconcileResult {
  session: ActiveSession;
  /** Pages counted automatically during this reconcile. */
  advanced: number;
  finished: boolean;
}

/**
 * Bring a session up to date with the wall clock: count every page whose
 * micro timer ran out since the last check and finish the session when the
 * target or the macro timer is reached. Safe to call at any frequency — after
 * a throttled background tab or a reload it catches up in one pass, stamping
 * each page with the moment it actually completed.
 */
export function reconcile(s: ActiveSession, now: number): ReconcileResult {
  if (s.status === "finished") return { session: s, advanced: 0, finished: false };

  const elapsed = rawElapsed(s, now);
  if (s.pages.length >= s.targetPages) {
    return {
      session: finishAt(s, Math.min(elapsed, s.durationMs), "target", now),
      advanced: 0,
      finished: true,
    };
  }
  if (s.status !== "running") return { session: s, advanced: 0, finished: false };

  let pageStartMs = s.pageStartMs;
  const added: ActiveSession["pages"] = [];
  let finish: { elapsed: number; reason: EndReason } | null = null;

  for (;;) {
    const pageEnd = pageStartMs + s.pageMs;
    if (pageEnd <= s.durationMs && elapsed >= pageEnd) {
      added.push({ at: epochAtElapsed(s, pageEnd), kind: "auto" });
      pageStartMs = pageEnd;
      if (s.pages.length + added.length >= s.targetPages) {
        finish = { elapsed: pageEnd, reason: "target" };
        break;
      }
      continue;
    }
    if (elapsed >= s.durationMs) finish = { elapsed: s.durationMs, reason: "time" };
    break;
  }

  if (!added.length && !finish) return { session: s, advanced: 0, finished: false };

  let next: ActiveSession = { ...s, pageStartMs, pages: [...s.pages, ...added] };
  if (finish) next = finishAt(next, finish.elapsed, finish.reason, now);
  return { session: next, advanced: added.length, finished: !!finish };
}

// ── Actions ────────────────────────────────────────────────────────────────
// Each action reconciles first so it acts on the session as it is *now*.

export interface StartParams {
  id: string;
  bookId: string | null;
  title: string;
  startPage: number;
  targetPages: number;
  durationMs: number;
  pageMs: number;
}

export function startSession(p: StartParams, now: number): ActiveSession {
  return {
    ...p,
    targetPages: Math.max(1, Math.round(p.targetPages)),
    durationMs: clampDurationMs(p.durationMs),
    pageMs: clampPageMs(p.pageMs),
    status: "running",
    startedAt: now,
    accumulatedMs: 0,
    resumedAt: now,
    pageStartMs: 0,
    pages: [],
  };
}

export function pauseSession(s: ActiveSession, now: number): ActiveSession {
  const r = reconcile(s, now).session;
  if (r.status !== "running") return r;
  return { ...r, status: "paused", accumulatedMs: elapsedAt(r, now), resumedAt: null };
}

export function resumeSession(s: ActiveSession, now: number): ActiveSession {
  if (s.status !== "paused") return s;
  return { ...s, status: "running", resumedAt: now };
}

/** The reader finished the page early: count it and start the next one. */
export function skipPage(s: ActiveSession, now: number): ActiveSession {
  const r = reconcile(s, now).session;
  if (r.status === "finished") return r;
  const elapsed = elapsedAt(r, now);
  const next: ActiveSession = {
    ...r,
    pages: [...r.pages, { at: now, kind: "manual" }],
    pageStartMs: Math.min(alignSecond(elapsed), r.durationMs),
  };
  return reconcile(next, now).session;
}

/** Un-count the last page; the reader gets a fresh page timer to re-read it. */
export function undoPage(s: ActiveSession, now: number): ActiveSession {
  const r = reconcile(s, now).session;
  if (r.status === "finished" || r.pages.length === 0) return r;
  return {
    ...r,
    pages: r.pages.slice(0, -1),
    pageStartMs: Math.min(alignSecond(elapsedAt(r, now)), r.durationMs),
  };
}

export function restartPage(s: ActiveSession, now: number): ActiveSession {
  const r = reconcile(s, now).session;
  if (r.status === "finished") return r;
  return { ...r, pageStartMs: Math.min(alignSecond(elapsedAt(r, now)), r.durationMs) };
}

/**
 * Change time-per-page. The current page keeps the time already spent on it,
 * so +30s means 30 more seconds now — but a shorter pace never ends the page
 * on the spot.
 */
export function setPageMs(s: ActiveSession, pageMs: number, now: number): ActiveSession {
  const r = reconcile(s, now).session;
  if (r.status === "finished") return r;
  const nextPageMs = clampPageMs(pageMs);
  const elapsed = elapsedAt(r, now);
  let pageStartMs = r.pageStartMs;
  if (pageStartMs + nextPageMs - elapsed < PAGE_CHANGE_GRACE_MS) {
    pageStartMs = alignSecond(elapsed + PAGE_CHANGE_GRACE_MS - nextPageMs);
  }
  return reconcile({ ...r, pageMs: nextPageMs, pageStartMs }, now).session;
}

export function setDurationMs(s: ActiveSession, durationMs: number, now: number): ActiveSession {
  const r = reconcile(s, now).session;
  if (r.status === "finished") return r;
  const floor = Math.ceil((elapsedAt(r, now) + MINUTE) / MINUTE) * MINUTE;
  const nextDuration = clamp(
    clampDurationMs(durationMs),
    Math.min(floor, DURATION_MS_MAX),
    DURATION_MS_MAX,
  );
  return reconcile({ ...r, durationMs: nextDuration }, now).session;
}

export function setTargetPages(s: ActiveSession, target: number, now: number): ActiveSession {
  const r = reconcile(s, now).session;
  if (r.status === "finished") return r;
  const nextTarget = Math.max(r.pages.length + 1, Math.round(target));
  return reconcile({ ...r, targetPages: nextTarget }, now).session;
}

export function endSession(s: ActiveSession, now: number): ActiveSession {
  const r = reconcile(s, now).session;
  if (r.status === "finished") return r;
  return finishAt(r, elapsedAt(r, now), "ended", now);
}

// ── Derived view ──────────────────────────────────────────────────────────

export type PaceStatus = "ahead" | "on-track" | "behind";

export interface SessionView {
  elapsed: number;
  macroRemaining: number;
  macroProgress: number;
  microElapsed: number;
  microRemaining: number;
  /** Fraction of the current page's time still left (1 → 0). */
  microFraction: number;
  pagesDone: number;
  pagesLeft: number;
  currentPage: number;
  pagesProgress: number;
  targetPaceMs: number;
  paceStatus: PaceStatus;
  /** Pages ahead (+) or behind (−) the schedule needed to hit the target. */
  paceDelta: number;
  /** Time needed to finish the target at the current pace. */
  timeToTargetMs: number;
  onTimeForTarget: boolean;
  /** Suggested time-per-page for the remaining pages, when it differs meaningfully. */
  suggestedPageMs: number | null;
}

const SUGGEST_STEP = 5 * SECOND;

export function viewSession(s: ActiveSession, now: number): SessionView {
  const elapsed = elapsedAt(s, now);
  const macroRemaining = Math.max(0, s.durationMs - elapsed);
  const microElapsed = clamp(elapsed - s.pageStartMs, 0, s.pageMs);
  const microRemaining = Math.min(s.pageMs - microElapsed, macroRemaining);
  const pagesDone = s.pages.length;
  const pagesLeft = Math.max(0, s.targetPages - pagesDone);

  const targetPaceMs = s.durationMs / s.targetPages;
  const reading = s.status === "finished" ? 0 : microElapsed / s.pageMs;
  const paceDelta = pagesDone + reading - elapsed / targetPaceMs;
  const paceStatus: PaceStatus =
    paceDelta >= 0.75 ? "ahead" : paceDelta <= -0.75 ? "behind" : "on-track";

  const timeToTargetMs =
    pagesLeft > 0 ? s.pageMs - microElapsed + (pagesLeft - 1) * s.pageMs : 0;

  let suggestedPageMs: number | null = null;
  if (s.status !== "finished" && pagesLeft > 2) {
    const available = macroRemaining - (s.pageMs - microElapsed);
    const ideal = available / (pagesLeft - 1);
    const rounded = clampPageMs(Math.floor(ideal / SUGGEST_STEP) * SUGGEST_STEP);
    const diff = Math.abs(rounded - s.pageMs);
    if (available > 0 && diff >= 15 * SECOND && diff >= s.pageMs * 0.05) {
      suggestedPageMs = rounded;
    }
  }

  return {
    elapsed,
    macroRemaining,
    macroProgress: elapsed / s.durationMs,
    microElapsed,
    microRemaining,
    microFraction: s.pageMs > 0 ? 1 - microElapsed / s.pageMs : 0,
    pagesDone,
    pagesLeft,
    currentPage: s.startPage + pagesDone,
    pagesProgress: Math.min(1, (pagesDone + reading) / s.targetPages),
    targetPaceMs,
    paceStatus,
    paceDelta,
    timeToTargetMs,
    onTimeForTarget: timeToTargetMs <= macroRemaining,
    suggestedPageMs,
  };
}

/** Milliseconds until the session's elapsed clock next crosses a whole second. */
export function msToNextSecond(s: ActiveSession, now: number): number {
  return SECOND - (rawElapsed(s, now) % SECOND);
}

export type AlertKind = "page" | "end";
export interface UpcomingAlert {
  at: number;
  kind: AlertKind;
}

/** Wall-clock times of the upcoming page/end alerts, for pre-scheduled audio. */
export function upcomingAlerts(
  s: ActiveSession,
  now: number,
  horizonMs: number,
  max = 12,
): UpcomingAlert[] {
  if (s.status !== "running") return [];
  const out: UpcomingAlert[] = [];
  let pageEnd = s.pageStartMs + s.pageMs;
  let count = s.pages.length;
  const limit = now + horizonMs;

  while (out.length < max) {
    if (pageEnd <= s.durationMs) {
      count++;
      const at = epochAtElapsed(s, pageEnd);
      if (at > limit) break;
      const last = count >= s.targetPages || pageEnd === s.durationMs;
      if (at > now) out.push({ at, kind: last ? "end" : "page" });
      if (last) break;
      pageEnd += s.pageMs;
    } else {
      const at = epochAtElapsed(s, s.durationMs);
      if (at > now && at <= limit) out.push({ at, kind: "end" });
      break;
    }
  }
  return out;
}

export function toRecord(s: ActiveSession): SessionRecord {
  return {
    id: s.id,
    bookId: s.bookId,
    title: s.title,
    startPage: s.startPage,
    targetPages: s.targetPages,
    durationMs: s.durationMs,
    pageMs: s.pageMs,
    startedAt: s.startedAt,
    endedAt: s.endedAt ?? s.startedAt + s.accumulatedMs,
    activeMs: s.accumulatedMs,
    pageTimes: s.pages.map((p) => p.at),
    endReason: s.endReason ?? "ended",
  };
}

export const worthSaving = (s: ActiveSession) =>
  s.pages.length > 0 || s.accumulatedMs >= MINUTE;
