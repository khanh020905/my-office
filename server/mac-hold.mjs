// Who holds a request that Claude Code asks about (a PermissionRequest or a question), and for how long.
// An office page or panel that has focus holds it the usual time. The menu bar app (menubar/MyOfficeBar.swift) holds it
// too, for a shorter time, but only while the owner is really at the Mac: the app is alive (it reads /api/panel every
// 3 seconds) and no key or mouse has been idle for long. Away from the Mac nothing holds, and Claude Code asks in its own
// prompt (or the phone flow) as before, so a banner nobody sees never keeps Claude waiting.

/** the menu bar counts as alive when it read /api/panel this recently (ms) */
export const BAR_ALIVE_MS = 8000;
/** and the Mac as "at the desk" when no key or mouse has been idle for longer than this (seconds) */
export const BAR_IDLE_MAX_SEC = 120;
/** how long a request is held for the menu bar alone (ms; OFFICE_BAR_HOLD_MS shortens it for the tests) */
export const BAR_HOLD_MS = Math.min(20_000, Number(process.env.OFFICE_BAR_HOLD_MS) || 20_000);

/**
 * How long to hold a request, in ms: 0 = not at all (Claude Code asks itself).
 * { focused: an office page/panel has focus, barAlive, idleSec, pref: "approve from the Mac's notifications" is on,
 *   normalMs: the usual hold, barMs: the short one }
 */
export function holdMs({ focused, barAlive, idleSec, pref, normalMs, barMs = BAR_HOLD_MS }) {
  if (focused) return normalMs;
  if (pref && barAlive && Number.isFinite(idleSec) && idleSec < BAR_IDLE_MAX_SEC) return barMs;
  return 0;
}

/** the menu bar's side of it: when it last read /api/panel, and the Mac's idle seconds, read at most every `every` ms */
export function createBarWatch({ idle, every = 10_000, now = Date.now }) {
  let seenAt = 0, idleSec = Infinity, idleAt = 0, reading = false;
  return {
    /** the menu bar read /api/panel */
    seen() {
      const t = now(); seenAt = t;
      if (!reading && t - idleAt >= every) {
        reading = true;
        Promise.resolve(idle()).then((s) => { idleSec = Number.isFinite(s) ? s : Infinity; idleAt = now(); }).catch(() => { idleSec = Infinity; }).finally(() => { reading = false; });
      }
    },
    alive: () => now() - seenAt < BAR_ALIVE_MS,
    idleSec: () => idleSec,
  };
}
