// The page's clocks, in 2D and 3D alike: the time in the top bar, the open session's header, the Mac's readings. And the
// ?debug hook's first entries (the sessions, a message as if from the server), which the 3D world adds to when built.
import { state } from '../core/state.js';
import { $, hhmm, officeNow } from '../core/env.js';
import { wxChip } from '../life/weather.js';
import { renderSessionHead } from './session-drawer.js';
import { loadMac, pollMac } from './mac-drawer.js';
import { sessions, workers } from '../people/workers.js';
import { upsertSession } from '../net/live.js';
import { applyMsg, demoTimers } from '../demo/demo.js';

export function setup() {
  const now = () => hhmm(officeNow().getTime()) + wxChip();
  $('clock').textContent = now();
  setInterval(() => {
    { const v = now(), c = $('clock'); if (c.textContent !== v) c.textContent = v; }   // (changes once a minute)
    if (state.selectedId) renderSessionHead();
  }, 1000);
  loadMac();
  state.macTimer = setInterval(pollMac, 30000);
  if (new URLSearchParams(location.search).has('debug')) addHook({ get workers() { return workers; }, get sessions() { return sessions; }, upsert: (x) => upsertSession(x, true), emit: (m) => applyMsg(m),
    get feed() { return state.feed; }, pauseDemo: () => { demoTimers.forEach(clearTimeout); demoTimers.clear(); } });
}
/** ?debug: entries added to window.__office (getters stay getters). */
export function addHook(o) { window.__office = Object.defineProperties(window.__office || {}, Object.getOwnPropertyDescriptors(o)); }
