import { startOfDay } from "./format";
import { elapsedAt, toRecord } from "./session";
import type { ActiveSession, SessionRecord } from "./types";

export interface Totals {
  pages: number;
  ms: number;
  sessions: number;
  /** Average time per page across the sessions counted, or null with no pages. */
  paceMs: number | null;
  /** Of the pages in the sessions counted, how many were counted because time ran out. */
  timedOut: number;
  sessionPages: number;
}

export interface Bucket {
  start: number;
  pages: number;
  ms: number;
}

/** Saved history plus the live session, so stats include what's happening now. */
export function withLive(
  history: SessionRecord[],
  active: ActiveSession | null,
  now: number,
): SessionRecord[] {
  if (!active || active.status === "finished") return history;
  return [{ ...toRecord(active), activeMs: elapsedAt(active, now), endedAt: now }, ...history];
}

/** Pages are counted by when they were read; time and sessions by when the session started. */
export function totals(records: SessionRecord[], since = 0): Totals {
  let pages = 0;
  let ms = 0;
  let sessions = 0;
  let pacedMs = 0;
  let pacedPages = 0;
  let timedOut = 0;
  for (const r of records) {
    for (const t of r.pageTimes) if (t >= since) pages++;
    if (r.startedAt >= since) {
      ms += r.activeMs;
      sessions++;
      timedOut += r.timedOut ?? 0;
      if (r.pageTimes.length) {
        pacedMs += r.activeMs;
        pacedPages += r.pageTimes.length;
      }
    }
  }
  return {
    pages,
    ms,
    sessions,
    paceMs: pacedPages ? pacedMs / pacedPages : null,
    timedOut,
    sessionPages: pacedPages,
  };
}

function addDays(dayStart: number, days: number): number {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

function startOfWeek(epoch: number): number {
  const d = new Date(startOfDay(epoch));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d.getTime();
}

function bucketize(
  records: SessionRecord[],
  starts: number[],
  keyOf: (epoch: number) => number,
): Bucket[] {
  const map = new Map(starts.map((start) => [start, { start, pages: 0, ms: 0 }]));
  for (const r of records) {
    for (const t of r.pageTimes) {
      const b = map.get(keyOf(t));
      if (b) b.pages++;
    }
    const b = map.get(keyOf(r.startedAt));
    if (b) b.ms += r.activeMs;
  }
  return starts.map((s) => map.get(s)!);
}

export function dailyBuckets(records: SessionRecord[], days: number, now: number): Bucket[] {
  const today = startOfDay(now);
  const starts = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
  return bucketize(records, starts, startOfDay);
}

export function weeklyBuckets(records: SessionRecord[], weeks: number, now: number): Bucket[] {
  const thisWeek = startOfWeek(now);
  const starts = Array.from({ length: weeks }, (_, i) => addDays(thisWeek, (i - weeks + 1) * 7));
  return bucketize(records, starts, startOfWeek);
}

export const forBook = (records: SessionRecord[], bookId: string) =>
  records.filter((r) => r.bookId === bookId);
