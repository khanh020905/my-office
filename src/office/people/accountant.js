// The accountant (company floor): her desk in the director's office, the day's API cost on her screen, the report to the
// director at 17:30, and a word with whoever spends the most when the plan's limit gets near.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { PRO, nowMs, officeNow, rand, reduceMotion, replay } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { canvasTex, fitText, mat, put, rbox } from '../scene/blocks.js';
import { officeChair } from '../world/desks.js';
import { liftArrive } from '../world/entrance.js';
import { DESK_SPOTS, DOOR_IN, DOOR_OUT, faceTo } from './navigation.js';
import { Worker, nearBoss, npcs, sessions, workers } from './workers.js';
import { director } from './director.js';
import { quip } from './errands.js';
import { liveWindows } from '../ui/mac-drawer.js';
import { napOn } from '../life/nap.js';
import { sfx } from '../audio/sfx.js';
import { t as tr } from '../../i18n/index.js';

/* - 8:00 to 17:45, up and down by the lift. Her desk stands in the director's office, along the glass on the meeting
     room's side: the screen faces the room (a little spreadsheet of what the open sessions have cost, by project), a
     calculator, a stack of red VAT invoices, the ledger, a small printer.
   - 17:30: she prints the day's report and takes it to the director's desk (he says thanks; out of his office, she
     leaves it on the desk), then home.
   - When the 5-hour or the weekly use of the plan passes 80 % (once each time it does), she goes to the person whose
     session has cost the most and asks them to go easy on tokens. Never in the nap, a stand-up, Friday tea or a
     break for the limit. */
const FROM = 480, TO = 1065, REPORT_AT = 1050, WARN = 80;
const minutes = () => { const d = officeNow(); return d.getHours() * 60 + d.getMinutes(); };
const today = () => officeNow().toDateString();
function say(w, key, vars, ms = 4500) { const text = tr(key, vars); w.say('idle', text); setTimeout(() => { if (w.lastSay?.text === text) w.hush(); }, ms); }
const usd = (v) => `$${v >= 100 ? Math.round(v) : v.toFixed(2)}`;
const projOf = (s) => s?.git?.repo || String(s?.dir || '').split('/').filter(Boolean).pop() || tr('activity.live.otherProject');

// a moment the office is busy with something together (people/rounds.js waits for these too)
export function busyNow() {
  const d = officeNow(), m = d.getHours() * 60 + d.getMinutes(), day = d.getDay();
  if (napOn || replay.on || (day === 1 && m >= 540 && m < 575) || (day === 5 && m >= 960 && m < 995)) return true;
  for (const w of workers.values()) if (w.onBreak || w.chore?.gathering) return true;
  return false;
}

/* ---------- the desk ---------- */
const DESK = { x: 5.45, z: 6.15 };   // (the admin corner beside the front pod, with HR (people/hr.js): off every walkway, her back to the right aisle, her screen to the room)
let SEAT, REPORT, screenTex, sheetKey = '', paperM, deskPaper;
function buildDesk() {
  const g = new THREE.Group(); g.position.set(DESK.x, 0, DESK.z); g.rotation.y = Math.PI / 2; scene.add(g);   // (its front, and her chair, toward +x)
  const wood = mat('#B48A60', { roughness: 0.6 }), dark = mat('#2B2F36', { roughness: 0.5 });
  put(g, rbox(0.95, 0.05, 0.55, wood, 0.015), 0, 0.745, 0);
  for (const sx of [-1, 1]) put(g, rbox(0.04, 0.72, 0.5, wood, 0.01), sx * 0.45, 0.36, 0);
  put(g, rbox(0.86, 0.4, 0.03, wood, 0.01), 0, 0.5, -0.24);
  // the screen, toward the chair and the room; the spreadsheet drawn on it (screenTex)
  put(g, rbox(0.06, 0.2, 0.06, dark, 0.01), 0.2, 0.87, -0.16);
  put(g, rbox(0.52, 0.33, 0.035, dark, 0.015), 0.2, 1.07, -0.15);
  screenTex = canvasTex(320, 200, (c, w, h) => { c.fillStyle = '#F7F8FA'; c.fillRect(0, 0, w, h); });
  const scr = put(g, new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.3), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })), 0.2, 1.07, -0.13);
  scr.userData.noMerge = true;
  put(g, rbox(0.36, 0.015, 0.12, mat('#E8E8E6', { roughness: 0.5 }), 0.005), -0.02, 0.778, 0.1);
  // a calculator, its little green display
  put(g, rbox(0.09, 0.02, 0.14, dark, 0.006), 0.31, 0.78, 0.12).rotation.y = -0.2;
  put(g, rbox(0.07, 0.004, 0.035, mat('#9FD8A0', { emissive: '#3E7A40', emissiveIntensity: 0.4 }), 0.002), 0.318, 0.792, 0.08).rotation.y = -0.2;
  // the red VAT invoices (hoá đơn đỏ), two piles, and the ledger
  const white = mat('#F4F1EA', { roughness: 0.95 }), pink = mat('#E7A1B0', { roughness: 0.9 });
  put(g, rbox(0.21, 0.07, 0.25, white, 0.006), -0.33, 0.805, -0.1).rotation.y = 0.12;
  put(g, rbox(0.21, 0.012, 0.25, pink, 0.004), -0.33, 0.846, -0.1).rotation.y = 0.12;
  put(g, rbox(0.23, 0.045, 0.31, mat('#7A1F2B', { roughness: 0.7 }), 0.01), -0.3, 0.792, 0.2).rotation.y = -0.18;
  // the corner's low screen behind the two desks, its sign toward the room
  const felt = mat('#6F8A9A', { roughness: 0.95 });
  put(scene, rbox(0.06, 1.2, 2.2, felt, 0.02), 5.0, 0.6, 6.72);
  put(scene, rbox(0.07, 0.04, 2.24, mat('#9AA2AD', { roughness: 0.4, metalness: 0.4 }), 0.01), 5.0, 1.22, 6.72);
  const signTex = canvasTex(512, 72, (c, w, h) => { c.fillStyle = '#1C2620'; c.fillRect(0, 0, w, h); c.fillStyle = '#F6EFE4'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '800 36px "Be Vietnam Pro", system-ui, sans-serif'; fitText(c, tr('people.accountant.corner'), w - 30); c.fillText(tr('people.accountant.corner'), w / 2, h / 2 + 2); });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.18), new THREE.MeshBasicMaterial({ map: signTex })); sign.position.set(5.036, 1.06, 6.72); sign.rotation.y = Math.PI / 2; sign.userData.noMerge = true; scene.add(sign);
  // a small printer on a cabinet behind the screen
  const cab = new THREE.Group(); cab.position.set(4.66, 0, 6.0); cab.rotation.y = Math.PI / 2; scene.add(cab);
  put(cab, rbox(0.45, 0.6, 0.42, mat('#D6D9DE', { roughness: 0.6 }), 0.02), 0, 0.3, 0);
  put(cab, rbox(0.38, 0.17, 0.32, mat('#EDEEF0', { roughness: 0.5 }), 0.02), 0, 0.685, 0);
  put(cab, rbox(0.26, 0.012, 0.14, white, 0.004), 0, 0.775, 0.1);
  put(cab, rbox(0.3, 0.03, 0.02, dark, 0.005), 0, 0.71, 0.16);
  // her chair, facing the desk, and a nameplate on the desk's front
  officeChair(scene, SEAT.x, SEAT.z, mat('#4F6D8F', { roughness: 0.6 })).rotation.y = SEAT.face;
  const np = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.09), new THREE.MeshBasicMaterial({ map: canvasTex(256, 68, (c, w, h) => {
    c.fillStyle = '#2B2F36'; c.fillRect(0, 0, w, h); c.fillStyle = '#E2B04A'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '800 34px "Be Vietnam Pro", system-ui, sans-serif'; fitText(c, tr('people.accountant.plate'), w - 20); c.fillText(tr('people.accountant.plate'), w / 2, h / 2 + 2);
  }) }));
  np.position.set(DESK.x + 0.27, 0.83, DESK.z - 0.12); np.rotation.order = 'YXZ'; np.rotation.set(-0.35, Math.PI / 2, 0); np.userData.noMerge = true; scene.add(np);
  // the report left on the director's desk when he is out
  paperM = mat('#FBFBF7', { roughness: 0.9 });
  deskPaper = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.01, 0.29), paperM); deskPaper.position.set(-4.85, 0.795, -5.65); deskPaper.rotation.y = 0.25;
  deskPaper.visible = false; deskPaper.userData.dynamic = true; scene.add(deskPaper);
}
// the open sessions' API cost, by project, and the total
function costs() {
  const by = new Map();
  for (const s of sessions.values()) { const c = s.usage?.cost || 0; if (c > 0) by.set(projOf(s), (by.get(projOf(s)) || 0) + c); }
  const rows = [...by].sort((a, b) => b[1] - a[1]);
  return { rows, total: rows.reduce((a, r) => a + r[1], 0) };
}
function drawSheet() {
  const { rows, total } = costs(), key = rows.map(([p, c]) => `${p}:${c.toFixed(2)}`).join('|');
  if (key === sheetKey) return;
  sheetKey = key;
  const c = screenTex.image.getContext('2d'), w = 320, h = 200, F = '"Be Vietnam Pro", system-ui, sans-serif';
  c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#1F7A45'; c.fillRect(0, 0, w, 30);   // a spreadsheet's green bar, the day's title
  c.fillStyle = '#FFFFFF'; c.font = `700 15px ${F}`; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText(tr('people.accountant.sheet'), 10, 15);
  c.fillStyle = '#E9EDF2'; c.fillRect(0, 30, w, 24);
  c.fillStyle = '#3A3F47'; c.font = `700 13px ${F}`; c.fillText(tr('people.accountant.project'), 10, 42); c.textAlign = 'right'; c.fillText(tr('people.accountant.cost'), w - 10, 42);
  const shown = rows.slice(0, 4);
  shown.forEach(([p, v], k) => {
    const y = 54 + k * 26;
    c.strokeStyle = '#D5DAE1'; c.beginPath(); c.moveTo(0, y + 26); c.lineTo(w, y + 26); c.stroke();
    c.fillStyle = '#1C1F24'; c.font = `500 13px ${F}`; c.textAlign = 'left'; fitText(c, p, 200); c.fillText(p, 10, y + 13);
    c.font = `600 13px ${F}`; c.textAlign = 'right'; c.fillText(usd(v), w - 10, y + 13);
  });
  c.strokeStyle = '#B9C0CA'; c.beginPath(); c.moveTo(w * 0.62, 54); c.lineTo(w * 0.62, 158); c.stroke();
  c.fillStyle = '#FFF4D6'; c.fillRect(0, 160, w, 40);
  c.fillStyle = '#1C1F24'; c.font = `800 15px ${F}`; c.textAlign = 'left'; c.fillText(tr('people.accountant.total'), 10, 180);
  c.textAlign = 'right'; c.fillText(usd(total), w - 10, 180);
  screenTex.needsUpdate = true;
}

/* ---------- the accountant ---------- */
let accountant = null, reportDay = '', warned = new Set(), checkAt = 0, sheetAt = 0;
function arrive(p, then) {
  p.offstage = false; p.hush(); p.path = []; p.phase = 'idle'; p.anim = 'idle';
  liftArrive(p); p.waitLift = then;
}
function depart(p, then) {
  const gone = () => { p.offstage = true; p.spot = null; p.leavingNow = false; then?.(); };
  p.leavingNow = true;
  p.goTo(DOOR_IN, () => { p.anim = 'idle'; p.faceTarget = DOOR_IN.face; p.liftWait = () => p.goTo(DOOR_OUT, () => { p.faceTarget = Math.PI / 2; p.liftRide = gone; }); });
}
const atDesk = (p) => !p.offstage && !p.coming && !p.leavingNow && !p.job && p.phase !== 'walk' && p.spot === SEAT;
// to her desk and back to typing
function home(p) { p.job = null; p.paper.visible = false; p.goTo(SEAT, () => { p.anim = 'type'; p.nextIdle = state.sim + rand(4, 8); }); }

/* 17:30: print, carry it over, hand it to the director (or leave it on his desk), back */
export function report(force = false) {
  const p = accountant;
  if (!p || !atDesk(p) || (!force && busyNow())) return false;
  reportDay = today(); p.job = 'report'; p.hush(); p.anim = 'idle';
  say(p, 'people.accountant.print'); sfx.play('print');
  const total = usd(costs().total);
  p.afterAt = state.sim + (reduceMotion ? 0.5 : 2.2);
  p.after = () => {
    p.paper.visible = true;
    p.goTo(REPORT, () => {
      const d = director, here = d && d.station === 'home' && !d.job && d.phase !== 'walk' && !d.chore;
      p.faceTarget = REPORT.face; p.anim = 'globe';
      say(p, here ? 'people.accountant.report' : 'people.accountant.leftOnDesk', { total }, 4000);
      if (here) {
        d.holdUntil = d.nextIdle = state.sim + 4; d.anim = 'idle';
        setTimeout(() => { if (d.station !== 'home') return; const t = tr('people.accountant.dirThanks'); d.say('substop', t); d.waveUntil = state.sim + 1.2; setTimeout(() => { if (d.lastSay?.text === t) d.hush(); }, 2600); }, reduceMotion ? 300 : 1500);
      }
      p.afterAt = state.sim + (reduceMotion ? 0.6 : 2.6);
      p.after = () => { p.paper.visible = false; deskPaper.visible = !here; deskPaper.userData.day = today(); p.anim = 'idle'; home(p); };
    });
  };
  return true;
}

// the plan's windows past 80 % that she hasn't spoken about yet (this time round): the fullest first
function nearLimit() {
  return liveWindows().filter((w) => w.pct >= WARN && w.pct < 99.5 && !warned.has(`${w.key}:${w.resetsAt || ''}`)).sort((a, b) => b.pct - a.pct)[0] || null;
}
// the person here whose session has cost the most
function spender() {
  let best = null, bc = 0;
  for (const w of workers.values()) {
    const s = sessions.get(w.id), c = s?.usage?.cost || 0;
    if (w.sub || !w.root.visible || w.away || w.street || w.offstage || w.leaving || w.outing || w.onBreak || w.phase === 'walk' || c <= bc) continue;
    best = w; bc = c;
  }
  return best;
}
export function budgetWarn(force = false) {
  const p = accountant;
  if (!p || !atDesk(p) || (!force && busyNow())) return false;
  const win = nearLimit() || (force ? { key: 'weekly', pct: 82, resetsAt: 0 } : null), w = spender();
  if (!win || !w) return false;
  warned.add(`${win.key}:${win.resetsAt || ''}`);
  p.job = 'warn'; p.hush(); p.anim = 'idle';
  const d = sessions.get(w.id)?.desk ?? -1;
  let to;
  if (d >= 0) { const ds = DESK_SPOTS[d], x = ds.x - 0.55, z = ds.z - 0.8; to = { x, z, face: faceTo(x, z, ds.x, ds.z), node: ds.node }; }
  else { to = nearBoss(w, p); to.face = Math.atan2(w.pos.x - to.x, w.pos.y - to.z); }
  const text = tr('people.accountant.warn', { pct: Math.round(win.pct), window: tr(`people.accountant.win.${win.key === 'weekly' ? 'weekly' : 'session'}`) });
  p.goTo(to, () => {
    p.faceTarget = Math.atan2(w.pos.x - p.pos.x, w.pos.y - p.pos.y); p.anim = 'idle';
    p.say('idle', text); p.lastWarn = text;
    setTimeout(() => { if (w.root.visible && !w.chore && w.phase !== 'walk') { if (w.pose !== 'sit') w.faceTarget = Math.atan2(p.pos.x - w.pos.x, p.pos.y - w.pos.y); quip(w, tr('people.accountant.reply'), 'idle'); } }, reduceMotion ? 300 : 2200);
    p.afterAt = state.sim + (reduceMotion ? 1 : 4.5);
    p.after = () => { if (p.lastSay?.text === text) p.hush(); home(p); };
  });
  return true;
}

// ?debug: __office.accountant (where she is), report(), budgetWarn() (the test's way in)
let hooked = false;
function hook() {
  const o = window.__office; if (hooked || !o) return;
  hooked = true; Object.defineProperty(o, 'accountant', { get: () => accountantState(), configurable: true });
  o.report = () => report(true); o.budgetWarn = () => budgetWarn(true);
}
export function updateAccountant() {
  const p = accountant; if (!p) return;
  if (!hooked) hook();
  if (p.tagObj.visible !== (!p.offstage && (p.phase === 'walk' || state.hovered === p))) p.tagObj.visible = !p.offstage && (p.phase === 'walk' || state.hovered === p);
  if (state.sim > sheetAt) { sheetAt = state.sim + 3; drawSheet(); if (deskPaper.visible && deskPaper.userData.day !== today()) deskPaper.visible = false; }
  if (state.sim < checkAt || replay.on) return;
  checkAt = state.sim + 5;
  if (p.offstage || !atDesk(p)) return;
  if (reportDay !== today() && minutes() >= REPORT_AT && minutes() < TO) { report(); return; }
  if (nearLimit()) budgetWarn();
}

export function setup() {
  if (!PRO) return;   // (the small office has no room for her)
  SEAT = { x: DESK.x + 0.66, z: DESK.z, face: -Math.PI / 2, node: 'R3', sit: true };
  REPORT = { x: -4.05, z: -6.12, face: faceTo(-4.05, -6.12, -5.4, -6.75), node: 'DRs' };
  buildDesk();
  accountant = new (class Accountant extends Worker {
    constructor() {
      super({ name: tr('people.accountant.name'), shirt: '#F2B8B5', hair: '#3A2A20', style: 'bob', acc: null, outfit: 'shirt', pants: '#3A3F4F', shoes: '#2B2B30' }, { id: '__accountant' });
      this.staff = true; this.offstage = true; this.root.visible = this.tagObj.visible = false; npcs.push(this);
      this.attachPaper();
    }
    attachPaper() { this.paper = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.012, 0.23), paperM); this.paper.position.set(0, -0.06, 0.07); this.paper.rotation.x = 0.3; this.paper.visible = this.job === 'report'; this.P.armR.hand.add(this.paper); }
    rebuild() { super.rebuild(); this.attachPaper(); }
    update(dt, t) {
      if (this.offstage && !this.liftRide) {   // (off the floor: just the clock)
        if (this.root.visible || this.tagObj.visible) { this.root.visible = false; this.root.matrixWorldAutoUpdate = false; this.tagObj.visible = false; this.bubbleObj.visible = false; }
        this.step(); return;
      }
      super.update(dt, t);
    }
    tick() {
      if (this.waitLift) { if (!this.liftHold) { const f = this.waitLift; this.waitLift = null; f(); } return; }
      this.step();
    }
    step() {
      const m = minutes(), on = !replay.on && m >= FROM && m < TO;
      if (on && this.offstage && !this.coming) {
        if (!this.seen) { this.offstage = false; this.pos.set(SEAT.x, SEAT.z); this.face = this.faceTarget = SEAT.face; this.spot = SEAT; this.pose = 'sit'; this.anim = 'type'; }
        else { this.coming = true; arrive(this, () => { say(this, 'people.accountant.morning'); this.goTo(SEAT, () => { this.coming = false; this.anim = 'type'; }); }); }
      } else if (!on && !this.offstage && !this.leavingNow && !this.coming && !this.job && this.phase !== 'walk' && !this.after) { say(this, 'people.accountant.bye', null, 3000); depart(this); }
      this.seen = true;
      if (atDesk(this) && state.sim > (this.nextIdle || 0)) {   // types, checks the calculator, reads an invoice
        this.anim = ['type', 'type', 'think', 'read'][Math.floor(Math.random() * 4)]; this.nextIdle = state.sim + rand(6, 12);
      }
    }
  })();
}
// for ?debug and the tests: where she is and what she's doing
export const accountantState = () => accountant && { offstage: accountant.offstage, job: accountant.job || null, atDesk: atDesk(accountant), x: +accountant.pos.x.toFixed(2), z: +accountant.pos.y.toFixed(2), said: accountant.lastSay?.text || '', warn: accountant.lastWarn || '', paperOnDesk: deskPaper.visible, at: nowMs() };
export { accountant };
