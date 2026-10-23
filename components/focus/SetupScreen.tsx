"use client";

import { useState, type ReactNode } from "react";
import { alertAudio } from "@/lib/audio";
import { formatDuration, formatPace, formatTimeOfDay, startOfDay } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import {
  DURATION_MS_MAX,
  DURATION_MS_MIN,
  MINUTE,
  PAGE_MS_MAX,
  PAGE_MS_MIN,
  PAGE_MS_STEP,
  SECOND,
  clamp,
  clampPageMs,
} from "@/lib/session";
import { totals } from "@/lib/stats";
import { useApp } from "@/lib/store";
import type { Book, SessionMode } from "@/lib/types";
import { unitsFor } from "@/lib/units";
import { BookPickerSheet, bookProgress, isFinished } from "../books";
import { ChevronRightIcon, LogoMark, PlayIcon } from "../icons";
import { Bar, Button, Card, Segmented, Stepper, cx } from "../ui";

const DURATION_PRESETS = [30, 60, 120, 180].map((m) => m * MINUTE);
const PACE_PRESETS: Record<SessionMode, number[]> = {
  read: [2, 3, 5, 10].map((m) => m * MINUTE),
  practice: [1, 2, 3, 5].map((m) => m * MINUTE),
};

function initialBook(books: Book[], preferredId: string | null): Book | null {
  const preferred = books.find((b) => b.id === preferredId);
  if (preferred && !isFinished(preferred)) return preferred;
  const unfinished = books.filter((b) => !isFinished(b));
  unfinished.sort((a, b) => (b.lastReadAt ?? b.createdAt) - (a.lastReadAt ?? a.createdAt));
  return unfinished[0] ?? preferred ?? null;
}

const startPageFor = (book: Book | null) => (book && !isFinished(book) ? book.currentPage : 1);

function greeting(now: number) {
  const h = new Date(now).getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function SetupScreen() {
  const savedMode = useApp((s) => s.setup.mode);
  const history = useApp((s) => s.history);
  const updateSetup = useApp((s) => s.updateSetup);
  const now = useNow();
  const [mode, setMode] = useState<SessionMode>(savedMode);
  const units = unitsFor(mode);
  const today = totals(
    history.filter((r) => (r.mode ?? "read") === mode),
    startOfDay(now),
  );

  const switchMode = (next: SessionMode) => {
    setMode(next);
    updateSetup({ mode: next });
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 animate-rise flex-col px-5 pb-6 pt-safe sm:px-8">
      <section className="pb-6 pt-6 md:pb-7 md:pt-12">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <LogoMark size={18} className="shrink-0 md:hidden" />
            <p className="label-caps truncate">{greeting(now)}</p>
          </div>
          <Segmented<SessionMode>
            label="Session type"
            value={mode}
            onChange={switchMode}
            options={[
              { value: "read", label: "Read", title: "Time pages of a book" },
              { value: "practice", label: "Practice", title: "Time questions in a test" },
            ]}
          />
        </div>
        <h1
          key={mode}
          className="mt-4 animate-fade font-serif text-[36px] leading-[1.04] tracking-[-0.025em] sm:text-[46px]"
        >
          {mode === "practice" ? (
            <>
              How many will
              <br />
              you solve today?
            </>
          ) : (
            <>
              What will you
              <br />
              finish today?
            </>
          )}
        </h1>
        {today.pages > 0 && (
          <p className="mt-3 text-[13px] text-muted">
            Today so far: {units.count(today.pages)} in {formatDuration(today.ms)}
          </p>
        )}
      </section>

      <SetupForm key={mode} mode={mode} now={now} />
    </div>
  );
}

/** Keyed by mode, so switching modes starts from that mode's remembered setup. */
function SetupForm({ mode, now }: { mode: SessionMode; now: number }) {
  const books = useApp((s) => s.books);
  const setup = useApp((s) => s.setup);
  const start = useApp((s) => s.start);
  const practice = mode === "practice";
  const units = unitsFor(mode);
  const prefs = practice ? setup.practice : setup;

  const [bookId, setBookId] = useState<string | null>(() =>
    practice ? null : (initialBook(books, setup.bookId)?.id ?? null),
  );
  const book = practice ? null : (books.find((b) => b.id === bookId) ?? null);
  const [title, setTitle] = useState(setup.practice.title);
  const [durationMs, setDurationMs] = useState(prefs.durationMs);
  const [pageMs, setPageMs] = useState(prefs.pageMs);
  const [startPage, setStartPage] = useState(() => startPageFor(book));
  const [targetOverride, setTargetOverride] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const maxStart = book ? book.totalPages : 99999;
  const maxTarget = book ? book.totalPages - startPage + 1 : 9999;
  const capacity = Math.max(1, Math.floor(durationMs / pageMs));
  const target = clamp(targetOverride ?? capacity, 1, maxTarget);
  const neededMs = target * pageMs;
  const fits = neededMs <= durationMs;
  const fittingPace = clampPageMs(Math.floor(durationMs / target / (5 * SECOND)) * 5 * SECOND);
  const last = startPage + target - 1;

  const selectBook = (id: string | null) => {
    const next = books.find((b) => b.id === id) ?? null;
    setBookId(id);
    setStartPage(startPageFor(next));
    setTargetOverride(null);
  };

  const begin = () => {
    void alertAudio.unlock(); // inside the tap, so chimes are allowed to play later
    start({ mode, title, bookId, startPage, targetPages: target, durationMs, pageMs });
  };

  return (
    <>
      {practice ? (
        <label className="mb-3 block cursor-text rounded-[24px] bg-surface px-5 py-4 shadow-soft ring-1 ring-line sm:py-5">
          <span className="label-caps">Practice test</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Name it (optional)"
            maxLength={80}
            className="mt-1 block w-full bg-transparent font-serif text-[21px] leading-tight tracking-[-0.01em] outline-none placeholder:text-muted/50 sm:text-[22px]"
          />
          <span className="mt-1 block text-[13px] text-muted">Each question gets its own countdown</span>
        </label>
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="group mb-3 flex w-full items-center gap-4 rounded-[24px] bg-surface px-5 py-4 text-left shadow-soft ring-1 ring-line transition active:scale-[0.99] sm:py-5"
        >
          <div className="min-w-0 flex-1">
            <div className="label-caps">{book ? "Reading" : "Quick session"}</div>
            <div className="mt-1 truncate font-serif text-[21px] leading-tight tracking-[-0.01em] sm:text-[22px]">
              {book ? book.title : books.length ? "No book" : "Add your first book"}
            </div>
            {book ? (
              <>
                <div className="mt-1 text-[13px] text-muted">
                  {isFinished(book) ? "Finished · reading again" : `p. ${book.currentPage} of ${book.totalPages}`}
                  {book.author ? ` · ${book.author}` : ""}
                </div>
                <Bar value={bookProgress(book)} className="mt-3 h-[3px]" tone="accent" />
              </>
            ) : (
              <div className="mt-1 text-[13px] text-muted">
                {books.length ? "Tap to choose a book" : "Or just set a target below and start"}
              </div>
            )}
          </div>
          <ChevronRightIcon className="shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-fg" />
        </button>
      )}

      <Card className="divide-y divide-line px-5">
        <Row
          title={practice ? "Test length" : "Session"}
          detail={`Ends around ${formatTimeOfDay(now + durationMs)}`}
          control={
            <Stepper
              label={practice ? "test length" : "session length"}
              value={durationMs}
              step={15 * MINUTE}
              min={DURATION_MS_MIN}
              max={DURATION_MS_MAX}
              onChange={setDurationMs}
            >
              {formatDuration(durationMs)}
            </Stepper>
          }
        >
          <Presets values={DURATION_PRESETS} value={durationMs} onChange={setDurationMs} format={formatDuration} />
        </Row>
        <Row
          title={`Per ${units.one}`}
          detail={practice ? "Then moves on" : "Then auto-advances"}
          control={
            <Stepper
              label={`time per ${units.one}`}
              value={pageMs}
              step={PAGE_MS_STEP}
              min={PAGE_MS_MIN}
              max={PAGE_MS_MAX}
              onChange={setPageMs}
            >
              {formatPace(pageMs)}
            </Stepper>
          }
        >
          <Presets values={PACE_PRESETS[mode]} value={pageMs} onChange={setPageMs} format={formatDuration} />
        </Row>
        <Row
          title={practice ? "First question" : "Start page"}
          detail={book ? `of ${book.totalPages}` : practice ? "Its number in your set" : "Where you begin"}
          control={
            <Stepper
              label={practice ? "first question" : "start page"}
              value={startPage}
              step={1}
              min={1}
              max={maxStart}
              onChange={(v) => setStartPage(v)}
            >
              <NumberInput
                key={startPage}
                value={startPage}
                min={1}
                max={maxStart}
                onChange={setStartPage}
                label={practice ? "First question" : "Start page"}
              />
            </Stepper>
          }
        />
        <Row
          title={units.Many}
          detail={target > 1 ? `${units.ref(startPage)} – ${units.ref(last)}` : units.ref(startPage)}
          control={
            <Stepper
              label={`${units.many} to ${practice ? "solve" : "read"}`}
              value={target}
              step={1}
              min={1}
              max={maxTarget}
              onChange={setTargetOverride}
            >
              <NumberInput
                key={target}
                value={target}
                min={1}
                max={maxTarget}
                onChange={setTargetOverride}
                label={`${units.Many} to ${practice ? "solve" : "read"}`}
              />
            </Stepper>
          }
        />
      </Card>

      {/* Sticky so the start button is always reachable above the tab bar. */}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+58px)] z-10 -mx-5 bg-linear-to-t from-bg from-75% to-transparent px-5 pb-3 sm:-mx-8 sm:px-8 md:bottom-0 md:pb-6">
        <div className="flex min-h-[56px] items-center justify-center px-2 pb-2 pt-4 text-center text-[13px] leading-relaxed text-muted" aria-live="polite">
          {fits ? (
            <span>
              {units.count(target)} in {formatDuration(neededMs)}
              {durationMs - neededMs >= MINUTE && ` · ${formatDuration(durationMs - neededMs)} to spare`}
            </span>
          ) : (
            <span>
              {units.count(target)} at {formatPace(pageMs)} needs {formatDuration(neededMs)}.{" "}
              <button
                type="button"
                onClick={() => setPageMs(fittingPace)}
                className="font-medium text-fg underline decoration-line-strong underline-offset-4 transition hover:decoration-fg"
              >
                Use {formatPace(fittingPace)} per {units.one}
              </button>
            </span>
          )}
        </div>

        <Button size="lg" className="w-full text-base" onClick={begin}>
          <PlayIcon size={18} />
          {practice ? "Start practice" : "Start session"}
        </Button>
      </div>

      {!practice && (
        <BookPickerSheet
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          selectedId={bookId}
          onSelect={selectBook}
        />
      )}
    </>
  );
}

function Row({
  title,
  detail,
  control,
  children,
}: {
  title: string;
  detail: string;
  control: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-medium tracking-[-0.01em]">{title}</div>
          <div className="mt-0.5 truncate text-[13px] text-muted">{detail}</div>
        </div>
        {control}
      </div>
      {children}
    </div>
  );
}

function Presets({
  values,
  value,
  onChange,
  format,
}: {
  values: number[];
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div className="mt-2.5 flex gap-1.5">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={v === value}
          className={cx(
            "h-7 rounded-full px-3 text-xs font-medium tabular transition",
            v === value ? "bg-fg text-bg" : "bg-surface-2 text-muted hover:text-fg",
          )}
        >
          {format(v)}
        </button>
      ))}
    </div>
  );
}

/** Inline-editable number; commits on blur or Enter. Re-keyed by the parent when the value changes. */
function NumberInput({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const commit = () => {
    const n = Math.round(Number(draft));
    const next = Number.isFinite(n) && draft.trim() !== "" ? clamp(n, min, max) : value;
    setDraft(String(next));
    if (next !== value) onChange(next);
  };
  return (
    <input
      aria-label={label}
      type="number"
      inputMode="numeric"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="w-[4.5rem] rounded-lg bg-transparent text-center outline-none focus:bg-surface-2"
    />
  );
}
