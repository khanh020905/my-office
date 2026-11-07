// The production departments board (world/pro/wing.js deptBoard): a page-side agent model (shared/agent-events.js)
// fed by the same events the office sees, counted per department (shared/departments.js). Agents a real event could not
// place in a department are not counted anywhere; stale agents drop out (the model turns them 'unknown').
import { createAgentModel, STALE_MS } from '../../shared/agent-events.js';
import { deptBoard } from '../world/pro/wing.js';

const model = createAgentModel();
const ACTIVE = new Set(['running', 'reviewing', 'blocked', 'waiting']);
let timer = 0;

export function deptCounts(snap, now) {
  const c = {};
  for (const a of snap) {
    if (!a.dept) continue;
    const failed = a.state === 'failed' && now - a.lastAt < STALE_MS;
    if (!ACTIVE.has(a.state) && !failed) continue;
    const r = (c[a.dept] ||= { active: 0, review: 0, failed: 0 });
    if (failed) r.failed++; else r.active++;
    if (a.state === 'reviewing') r.review++;
  }
  return c;
}
function redraw() { timer = 0; const now = Date.now(); deptBoard(deptCounts(model.snapshot(now), now)); }

export function deptEvent(e) { if (model.ingest(e) && !timer) timer = setTimeout(redraw, 1000); }   // at most one redraw a second
if (typeof setInterval === 'function') setInterval(redraw, 30e3);   // so agents gone quiet leave the board
