const pad = (n: number) => String(n).padStart(2, "0");

/** Countdown display: rounds up so 4:59.4 shows 5:00 and zero is only shown at zero. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Pace such as 5:00 or 4:35 (per page). */
export function formatPace(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

/** Human duration: 3h, 2h 30m, 45m, 50s. */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (ms > 0 && ms < 60000) return `${Math.round(ms / 1000)}s`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function formatTimeOfDay(epoch: number): string {
  return new Date(epoch).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatRelativeDay(epoch: number, now = Date.now()): string {
  const day = startOfDay(epoch);
  const today = startOfDay(now);
  const diff = Math.round((today - day) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return new Date(epoch).toLocaleDateString([], { weekday: "long" });
  return new Date(epoch).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: new Date(epoch).getFullYear() === new Date(now).getFullYear() ? undefined : "numeric",
  });
}

export function startOfDay(epoch: number): number {
  const d = new Date(epoch);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
