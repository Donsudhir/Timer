import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  HOUR,
  MINUTE,
  type ReconcileResult,
  endSession,
  pauseSession,
  reconcile,
  restartPage,
  resumeSession,
  setDurationMs,
  setPageMs,
  setTargetPages,
  skipPage,
  startSession,
  toRecord,
  undoPage,
  worthSaving,
} from "./session";
import { STORAGE_KEY } from "./constants";
import type { ActiveSession, Book, SessionMode, SessionRecord, Settings, SetupPrefs } from "./types";

export { STORAGE_KEY };
const HISTORY_LIMIT = 2000;

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  sound: true,
  volume: 0.8,
  vibration: true,
  keepAwake: true,
  adaptivePace: true,
};

export const DEFAULT_SETUP: SetupPrefs = {
  mode: "read",
  bookId: null,
  durationMs: 3 * HOUR,
  pageMs: 5 * MINUTE,
  practice: { title: "", durationMs: HOUR, pageMs: 2 * MINUTE },
};

export function uid(): string {
  // randomUUID is unavailable outside secure contexts (e.g. testing over LAN http).
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

interface Data {
  books: Book[];
  history: SessionRecord[];
  active: ActiveSession | null;
  settings: Settings;
  setup: SetupPrefs;
}

export interface BookInput {
  title: string;
  author?: string;
  totalPages: number;
  currentPage?: number;
}

export interface StartInput {
  mode: SessionMode;
  /** Practice test name; reading sessions take the book's title. */
  title?: string;
  bookId: string | null;
  startPage: number;
  targetPages: number;
  durationMs: number;
  pageMs: number;
}

export interface BackupFile {
  app: "pagepace";
  version: 1;
  exportedAt: number;
  books: Book[];
  history: SessionRecord[];
  settings: Settings;
}

interface Actions {
  addBook: (input: BookInput) => string;
  updateBook: (id: string, patch: Partial<Omit<Book, "id">>) => void;
  deleteBook: (id: string) => void;

  start: (input: StartInput) => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  undo: () => void;
  restartPage: () => void;
  setPageMs: (ms: number) => void;
  setDuration: (ms: number) => void;
  setTarget: (pages: number) => void;
  end: () => void;
  /** Discard the live session and roll the book back to where it started. */
  reset: () => void;
  /** Close the summary of a finished session. */
  dismiss: () => void;
  tick: (now: number) => ReconcileResult | null;

  updateSettings: (patch: Partial<Settings>) => void;
  updateSetup: (patch: Partial<SetupPrefs>) => void;
  exportData: () => BackupFile;
  importData: (file: BackupFile) => void;
  clearAll: () => void;
}

export type AppState = Data & Actions;

const initialData: Data = {
  books: [],
  history: [],
  active: null,
  settings: DEFAULT_SETTINGS,
  setup: DEFAULT_SETUP,
};

const bookPageFor = (book: Book, s: ActiveSession) =>
  Math.min(book.totalPages + 1, s.startPage + s.pages.length);

export const useApp = create<AppState>()(
  persist(
    (set, get) => {
      /** Apply a session transition and keep the book and history in sync. */
      const commit = (prev: ActiveSession, next: ActiveSession, now: number) => {
        if (next === prev) return;
        set((state) => {
          let { books, history } = state;
          if (next.bookId && next.pages.length !== prev.pages.length) {
            books = books.map((b) =>
              b.id === next.bookId
                ? { ...b, currentPage: bookPageFor(b, next), lastReadAt: now, updatedAt: now }
                : b,
            );
          }
          if (next.status === "finished" && prev.status !== "finished" && worthSaving(next)) {
            history = [toRecord(next), ...history].slice(0, HISTORY_LIMIT);
          }
          return { active: next, books, history };
        });
      };

      const mutate = (fn: (s: ActiveSession, now: number) => ActiveSession) => {
        const prev = get().active;
        if (!prev) return;
        const now = Date.now();
        commit(prev, fn(prev, now), now);
      };

      return {
        ...initialData,

        addBook: (input) => {
          const now = Date.now();
          const id = uid();
          const totalPages = Math.max(1, Math.round(input.totalPages));
          const book: Book = {
            id,
            title: input.title.trim(),
            author: input.author?.trim() || undefined,
            totalPages,
            currentPage: Math.min(totalPages + 1, Math.max(1, Math.round(input.currentPage ?? 1))),
            createdAt: now,
            updatedAt: now,
          };
          set((s) => ({ books: [book, ...s.books] }));
          return id;
        },

        updateBook: (id, patch) =>
          set((s) => ({
            books: s.books.map((b) => {
              if (b.id !== id) return b;
              const next = { ...b, ...patch, updatedAt: Date.now() };
              next.totalPages = Math.max(1, Math.round(next.totalPages));
              next.currentPage = Math.min(next.totalPages + 1, Math.max(1, Math.round(next.currentPage)));
              return next;
            }),
          })),

        deleteBook: (id) =>
          set((s) => ({
            books: s.books.filter((b) => b.id !== id),
            setup: s.setup.bookId === id ? { ...s.setup, bookId: null } : s.setup,
          })),

        start: (input) => {
          const now = Date.now();
          const practice = input.mode === "practice";
          const book =
            !practice && input.bookId ? get().books.find((b) => b.id === input.bookId) : undefined;
          const title = input.title?.trim() ?? "";
          const session = startSession(
            {
              id: uid(),
              mode: input.mode,
              bookId: book?.id ?? null,
              title: book?.title ?? (title || (practice ? "Practice test" : "Reading session")),
              startPage: input.startPage,
              targetPages: input.targetPages,
              durationMs: input.durationMs,
              pageMs: input.pageMs,
            },
            now,
          );
          const { durationMs, pageMs } = session;
          set((s) => ({
            active: session,
            setup: practice
              ? { ...s.setup, mode: "practice", practice: { title, durationMs, pageMs } }
              : { ...s.setup, mode: "read", bookId: session.bookId, durationMs, pageMs },
            books: book
              ? s.books.map((b) =>
                  b.id === book.id
                    ? { ...b, currentPage: session.startPage, lastReadAt: now, updatedAt: now }
                    : b,
                )
              : s.books,
          }));
        },

        pause: () => mutate(pauseSession),
        resume: () => mutate(resumeSession),
        skip: () => mutate(skipPage),
        undo: () => mutate(undoPage),
        restartPage: () => mutate(restartPage),
        setPageMs: (ms) => mutate((s, now) => setPageMs(s, ms, now)),
        setDuration: (ms) => mutate((s, now) => setDurationMs(s, ms, now)),
        setTarget: (pages) => mutate((s, now) => setTargetPages(s, pages, now)),
        end: () => mutate(endSession),

        reset: () => {
          const s = get().active;
          if (!s) return;
          const now = Date.now();
          set((state) => ({
            active: null,
            books: state.books.map((b) =>
              b.id === s.bookId && s.status !== "finished"
                ? { ...b, currentPage: s.startPage, updatedAt: now }
                : b,
            ),
          }));
        },

        dismiss: () => set({ active: null }),

        tick: (now) => {
          const prev = get().active;
          if (!prev) return null;
          const result = reconcile(prev, now);
          commit(prev, result.session, now);
          return result;
        },

        updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
        updateSetup: (patch) => set((s) => ({ setup: { ...s.setup, ...patch } })),

        exportData: () => {
          const { books, history, settings } = get();
          return { app: "pagepace", version: 1, exportedAt: Date.now(), books, history, settings };
        },

        importData: (file) =>
          set({
            books: Array.isArray(file.books) ? file.books : [],
            history: Array.isArray(file.history) ? file.history : [],
            settings: { ...DEFAULT_SETTINGS, ...file.settings },
            setup: DEFAULT_SETUP,
            active: null,
          }),

        clearAll: () => set({ ...initialData }),
      };
    },
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ books, history, active, settings, setup }): Data => ({
        books,
        history,
        active,
        settings,
        setup,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Data>;
        return {
          ...current,
          ...p,
          settings: { ...DEFAULT_SETTINGS, ...p.settings },
          setup: {
            ...DEFAULT_SETUP,
            ...p.setup,
            practice: { ...DEFAULT_SETUP.practice, ...p.setup?.practice },
          },
        };
      },
    },
  ),
);

/** Wall clock shared by everything that renders live time. Updated by the session engine. */
export const useClock = create<{ now: number }>(() => ({
  now: typeof window === "undefined" ? 0 : Date.now(),
}));
