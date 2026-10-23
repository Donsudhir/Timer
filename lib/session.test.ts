import { describe, expect, it } from "vitest";
import {
  HOUR,
  MINUTE,
  SECOND,
  elapsedAt,
  endSession,
  pauseSession,
  reconcile,
  resumeSession,
  setDurationMs,
  setPageMs,
  setTargetPages,
  skipPage,
  startSession,
  toRecord,
  undoPage,
  unitDurations,
  upcomingAlerts,
  viewSession,
} from "./session";

const T0 = 1_700_000_000_000;

function make(overrides: Partial<Parameters<typeof startSession>[0]> = {}) {
  return startSession(
    {
      id: "s1",
      mode: "read",
      bookId: null,
      title: "Test",
      startPage: 10,
      targetPages: 36,
      durationMs: 3 * HOUR,
      pageMs: 5 * MINUTE,
      ...overrides,
    },
    T0,
  );
}

describe("reconcile", () => {
  it("does nothing before the first page ends", () => {
    const s = make();
    const r = reconcile(s, T0 + 5 * MINUTE - 1);
    expect(r.advanced).toBe(0);
    expect(r.session).toBe(s);
  });

  it("counts a page exactly when the micro timer reaches zero and restarts it", () => {
    const r = reconcile(make(), T0 + 5 * MINUTE);
    expect(r.advanced).toBe(1);
    expect(r.session.pages).toEqual([{ at: T0 + 5 * MINUTE, kind: "auto", el: 5 * MINUTE }]);
    expect(r.session.pageStartMs).toBe(5 * MINUTE);
    const v = viewSession(r.session, T0 + 5 * MINUTE);
    expect(v.microRemaining).toBe(5 * MINUTE);
    expect(v.currentPage).toBe(11);
  });

  it("catches up after a long gap, stamping each page at its real time", () => {
    const r = reconcile(make(), T0 + 23 * MINUTE);
    expect(r.advanced).toBe(4);
    expect(r.session.pages.map((p) => p.at - T0)).toEqual([5, 10, 15, 20].map((m) => m * MINUTE));
    expect(viewSession(r.session, T0 + 23 * MINUTE).microRemaining).toBe(2 * MINUTE);
  });

  it("finishes on target at the moment the last page completes", () => {
    const r = reconcile(make({ targetPages: 3 }), T0 + 40 * MINUTE);
    expect(r.finished).toBe(true);
    expect(r.session.status).toBe("finished");
    expect(r.session.endReason).toBe("target");
    expect(r.session.pages).toHaveLength(3);
    expect(r.session.accumulatedMs).toBe(15 * MINUTE);
    expect(r.session.endedAt).toBe(T0 + 15 * MINUTE);
  });

  it("finishes on time without counting the unfinished final page", () => {
    const s = make({ durationMs: 12 * MINUTE, targetPages: 50 });
    const r = reconcile(s, T0 + 2 * HOUR);
    expect(r.session.endReason).toBe("time");
    expect(r.session.pages).toHaveLength(2);
    expect(r.session.accumulatedMs).toBe(12 * MINUTE);
    expect(r.session.endedAt).toBe(T0 + 12 * MINUTE);
  });

  it("counts a page that ends exactly at the session end", () => {
    const r = reconcile(make({ durationMs: 10 * MINUTE, targetPages: 5 }), T0 + 10 * MINUTE);
    expect(r.session.pages).toHaveLength(2);
    expect(r.session.endReason).toBe("time");
  });
});

describe("pause and resume", () => {
  it("freezes both timers together while paused", () => {
    let s = make();
    s = pauseSession(s, T0 + 2 * MINUTE);
    expect(s.status).toBe("paused");
    const later = T0 + 50 * MINUTE;
    expect(reconcile(s, later).advanced).toBe(0);
    const v = viewSession(s, later);
    expect(v.elapsed).toBe(2 * MINUTE);
    expect(v.microRemaining).toBe(3 * MINUTE);
    expect(v.macroRemaining).toBe(3 * HOUR - 2 * MINUTE);

    s = resumeSession(s, later);
    const r = reconcile(s, later + 3 * MINUTE);
    expect(r.advanced).toBe(1);
    expect(r.session.pages[0].at).toBe(later + 3 * MINUTE);
  });

  it("counts pages that completed before a late pause", () => {
    const s = pauseSession(make(), T0 + 11 * MINUTE);
    expect(s.pages).toHaveLength(2);
    expect(elapsedAt(s, T0 + HOUR)).toBe(11 * MINUTE);
  });
});

describe("manual controls", () => {
  it("skip counts the page and restarts the micro timer on a whole second", () => {
    const s = skipPage(make(), T0 + 90 * SECOND + 300);
    expect(s.pages).toEqual([{ at: T0 + 90 * SECOND + 300, kind: "manual", el: 90 * SECOND + 300 }]);
    expect(s.pageStartMs).toBe(90 * SECOND);
    expect(viewSession(s, T0 + 90 * SECOND + 300).microRemaining).toBe(5 * MINUTE - 300);
  });

  it("skip finishes the session when it reaches the target", () => {
    let s = make({ targetPages: 2 });
    s = skipPage(s, T0 + MINUTE);
    s = skipPage(s, T0 + 2 * MINUTE);
    expect(s.status).toBe("finished");
    expect(s.endReason).toBe("target");
  });

  it("undo removes the last page and gives a fresh page timer", () => {
    let s = reconcile(make(), T0 + 5 * MINUTE + 20 * SECOND).session;
    expect(s.pages).toHaveLength(1);
    s = undoPage(s, T0 + 5 * MINUTE + 20 * SECOND);
    expect(s.pages).toHaveLength(0);
    const v = viewSession(s, T0 + 5 * MINUTE + 20 * SECOND);
    expect(v.currentPage).toBe(10);
    expect(v.microRemaining).toBe(5 * MINUTE);
  });

  it("undo is a no-op with no pages", () => {
    const s = make();
    expect(undoPage(s, T0 + MINUTE).pages).toHaveLength(0);
  });

  it("end session finishes with the elapsed time so far", () => {
    const s = endSession(make(), T0 + 7 * MINUTE);
    expect(s.status).toBe("finished");
    expect(s.endReason).toBe("ended");
    expect(s.pages).toHaveLength(1);
    expect(s.accumulatedMs).toBe(7 * MINUTE);
    expect(s.endedAt).toBe(T0 + 7 * MINUTE);
  });
});

describe("adjustments", () => {
  it("more time per page extends the current page", () => {
    const s = setPageMs(make(), 5 * MINUTE + 30 * SECOND, T0 + 4 * MINUTE);
    expect(viewSession(s, T0 + 4 * MINUTE).microRemaining).toBe(90 * SECOND);
  });

  it("a shorter pace never ends the current page on the spot", () => {
    const s = setPageMs(make(), 3 * MINUTE, T0 + 4 * MINUTE + 50 * SECOND);
    expect(s.pages).toHaveLength(0);
    expect(viewSession(s, T0 + 4 * MINUTE + 50 * SECOND).microRemaining).toBe(3 * SECOND);
    expect(reconcile(s, T0 + 4 * MINUTE + 53 * SECOND).advanced).toBe(1);
  });

  it("session length cannot drop below the time already spent", () => {
    const s = setDurationMs(make(), 10 * MINUTE, T0 + 30 * MINUTE);
    expect(s.durationMs).toBe(31 * MINUTE);
    expect(s.status).toBe("running");
  });

  it("target cannot drop to or below pages already read", () => {
    let s = reconcile(make(), T0 + 16 * MINUTE).session;
    s = setTargetPages(s, 1, T0 + 16 * MINUTE);
    expect(s.targetPages).toBe(4);
    expect(s.status).toBe("running");
  });
});

describe("view", () => {
  it("is on track when the page time matches the target pace", () => {
    const s = make();
    for (const t of [0, 1, 4.5, 30, 92].map((m) => T0 + m * MINUTE)) {
      const v = viewSession(reconcile(s, t).session, t);
      expect(v.paceStatus).toBe("on-track");
    }
  });

  it("reports behind and suggests a faster pace when the target won't fit", () => {
    const s = make({ targetPages: 40 });
    const t = T0 + 60 * MINUTE;
    const v = viewSession(reconcile(s, t).session, t);
    expect(v.paceStatus).toBe("behind");
    expect(v.onTimeForTarget).toBe(false);
    expect(v.suggestedPageMs).not.toBeNull();
    expect(v.suggestedPageMs!).toBeLessThan(5 * MINUTE);
  });

  it("reports ahead after skipping pages", () => {
    let s = make();
    for (let i = 1; i <= 3; i++) s = skipPage(s, T0 + i * MINUTE);
    expect(viewSession(s, T0 + 3 * MINUTE).paceStatus).toBe("ahead");
  });
});

describe("upcomingAlerts", () => {
  it("lists page ends within the horizon and marks the last one as end", () => {
    const s = make({ targetPages: 3 });
    const alerts = upcomingAlerts(s, T0, HOUR);
    expect(alerts).toEqual([
      { at: T0 + 5 * MINUTE, kind: "page" },
      { at: T0 + 10 * MINUTE, kind: "page" },
      { at: T0 + 15 * MINUTE, kind: "end" },
    ]);
  });

  it("includes the session end when it comes before the next page", () => {
    const s = make({ durationMs: 7 * MINUTE });
    expect(upcomingAlerts(s, T0, HOUR)).toEqual([
      { at: T0 + 5 * MINUTE, kind: "page" },
      { at: T0 + 7 * MINUTE, kind: "end" },
    ]);
  });

  it("is empty while paused", () => {
    expect(upcomingAlerts(pauseSession(make(), T0 + MINUTE), T0 + MINUTE, HOUR)).toEqual([]);
  });
});

describe("practice timing", () => {
  const practice = () => make({ mode: "practice", pageMs: 2 * MINUTE, targetPages: 10, durationMs: HOUR });

  it("measures each question in session time, excluding pauses", () => {
    let s = practice();
    s = skipPage(s, T0 + 70 * SECOND); // Q1 solved in 1:10
    s = pauseSession(s, T0 + 100 * SECOND); // 30 s into Q2, then a 10-minute break
    s = resumeSession(s, T0 + 700 * SECOND);
    s = reconcile(s, T0 + 800 * SECOND).session; // Q2 times out at 2:00 of its own time
    expect(unitDurations(s)).toEqual([70 * SECOND, 2 * MINUTE]);
  });

  it("records the mode and how many questions timed out", () => {
    let s = practice();
    s = skipPage(s, T0 + 30 * SECOND);
    s = reconcile(s, T0 + 30 * SECOND + 4 * MINUTE).session;
    s = endSession(s, T0 + 30 * SECOND + 4 * MINUTE);
    const record = toRecord(s);
    expect(record.mode).toBe("practice");
    expect(record.pageTimes).toHaveLength(3);
    expect(record.timedOut).toBe(2);
  });

  it("charges time from before an undo to the question being redone", () => {
    let s = practice();
    s = skipPage(s, T0 + 40 * SECOND);
    s = undoPage(s, T0 + 50 * SECOND);
    s = skipPage(s, T0 + 90 * SECOND);
    expect(unitDurations(s)).toEqual([90 * SECOND]);
  });
});
