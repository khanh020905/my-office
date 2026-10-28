// The timeline: one lane per session.
import { buildTimeline } from '../../shared/timeline.js';
import { state } from '../core/state.js';
import { $, el, fmtAgo, fmtBytes, fmtClock, hhmm, replay } from '../core/env.js';
import { renderer } from '../scene/renderer.js';
import { colorOf, dn, sessions } from '../people/workers.js';
import { toast } from '../ui/activity.js';
import { openSession } from '../ui/session-drawer.js';
import { renderBell } from '../ui/topbar.js';
import { closePlace } from '../interact/place-cards.js';
import { TOKEN } from '../net/live.js';
import { DEMO, connect, startDemo } from '../demo/demo.js';
import { dayKey, rangeOf, renderReplay, seekTo, startReplay } from './replay.js';
import { t as tr } from '../../i18n/index.js';

/* ---------- timeline: one lane per session (subagents indented), what it did and when, and how long it waited for
   you. Data from /api/timeline (built from the replay log); in the demo, from the events on screen. ---------- */
const tl = { range: '3h', data: null, timer: 0, loading: false };
const fmtSpan = (ms) => fmtAgo(Math.max(1, ms / 1000));
// A span kind's name, and a row's name (a subagent row the data left unnamed is called "subagent")
const kindLabel = (k) => tr(`timeline.kind.${k}`);
const rowName = (r) => r.name || (r.agent ? tr('timeline.subagent') : '');
async function fetchTimeline(range) {
  const { from, to } = rangeOf(range);
  if (DEMO) {
    const t0 = Math.min(from, ...state.feed.map((e) => e.ts));
    const items = [{ t: t0, m: { k: 'snap', sessions: [...sessions.values()].map((s) => ({ ...s, status: 'rest', lastPrompt: '' })) } }]
      .concat(state.feed.map((e) => ({ t: e.ts, m: { k: 'ev', e, s: sessions.get(e.sess) || null } })));
    return buildTimeline(items, from, to);
  }
  const r = await fetch(`/api/timeline?from=${from}&to=${to}${TOKEN ? `&k=${encodeURIComponent(TOKEN)}` : ''}`);
  return r.json();
}
async function loadTimeline(range = tl.range) {
  tl.range = range;
  for (const b of document.querySelectorAll('[data-tl]')) b.setAttribute('aria-pressed', String(b.dataset.tl === range));
  if (!tl.data) $('tl-scroll').replaceChildren(el('p', 'tl-empty', tr('common.loading')));
  try { tl.data = await fetchTimeline(range); } catch { $('tl-scroll').replaceChildren(el('p', 'tl-empty', tr('timeline.loadFailed'))); return; }
  renderTimeline();
}
function openTimeline() {
  $('tl').hidden = false; closePlace();
  tl.data = null; loadTimeline();
  clearInterval(tl.timer); tl.timer = setInterval(() => { if (!$('tl').hidden && tl.range !== 'yesterday' && document.visibilityState === 'visible') loadTimeline(); }, 30000);
  $('tl-close').focus({ preventScroll: true });
}
export function closeTimeline() { $('tl').hidden = true; clearInterval(tl.timer); $('tl-tip').hidden = true; }
function tlTicks(from, to) {
  const span = to - from, steps = [5, 10, 15, 30, 60, 120, 180, 360].map((m) => m * 60e3);
  const step = steps.find((s) => span / s <= 9) || 360 * 60e3, out = [];
  for (let t = Math.ceil(from / step) * step; t < to; t += step) out.push(t);
  return out;
}
function renderTimeline() {
  const d = tl.data; if (!d) return;
  const { from, to } = d, W = to - from, pct = (t) => `${((t - from) / W) * 100}%`;
  const T = d.totals || {};
  const kpi = (label, value, note, tone) => { const k = el('div', 'tl-kpi'); if (tone) k.dataset.tone = tone; k.append(el('b', null, value), el('span', null, label)); if (note) k.title = note; return k; };
  $('tl-kpis').replaceChildren(
    kpi(tr('timeline.kpi.wait'), T.wait ? fmtSpan(T.wait) : tr('time.min', { n: 0 }), tr('timeline.kpi.waitNote'), 'red'),
    kpi(tr('timeline.kpi.turn'), T.turn ? fmtSpan(T.turn) : tr('time.min', { n: 0 }), tr('timeline.kpi.turnNote'), 'amber'),
    kpi(tr('timeline.kpi.work'), T.work ? fmtSpan(T.work) : tr('time.min', { n: 0 }), tr('timeline.kpi.workNote')),
    kpi(tr('timeline.kpi.prompts'), String(T.prompts || 0)),
  );
  const leg = $('tl-legend'); leg.replaceChildren();
  for (const k of ['think', 'read', 'edit', 'shell', 'web', 'agent', 'wait', 'turn']) { const c = el('span', 'tl-leg'); const sw = el('i'); sw.dataset.k = k; c.append(sw, document.createTextNode(kindLabel(k))); leg.append(c); }
  const box = el('div', 'tl-grid');
  const axis = el('div', 'tl-row tl-axis'); const at = el('div', 'tl-track');
  for (const t of tlTicks(from, to)) { const k = el('span', 'tl-tick', hhmm(t)); k.style.left = pct(t); at.append(k); }
  axis.append(el('div', 'tl-name'), at); box.append(axis);
  if (!d.rows.length) box.append(el('p', 'tl-empty', tl.range === 'yesterday' ? tr('timeline.nothingYesterday') : tr('timeline.nothingHere')));
  d.rows.forEach((r, ri) => {
    const line = el('div', 'tl-row' + (r.agent ? ' tl-row--sub' : ''));
    const name = el('button', 'tl-name'); name.type = 'button';
    const s = sessions.get(r.sess), dot = el('i'); dot.style.background = r.agent ? 'var(--blue)' : s ? colorOf(s) : '#5E687B';
    const proj = !r.agent && s?.dir ? String(s.dir).split('/').filter(Boolean).pop() : '';
    const tt = r.totals, note = r.agent ? fmtSpan(tt.work) : `${proj ? proj + ' · ' : ''}${tr('timeline.rowWork', { time: fmtSpan(tt.work) })}${tt.wait > 60e3 ? ` · ${tr('timeline.rowWait', { time: fmtSpan(tt.wait) })}` : ''}`;
    name.append(dot, el('b', null, (!r.agent && (dn(s) || r.title)) || rowName(r)), el('small', null, note));
    name.title = s ? tr('timeline.openSession') : tr('timeline.sessionClosed');
    name.addEventListener('click', () => { if (sessions.has(r.sess)) { closeTimeline(); openSession(r.sess, r.agent ? { tab: 'subs', agent: r.agent } : {}); } else toast(tr('timeline.sessionClosedToast')); });
    const track = el('div', 'tl-track');
    r.spans.forEach((x, si) => {
      if (x[2] === 'idle') return;
      const b = el('div', 'tl-span'); b.dataset.k = x[2]; b.dataset.r = ri; b.dataset.s = si;
      b.style.left = pct(x[0]); b.style.width = `max(2px, ${((x[1] - x[0]) / W) * 100}%)`;
      track.append(b);
    });
    for (const [t, k, label] of r.marks) {
      if (k !== 'prompt' && k !== 'fail' && k !== 'deploy') continue;
      const m = el('div', 'tl-mark'); m.dataset.k = k; m.style.left = pct(t); m.dataset.t = t; m.dataset.label = label || ''; track.append(m);
    }
    if (to >= Date.now() - 60e3) { const now = el('div', 'tl-now'); now.style.left = pct(Date.now()); track.append(now); }
    line.append(name, track); box.append(line);
  });
  const sc = $('tl-scroll'), keep = sc.scrollTop;
  sc.replaceChildren(box); sc.scrollTop = keep;
  if (d.truncated) sc.append(el('p', 'tl-empty', tr('timeline.truncated')));
}
// tooltip + click on a span: "what, when, how long"; clicking replays that moment
function tlTarget(e) {
  const sp = e.target.closest('.tl-span'), mk = e.target.closest('.tl-mark');
  if (sp) { const r = tl.data.rows[+sp.dataset.r], x = r.spans[+sp.dataset.s]; return { r, t: x[0], title: kindLabel(x[2]), label: x[3], when: `${hhmm(x[0])}–${hhmm(x[1])} · ${fmtSpan(x[1] - x[0])}` }; }
  if (mk) { const r = tl.data.rows[+mk.closest('.tl-row').querySelector('.tl-span')?.dataset.r || 0]; return { r, t: +mk.dataset.t, title: ['prompt', 'fail', 'deploy'].includes(mk.dataset.k) ? tr(`timeline.mark.${mk.dataset.k}`) : undefined, label: mk.dataset.label, when: hhmm(+mk.dataset.t) }; }
  return null;
}
// the activity panel shows today's waiting time under its numbers
async function refreshWaitToday() {
  if (replay.on) return;
  try {
    const d = await fetchTimeline('today'), w = (d.totals?.wait || 0) + (d.totals?.turn || 0);
    $('tl-open-v').textContent = w > 60e3 ? tr('timeline.waitToday', { time: fmtSpan(w) }) : tr('timeline.hint');
  } catch { /* keep the old text */ }
}
// Recording: the whole tab when the browser lets us (getDisplayMedia, the person picks this tab), else just the 3D view.
// MP4 when the browser can encode it (Chrome does), since that is what Facebook and phones play; WebM otherwise.
export let recorder = null, recChunks = [], recStart = 0, recTimer = null, recAuto = false;
async function startRecording() {
  if (!window.MediaRecorder) { toast(tr('replay.rec.unsupported')); return; }
  let stream = null, whole = true;
  if (navigator.mediaDevices?.getDisplayMedia) {
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30, displaySurface: 'browser' }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' });
    } catch (e) { if (e?.name === 'NotAllowedError') { toast(tr('replay.rec.canceled')); return; } }
  }
  if (!stream) { stream = renderer.domElement.captureStream(30); whole = false; }
  const type = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
  try { recorder = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 10e6 } : undefined); }
  catch { stream.getTracks().forEach((t) => t.stop()); toast(tr('replay.rec.failed')); return; }
  recChunks = [];
  const rec = recorder;
  rec.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
  rec.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    const mime = rec.mimeType || type || 'video/webm', ext = mime.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(recChunks, { type: mime });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `my-office-${new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-').slice(0, 16)}.${ext}`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60e3);
    if (recorder === rec) recorder = null;
    clearInterval(recTimer); renderRec();
    toast(tr('replay.rec.saved', { ext: ext.toUpperCase(), size: fmtBytes(blob.size) }));
  };
  stream.getVideoTracks()[0]?.addEventListener('ended', stopRecording);
  // a recording made during a replay starts from the beginning and stops by itself at the end
  recAuto = replay.on;
  if (replay.on) { replay.i = 0; replay.clock = 0; seekTo(replay.from); replay.playing = true; replay.ended = false; replay.last = performance.now(); renderReplay(); }
  rec.start(1000); recStart = performance.now(); clearInterval(recTimer); recTimer = setInterval(renderRec, 500); renderRec();
  if (!whole) toast(tr('replay.rec.viewOnly'));
}
export function stopRecording() { if (recorder && recorder.state !== 'inactive') recorder.stop(); }
function renderRec() {
  const on = !!recorder && recorder.state === 'recording';
  $('rp-rec').setAttribute('aria-pressed', String(on)); document.body.classList.toggle('is-recording', on);
  $('rp-rec-l').textContent = on ? tr('replay.rec.stop', { time: fmtClock((performance.now() - recStart) / 1000) }) : tr('replay.rec.start');
}

export function setup() {
  $('tl-scroll').addEventListener('mousemove', (e) => {
    const tip = $('tl-tip'), x = tlTarget(e);
    if (!x) { tip.hidden = true; return; }
    tip.replaceChildren(el('b', null, x.title), el('em', null, x.when)); if (x.label) tip.append(el('span', null, x.label));
    tip.append(el('small', null, tr('timeline.tipClick')));
    const box = $('tl').getBoundingClientRect(); tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.transform = `translate(${Math.min(e.clientX - box.left + 14, box.width - w - 10)}px, ${Math.max(8, e.clientY - box.top - h - 12)}px)`;
  });
  $('tl-scroll').addEventListener('mouseleave', () => { $('tl-tip').hidden = true; });
  $('tl-scroll').addEventListener('click', async (e) => {
    const x = tlTarget(e); if (!x) return;
    if (DEMO) { toast(tr('timeline.demoNoReplay')); return; }
    closeTimeline();
    await startReplay(tl.range);
    if (replay.on) { seekTo(Math.max(replay.from, x.t - 15000)); renderReplay(); }
  });
  document.querySelector('.tl-ranges').addEventListener('click', (e) => { const b = e.target.closest('[data-tl]'); if (b) { tl.data = null; loadTimeline(b.dataset.tl); } });
  $('tl-close').addEventListener('click', closeTimeline);
  $('tl-open').addEventListener('click', openTimeline);
  $('tl-csv').addEventListener('click', () => {
    const d = tl.data; if (!d) return;
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`, ts = (t) => new Date(t).toLocaleString('sv-SE');
    const lines = [tr('timeline.csvHead')];
    for (const r of d.rows) for (const [s, e, k, label] of r.spans) if (k !== 'idle') lines.push([q(r.agent ? d.rows.find((x) => !x.agent && r.key.startsWith(x.key + '|'))?.name || '' : r.name), q(r.agent ? rowName(r) : ''), q(ts(s)), q(ts(e)), Math.round((e - s) / 1000), q(kindLabel(k)), q(label)].join(','));
    const a = el('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = tr('timeline.csvFile', { day: dayKey(d.from) }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(tr('timeline.csvSaved', { n: lines.length - 1 }));
  });
  setTimeout(refreshWaitToday, 4000);
   setInterval(refreshWaitToday, 120000);
  $('rp-rec').addEventListener('click', () => (recorder ? stopRecording() : startRecording()));
  if (DEMO) startDemo(); else connect();
  renderBell();
}
