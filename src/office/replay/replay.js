// Replay and recording.
import { state } from '../core/state.js';
import { $, fmtClock, hhmm, replay, officeNow } from '../core/env.js';
import { icon } from '../ui/icons.js';
import { leaving, leavingIds, sessions } from '../people/workers.js';
import { director } from '../people/director.js';
import { queueUi, renderFeed, toast } from '../ui/activity.js';
import { closeSession } from '../ui/session-drawer.js';
import { closeMac } from '../ui/mac-drawer.js';
import { fp } from '../interact/first-person.js';
import { TOKEN } from '../net/live.js';
import { unseenDone } from '../life/your-turn.js';
import { fails } from '../life/incidents.js';
import { perms, renderPerms } from '../ui/permissions.js';
import { DEMO, applyMsg, connect, dropSessionNow, liveES } from '../demo/demo.js';
import { recAuto, recorder, stopRecording } from './timeline.js';
import { t as tr } from '../../i18n/index.js';

/* ---------- replay: the last hour (or day) of the office at ×10–×120, and recording the tab to a video ----------
   The server keeps what it streamed (data/replay); the page fast-forwards from the nearest snapshot, then plays the
   events on a virtual clock. Quiet stretches longer than 3 s of playback are skipped. */
export const REPLAY_MOTION = 2;   // people walk faster in a replay so they keep up with the events
export const dayKey = (t) => new Date(t).toLocaleDateString('sv-SE');
export function rangeOf(r) {
  const now = Date.now(), d0 = new Date(); d0.setHours(0, 0, 0, 0);
  if (r === '3h') return { from: now - 3 * 3600e3, to: now };
  if (r === 'today') return { from: d0.getTime(), to: now };
  if (r === 'yesterday') return { from: d0.getTime() - 86400e3, to: d0.getTime() - 1 };
  return { from: now - 3600e3, to: now };
}
export async function startReplay(range = replay.range) {
  if (DEMO) { toast(tr('replay.demoNothing')); return; }
  if (replay.loading) return;
  replay.range = range; replay.loading = true; renderReplay();
  const { from, to } = rangeOf(range);
  let items = [];
  try {
    for (const day of [...new Set([dayKey(from), dayKey(to)])]) {
      const r = await fetch(`/api/replay?day=${day}&from=${from}&to=${to}${TOKEN ? `&k=${encodeURIComponent(TOKEN)}` : ''}`);
      items = items.concat((await r.json()).items || []);
    }
  } catch { replay.loading = false; renderReplay(); toast(tr('replay.loadFailed')); return; }
  replay.loading = false;
  const first = items.find((x) => x.t >= from);
  if (!first) {
    renderReplay();
    toast(range === 'yesterday' ? tr('replay.nothingYesterday') : tr('replay.nothingHere'));
    return;
  }
  if (!replay.on) {
    replay.on = true; document.body.classList.add('is-replay');
    perms.clear(); renderPerms(); closeMac(); if (state.selectedId) closeSession();
  }
  replay.items = items; replay.to = to;
  replay.from = Math.max(from, first.t - 5000);
  replay.i = 0; replay.clock = 0; seekTo(replay.from);
  replay.playing = true; replay.ended = false; replay.last = performance.now();
  drawHeat(); renderReplay();
}
function resetScene() {
  for (const id of [...sessions.keys()]) dropSessionNow(id);
  if (director) director.reset();
  for (const w of [...leaving]) w.remove();
  leaving.clear(); leavingIds.clear();
  state.feed = []; state.stats = {}; fails.length = 0; unseenDone.clear(); state.incidentUntil = 0; renderFeed(); queueUi();
}
export function seekTo(t) {
  if (t < replay.clock || replay.i === 0) { resetScene(); replay.i = 0; }
  replay.clock = t;
  while (replay.i < replay.items.length && replay.items[replay.i].t <= t) applyMsg(replay.items[replay.i++].m, true);
  for (const w of [...leaving]) w.remove();
  leaving.clear(); leavingIds.clear();
  renderFeed(); queueUi(); renderReplayTime(true);
}
export function replayTick() {
  const now = performance.now(), dt = Math.min(0.25, (now - replay.last) / 1000); replay.last = now;
  if (!replay.on || !replay.playing) return;
  const next = replay.items[replay.i];
  if (next && next.t - replay.clock > replay.speed * 3000) replay.clock = next.t - replay.speed * 500;   // skip a quiet stretch
  replay.clock = Math.min(replay.to, replay.clock + dt * 1000 * replay.speed);
  let n = 0;
  while (replay.i < replay.items.length && replay.items[replay.i].t <= replay.clock) applyMsg(replay.items[replay.i++].m, n++ > 30);
  if (replay.i >= replay.items.length && !next || replay.clock >= replay.to) {
    replay.playing = false; replay.ended = true; renderReplay();
    if (recorder && recAuto) setTimeout(stopRecording, 1500);
  }
  renderReplayTime();
}
let rtAt = 0, seeking = false;
function renderReplayTime(force = false) {
  const now = performance.now(); if (!force && now - rtAt < 200) return; rtAt = now;
  $('rp-now').textContent = hhmm(replay.clock, true);
  if (!seeking) $('rp-seek').value = String(Math.round(((replay.clock - replay.from) / Math.max(1, replay.to - replay.from)) * 1000));
  $('replay-chip').textContent = tr('replay.chip', { time: hhmm(replay.clock), speed: replay.speed });
}
export function renderReplay() {
  const on = replay.on;
  $('rp-bar').hidden = !on && !replay.loading;
  $('replay-chip').hidden = !on;
  $('live-tag').lastChild.textContent = on ? tr('replay.tagReplay') : tr('replay.tagLive');
  if (on) { const c = $('conn'); c.dataset.state = 'on'; c.lastElementChild.textContent = tr('replay.conn'); }
  $('btn-replay').setAttribute('aria-pressed', String(on));
  const play = $('rp-play'), ic = play.querySelector('.rp-ic');
  const want = replay.playing ? 'pause' : 'play';
  if (ic.dataset.shows !== want) { ic.dataset.shows = want; ic.replaceChildren(icon(want)); }
  play.setAttribute('aria-label', replay.playing ? tr('replay.pause') : replay.ended ? tr('replay.restart') : tr('replay.play'));
  for (const b of document.querySelectorAll('#rp-range [data-range]')) b.setAttribute('aria-pressed', String(b.dataset.range === replay.range));
  for (const b of document.querySelectorAll('#rp-speed [data-speed]')) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === replay.speed));
  const len = replay.to - replay.from, mins = Math.round(len / 60e3);
  const span = mins >= 60 ? (mins % 60 ? tr('time.hourMin', { h: Math.floor(mins / 60), m: mins % 60 }) : tr('time.hour', { n: Math.floor(mins / 60) })) : tr('time.min', { n: mins });
  $('rp-span').textContent = replay.loading ? tr('replay.loading') : on ? `${hhmm(replay.from)}–${hhmm(replay.to)} · ${span} → ${fmtClock(len / 1000 / replay.speed)}` : '';
  if (on) renderReplayTime(true);
}
// activity strip over the scrubber: one bar per slice; red where something failed, gold where something shipped
function drawHeat() {
  const c = $('rp-heat'), dpr = Math.min(2, devicePixelRatio || 1), w = Math.max(200, c.clientWidth || 600), h = c.clientHeight || 30;
  c.width = w * dpr; c.height = h * dpr;
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const N = Math.min(160, Math.floor(w / 4)), len = Math.max(1, replay.to - replay.from), b = new Array(N).fill(0), bad = new Array(N).fill(0), ship = new Array(N).fill(0);
  for (const x of replay.items) {
    if (x.m.k !== 'ev' || x.t < replay.from) continue;
    const k = Math.min(N - 1, Math.floor(((x.t - replay.from) / len) * N));
    b[k]++; if (x.m.e.type === 'fail') bad[k]++; if (x.m.e.type === 'deploy') ship[k]++;
  }
  const max = Math.max(4, ...b), bw = w / N;
  for (let k = 0; k < N; k++) {
    if (!b[k]) continue;
    const bh = Math.max(2, (Math.sqrt(b[k]) / Math.sqrt(max)) * (h - 4));
    g.fillStyle = bad[k] ? '#FF5A5A' : ship[k] ? '#FFD166' : 'rgba(255, 179, 71, .55)';
    g.fillRect(k * bw + 0.5, h - bh, Math.max(1, bw - 1), bh);
  }
}
function stopReplay() {
  if (!replay.on) { replay.loading = false; renderReplay(); return; }
  if (recorder) stopRecording();
  replay.on = false; replay.playing = false; replay.items = []; document.body.classList.remove('is-replay');
  resetScene(); state.connectedOnce = false;
  try { liveES?.close(); } catch { /* closed */ }
  connect(); renderReplay(); $('clock').textContent = hhmm(officeNow().getTime());
}

export function setup() {
  $('btn-replay').addEventListener('click', () => (replay.on ? stopReplay() : startReplay('1h')));
  $('rp-close').addEventListener('click', stopReplay);
  $('rp-play').addEventListener('click', () => {
    if (replay.ended) { replay.i = 0; replay.clock = 0; seekTo(replay.from); replay.ended = false; }
    replay.playing = !replay.playing; replay.last = performance.now(); renderReplay();
  });
  $('rp-seek').addEventListener('pointerdown', () => { seeking = true; });
  addEventListener('pointerup', () => { seeking = false; });
  $('rp-seek').addEventListener('input', (e) => {
    const t = replay.from + (Number(e.target.value) / 1000) * (replay.to - replay.from);
    seekTo(t); replay.ended = false; renderReplay();
  });
  $('rp-range').addEventListener('click', (e) => { const b = e.target.closest('[data-range]'); if (b) startReplay(b.dataset.range); });
  $('rp-speed').addEventListener('click', (e) => { const b = e.target.closest('[data-speed]'); if (b) { replay.speed = Number(b.dataset.speed); renderReplay(); } });
  document.addEventListener('keydown', (e) => {
    if (!replay.on || e.code !== 'Space' || fp.on || e.target.closest?.('input, textarea, select, button, [contenteditable="true"]')) return;
    e.preventDefault(); $('rp-play').click();
  });
  addEventListener('resize', () => { if (replay.on) drawHeat(); });
}
