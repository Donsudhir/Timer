export type ThemePref = "system" | "light" | "dark";

export interface Book {
  id: string;
  title: string;
  author?: string;
  totalPages: number;
  /** Next page to read (1-indexed). Greater than totalPages means finished. */
  currentPage: number;
  createdAt: number;
  updatedAt: number;
  lastReadAt?: number;
}

/** "read" times pages of a book; "practice" times questions in a test. */
export type SessionMode = "read" | "practice";

/** "auto": the timer ran out (in practice, the question timed out). "manual": moved on early. */
export type PageEventKind = "auto" | "manual";

export interface PageEvent {
  /** Epoch ms at which the page was counted. */
  at: number;
  kind: PageEventKind;
  /** Session elapsed time when it was counted (absent in data saved before practice mode). */
  el?: number;
}

export type SessionStatus = "running" | "paused" | "finished";
export type EndReason = "time" | "target" | "ended";

/**
 * A live session. Both timers derive from a single elapsed clock:
 *   elapsed = accumulatedMs + (running ? now - resumedAt : 0)
 * The macro timer is `durationMs - elapsed`; the micro timer is
 * `pageMs - (elapsed - pageStartMs)`. Sharing one clock keeps them in lockstep
 * through pauses, reloads and background throttling.
 */
export interface ActiveSession {
  id: string;
  /** Absent means "read" (sessions saved before practice mode). */
  mode?: SessionMode;
  bookId: string | null;
  title: string;
  startPage: number;
  targetPages: number;
  durationMs: number;
  pageMs: number;
  status: SessionStatus;
  startedAt: number;
  accumulatedMs: number;
  resumedAt: number | null;
  /** Elapsed time at which the current page began. */
  pageStartMs: number;
  pages: PageEvent[];
  endedAt?: number;
  endReason?: EndReason;
}

export interface SessionRecord {
  id: string;
  mode?: SessionMode;
  bookId: string | null;
  title: string;
  startPage: number;
  targetPages: number;
  durationMs: number;
  pageMs: number;
  startedAt: number;
  endedAt: number;
  activeMs: number;
  /** Epoch ms of each counted page. */
  pageTimes: number[];
  /** How many were counted because their timer ran out. */
  timedOut?: number;
  endReason: EndReason;
}

export interface Settings {
  theme: ThemePref;
  sound: boolean;
  volume: number;
  vibration: boolean;
  keepAwake: boolean;
  adaptivePace: boolean;
}

export interface SetupPrefs {
  mode: SessionMode;
  bookId: string | null;
  durationMs: number;
  pageMs: number;
  practice: {
    title: string;
    durationMs: number;
    pageMs: number;
  };
}
