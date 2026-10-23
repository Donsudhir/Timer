# PagePace

A calm, strict reading-pace timer. Pick a book, a number of pages and a time per
page; PagePace runs two synchronized countdowns and turns the page for you when
each page's time is up, so you finish pages instead of just logging hours.

Installable PWA, local-first, no account.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # timer engine unit tests
npm run build && npm start
```

The service worker only registers in production builds (`npm run build && npm start`).
Install prompts, the wake lock and `crypto.randomUUID` need a secure context:
`localhost` or HTTPS. Over plain LAN http those features quietly switch off.

## How it works

**One clock, two timers.** A session stores `accumulatedMs`, `resumedAt` and
`pageStartMs`. Elapsed time is `accumulatedMs + (now − resumedAt)` while running.
The session (macro) countdown is `durationMs − elapsed` and the page (micro)
countdown is `pageMs − (elapsed − pageStartMs)`. Both derive from the same
timestamp math, so they can't drift apart through pauses, reloads or background
throttling. Intervals are never counted.

**Reconcile, don't tick.** `reconcile()` in `lib/session.ts` counts every page
whose time has run out since the last check, stamping each with the moment it
actually completed, and finishes the session on target or time. After a reload or
a long background stretch it catches up in one pass. The engine
(`components/runtime.tsx`) schedules its next check for the next whole second of
the session clock, so both countdowns change on the same frame.

**Alerts that survive background tabs.** Browsers throttle timers in hidden tabs,
so page chimes are pre-scheduled on the Web Audio clock at the exact page-end
times (`lib/audio.ts`). If that clock stalls (device sleep, iOS suspending the
page), drift detection cancels and re-anchors the schedule so nothing plays late.
If the audio clock couldn't play an alert, the engine plays a fallback chime on
its next check. Vibration fires when the page is visible. A screen wake lock keeps
the display on while a session runs.

**Storage.** Everything (books, session history, the live session and settings) lives
in `localStorage` under `pagepace`, through a persisted Zustand store
(`lib/store.ts`). Other open tabs pick up changes through the `storage` event.
Settings → Export/Import moves data between devices as JSON.

## Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Pause / resume | Center button | Space |
| Finished the page early | Next page | → or N |
| Un-count the last page (re-read it with a fresh timer) | Undo | U, Backspace, ⌘/Ctrl+Z |
| Change pace, length or target; restart page; end or reset | Sliders icon | — |

## Layout

```
app/                 routes: / (setup → focus → summary), /library, /stats, /settings
components/focus/    setup, focus dashboard, adjust sheet, session summary
components/          shell, runtime engine, UI primitives, icons
lib/session.ts       pure timer engine (fully unit tested)
lib/store.ts         persisted app state and actions
lib/audio.ts         synthesized chimes and audio-clock scheduling
lib/stats.ts         daily/weekly aggregation
public/sw.js         offline shell cache
scripts/             icon generation (npm run icons)
```

## Known platform limits

- iOS suspends web pages when the screen locks. The session keeps counting by
  timestamps and catches up on return, but no chime plays while the phone is
  locked. Keeping the screen awake (on by default) avoids this.
- On iPhone, Web Audio follows the ring/silent switch, and `navigator.vibrate`
  isn't supported.
- Audio needs one tap after each page load (browser autoplay rules). The focus
  screen shows a hint until it has one.
