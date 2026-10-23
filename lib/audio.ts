import type { AlertKind, UpcomingAlert } from "./session";

/** Timer alerts, plus "complete" for when the user finishes a page or question. */
export type Sound = AlertKind | "complete" | "test";

type Overtone = [ratio: number, gain: number, decaySeconds: number];

// Fundamental plus two inharmonic partials: a soft bell that rings out (timer alerts).
const BELL: Overtone[] = [
  [1, 0.42, 1.7],
  [2.76, 0.12, 0.77],
  [5.4, 0.04, 0.37],
];
const BELL_LONG: Overtone[] = BELL.map(([r, g, d]) => [r, g, d * (2.4 / 1.7)]);

// Strong fourth harmonic and a fast decay: a short, wooden marimba note (completion).
const MARIMBA: Overtone[] = [
  [1, 0.3, 0.45],
  [3.99, 0.07, 0.07],
  [9.8, 0.015, 0.025],
];

interface Scheduled {
  at: number;
  kind: AlertKind;
  ctxTime: number;
  nodes: AudioScheduledSourceNode[];
}

/** Nodes starting within this many seconds are left alone (they're about to play). */
const KEEP_WINDOW = 0.08;
const MATCH_MS = 25;
/** Re-anchor when the audio clock and wall clock disagree by more than this (s). */
const DRIFT_LIMIT = 0.25;

type AudioContextCtor = typeof AudioContext;

function getCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Synthesized alert chimes. Page alerts are scheduled ahead of time on the
 * audio clock, which keeps running (and on time) in background tabs where
 * timers are throttled. If the audio clock stalls — device sleep, iOS
 * suspending the page — the drift check cancels and re-anchors the schedule
 * so nothing plays late.
 */
class AlertAudio {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private scheduled: Scheduled[] = [];
  private anchor: { ctx: number; epoch: number } | null = null;
  private volume = 0.8;

  get supported() {
    return getCtor() !== null;
  }

  get ready() {
    return this.ctx?.state === "running";
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = getCtor();
    if (!Ctor) return null;
    const ctx = new Ctor({ latencyHint: "interactive" });
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.ratio.value = 12;
    const out = ctx.createGain();
    out.gain.value = this.volume;
    out.connect(limiter).connect(ctx.destination);
    ctx.addEventListener("statechange", () => {
      if (ctx.state !== "running") this.anchor = null;
    });
    this.ctx = ctx;
    this.out = out;
    return ctx;
  }

  /** Must run inside a user gesture at least once (autoplay policy, iOS). */
  unlock(): Promise<boolean> {
    const ctx = this.ensure();
    if (!ctx) return Promise.resolve(false);
    try {
      // A silent buffer started within the gesture unlocks iOS Safari.
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    } catch {}
    if (ctx.state === "running") return Promise.resolve(true);
    return ctx.resume().then(
      () => ctx.state === "running",
      () => false,
    );
  }

  setVolume(volume: number) {
    this.volume = volume;
    if (this.ctx && this.out) this.out.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02);
  }

  play(kind: Sound): boolean {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return false;
    this.render(kind, ctx.currentTime + 0.02);
    return true;
  }

  /** Make the pre-scheduled chimes match `alerts`. Idempotent; call freely. */
  sync(alerts: UpcomingAlert[]) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") {
      this.cancelFuture();
      return;
    }
    const nowEpoch = Date.now();
    if (!this.anchor || Math.abs(this.drift(nowEpoch)) > DRIFT_LIMIT) {
      this.cancelFuture();
      this.anchor = { ctx: ctx.currentTime, epoch: nowEpoch };
    }
    const anchor = this.anchor;
    const due = ctx.currentTime + KEEP_WINDOW;
    const matches = (a: { at: number; kind: AlertKind }, b: { at: number; kind: AlertKind }) =>
      a.kind === b.kind && Math.abs(a.at - b.at) <= MATCH_MS;

    const kept: Scheduled[] = [];
    for (const entry of this.scheduled) {
      if (entry.ctxTime < ctx.currentTime - 5) continue; // long finished
      if (entry.ctxTime <= due || alerts.some((a) => matches(a, entry))) kept.push(entry);
      else this.stop(entry);
    }
    for (const alert of alerts) {
      if (kept.some((e) => matches(alert, e))) continue;
      const ctxTime = anchor.ctx + (alert.at - anchor.epoch) / 1000;
      if (ctxTime <= due) continue;
      kept.push({ ...alert, ctxTime, nodes: this.render(alert.kind, ctxTime) });
    }
    this.scheduled = kept;
  }

  /** True if a chime for the alert at `at` was scheduled and has started. */
  played(at: number): boolean {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return false;
    return this.scheduled.some(
      (e) => Math.abs(e.at - at) <= MATCH_MS && e.ctxTime <= ctx.currentTime + 0.15,
    );
  }

  cancelFuture() {
    const now = this.ctx?.currentTime ?? 0;
    this.scheduled = this.scheduled.filter((e) => {
      if (e.ctxTime > now + KEEP_WINDOW) {
        this.stop(e);
        return false;
      }
      return true;
    });
  }

  private drift(nowEpoch: number): number {
    if (!this.ctx || !this.anchor) return 0;
    return this.ctx.currentTime - (this.anchor.ctx + (nowEpoch - this.anchor.epoch) / 1000);
  }

  private stop(entry: Scheduled) {
    for (const node of entry.nodes) {
      try {
        node.stop();
        node.disconnect();
      } catch {}
    }
  }

  private render(kind: Sound, t: number): AudioScheduledSourceNode[] {
    if (kind === "complete") {
      // A quick upward pop landing on a marimba note: short, warm, "done".
      return [this.pop(t), ...this.tone(1046.5, t + 0.055, MARIMBA)];
    }
    // Time's up: a bright rising fifth. End: a four-note arpeggio that resolves.
    if (kind === "end") {
      return [783.99, 987.77, 1174.66, 1567.98].flatMap((f, i) => this.tone(f, t + i * 0.14, BELL_LONG));
    }
    return [880, 1318.51].flatMap((f, i) => this.tone(f, t + i * 0.16, BELL));
  }

  private tone(freq: number, t: number, partials: Overtone[]): AudioScheduledSourceNode[] {
    const ctx = this.ctx!;
    return partials.map(([ratio, gain, decay]) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * ratio;
      return this.voice(osc, gain, t, decay);
    });
  }

  private pop(t: number): AudioScheduledSourceNode {
    const osc = this.ctx!.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(980, t + 0.07);
    return this.voice(osc, 0.3, t, 0.14);
  }

  /** Fast attack, exponential decay, then clean up the nodes. */
  private voice(osc: OscillatorNode, gain: number, t: number, decay: number): AudioScheduledSourceNode {
    const ctx = this.ctx!;
    const end = t + decay;
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(env).connect(this.out!);
    osc.start(t);
    osc.stop(end + 0.05);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
    return osc;
  }
}

export const alertAudio = new AlertAudio();

export const canVibrate = () =>
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

export function vibrate(kind: AlertKind | "complete") {
  if (!canVibrate()) return;
  // Browsers refuse (and log) vibration before the first user interaction.
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (activation && !activation.hasBeenActive) return;
  try {
    const pattern = { end: [260, 120, 260, 120, 480], page: [170, 90, 170], complete: [24] };
    navigator.vibrate(pattern[kind]);
  } catch {}
}
