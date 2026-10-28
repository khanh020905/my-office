// The whiteboard: agents' tasks and your own sticky notes.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { V2, el, fmtAgo, nowMs, rand, stage } from '../core/env.js';
import { icon } from './icons.js';
import { BASE_ZOOM, camera, composer, fpCam, renderer, scene } from '../scene/renderer.js';
import { mat } from '../scene/blocks.js';
import { STICKY_COLORS, STICKY_SLOTS, board, boardFace } from '../world/furniture/board.js';
import { ADJ, DESK_SPOTS, NODES, STATIONS, route, standBy, wayTo } from '../people/navigation.js';
import { colorOf, dn, sessions, subs, workers } from '../people/workers.js';
import { director } from '../people/director.js';
import { applyWeather, wx } from '../life/weather.js';
import { toast } from './activity.js';
import { openSession, toggleSession } from './session-drawer.js';
import { openMac } from './mac-drawer.js';
import { PROPS, activateProp, buildProps, floorLamps, pickPerson, pickProp, propMeshes, setHoverProp } from '../interact/props.js';
import * as errands from '../people/errands.js';
import { goOut, outing } from '../people/outings.js';
import { THEME } from '../world/backdrops/index.js';
import * as gatherings from '../people/gatherings.js';
import { PLACES, chipCovered } from '../interact/place-chips.js';
import { agoText, closePlace, openPlace, plButton, plEmpty, plGroup, plRow, plcState, renderPlace } from '../interact/place-cards.js';
import { blocked, fp, toStreet } from '../interact/first-person.js';
import { TOKEN, upsertSession } from '../net/live.js';
import { sfx } from '../audio/sfx.js';
import { DEMO, applyMsg, demoTimers } from '../demo/demo.js';
import { focusTarget } from '../core/loop.js';
import { napOn } from '../life/nap.js';
import { sendParcel, staff, startCleaner } from '../people/staff.js';
import { mondayStandup } from '../people/gatherings.js';
import { teatime } from '../people/teatime.js';
import { t as tr } from '../../i18n/index.js';

let boardAt = 0;
// the demo's to-dos: the text is a getter, so it is translated when the demo copies it, not at module load
const demoTodo = (id, done) => ({ id, get text() { return tr(`board.demo.${id}`); }, done });
export const DEMO_TODOS = [demoTodo('d1', false), demoTodo('d2', true), demoTodo('d3', false)];
async function todoApi(body) {
  if (DEMO) {
    if (body.op === 'add') state.todos.push({ id: Math.random().toString(36).slice(2, 8), text: body.text, done: false, at: Date.now() });
    else if (body.op === 'toggle') { const t = state.todos.find((x) => x.id === body.id); if (t) { t.done = !t.done; t.doneAt = t.done ? Date.now() : 0; } }
    else if (body.op === 'del') state.todos = state.todos.filter((x) => x.id !== body.id);
    else if (body.op === 'clear') state.todos = state.todos.filter((x) => !x.done);
    onTodos(); return true;
  }
  try {
    const r = await fetch(`/api/todos${TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (Array.isArray(d.todos)) { state.todos = d.todos; onTodos(); }
    if (!d.ok) toast(d.message || tr('board.saveFailed'));
    return !!d.ok;
  } catch { toast(tr('board.saveOffline')); return false; }
}
export function onTodos() { state.boardDirty = true; if (plcState.id === 'board') renderPlace(); }
const TASK_ORDER = { wait: 0, doing: 1, done: 2 };
function agentTasks() {
  return [...sessions.values()].filter((s) => s.lastPrompt).map((s) => ({ s, state: s.status === 'wait' ? 'wait' : s.status === 'work' ? 'doing' : 'done' }))
    .sort((a, b) => TASK_ORDER[a.state] - TASK_ORDER[b.state] || (b.s.taskStart || 0) - (a.s.taskStart || 0));
}
const myTodos = () => [...state.todos.filter((t) => !t.done), ...state.todos.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0))];
// board canvas: 1024 x 512 over a 3.1 x 1.55 m face. Canvas x maps to board z as z = (0.5 - x / 1024) * 3.1.
const BW = 1024, BH = 512;
let boardCanvas;
let boardTex2;
const FB = '"Be Vietnam Pro", system-ui, sans-serif';
// In streamer mode the board shows grey bars where the words would be.
function boardText(g, text, x, y, max) {
  const t = fitText(g, text, max);
  if (!state.streamer) { g.fillText(t, x, y); return g.measureText(t).width; }
  const w = Math.min(max, g.measureText(t).width), h = parseInt(g.font.match(/(\d+)px/)?.[1] || '20', 10) * 0.55, c = g.fillStyle;
  g.fillStyle = 'rgba(120,128,142,.35)'; g.beginPath(); g.roundRect(x, y - h, w, h, h / 2); g.fill(); g.fillStyle = c;
  return w;
}
function fitText(g, text, max) { if (g.measureText(text).width <= max) return text; let lo = 0, hi = text.length; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g.measureText(text.slice(0, m) + '…').width <= max) lo = m; else hi = m - 1; } return text.slice(0, lo).trimEnd() + '…'; }
let boardSig = '';
function drawBoard(t) {
  // redraw only when what the board says has changed (or a row is flashing)
  const pulsing = state.boardPulse.until > t;
  const sig = JSON.stringify([state.streamer, state.todos, agentTasks().map((x) => [x.s.id, x.state, dn(x.s), x.s.lastPrompt, x.s.desk, (x.s.todos || []).map((k) => k.status).join('')])]);
  if (sig === boardSig && !pulsing) return;
  boardSig = pulsing ? '' : sig;
  const g = boardCanvas.getContext('2d');
  g.fillStyle = '#FBFBF7'; g.fillRect(0, 0, BW, BH);
  g.fillStyle = 'rgba(43,58,85,.05)'; for (let i = 0; i < 9; i++) g.fillRect(0, 40 + i * 52, BW, 1);   // faint ruled lines
  const tasks = agentTasks(), n = (k) => tasks.filter((x) => x.state === k).length;
  g.fillStyle = '#22304A'; g.font = `800 46px ${FB}`; g.fillText(tr('board.title').toUpperCase(), 40, 70);
  g.font = `600 22px ${FB}`; g.fillStyle = '#6B7486';
  const sum = [n('doing') && tr('board.sumDoing', { n: n('doing') }), n('wait') && tr('board.sumWait', { n: n('wait') }), n('done') && tr('board.sumDone', { n: n('done') })].filter(Boolean).join(' · ');
  g.fillText(sum || tr('board.sumNone'), 40, 104);
  const rows = tasks.slice(0, 5);
  rows.forEach((x, i) => {
    const y = 132 + i * 72, s = x.s, col = colorOf(s);
    if (state.boardPulse.id === s.id && state.boardPulse.until > t) { g.fillStyle = `rgba(255,214,102,${0.25 + 0.25 * Math.sin(t * 9)})`; g.fillRect(28, y - 6, 552, 66); }
    g.lineWidth = 4; g.strokeStyle = x.state === 'done' ? '#2E9E62' : x.state === 'wait' ? '#E0912A' : '#22304A';
    g.beginPath(); g.roundRect(40, y + 6, 32, 32, 7); g.stroke();
    if (x.state === 'done') { g.fillStyle = '#2E9E62'; g.fill(); g.strokeStyle = '#FFFFFF'; g.lineWidth = 4.5; g.beginPath(); g.moveTo(47, y + 22); g.lineTo(54, y + 30); g.lineTo(66, y + 14); g.stroke(); }
    else if (x.state === 'wait') { g.fillStyle = '#E0912A'; g.font = `900 26px ${FB}`; g.textAlign = 'center'; g.fillText('!', 56, y + 32); g.textAlign = 'left'; }
    else { g.fillStyle = '#E8730E'; g.beginPath(); g.arc(56, y + 22, 6 + Math.sin(t * 5) * 1.5, 0, 7); g.fill(); }
    g.fillStyle = col; g.font = `800 19px ${FB}`; boardText(g, dn(s).toUpperCase(), 88, y + 16, 330);
    const td = s.todos || [], tdDone = td.filter((k) => k.status === 'done').length;
    let right = 576;
    if (td.length) {
      g.font = `700 18px ${FB}`; const lab = `${tdDone}/${td.length}`, lw = g.measureText(lab).width;
      g.fillStyle = '#6B7486'; g.fillText(lab, right - lw, y + 16);
      const bw = 70; g.fillStyle = '#E3E6EC'; g.fillRect(right - lw - bw - 10, y + 6, bw, 9); g.fillStyle = '#2E9E62'; g.fillRect(right - lw - bw - 10, y + 6, bw * (tdDone / td.length), 9);
    }
    g.font = `500 26px ${FB}`; g.fillStyle = x.state === 'done' ? '#8A93A3' : '#22304A';
    const w = boardText(g, s.lastPrompt, 88, y + 48, right - 88);
    if (x.state === 'done' && !state.streamer) { g.fillStyle = '#8A93A3'; g.fillRect(88, y + 39, w, 2.5); }
  });
  if (!rows.length) { g.fillStyle = '#8A93A3'; g.font = `500 24px ${FB}`; g.fillText(tr('board.emptyLine1'), 40, 170); g.fillText(tr('board.emptyLine2'), 40, 204); }
  if (tasks.length > 5) { g.fillStyle = '#6B7486'; g.font = `600 20px ${FB}`; g.fillText(tr('board.more', { n: tasks.length - 5 }), 88, 132 + 5 * 72 - 4); }
  // right half: your sticky notes
  g.strokeStyle = 'rgba(43,58,85,.12)'; g.lineWidth = 2; g.beginPath(); g.moveTo(600, 34); g.lineTo(600, 486); g.stroke();
  const open = state.todos.filter((x) => !x.done).length;
  g.fillStyle = '#22304A'; g.font = `800 26px ${FB}`; g.fillText(tr('board.yours').toUpperCase(), 626, 70);
  g.fillStyle = '#6B7486'; g.font = `600 20px ${FB}`; g.fillText(state.todos.length ? tr('board.open', { n: open }) : tr('board.clickToAdd'), 626, 100);
  const mine = myTodos();
  if (mine.length < STICKY_SLOTS.length) {   // a dashed "add" note in the next free slot
    const sl = STICKY_SLOTS[mine.length], cx = (0.5 - sl.z / 3.1) * BW, cy = (0.5 - sl.y / 1.55) * BH, s = (0.36 / 3.1) * BW;
    g.setLineDash([10, 8]); g.strokeStyle = 'rgba(43,58,85,.35)'; g.lineWidth = 3; g.strokeRect(cx - s / 2, cy - s / 2, s, s); g.setLineDash([]);
    g.fillStyle = 'rgba(43,58,85,.5)'; g.font = `800 40px ${FB}`; g.textAlign = 'center'; g.fillText('+', cx, cy + 4); g.font = `600 15px ${FB}`; g.fillText(tr('board.addNote'), cx, cy + 30); g.textAlign = 'left';
  }
  if (mine.length > STICKY_SLOTS.length) { g.fillStyle = '#6B7486'; g.font = `600 18px ${FB}`; g.fillText(tr('board.more', { n: mine.length - STICKY_SLOTS.length }), 626, 482); }
  boardTex2.needsUpdate = true;
  syncStickies(mine);
}
function stickyTex(m, text, done, color) {
  const c = m.userData.canvas || (m.userData.canvas = Object.assign(document.createElement('canvas'), { width: 192, height: 192 }));
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 192, 192);
  g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(0, 0, 192, 22);
  g.fillStyle = done ? 'rgba(40,40,40,.45)' : '#2E2B26'; g.font = `600 23px ${FB}`;
  const words = text.split(/\s+/), lines = []; let cur = '';
  for (const w of words) { const t2 = cur ? cur + ' ' + w : w; if (g.measureText(t2).width > 164 && cur) { lines.push(cur); cur = w; } else cur = t2; }
  if (cur) lines.push(cur);
  const shown = lines.slice(0, 5); if (lines.length > 5) shown[4] = fitText(g, shown[4] + '…', 164);
  shown.forEach((l, i) => { const w = boardText(g, l, 14, 52 + i * 28, 168); if (done && !state.streamer) g.fillRect(14, 44 + i * 28, w, 2.5); });
  if (done) { g.strokeStyle = '#2E9E62'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(132, 160); g.lineTo(148, 176); g.lineTo(178, 140); g.stroke(); }
  const tex = m.userData.tex || (m.userData.tex = new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  return tex;
}
export const stickyNotes = [];
function syncStickies(mine) {
  STICKY_SLOTS.forEach((sl, i) => {
    const t = mine[i];
    let n = stickyNotes[i];
    if (!t) { if (n) n.g.visible = false; return; }
    if (!n) {
      const g = new THREE.Group(); g.position.set(0.075, sl.y, sl.z); board.add(g);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), new THREE.MeshStandardMaterial({ roughness: 0.95 }));
      face.rotation.y = Math.PI / 2; face.position.x = 0.012; g.add(face);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.36, 0.36), mat('#FFE787', { roughness: 1 })); back.castShadow = true; g.add(back);
      g.rotation.x = rand(-0.08, 0.08); g.scale.setScalar(0.01);
      n = stickyNotes[i] = { g, face, back, key: '' };
      for (const m of [face, back]) { m.userData.prop = PROPS.get('board'); propMeshes.push(m); PROPS.get('board')?.meshes.push(m); }
    }
    const color = t.done ? '#E6E2D6' : STICKY_COLORS[(t.id.charCodeAt(0) + t.id.charCodeAt(t.id.length - 1)) % STICKY_COLORS.length];
    const key = `${t.id}|${t.text}|${t.done}`;
    if (n.key !== key) {
      const fresh = !n.key || n.key.split('|')[0] !== t.id;
      n.key = key; n.face.material.map = stickyTex(n.face, t.text, t.done, color); n.face.material.needsUpdate = true; n.back.material.color.set(color);
      if (fresh) n.g.scale.setScalar(0.01);
    }
    n.g.visible = true;
  });
}
export function boardContent() {
  const body = el('div', 'pl-board');
  const agents = el('div'); agents.dataset.part = 'agents';
  const tasks = agentTasks();
  agents.append(plGroup(tr('board.agentTasks')));
  if (!tasks.length) agents.append(plEmpty(tr('board.agentEmpty')));
  const STATE = { wait: ['alert', 'red'], doing: ['sparkle', 'green'], done: ['check', null] };
  for (const x of tasks) {
    const s = x.s, [ic, tone] = STATE[x.state];
    const meta = x.state === 'done' ? tr('board.metaDone', { name: dn(s), ago: agoText(s.doneAt || s.lastAt) })
      : tr(x.state === 'wait' ? 'board.metaWait' : 'board.metaDoing', { name: dn(s), time: s.taskStart ? fmtAgo((nowMs() - s.taskStart) / 1000) : '' });
    const r = plRow({ ic, tone, color: colorOf(s), title: s.lastPrompt, meta, onClick: () => openSession(s.id) });
    r.dataset.state = x.state;
    agents.append(r);
    if (s.todos?.length) {
      const ul = el('ul', 'pl-todos');
      for (const k of s.todos.slice(0, 8)) { const li = el('li'); li.dataset.status = k.status; li.append(el('span', 'md-box', k.status === 'done' ? '✓' : ''), el('span', null, k.text)); ul.append(li); }
      agents.append(ul);
    }
  }
  const mine = el('div'); mine.dataset.part = 'mine';
  const ul = el('ul', 'todo-list');
  for (const t of myTodos()) {
    const li = el('li'); li.dataset.done = String(!!t.done);
    const cb = el('button', 'todo-check'); cb.type = 'button'; cb.setAttribute('role', 'checkbox'); cb.setAttribute('aria-checked', String(!!t.done)); cb.setAttribute('aria-label', t.done ? tr('board.markUndone') : tr('board.markDone'));
    cb.append(icon('check'));
    cb.addEventListener('click', () => { if (!t.done) sfx.play('pop'); todoApi({ op: 'toggle', id: t.id }); });
    const del = el('button', 'todo-del'); del.type = 'button'; del.setAttribute('aria-label', tr('board.deleteTodo', { text: t.text })); del.append(icon('x'));
    del.addEventListener('click', () => todoApi({ op: 'del', id: t.id }));
    li.append(cb, el('span', 'todo-txt', t.text), del); ul.append(li);
  }
  if (!state.todos.length) mine.append(plEmpty(tr('board.mineEmpty')));
  else mine.append(ul);
  const nDone = state.todos.filter((t) => t.done).length;
  if (nDone) mine.append(plButton(tr('board.clearDone', { n: nDone }), () => todoApi({ op: 'clear' }), 'btn--ghost'));
  const form = el('form', 'todo-add');
  const input = el('input'); input.type = 'text'; input.maxLength = 140; input.placeholder = tr('board.addPlaceholder'); input.setAttribute('aria-label', tr('board.addLabel')); input.enterKeyHint = 'done';
  const add = el('button', 'btn btn--sm btn--accent', tr('board.add')); add.type = 'submit';
  form.append(input, add);
  form.addEventListener('submit', async (e) => { e.preventDefault(); const v = input.value.trim(); if (!v) { input.focus(); return; } input.value = ''; await todoApi({ op: 'add', text: v }); sfx.play('pop'); input.focus(); });
  body.append(plGroup(tr('board.yours')), form, mine, agents);
  return { icon: 'list', title: tr('board.cardTitle'), sub: tr('board.cardSub'), body };
}
export function updateBoard(t) {
  if ((state.boardDirty || state.boardPulse.until > t) && t - boardAt > (state.boardPulse.until > t ? 0.08 : 0.4)) { boardAt = t; state.boardDirty = false; drawBoard(t); }
  for (const n of stickyNotes) if (n && n.g.visible && n.g.scale.x < 1) n.g.scale.setScalar(Math.min(1, n.g.scale.x + 1 / 60 * 3));
}
export const ray = new THREE.Raycaster();
let ndc;
let downAt = null;

export function setup() {
  /* ---------- the whiteboard: agents' tasks as a checklist, your own to-dos as sticky notes ---------- */
  state.todos = []; state.boardDirty = true; state.boardPulse = { id: null, until: 0 };
  boardCanvas = document.createElement('canvas');
   boardCanvas.width = BW;
   boardCanvas.height = BH;
  boardTex2 = new THREE.CanvasTexture(boardCanvas);
   boardTex2.colorSpace = THREE.SRGBColorSpace;
   boardTex2.anisotropy = 8;
  boardFace.material.map = boardTex2;
   boardFace.material.needsUpdate = true;
  buildProps();
  if (new URLSearchParams(location.search).has('debug')) window.__office = { THREE, PROPS, PLACES, camera, scene, stage, propMeshes, chipCovered, activateProp, closePlace, get fp() { return fp; }, get workers() { return workers; }, get sessions() { return sessions; }, get subs() { return subs; }, upsert: (x) => upsertSession(x, true), emit: (m) => applyMsg(m), get wx() { return wx; }, applyWeather: () => applyWeather(), select: (id) => openSession(id), get feed() { return state.feed; },
    view: (x, y, z, zoom) => { focusTarget.set(x, y, z); state.zoomGoal = zoom * BASE_ZOOM; state.lastUserCam = performance.now(); }, renderer, composer, get director() { return director; }, STATIONS, nav: { route, NODES, ADJ, DESK_SPOTS, blocked, standBy, wayTo }, floorLamps, errands, gatherings,
    goOut, get outing() { return outing(); }, get street() { return THEME?.live?.street; }, fpToStreet: () => toStreet(), speed: (n) => { state.speed = n; }, pauseDemo: () => { demoTimers.forEach(clearTimeout); demoTimers.length = 0; },
    limitOut: (min) => { state.quotaTest = min > 0 ? Date.now() + min * 60e3 : 0; }, get napOn() { return napOn; },
    parcel: () => sendParcel(), clean: () => startCleaner(), get staff() { return staff(); },
    standup: () => mondayStandup(true), teatime: () => teatime(true) };
  /* picking chibis */
  ndc = new V2();
  renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]); downAt = null;
    if (moved > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, fp.on ? fpCam : camera);
    const per = pickPerson(), pr = pickProp();
    if (pr && (!per || pr.d < per.d - 0.3)) { activateProp(pr.prop); return; }
    if (!per) { closePlace(); return; }
    if (per.devBox) { openMac(); return; }
    const w = per.worker;
    if (w && w === director) { openPlace('director'); return; }
    if (w?.sub) { if (w.parent) openSession(w.parent.id, { tab: 'subs', agent: w.id }); return; }
    if (w && w.anim === 'sleep' && w.phase !== 'walk') w.poke();
    else if (w && state.selectedId !== w.id) errands.lookUp(w);
    if (w) toggleSession(w.id);
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    const now = performance.now(); if (now - state.hoverAt < 60) return; state.hoverAt = now;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, fp.on ? fpCam : camera);
    const per = pickPerson(), pr = pickProp();
    const p = pr && (!per || pr.d < per.d - 0.3) ? pr.prop : null;
    state.hovered = !p && per?.worker ? per.worker : null;
    setHoverProp(p, e);
    renderer.domElement.classList.toggle('hovering', !!state.hovered || (!p && !!per?.devBox) || !!p);
  });
  renderer.domElement.addEventListener('pointerleave', () => { state.hovered = null; setHoverProp(null); renderer.domElement.classList.remove('hovering'); });
}
