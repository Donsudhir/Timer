"use client";

import { useState } from "react";
import { formatPace } from "@/lib/format";
import { unitDurations } from "@/lib/session";
import type { ActiveSession } from "@/lib/types";
import { cx } from "../ui";

/**
 * Time spent on each question against the per-question limit. Questions that
 * timed out are highlighted; the rest stay neutral. Hover, focus or tap a bar
 * for its readout; the longest question is shown by default.
 */
export function QuestionTimes({ session }: { session: ActiveSession }) {
  const durations = unitDurations(session);
  const [hovered, setHovered] = useState<number | null>(null);
  if (durations.length === 0) return null;

  const limit = session.pageMs;
  const top = Math.max(limit, ...durations);
  const longest = durations.indexOf(Math.max(...durations));
  const shown = hovered ?? longest;
  const timedOut = (i: number) => session.pages[i].kind === "auto";
  const label = (i: number) => `Q${session.startPage + i}`;
  const outCount = session.pages.filter((p) => p.kind === "auto").length;
  const status = (i: number) => (timedOut(i) ? "Timed out" : "Within time");

  return (
    <figure>
      <figcaption className="flex items-end justify-between gap-4">
        <div>
          <div className="label-caps">Time per question</div>
          <div className="mt-2 text-[28px] font-light leading-none tracking-[-0.03em] tabular">
            {formatPace(durations[shown])}
            <span className="ml-1.5 text-sm font-normal tracking-normal text-muted">{label(shown)}</span>
          </div>
        </div>
        <div className="pb-0.5 text-right text-xs text-muted">
          <div className="font-medium text-fg-2">{hovered === null ? "Longest" : label(shown)}</div>
          <div>{status(shown)}</div>
        </div>
      </figcaption>

      <div className="relative mt-6 h-32" onPointerLeave={() => setHovered(null)}>
        <div
          className="absolute inset-x-0 border-t border-line-strong"
          style={{ bottom: `${(limit / top) * 100}%` }}
          aria-hidden="true"
        >
          <span className="absolute -top-2.5 right-0 bg-surface pl-1.5 text-[10px] text-muted tabular">
            {formatPace(limit)} limit
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 border-t border-line-strong" aria-hidden="true" />
        <div className="absolute inset-0 right-16 flex items-end">
          {durations.map((d, i) => (
            <button
              key={i}
              type="button"
              className="group flex h-full flex-1 items-end justify-center px-px outline-none"
              aria-label={`${label(i)}: ${formatPace(d)}, ${status(i).toLowerCase()}`}
              onPointerEnter={() => setHovered(i)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              onClick={() => setHovered(i)}
            >
              <span
                className={cx(
                  "block w-full max-w-6 rounded-t-[4px] transition-opacity duration-300 group-focus-visible:ring-2 group-focus-visible:ring-accent",
                  timedOut(i) ? "bg-chart-hi" : "bg-chart-rest",
                  hovered !== null && hovered !== i && "opacity-40",
                )}
                style={{ height: `max(2px, ${(d / top) * 100}%)` }}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex pr-16 text-[10px] text-muted tabular" aria-hidden="true">
        {durations.map((_, i) => (
          <div key={i} className="flex-1 overflow-visible whitespace-nowrap text-center">
            {i === 0 || i === durations.length - 1 ? label(i) : ""}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-2">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-chart-rest" aria-hidden="true" />
          Within time · {durations.length - outCount}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-chart-hi" aria-hidden="true" />
          Timed out · {outCount}
        </span>
      </div>

      <table className="sr-only">
        <caption>Time per question</caption>
        <thead>
          <tr>
            <th scope="col">Question</th>
            <th scope="col">Time</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {durations.map((d, i) => (
            <tr key={i}>
              <td>{label(i)}</td>
              <td>{formatPace(d)}</td>
              <td>{status(i)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
