let sentinel: WakeLockSentinel | null = null;
let pending: Promise<void> | null = null;
let wanted = false;

export const wakeLockSupported = () =>
  typeof navigator !== "undefined" && "wakeLock" in navigator;

/**
 * Keep the screen on while `on`. The browser drops the lock whenever the page
 * is hidden, so call this again on visibilitychange to re-acquire it.
 */
export function setWakeLock(on: boolean) {
  wanted = on;
  if (!wakeLockSupported()) return;

  if (!on) {
    const s = sentinel;
    sentinel = null;
    s?.release().catch(() => {});
    return;
  }
  if (sentinel || pending || document.visibilityState !== "visible") return;

  pending = navigator.wakeLock
    .request("screen")
    .then((s) => {
      if (!wanted) {
        s.release().catch(() => {});
        return;
      }
      sentinel = s;
      s.addEventListener("release", () => {
        if (sentinel === s) sentinel = null;
      });
    })
    .catch(() => {})
    .finally(() => {
      pending = null;
    });
}
