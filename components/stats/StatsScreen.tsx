"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDuration, formatPace, formatRelativeDay, formatTimeOfDay, plural, startOfDay } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { HOUR } from "@/lib/session";
import { type Bucket, dailyBuckets, totals, weeklyBuckets, withLive } from "@/lib/stats";
import { useApp } from "@/lib/store";
import type { SessionMode } from "@/lib/types";
import { type Units, unitsFor } from "@/lib/units";
import { ChartIcon } from "../icons";
import { PageColumn } from "../Hydrated";
import { Card, PageHeader, Segmented, buttonClass, cx } from "../ui";

type Range = "week" | "month" | "all";

const RANGE_DAYS: Record<Exclude<Range, "all">, number> = { week: 7, month: 30 };

export function StatsScreen() {
  const history = useApp((s) => s.history);
  const active = useApp((s) => s.active);
  const now = useNow();
  const [range, setRange] = useState<Range>("week");
  const [modeChoice, setModeChoice] = useState<SessionMode | null>(null);

  const all = withLive(history, active, now);
  const liveId = active && active.status !== "finished" ? active.id : null;
  const hasPractice = all.some((r) => r.mode === "practice");
  // Pages and questions don't add up, so each mode has its own stats.
  const mode = modeChoice ?? all[0]?.mode ?? "read";
  const units = unitsFor(mode);
  const practice = mode === "practice";
  const records = all.filter((r) => (r.mode ?? "read") === mode);

  if (all.length === 0) {
    return (
      <PageColumn>
        <PageHeader title="Stats" />
        <div className="flex flex-col items-center rounded-[28px] border border-dashed border-line-strong px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-fg-2">
            <ChartIcon size={24} />
          </div>
          <h2 className="mt-5 font-serif text-2xl">No sessions yet</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
            Finish a session and your pages, pace and daily progress show up here.
          </p>
          <Link href="/" className={buttonClass("primary", "md", "mt-7")}>
            Start a session
          </Link>
        </div>
      </PageColumn>
    );
  }

  const days = range === "all" ? null : RANGE_DAYS[range];
  let since = 0;
  if (days) {
    const d = new Date(startOfDay(now));
    d.setDate(d.getDate() - (days - 1));
    since = d.getTime();
  }
  const t = totals(records, since);
  const buckets = days ? dailyBuckets(records, days, now) : weeklyBuckets(records, 12, now);
  const recent = records.slice(0, 25);
  const inTime = t.sessionPages ? Math.round(((t.sessionPages - t.timedOut) / t.sessionPages) * 100) : null;

  return (
    <PageColumn>
      <PageHeader
        title="Stats"
        action={
          hasPractice && (
            <Segmented<SessionMode>
              label="Session type"
              value={mode}
              onChange={setModeChoice}
              options={[
                { value: "read", label: "Reading" },
                { value: "practice", label: "Practice" },
              ]}
            />
          )
        }
      />

      <Segmented<Range>
        label="Range"
        className="mb-5 w-full sm:w-auto"
        value={range}
        onChange={setRange}
        options={[
          { value: "week", label: "7 days" },
          { value: "month", label: "30 days" },
          { value: "all", label: "All time" },
        ]}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label={units.Many}
          value={String(t.pages)}
          sub={days ? `${(t.pages / days).toFixed(1)} a day` : `${plural(t.sessions, "session")}`}
        />
        <Tile
          label={practice ? "Practice" : "Reading"}
          value={t.ms ? formatDuration(t.ms) : "0m"}
          sub={days ? `${formatDuration(t.ms / days)} a day` : "in sessions"}
        />
        <Tile
          label={`Per ${units.one}`}
          value={t.paceMs ? formatPace(t.paceMs) : "—"}
          sub={t.paceMs ? `${perHour(t.paceMs)} ${units.many}/hour` : `no ${units.many} yet`}
        />
        {practice ? (
          <Tile
            label="In time"
            value={inTime === null ? "—" : `${inTime}%`}
            sub={t.sessionPages ? `${t.timedOut} timed out` : "none in range"}
          />
        ) : (
          <Tile
            label="Sessions"
            value={String(t.sessions)}
            sub={t.sessions ? `${formatDuration(t.ms / t.sessions)} average` : "none in range"}
          />
        )}
      </div>

      <Card className="mt-3 p-5 sm:p-6">
        <BarChart buckets={buckets} units={units} unit={days ? "day" : "week"} now={now} key={`${mode}-${range}`} />
      </Card>

      <section className="mt-10">
        <h2 className="label-caps mb-2">Sessions</h2>
        {recent.length === 0 && (
          <p className="py-4 text-sm text-muted">No {practice ? "practice" : "reading"} sessions yet.</p>
        )}
        <ul className="divide-y divide-line">
          {recent.map((r) => {
            const pages = r.pageTimes.length;
            return (
              <li key={r.id} className="flex items-center gap-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {r.id === liveId && (
                      <span className="h-1.5 w-1.5 shrink-0 animate-breathe rounded-full bg-accent" aria-label="In progress" />
                    )}
                    <span className="truncate text-[15px] font-medium tracking-[-0.01em]">{r.title}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {r.id === liveId ? "Now" : `${formatRelativeDay(r.startedAt, now)}, ${formatTimeOfDay(r.startedAt)}`} ·{" "}
                    {formatDuration(r.activeMs)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[15px] tabular">
                    {pages}
                    <span className="text-muted">/{r.targetPages}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted tabular">
                    {pages ? `${formatPace(r.activeMs / pages)} / ${units.one}` : "—"}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </PageColumn>
  );
}

function perHour(paceMs: number): string {
  const n = HOUR / paceMs;
  return n >= 100 ? String(Math.round(n)) : n.toFixed(1);
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="label-caps">{label}</div>
      <div className="mt-2 text-[30px] font-light leading-none tracking-[-0.03em] tabular">{value}</div>
      <div className="mt-2 truncate text-xs text-muted">{sub}</div>
    </Card>
  );
}

function niceCeil(n: number): number {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * pow >= n) return m * pow;
  return 10 * pow;
}

function bucketLabel(b: Bucket, unit: "day" | "week", now: number): string {
  if (unit === "week") {
    return `Week of ${new Date(b.start).toLocaleDateString([], { month: "short", day: "numeric" })}`;
  }
  const rel = formatRelativeDay(b.start, now);
  return rel === "Today" || rel === "Yesterday"
    ? rel
    : new Date(b.start).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function axisLabel(b: Bucket, i: number, count: number, unit: "day" | "week"): string | null {
  const d = new Date(b.start);
  if (unit === "day" && count <= 7) return d.toLocaleDateString([], { weekday: "narrow" });
  const every = unit === "day" ? 7 : 3;
  if ((count - 1 - i) % every !== 0) return null;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Single-series column chart: one bar per day (or week), hover/focus/tap for the readout. */
function BarChart({
  buckets,
  units,
  unit,
  now,
}: {
  buckets: Bucket[];
  units: Units;
  unit: "day" | "week";
  now: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const top = niceCeil(Math.max(...buckets.map((b) => b.pages)));
  const shownIndex = hovered ?? buckets.length - 1;
  const shown = buckets[shownIndex];

  return (
    <figure>
      <figcaption className="flex items-end justify-between gap-4">
        <div>
          <div className="label-caps">
            {units.Many} per {unit}
          </div>
          <div className="mt-2 text-[28px] font-light leading-none tracking-[-0.03em] tabular">
            {shown.pages}
            <span className="ml-1.5 text-sm font-normal tracking-normal text-muted">{shown.pages === 1 ? units.one : units.many}</span>
          </div>
        </div>
        <div className="pb-0.5 text-right text-xs text-muted">
          <div className="font-medium text-fg-2">{bucketLabel(shown, unit, now)}</div>
          <div className="tabular">{shown.ms ? formatDuration(shown.ms) : "No reading"}</div>
        </div>
      </figcaption>

      <div className="relative mt-6 h-40" onPointerLeave={() => setHovered(null)}>
        {[1, 0.5].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${f * 100}%` }} aria-hidden="true">
            <span className="absolute -top-2.5 right-0 bg-surface pl-1.5 text-[10px] text-muted tabular">{top * f}</span>
          </div>
        ))}
        <div className="absolute inset-x-0 bottom-0 border-t border-line-strong" aria-hidden="true" />
        <div className="absolute inset-0 right-7 flex items-end">
          {buckets.map((b, i) => {
            const isShown = i === shownIndex;
            return (
              <button
                key={b.start}
                type="button"
                className="group flex h-full flex-1 items-end justify-center px-[1px] outline-none"
                aria-label={`${bucketLabel(b, unit, now)}: ${units.count(b.pages)}`}
                onPointerEnter={() => setHovered(i)}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
                onClick={() => setHovered(i)}
              >
                <span
                  className={cx(
                    "block w-full max-w-6 rounded-t-[4px] transition-[height,opacity,background-color] duration-500 ease-out-soft group-focus-visible:ring-2 group-focus-visible:ring-accent",
                    b.pages ? "bg-accent" : "bg-faint",
                    hovered !== null && !isShown && "opacity-40",
                  )}
                  style={{ height: b.pages ? `${(b.pages / top) * 100}%` : "2px" }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex pr-7" aria-hidden="true">
        {buckets.map((b, i) => {
          const label = axisLabel(b, i, buckets.length, unit);
          return (
            <div
              key={b.start}
              className={cx(
                "flex-1 overflow-visible whitespace-nowrap text-center text-[10px] text-muted",
                i === shownIndex && "font-semibold text-fg",
              )}
            >
              {label ?? ""}
            </div>
          );
        })}
      </div>

      <table className="sr-only">
        <caption>
          {units.Many} per {unit}
        </caption>
        <thead>
          <tr>
            <th scope="col">{unit === "day" ? "Day" : "Week"}</th>
            <th scope="col">{units.Many}</th>
            <th scope="col">Time</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.start}>
              <td>{bucketLabel(b, unit, now)}</td>
              <td>{b.pages}</td>
              <td>{formatDuration(b.ms)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
