// HR and the attendance terminal (company floor). A fingerprint terminal hangs on the lift's front by its call buttons:
// everyone clocks in there on their first arrival of the day and out on the way home (a finger on the pad, a beep, their
// name and the time on its screen, a word when they are late); a little plate under it keeps the day's earliest. The HR
// woman (8:00 to 17:30, by the lift, clocking in herself) has her desk in the work floor's front corner by the lounge:
// she meets a new session's person at the lift and sees them to their desk, where she clips their project's name on the
// pod's screen (every desk in use has its tab); and on the last Friday of the month at 15:30 she brings a cake to the
// meeting table for the month's birthdays: the projects whose repository's first commit fell in this month, and the
// staff's own. The song, the candles, a slice each, and back to work three minutes later.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { PRO, officeNow, reduceMotion, replay } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { canvasTex, cyl, fitText, mat, put, rbox } from '../scene/blocks.js';
import { DESKS, dLocal, officeChair } from '../world/desks.js';
import { DZ, LIFT_FRONT } from '../world/entrance.js';
import { MEET } from '../world/furniture/meeting.js';
import { DESK_SPOTS, faceTo } from './navigation.js';
import { clockHooks, hash, sessions, workers } from './workers.js';
import { staffKit } from './staff.js';
import { birthday, gatheringNow } from './gatherings.js';
import { later, line } from './errands.js';
import { napOn } from '../life/nap.js';
import { DEMO } from '../demo/demo.js';
import { toast } from '../ui/activity.js';
import { sfx } from '../audio/sfx.js';
import { t as tr } from '../../i18n/index.js';

const FROM = 480, TO = 1050, LATE = 510, PARTY_AT = 930;   // her day 8:00 to 17:30; late after 8:30; the party at 15:30
const minutes = () => { const d = officeNow(); return d.getHours() * 60 + d.getMinutes(); };
const hhmm = (d) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
const projOf = (s) => s?.git?.repo || String(s?.dir || '').split('/').filter(Boolean).pop() || s?.name || '';
function say(w, text, ms = 4500) { if (!text) return; w.say('idle', text); setTimeout(() => { if (w.lastSay?.text === text) w.hush(); }, ms); }
const FONT = '"Be Vietnam Pro", system-ui, sans-serif';

/* ---------- the terminal ---------- */
let TERM = null, screenTex = null, plateTex = null, screenKey = '', plateKey = '', flash = null;
const log = new Map();   // session id -> { at: Date (office time), name, out } for today
let logDay = '';
function roll() { const d = officeNow().toDateString(); if (d !== logDay) { logDay = d; log.clear(); } }
function drawScreen() {
  const now = officeNow(), f = flash && state.sim < flash.until ? flash : null;
  const key = f ? `f${f.name}${f.kind}${f.time}` : `c${hhmm(now)}`;
  if (key === screenKey) return;
  screenKey = key;
  const g = screenTex.image.getContext('2d'), w = screenTex.image.width, h = screenTex.image.height;
  g.fillStyle = '#0E1A26'; g.fillRect(0, 0, w, h);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (!f) {
    g.fillStyle = '#7FA7C9'; g.font = `700 15px ${FONT}`; g.fillText(tr('people.hr.terminal'), w / 2, 18);
    g.fillStyle = '#E8F1F8'; g.font = `800 44px ${FONT}`; g.fillText(hhmm(now), w / 2, h / 2 + 4);
    g.fillStyle = '#7FA7C9'; g.font = `600 13px ${FONT}`; g.fillText(tr('people.hr.place'), w / 2, h - 16);
  } else {
    g.fillStyle = f.late ? '#E8A33B' : f.kind === 'out' ? '#4C8DD6' : '#3DBE7A'; g.fillRect(0, 0, w, 30);
    g.fillStyle = '#0E1A26'; g.font = `800 16px ${FONT}`; g.fillText(tr(f.late ? 'people.hr.lateTag' : f.kind === 'out' ? 'people.hr.bye' : 'people.hr.hello'), w / 2, 16);
    g.fillStyle = '#FFFFFF'; g.font = `800 22px ${FONT}`; fitText(g, f.name, w - 16); g.fillText(f.name, w / 2, 58, w - 16);
    g.fillStyle = '#BFD3E6'; g.font = `700 26px ${FONT}`; g.fillText(f.time, w / 2, 96);
  }
  screenTex.needsUpdate = true;
}
// the day's earliest of the sessions (real: when each first stirred today; or as they clocked in here)
function earliest() { let best = null; for (const e of log.values()) if (!best || e.at < best.at) best = e; return best; }
function drawPlate() {
  const e = earliest(), key = e ? `${e.name}${hhmm(e.at)}` : '-';
  if (key === plateKey) return;
  plateKey = key;
  const g = plateTex.image.getContext('2d'), w = plateTex.image.width, h = plateTex.image.height;
  g.fillStyle = '#F4EFE6'; g.fillRect(0, 0, w, h);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#7A1D16'; g.font = `800 20px ${FONT}`; g.fillText(tr('people.hr.earliest'), w / 2, 24, w - 12);
  g.fillStyle = '#1E232B'; g.font = `700 22px ${FONT}`;
  const text = e ? `${e.name} · ${hhmm(e.at)}` : tr('people.hr.nobodyYet');
  fitText(g, text, w - 14); g.fillText(text, w / 2, 64, w - 14);
  plateTex.needsUpdate = true;
}
// a finger on the pad: the beep, the name and the time on the screen for a few seconds
function press(name, kind, late = false) { flash = { name, kind, late, time: hhmm(officeNow()), until: state.sim + 4.5 }; sfx.play('beep'); }
// someone at the terminal: walk up, a finger on the pad, then on (then())
function punch(w, name, kind, then, late = false) {
  w.goTo(TERM, () => {
    w.faceTarget = TERM.face; w.anim = 'tidy';
    w.afterAt = state.sim + (reduceMotion ? 0.3 : 1.1);
    w.after = () => { press(name, kind, late); w.anim = 'idle'; if (late) say(w, line('people.hr.late')); then(); };
  });
}
const nameOf = (w) => sessions.get(w.id)?.name || w.cfg?.name || '';
function clockIn(w, then) {
  roll();
  if (!TERM || replay.on || w.sub || w.staff || log.has(w.id)) { then(); return; }
  const at = officeNow(), name = nameOf(w), late = minutes() > LATE && at.getHours() < 12;
  log.set(w.id, { at, name, out: null });
  punch(w, name, 'in', then, late);
}
function clockOut(w, then) {
  roll();
  const e = log.get(w.id);
  if (!TERM || replay.on || w.sub || w.staff || !e || e.out) { then(); return; }
  e.out = officeNow();
  punch(w, e.name, 'out', then);
}
// those already at their desks when the page opens have clocked in: when their session first stirred today (on the
// demo, a minute between 7:35 and 8:40 of their own)
function infer() {
  roll();
  const now = officeNow();
  for (const s of sessions.values()) {
    const w = workers.get(s.id);
    if (!w || log.has(s.id) || w.away || w.leaving || w.homeBound || w.station === 'arriving' || !w.root.visible) continue;
    let at = null;
    if (s.dayFirst && s.dayFirst.day === new Date().toLocaleDateString('sv')) at = new Date(s.dayFirst.at);
    if (!at || DEMO) { at = new Date(now); at.setHours(7, 35 + (hash(s.id) % 66), 0, 0); if (at > now) at = new Date(now); }
    log.set(s.id, { at, name: s.name, out: null, inferred: true });
  }
}

/* ---------- name tabs on the pods' screens ---------- */
let tabsTex = null, tabsMesh = null, tabsKey = '';
const pending = new Set();   // new sessions whose tab HR has yet to put up
const TAB_W = 256, TAB_H = 64, COLS = 4;
function drawTabs(names) {
  const g = tabsTex.image.getContext('2d');
  g.clearRect(0, 0, tabsTex.image.width, tabsTex.image.height);
  names.forEach((name, d) => {
    if (!name) return;
    const x = (d % COLS) * TAB_W, y = Math.floor(d / COLS) * TAB_H;
    g.fillStyle = '#FBF9F4'; g.fillRect(x, y, TAB_W, TAB_H);
    g.fillStyle = '#E8865F'; g.fillRect(x, y, TAB_W, 7);
    g.fillStyle = '#1E232B'; g.font = `800 30px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, name, TAB_W - 20); g.fillText(name, x + TAB_W / 2, y + TAB_H / 2 + 4, TAB_W - 20);
  });
  tabsTex.needsUpdate = true;
}
// a tab clipped on the top rail of the pod's felt screen over each desk in use, readable from both sides
function buildTabs(names) {
  if (tabsMesh) { scene.remove(tabsMesh); tabsMesh.geometry.dispose(); tabsMesh = null; }
  const list = [], W = tabsTex.image.width, H = tabsTex.image.height;
  names.forEach((name, d) => {
    if (!name) return;
    const D = DESKS[d], [cx, cz] = dLocal(D, 0.42, 0.375), sn = Math.sin(D.ry), c = Math.cos(D.ry), u0 = ((d % COLS) * TAB_W) / W, v0 = 1 - ((Math.floor(d / COLS) + 1) * TAB_H) / H;
    for (const side of [-1, 1]) {
      const p = new THREE.PlaneGeometry(0.26, 0.065), uv = p.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (TAB_W / W), v0 + uv.getY(i) * (TAB_H / H));
      p.rotateY(D.ry + (side < 0 ? Math.PI : 0)).translate(cx + side * sn * 0.004, 1.255, cz + side * c * 0.004);
      list.push(p);
    }
  });
  if (!list.length) return;
  tabsMesh = new THREE.Mesh(mergeGeos(list), new THREE.MeshStandardMaterial({ map: tabsTex, roughness: 0.8 }));
  tabsMesh.userData.noMerge = true; scene.add(tabsMesh);
}
function mergeGeos(list) {
  const n = list.reduce((a, g) => a + g.attributes.position.count, 0), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    for (const i of g.index.array) idx.push(i + o);
    o += g.attributes.position.count; g.dispose();
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); m.setIndex(idx);
  return m;
}
function syncTabs() {
  if (!tabsTex) return;
  const names = DESKS.map(() => '');
  for (const s of sessions.values()) {
    const w = workers.get(s.id);
    if (s.desk < 0 || s.desk >= DESKS.length || !w || pending.has(s.id)) continue;
    names[s.desk] = projOf(s);
  }
  const key = names.join('|');
  if (key === tabsKey) return;
  tabsKey = key; drawTabs(names); buildTabs(names);
}

/* ---------- the month's birthdays ---------- */
const STAFF_MONTH = [['staff.receptionist', 3], ['staff.cleaner', 7], ['staff.shipper', 10], ['accountant.name', 5], ['staff.hr', 11], ['guard.name', 9], ['staff.postman', 12]];   // (their names' keys)
const lastFriday = (d) => d.getDay() === 5 && d.getDate() + 7 > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
function birthdayNames(month) {
  const out = new Set();
  for (const s of sessions.values()) {
    const p = projOf(s); if (!p) continue;
    const born = s.git?.born, m = born ? Number(born.slice(5, 7)) : DEMO ? (hash(p) % 12) + 1 : 0;
    if (m === month) out.add(p);
  }
  for (const [k, m] of STAFF_MONTH) { if (m !== month) continue; const n = tr(`people.${k}`); if (n && n !== `people.${k}`) out.add(n); }
  return [...out];
}
let banner = null, bannerTex = null, partyDay = '', party = null;
function drawBanner(month, names) {
  const g = bannerTex.image.getContext('2d'), w = bannerTex.image.width, h = bannerTex.image.height;
  g.fillStyle = '#FFF6EC'; g.fillRect(0, 0, w, h);
  const FLAGS = ['#E8865F', '#F2C14E', '#5FB49C', '#5B8DD9', '#D9628B'];
  for (let k = 0; k < 16; k++) { g.fillStyle = FLAGS[k % FLAGS.length]; g.beginPath(); g.moveTo(k * 64, 0); g.lineTo(k * 64 + 64, 0); g.lineTo(k * 64 + 32, 40); g.fill(); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#B23A2C'; g.font = `900 64px ${FONT}`; const title = tr('people.hr.bdayTitle', { m: month }); fitText(g, title, w - 60); g.fillText(title, w / 2, 112, w - 60);
  g.fillStyle = '#2B2F36'; g.font = `700 38px ${FONT}`;
  const shown = names.length > 5 ? [...names.slice(0, 5), tr('people.hr.andMore', { n: names.length - 5 })] : names;
  const text = shown.length ? shown.join(' · ') : tr('people.hr.everyone');
  fitText(g, text, w - 60); g.fillText(text, w / 2, 192, w - 60);
  bannerTex.needsUpdate = true;
}
function startParty() {
  if (party || gatheringNow() || replay.on) return false;
  const month = officeNow().getMonth() + 1, names = birthdayNames(month);
  drawBanner(month, names);
  const host = hr && !hr.offstage && !hr.chore && !hr.job && hr.phase !== 'walk' && !hr.leavingNow ? hr : null;
  if (host) host.carry = 'cake';   // (the cake, carried to the table)
  const g = birthday({ long: reduceMotion ? 40 : 150, host, open: tr('people.hr.bdayOpen', { m: month }),
    onStart: (g) => {
      banner.visible = true; if (host) host.carry = null;
      const here = (w) => w.chore?.gathering === g;
      g.members.forEach((w, i) => later(1.5 + i * 0.7, () => here(w) && say(w, line('people.hr.sing'), 3500)));
      later(9, () => { if (host && here(host)) say(host, line('people.hr.candles')); sfx.play('clap'); });
      later(15, () => {
        if (host && here(host)) say(host, line('people.hr.slices'));
        for (const w of g.members) if (here(w)) { w.carry = 'cake'; w.anim = 'coffee'; }
        sfx.play('pop');
      });
    },
    onEnd: () => { banner.visible = false; party = null; },
  });
  if (!g) { if (host) host.carry = null; return false; }
  party = g;
  toast(tr('people.hr.bdayToast', { m: month }), 6000);
  return true;
}

/* ---------- HR herself ---------- */
let hr = null, SEAT = null, GREET = null;
const HR_DESK = { x: 5.45, z: 7.3 };   // (the admin corner beside the front pod, next to the accountant's (people/accountant.js), off every walkway)
const queue = [];
function newcomer(w) {
  if (!hr || w.sub || w.staff) return;
  pending.add(w.id); queue.push(w.id);
}
function meet(H) {   // the next newcomer: at the lift if she gets there in time, then to their desk and the name tab
  const id = queue.shift(), w = workers.get(id), s = sessions.get(id);
  if (!w || !s || s.desk < 0 || s.desk >= DESKS.length) { pending.delete(id); return; }
  H.job = 'meet';
  const done = () => { pending.delete(id); H.job = null; H.goTo(SEAT, () => { H.anim = 'type'; }); };
  const toDesk = () => {
    const D = DESKS[s.desk], [x, z] = dLocal(D, 0.35, -1.2), spot = { x, z, face: faceTo(x, z, D.x, D.z), node: DESK_SPOTS[s.desk].node };
    H.goTo(spot, () => {
      pending.delete(id); sfx.play('pop'); H.anim = 'tidy'; say(H, line('people.hr.yourDesk'));
      H.afterAt = state.sim + (reduceMotion ? 0.4 : 2.6); H.after = done;
    });
  };
  H.goTo(GREET, () => {
    const near = workers.get(id) && Math.hypot(w.pos.x - GREET.x, w.pos.y - GREET.z) < 3.2;
    if (near) { H.faceTarget = faceTo(H.pos.x, H.pos.y, w.pos.x, w.pos.y); H.waveUntil = state.sim + 1.4; say(H, line('people.hr.welcome')); }
    H.afterAt = state.sim + (near && !reduceMotion ? 1.8 : 0.1); H.after = toDesk;
  });
}
function buildDesk() {
  // the admin corner beside the front pod, off the walkways, next to the accountant's: a small desk against the corner's
  // low screen, her chair on the aisle's side, files and a stamp, a little sign
  const g = new THREE.Group(); g.position.set(HR_DESK.x, 0, HR_DESK.z); g.rotation.y = -Math.PI / 2; scene.add(g);   // (her chair toward +x, the aisle)
  const wood = mat('#B48A60', { roughness: 0.6 }), dark = mat('#2B2F36', { roughness: 0.5 });
  put(g, rbox(0.9, 0.05, 0.55, wood, 0.015), 0, 0.745, 0);
  for (const sx of [-1, 1]) put(g, rbox(0.04, 0.72, 0.5, wood, 0.01), sx * 0.43, 0.36, 0);
  put(g, rbox(0.82, 0.4, 0.03, wood, 0.01), 0, 0.5, 0.24);
  // her screen, facing her (its back to the room), keyboard
  put(g, rbox(0.06, 0.2, 0.06, dark, 0.01), -0.12, 0.87, 0.12);
  put(g, rbox(0.46, 0.3, 0.035, dark, 0.015), -0.12, 1.05, 0.12);
  put(g, rbox(0.34, 0.015, 0.11, mat('#E8E8E6', { roughness: 0.5 }), 0.005), -0.1, 0.778, -0.1);
  // a tray of personnel files (coloured folders), the company stamp and its red pad
  const tray = new THREE.Group(); tray.position.set(0.3, 0.77, 0.05); g.add(tray);
  put(tray, rbox(0.24, 0.02, 0.3, mat('#5E6670', { roughness: 0.5 }), 0.004), 0, 0.01, 0);
  ['#3F7CC4', '#E8742A', '#2E9E4A', '#C9A227'].forEach((c, k) => put(tray, rbox(0.22, 0.012, 0.28, mat(c, { roughness: 0.8 }), 0.003), 0, 0.028 + k * 0.014, 0).rotation.y = (k - 1.5) * 0.04);
  put(g, rbox(0.09, 0.012, 0.06, mat('#B23A2C', { roughness: 0.7 }), 0.004), 0.3, 0.776, -0.18);
  put(g, cyl(0.022, 0.026, 0.06, dark, 10), 0.18, 0.8, -0.18); put(g, cyl(0.03, 0.03, 0.014, mat('#8E1A13'), 10), 0.18, 0.775, -0.18);
  // the desk sign, toward the room
  const sign = canvasTex(256, 64, (c, w, h) => { c.fillStyle = '#1C2620'; c.fillRect(0, 0, w, h); c.fillStyle = '#F6EFE4'; c.font = `800 30px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(tr('people.hr.sign'), w / 2, h / 2 + 2); });
  const sg = new THREE.Group(); sg.position.set(0.0, 0.77, 0.23); g.add(sg);   // (on the front edge, toward the window side and the camera)
  put(sg, rbox(0.24, 0.07, 0.03, '#1C2620', 0.008), 0, 0.035, 0).rotation.x = -0.25;
  put(sg, new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.055), new THREE.MeshBasicMaterial({ map: sign })), 0, 0.037, 0.017).rotation.x = -0.25;
  officeChair(g, 0, -0.6, mat('#3D5A80', { roughness: 0.6 }));
}
function buildTerminal() {
  // on the lift's front, right of its doors, beside the call buttons: a dark unit with a screen and a green-lit pad
  const x = LIFT_FRONT, z = DZ + 0.98, g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.PI / 2; scene.add(g);
  const dark = mat('#1B1F26', { roughness: 0.4 });
  put(g, rbox(0.13, 0.22, 0.05, dark, 0.012), 0, 1.24, 0.025);
  screenTex = canvasTex(160, 120, () => {}); screenTex.colorSpace = THREE.SRGBColorSpace;
  const scr = put(g, new THREE.Mesh(new THREE.PlaneGeometry(0.105, 0.079), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })), 0, 1.285, 0.0505); scr.userData.noMerge = true;
  put(g, rbox(0.05, 0.035, 0.008, mat('#3BAA6A', { emissive: '#2E8A55', emissiveIntensity: 0.9 }), 0.006), 0, 1.185, 0.052);
  plateTex = canvasTex(192, 88, () => {}); plateTex.colorSpace = THREE.SRGBColorSpace;
  put(g, rbox(0.16, 0.08, 0.008, mat('#B8912F', { roughness: 0.35, metalness: 0.6 }), 0.004), 0, 0.92, 0.004);
  const pm = put(g, new THREE.Mesh(new THREE.PlaneGeometry(0.148, 0.068), new THREE.MeshBasicMaterial({ map: plateTex })), 0, 0.92, 0.0095); pm.userData.noMerge = true;
  TERM = { x: x + 0.55, z, face: -Math.PI / 2, node: 'I', sit: false };
  GREET = { x: -5.8, z: DZ + 0.55, face: faceTo(-5.8, DZ + 0.55, TERM.x, TERM.z), node: 'I', sit: false };
}

let slowAt = 0, checkAt = 0, hooked = false;
export function updateHr() {
  if (!hooked && window.__office) hookDebug();
  if (!PRO) { partyCheck(); return; }
  if (state.sim < slowAt) return;
  slowAt = state.sim + 0.5;
  infer(); drawScreen(); drawPlate(); syncTabs();
  partyCheck();
}
function partyCheck() {
  if (state.sim < checkAt) return;
  checkAt = state.sim + 10;
  const d = officeNow(), m = minutes(), day = d.toDateString();
  if (replay.on || partyDay === day || !lastFriday(d) || m < PARTY_AT || m > PARTY_AT + 15 || napOn) return;
  if (startParty()) partyDay = day;
}
function hookDebug() {
  hooked = true;
  if (!new URLSearchParams(location.search).has('debug')) return;
  Object.defineProperties(window.__office, {
    hr: { get: () => hr && { offstage: hr.offstage, job: hr.job || null, chore: !!hr.chore, carry: hr.carry || null, x: +hr.pos.x.toFixed(2), z: +hr.pos.y.toFixed(2), said: hr.lastSay?.text || '' } },
    attendance: { value: () => ({ terminal: !!TERM, log: Object.fromEntries([...log].map(([id, e]) => [id, { name: e.name, at: hhmm(e.at), out: e.out ? hhmm(e.out) : null, inferred: !!e.inferred }])), earliest: plateKey, screen: screenKey, tabs: tabsKey, pending: [...pending] }) },
    birthday: { value: () => startParty() },
    party: { get: () => !!party && { banner: banner.visible, members: party.members.length, slices: party.members.filter((w) => w.carry === 'cake').length,
      who: party.members.map((w) => ({ id: w.id, here: w.chore?.gathering === party, carry: w.carry || null, anim: w.anim, phase: w.phase, after: !!w.after })) } },
  });
}

export function setup() {
  // the birthday banner: on the company floor pinned to the meeting room's back wall over the table (under the neon),
  // in the small office hung over the round table on two cords, turned to the room
  bannerTex = canvasTex(1024, 256, () => {}); bannerTex.colorSpace = THREE.SRGBColorSpace;
  banner = new THREE.Group(); banner.visible = false; banner.userData.dynamic = true; scene.add(banner);
  if (PRO) banner.position.set(MEET.x - 0.9, 2.42, MEET.z - 2.3);
  else { banner.position.set(MEET.x, 2.45, MEET.z - 0.2); banner.rotation.y = Math.PI / 4; for (const sx of [-0.7, 0.7]) put(banner, cyl(0.005, 0.005, 0.9, mat('#8E949C'), 4), sx, 0.65, 0); }
  put(banner, new THREE.Mesh(new THREE.PlaneGeometry(PRO ? 2.3 : 1.6, PRO ? 0.575 : 0.4), new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.85, side: THREE.DoubleSide })), 0, 0, 0);
  if (!PRO) return;   // (the small office: no lift and no HR; the party still comes, run by whoever is there)
  buildTerminal(); buildDesk();
  tabsTex = canvasTex(TAB_W * COLS, TAB_H * Math.ceil(DESKS.length / COLS), () => {}); tabsTex.colorSpace = THREE.SRGBColorSpace; tabsTex.anisotropy = 4;
  SEAT = { x: HR_DESK.x + 0.6, z: HR_DESK.z, face: -Math.PI / 2, node: 'R4', sit: true };   // (reached from the right aisle's front end)
  const { Staff, arrive, depart } = staffKit();
  hr = new (class extends Staff {
    step() {
      if (this.chore) return;   // (the party runs her)
      const m = minutes(), on = !replay.on && m >= FROM && m < TO;
      if (on && this.offstage && !this.coming) {
        if (!this.seen) { this.offstage = false; this.pos.set(SEAT.x, SEAT.z); this.face = this.faceTarget = SEAT.face; this.spot = SEAT; this.pose = 'sit'; this.anim = 'type'; }
        else {
          this.coming = true;
          arrive(this, () => punch(this, tr('people.staff.hr'), 'in', () => this.goTo(SEAT, () => { this.coming = false; this.anim = 'type'; })));
        }
      } else if (!on && !this.offstage && !this.leavingNow && !this.coming && !this.job && this.phase !== 'walk' && !this.after) {
        this.leavingNow = true;
        punch(this, tr('people.staff.hr'), 'out', () => depart(this));
      }
      this.seen = true;
      if (!on || this.offstage || this.coming || this.leavingNow || this.job || this.phase === 'walk' || this.after) return;
      if (queue.length && !napOn) meet(this);
    }
  })({ name: tr('people.staff.hr'), shirt: '#E7C6D3', hair: '#2B2420', style: 'ponytail', acc: null, outfit: 'shirt', pants: '#3A3F4A', shoes: '#1B1B1E' }, '__hr');
  clockHooks.in = clockIn; clockHooks.out = clockOut; clockHooks.newcomer = newcomer;
  document.fonts?.ready.then(() => { screenKey = plateKey = tabsKey = ''; });
}
// for tests (?debug)
export const hrState = () => ({ log: log.size, party: !!party });
