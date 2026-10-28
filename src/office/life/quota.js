// Out of Claude: an account's plan limit used up, its people on a break until it resets.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { PRO, pad2, rand, reduceMotion, replay } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { canvasTex, fitText, put, rbox } from '../scene/blocks.js';
import { LAY } from '../world/layout.js';
import { STATIONS } from '../people/navigation.js';
import { hash, sessions, workers } from '../people/workers.js';
import { asleep, free, later, quip } from '../people/errands.js';
import { dingBell } from '../people/gatherings.js';
import { liveWindows, resetText } from '../ui/mac-drawer.js';
import { toast } from '../ui/activity.js';
import { napOn } from './nap.js';
import { t as tr } from '../../i18n/index.js';

/* When the 5-hour (or the week's) limit of an account reaches 100 %, the people whose sessions are on that account and
   resting get up and go on a break: the pantry tables, the meeting table, the coffee counter, with a tea, a book or a
   chat. A board by the wall clock counts down to when it can be used again. When it resets the bell rings and they go
   back to their desks. Anyone whose session is still working (the reading lags a little) keeps working. */
const FULL = 99.5;   // (the usage API reads 100; a hair under still counts)
const BREAK = () => (PRO ? ['dining', 'meeting', 'coffee'] : ['meeting', 'coffee']);
const W = 512, H = 200;
let board = null, tex = null, drawn = '', grow = 0;
let out = new Map();   // account ('' = the main one) -> when it can be used again (ms; 0 if not known), the accounts that are out
let checkAt = 0, chatAt = 0;
const acctOf = (w) => sessions.get(w.id)?.acct || '';

// the accounts whose limit is used up now, each with the latest reset among its full windows
function readOut() {
  const m = new Map(), now = Date.now();
  const add = (acct, ws) => {
    const full = (ws || []).filter((w) => w.pct >= FULL && (!w.resetsAt || w.resetsAt > now));
    if (full.length) m.set(acct, Math.max(...full.map((w) => w.resetsAt || 0)));
  };
  add('', liveWindows());
  for (const o of state.limits?.others || []) add(o.name, o.windows);
  if (state.quotaTest > now) m.set('', Math.max(m.get('') || 0, state.quotaTest));   // (?limitout, __office.limitOut)
  return m;
}
function left(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000)), d = Math.floor(s / 86400);
  const hms = `${pad2(Math.floor(s / 3600) % 24)}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`;
  return d ? tr('life.quota.days', { d, time: hms }) : hms;
}

/* ---------- the board: dark glass on the wall (the pantry's, over the cupboards, where the break is; in the small office
   by the clock), a red dot, the countdown in amber ---------- */
function build() {
  const [x, y, z, ry] = PRO ? [11.15, 3.0, -7.93, 0] : LAY.clock;
  board = new THREE.Group(); board.position.set(x, y, z); board.rotation.y = ry;
  if (!PRO) { board.translateX(0.3); board.translateY(-0.86); board.translateZ(0.02); }   // (under the clock, over the sofa)
  board.visible = false; board.scale.y = 0.001; board.userData.dynamic = true; scene.add(board);
  put(board, rbox(1.32, 0.58, 0.05, '#23262D', 0.02), 0, 0, 0);
  tex = canvasTex(W, H, (g) => { g.fillStyle = '#121419'; g.fillRect(0, 0, W, H); });
  put(board, new THREE.Mesh(new THREE.PlaneGeometry(1.22, 1.22 * (H / W)), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })), 0, 0, 0.03);
}
function draw(now) {
  const rows = [...out].sort((a, b) => (a[1] || Infinity) - (b[1] || Infinity)), [acct, at] = rows[0], blink = Math.floor(now / 600) % 2;
  const big = at ? left(at - now) : '--:--:--', more = rows[1];
  const foot = more ? tr('life.quota.more', { name: more[0] || tr('life.quota.main'), left: more[1] ? left(more[1] - now) : '--:--' }) : at ? tr('life.quota.until', { when: resetText(at) }) : '';
  const key = `${acct}|${big}|${foot}|${blink}`; if (key === drawn) return; drawn = key;
  const g = tex.image.getContext('2d');
  g.fillStyle = '#121419'; g.fillRect(0, 0, W, H);
  g.fillStyle = blink ? '#FF5A4E' : '#6B2420'; g.beginPath(); g.arc(34, 38, 9, 0, Math.PI * 2); g.fill();
  g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#FF8A7E';
  g.font = '800 30px "Be Vietnam Pro", system-ui, sans-serif';
  const title = acct ? tr('life.quota.titleOther', { name: acct }) : tr('life.quota.title'); fitText(g, title, W - 74); g.fillText(title, 54, 39);
  g.textAlign = 'center'; g.fillStyle = '#FFB23F'; g.font = '800 88px "JetBrains Mono", ui-monospace, monospace'; fitText(g, big, W - 40); g.fillText(big, W / 2, 110);
  g.fillStyle = '#A3ABB9'; g.font = '600 25px "Be Vietnam Pro", system-ui, sans-serif'; fitText(g, foot, W - 40); g.fillText(foot, W / 2, 172);
  tex.needsUpdate = true;
}

/* ---------- people ---------- */
function goOnBreak(w) {
  const acct = acctOf(w);
  if (!w.onBreak || !out.has(acct) || sessions.get(w.id)?.status !== 'rest') { w.onBreak = false; return; }
  const station = BREAK().find((n) => STATIONS[n]?.some((s) => !s.by || s.by === w)) || BREAK().at(-1);
  const text = tr('life.quota.leave');
  w.want = { station, anim: ['coffee', 'read', 'idle'][hash(w.id) % 3], type: 'idle', text, dwell: 0.3 };
  setTimeout(() => { if (w.lastSay?.text === text) w.hush(); }, 6000);
}
function backToDesks(acct) {
  dingBell(); later(0.8, dingBell);
  if (!replay.on) toast(acct ? tr('life.quota.backOther', { name: acct }) : tr('life.quota.back'), 6000);
  let n = 0;
  for (const w of workers.values()) {
    if (!w.onBreak || acctOf(w) !== acct) continue;
    later(1 + n++ * rand(0.5, 1.1), () => {
      if (!w.onBreak) return;
      w.onBreak = false;
      if (w.phase !== 'walk' && sessions.get(w.id)?.status === 'rest') { quip(w, tr('life.quota.cheer'), 'idle'); w.goHomeAndRest(); }
    });
  }
}

export function updateQuota(dt) {
  if (board?.visible || out.size) {   // the board drops in and folds away
    grow = THREE.MathUtils.clamp(grow + (out.size ? 1 : -1) * dt * 3, 0, 1);
    board.scale.y = Math.max(0.001, reduceMotion ? (out.size ? 1 : 0) : 1 - (1 - grow) ** 3);
    board.visible = grow > 0;
  }
  const now = Date.now();
  if (out.size && board.visible) draw(now);
  if (state.sim < checkAt) return;
  checkAt = state.sim + 1;
  const next = replay.on ? new Map() : readOut();
  for (const acct of out.keys()) if (!next.has(acct)) backToDesks(acct);
  out = next;
  for (const w of workers.values()) {   // breaks that end by themselves: work came in, gone home, out on the street
    if (!w.onBreak) continue;
    const s = sessions.get(w.id);
    if (!s || s.status !== 'rest' || w.leaving || w.away || w.street || w.homeBound) w.onBreak = false;
    else if (w.lateRest(s) && w.phase !== 'walk' && !w.want) { w.onBreak = false; w.goHomeAndRest(); }   // (late at night: the desk, then home)
  }
  if (!out.size) return;
  // who goes: resting on an account that is out, at their desk or idle, a few seconds apart (not during the nap)
  let n = 0;
  if (!napOn) for (const w of workers.values()) {
    const s = sessions.get(w.id);
    if (w.sub || w.onBreak || !s || s.status !== 'rest' || s.bg?.length || !out.has(s.acct || '')) continue;
    if (!(free(w) || asleep(w)) || w.anim === 'eat' || w.mealBox || w.queued || w.outing || w.street || w.lateRest(s)) continue;
    w.onBreak = true;
    later(0.4 + n++ * rand(0.7, 1.5), () => goOnBreak(w));
  }
  // now and then someone on the break says something (how long is left, what they are doing)
  if (state.sim > chatAt) {
    chatAt = state.sim + rand(16, 34);
    const here = [...workers.values()].filter((w) => w.onBreak && !w.want && w.phase !== 'walk' && w.station !== 'desk' && !w.bubbleObj.visible);
    const w = here[Math.floor(Math.random() * here.length)], at = w && out.get(acctOf(w));
    if (w) quip(w, tr('life.quota.chat', { left: at ? left(at - now) : '…', time: at ? resetText(at) : '…' }), 'idle');
  }
}

export function setup() {
  build();
  const p = new URLSearchParams(location.search).get('limitout');   // a look at it: ?limitout=<minutes>
  if (p !== null) state.quotaTest = Date.now() + (+p || 30) * 60e3;
}
