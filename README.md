# PagePace

A calm, strict reading-pace timer. Pick a book, a number of pages and a time per
page; PagePace runs two synchronized countdowns, one for the session and one for
the current page, so you finish pages instead of just logging hours.

When a page's time is up you hear a chime. By default you press **Next** when
you've actually finished; the page timer counts the overtime in red until you
do, and pages finished late are marked as over time. Turn on **Auto-advance**
(on the start screen, or mid-session under Adjust) to have the page count itself
and the next one start the moment time runs out.

**Practice mode** does the same for tests: set a test length and a time per
question, and each question gets its own countdown. With auto-advance on,
PagePace moves you on when time runs out, which is the habit timed exams reward.
The summary charts the time spent on every question against the limit, and
splits them into finished within time vs. over time.

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

**Reconcile, don't tick.** `reconcile()` in `lib/session.ts` brings a session up
to date with the clock. With auto-advance on, it counts every page whose time
has run out since the last check, stamping each with the moment it actually
completed. With it off, it flags the time-up once so the alert fires. Either way
it finishes the session on target or time. After a reload or
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
| Done with this page/question (next) | Next page / Next question | Space, Enter or → |
| Pause / resume | Center button | P |
| Undo the last one (redo it with a fresh timer) | Undo | U, Backspace, ⌘/Ctrl+Z |
| Restart this page's timer | Adjust → Restart | R |
| Auto-advance on / off | Adjust → Auto-advance | A |
| Sound on / off | Adjust → Sound | M |
| Change pace, length or target; end or reset | Sliders icon | — |
| List shortcuts | Keyboard icon | ? |

Enter also starts a session from the setup screen and closes the summary. Held
keys don't repeat, so holding Space can't skip through pages.

**Two sounds, on purpose.** When an item's time runs out you hear a ringing
two-note bell. When *you* finish one, you hear a short, soft pop and marimba
note. Finishing the last one plays the session-end arpeggio instead. Preview
both in Settings → Alerts.

## Layout

```
app/                 routes: / (setup → focus → summary), /library, /stats, /settings
components/focus/    setup, focus dashboard, adjust sheet, session summary
components/          shell, runtime engine, UI primitives, icons
lib/session.ts       pure timer engine (fully unit tested)
lib/units.ts         page/question wording per session mode
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
