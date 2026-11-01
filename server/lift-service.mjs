// The lift's servicing after a restart (a scene the office draws: life/lift-service.js). For the first minutes after the
// server starts, the building's technician is at the lift and everyone takes the stairs: three minutes, five when the
// server starts on a build it has not run before (the last build is kept in data/lift.json). A build serviced that way
// gets an inspection sticker in the car, kept with the build, so a restart on the same build still shows it. The first
// start ever is not a new build (nothing to compare with), as Claude Code's first version seen is no news
// (claude-version.mjs). Nothing waits for it: the office works the same, only its people walk down.
import fs from 'node:fs';
import path from 'node:path';

export const SERVICE_MS = 3 * 60e3, NEW_BUILD_MS = 5 * 60e3;

/** What this start means, from what was kept last time (`last`: { build, sticker } or null), this build's id, the
    time and the office's version: { since, until, newBuild, sticker } (sticker: { build, version, at } or null). */
export function planService(last, build, now, version = '') {
  const newBuild = !!build && !!last?.build && last.build !== build;
  const until = now + (newBuild ? NEW_BUILD_MS : SERVICE_MS);
  // (put up at the end of this servicing; one from before, if it was for this same build)
  const sticker = newBuild ? { build, version, at: until } : build && last?.sticker?.build === build ? last.sticker : null;
  return { since: now, until, newBuild, sticker };
}

/** Reads and updates data/lift.json once, at start. pub(): what the pages get (in the live snapshot): { left: ms of
    servicing still to go (0: done), total, newBuild, sticker: { version, at, build: its first 7 characters } or null }.
    `left`, not a time: a phone's clock needn't agree with the Mac's. */
export function createLiftService({ dataDir, build = '', version = '', now = Date.now() }) {
  const file = path.join(dataDir, 'lift.json');
  let last = null;
  try { last = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* the first start */ }
  const plan = planService(last, build, now, version);
  try { fs.writeFileSync(file, JSON.stringify({ build: build || last?.build || '', sticker: plan.sticker })); } catch { /* read-only data: next time is a "first" start too */ }
  return {
    plan,
    pub: (t = Date.now()) => ({ left: Math.max(0, plan.until - t), total: plan.until - plan.since, newBuild: plan.newBuild,
      sticker: plan.sticker && { version: plan.sticker.version || '', at: plan.sticker.at, build: String(plan.sticker.build).slice(0, 7) } }),
  };
}
