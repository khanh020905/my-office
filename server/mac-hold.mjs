// Who holds a request that Claude Code asks about (a PermissionRequest or a question), and for how long.
// An office page or panel that has focus holds it the usual time. The menu bar app (menubar/MyOfficeBar.swift) holds it
// too, for a shorter time, but only while the owner is really at the Mac: the app is alive (it reads /api/panel every
// 3 seconds) and no key or mouse has been idle for long. Away from the Mac the phone holds it, when it can answer: approving
// from a phone is on and a phone gets push notifications. Then the request waits for the phone (a push says so at once)
// as long as the hook allows, at most 10 minutes, and goes back to Claude Code's own prompt the moment a key or the mouse
// moves on the Mac again. Otherwise nothing holds, and Claude Code asks in its own prompt as before, so a banner nobody
// sees never keeps Claude waiting.

/** the menu bar counts as alive when it read /api/panel this recently (ms) */
export const BAR_ALIVE_MS = 8000;
/** and the Mac as "at the desk" when no key or mouse has been idle for longer than this (seconds) */
export const BAR_IDLE_MAX_SEC = 120;
/** how long a request is held for the menu bar alone (ms; OFFICE_BAR_HOLD_MS shortens it for the tests) */
export const BAR_HOLD_MS = Math.min(20_000, Number(process.env.OFFICE_BAR_HOLD_MS) || 20_000);

/** the longest a request waits for the phone while the owner is away from the Mac (ms) */
export const PHONE_HOLD_MS = 10 * 60_000;
/** back at the Mac: a key or the mouse this recently (seconds) hands a request held for the phone back to Claude Code */
export const BACK_SEC = 20;

/**
 * Who holds a request and how long: { ms, by: 'phone' | 'page' | 'bar' | null } (ms 0 = nobody: Claude Code asks itself).
 * { focused: an office page/panel has focus, barAlive, idleSec (Infinity = not known), pref: "approve from the Mac's
 *   notifications" is on, normalMs: the usual hold, barMs: the short one, phone: a phone can answer (approving from a
 *   phone on, a phone subscribed to push), phoneMs: how long it may wait for one (the hook's own limit, at most 10 min) }
 * Away from the Mac comes first: an office page left open on the Mac has focus but nobody looks at it.
 */
export function holdPlan({ focused, barAlive, idleSec, pref, normalMs, barMs = BAR_HOLD_MS, phone = false, phoneMs = 0 }) {
  const known = Number.isFinite(idleSec);
  if (phone && phoneMs > 0 && known && idleSec >= BAR_IDLE_MAX_SEC) return { ms: phoneMs, by: 'phone' };
  if (focused) return { ms: normalMs, by: 'page' };
  if (pref && barAlive && known && idleSec < BAR_IDLE_MAX_SEC) return { ms: barMs, by: 'bar' };
  return { ms: 0, by: null };
}
/** the hold's length alone (ms) */
export const holdMs = (o) => holdPlan(o).ms;
/** a request held for the phone goes back to Claude Code when the owner is at the Mac again */
export const backAtMac = (idleSec) => Number.isFinite(idleSec) && idleSec < BACK_SEC;

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
    /** the idle seconds now, read again when the last reading is older than `maxAge` ms: a request coming in, or a hold for
     *  the phone watching for the owner's return, whether or not the app polls */
    async fresh(maxAge = every) {
      if (now() - idleAt < maxAge) return idleSec;
      try { const s = await idle(); idleSec = Number.isFinite(s) ? s : Infinity; } catch { idleSec = Infinity; }
      idleAt = now(); return idleSec;
    },
  };
}
