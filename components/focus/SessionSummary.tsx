"use client";

import { formatDuration, formatPace } from "@/lib/format";
import { worthSaving } from "@/lib/session";
import { useApp } from "@/lib/store";
import type { ActiveSession } from "@/lib/types";
import { unitsFor } from "@/lib/units";
import { bookProgress, isFinished } from "../books";
import { Bar, Button, Card } from "../ui";
import { QuestionTimes } from "./QuestionTimes";

const HEADLINES = {
  target: "Target reached",
  time: "Time's up",
  ended: "Session ended",
} as const;

export function SessionSummary({ session }: { session: ActiveSession }) {
  const dismiss = useApp((s) => s.dismiss);
  const book = useApp((s) => s.books.find((b) => b.id === session.bookId));
  const practice = session.mode === "practice";
  const units = unitsFor(session.mode);
  const pages = session.pages.length;
  const pace = pages ? session.accumulatedMs / pages : null;
  const last = session.startPage + pages - 1;
  const withinTime = session.pages.filter((p) => p.kind === "manual").length;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md animate-rise flex-col justify-center px-6 py-12 pt-safe text-center">
      <div className="label-caps">{HEADLINES[session.endReason ?? "ended"]}</div>
      <div className="mt-5 text-[124px] font-extralight leading-[0.9] tracking-[-0.06em]">{pages}</div>
      <div className="mt-3 font-serif text-[26px] tracking-[-0.01em]">
        {pages === 1 ? units.one : units.many} {practice ? "done" : "finished"}
      </div>
      <div className="mt-1 text-sm text-muted">
        {pages >= session.targetPages ? `All ${session.targetPages} planned` : `of ${session.targetPages} planned`}
      </div>

      <div className="mt-10 grid grid-cols-3 divide-x divide-line rounded-[24px] bg-surface py-5 shadow-soft ring-1 ring-line">
        <Metric label="Time" value={formatDuration(session.accumulatedMs)} />
        <Metric label={practice ? "Average" : "Per page"} value={pace ? formatPace(pace) : "—"} />
        {practice ? (
          <Metric label="In time" value={pages ? `${withinTime}/${pages}` : "—"} />
        ) : (
          <Metric label="Pages" value={pages ? (pages > 1 ? `${session.startPage}–${last}` : `${last}`) : "—"} />
        )}
      </div>

      {practice && pages > 0 && (
        <Card className="mt-3 p-5 text-left">
          <QuestionTimes session={session} />
        </Card>
      )}

      {book && (
        <div className="mt-3 rounded-[24px] bg-surface p-5 text-left shadow-soft ring-1 ring-line">
          <div className="flex items-baseline justify-between gap-3">
            <div className="truncate font-serif text-lg">{book.title}</div>
            <div className="shrink-0 text-[13px] text-muted tabular">{Math.round(bookProgress(book) * 100)}%</div>
          </div>
          <div className="mt-1 text-[13px] text-muted">
            {isFinished(book) ? "Finished — every page read" : `Next up: p. ${book.currentPage} of ${book.totalPages}`}
          </div>
          <Bar value={bookProgress(book)} tone="accent" className="mt-3" />
        </div>
      )}

      {!worthSaving(session) && (
        <p className="mt-4 text-[13px] text-muted">Under a minute with no pages — not saved to your stats.</p>
      )}

      <Button size="lg" className="mt-10 w-full" onClick={dismiss}>
        Done
      </Button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2">
      <div className="label-caps">{label}</div>
      <div className="mt-1.5 text-xl font-light tracking-[-0.02em] tabular">{value}</div>
    </div>
  );
}
