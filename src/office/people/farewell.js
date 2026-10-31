// The farewell (tiệc chia tay): a project the office remembers that has had no session for a month (Settings → More:
// 14, 30, 60 or 90 days, or never; server/tenure.mjs keeps each project's working life and says which are due) gets a
// last afternoon. Its person comes in once more, the company card on its lanyard, and packs the desk into a cardboard
// box (the little plant, the mug, the photo frame) while the area's carpet shows in the project's colour; everyone free
// gathers round the meeting table: HR's small cake, a big card that each one signs with a line ("Chúc em thành công",
// "Nhớ ghé chơi nha"), "Một, hai, ba… cười nào!" and the group photo in the group chat, the card handed back to HR.
// Then the box under the arm, out by the lift; the carpet rolls itself up and the desk gets a "Bàn trống" card. Opened
// again later, the project "comes back to its old company": its person walks in with the box, the colleagues tease
// ("Ủa quay lại hả 😆"), the carpet unrolls, the box is unpacked. Only for projects that really were at work (two days
// or more), only in office hours, never during lunch or the nap. It is all on screen: nothing about the project is
// touched. ?farewell: any hour, a shorter party (for tests); ?debug: __office.farewell.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { $, PRO, STATIC, officeNow, rand, reduceMotion, replay } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { canvasTex, fitText, mat, put, rbox, cyl } from '../scene/blocks.js';
import { DESKS, UNITS, dLocal, unitOfDesk } from '../world/desks.js';
import { MEET } from '../world/furniture/meeting.js';
import { confetti } from '../world/room-update.js';
import { DESK_SPOTS } from './navigation.js';
import { PALETTE, hash, sessions, workers } from './workers.js';
import { staffKit } from './staff.js';
import { farewellParty, gatheringNow } from './gatherings.js';
import { hrOnDuty } from './hr.js';
import { later, line } from './errands.js';
import { napOn } from '../life/nap.js';
import { TOKEN, areaOf, projOf, teamTags } from '../net/live.js';
import { chatLife, chatPhoto } from '../ui/group-chat.js';
import { toast } from '../ui/activity.js';
import { sfx } from '../audio/sfx.js';
import { t as tr } from '../../i18n/index.js';

const P = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const DEMO = STATIC || P.has('demo'), FORCE = P.has('farewell');
const FONT = '"Be Vietnam Pro", system-ui, sans-serif';
let T = { days: 30, choices: [14, 30, 60, 90], projects: [] };   // the server's word (GET /api/tenure, { k: 'tenure' })
let F = null;            // the farewell under way: { name, u, desk, stage, … }
let last = null;         // the one before (tests)
const held = new Set();  // farewells held from this page (not again before the server has it)
let checkAt = 0, leaver = null;
const say = (w, key, vars, ms = 4500) => { const text = typeof key === 'string' && key.includes('.') ? tr(key, vars) : key; w.say('idle', text); setTimeout(() => { if (w.lastSay?.text === text) w.hush(); }, ms); };
// where each project that said goodbye packed up, on this device (its "Bàn trống" card), the last 24
const GONE_KEY = 'office-gone';
let gone = {}; try { gone = JSON.parse(localStorage.getItem(GONE_KEY) || '{}') || {}; } catch { /* storage blocked */ }
function rememberGone(name, u) {
  if (u >= 0) gone[name] = u; else delete gone[name];
  gone = Object.fromEntries(Object.entries(gone).slice(-24));
  try { localStorage.setItem(GONE_KEY, JSON.stringify(gone)); } catch { /* storage blocked */ }
}
const goneArea = (name) => (gone[name] != null && gone[name] < UNITS.length ? gone[name] : areaOf(name));
const busyUnits = () => new Set([...sessions.values()].filter((s) => s.desk >= 0).map((s) => unitOfDesk[s.desk]));

/* ---------- the things: the box, the card, the company badge, the "Bàn trống" card, the rolled carpet ---------- */
let boxProto = null;
// an opened carton, its flaps out, and what was on the desk sticking out of it (bigger than life, as the desks' things)
function makeBox() {
  if (!boxProto) {
    const g = new THREE.Group(), card = mat('#C49A6C', { roughness: 0.9 }), dark = mat('#A47A4E', { roughness: 0.9 });
    put(g, rbox(0.36, 0.22, 0.27, card, 0.01), 0, 0.11, 0);
    for (const [x, z, ry] of [[0, 0.155, 0], [0, -0.155, 0], [0.2, 0, Math.PI / 2], [-0.2, 0, Math.PI / 2]]) put(g, new THREE.Mesh(new THREE.BoxGeometry(ry ? 0.25 : 0.34, 0.006, 0.08), dark), x, 0.23, z).rotation.set(ry ? 0 : (z > 0 ? 0.5 : -0.5), ry, ry ? (x > 0 ? -0.5 : 0.5) : 0);
    put(g, cyl(0.045, 0.035, 0.08, mat('#C8553D', { roughness: 0.7 }), 10), -0.09, 0.26, 0.04);               // the little plant: its pot
    put(g, new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat('#4E9A4A', { roughness: 0.9 })), -0.09, 0.33, 0.04);
    put(g, cyl(0.04, 0.036, 0.09, mat('#FFFFFF', { roughness: 0.4 }), 12), 0.1, 0.26, 0.05);                   // the mug
    const frame = put(g, new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.012), mat('#3A2E28', { roughness: 0.5 })), 0.03, 0.3, -0.07); frame.rotation.x = -0.25;   // the photo frame
    put(frame, new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.09), mat('#9CC3E0', { roughness: 0.6 })), 0, 0, -0.007).rotation.y = Math.PI;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    boxProto = g;
  }
  const b = boxProto.clone(); b.userData.dynamic = true; b.visible = false; scene.add(b);
  return b;
}
function boxOnDesk(box, d) { const D = DESKS[d], [x, z] = dLocal(D, 0.18, 0.05); box.removeFromParent(); scene.add(box); box.position.set(x, 0.782, z); box.rotation.set(0, D.ry + 0.2, 0); box.scale.setScalar(1); box.visible = true; }
// held on the chest in both arms (the pose: carry 'box'), as the courier's parcel
function boxInArms(box, w, keep = false) { box.removeFromParent(); w.P.spine.add(box); box.position.set(0, w.P.D.shY - 0.5, 0.32); box.rotation.set(0, 0, 0); box.scale.setScalar(0.85); box.visible = true; w.carry = 'box'; w.keepBox = keep; }

// the big card everyone signs, standing open on the meeting table: the line at the top, the signatures under it
let cardG = null, cardTex = null, signs = [];
function drawCard(name) {
  const g = cardTex.image.getContext('2d'), w = cardTex.image.width, h = cardTex.image.height;
  g.fillStyle = '#FFF8EE'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#E8865F'; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#B23A2C'; g.font = `900 46px ${FONT}`; const title = tr('people.farewell.card'); fitText(g, title, w - 40); g.fillText(title, w / 2, 62, w - 40);
  g.fillStyle = '#2B2F36'; g.font = `700 30px ${FONT}`; fitText(g, name, w - 60); g.fillText(name, w / 2, 112, w - 60);
  signs.forEach((s, k) => {   // each a short wish in their own colour, slanted, with a scribble of a name
    const x = 90 + (k % 3) * 166, y = 170 + Math.floor(k / 3) * 70;
    g.save(); g.translate(x, y); g.rotate(s.rot); g.fillStyle = s.color; g.font = `italic 600 20px ${FONT}`; fitText(g, s.text, 150); g.fillText(s.text, 0, 0, 150);
    g.strokeStyle = s.color; g.lineWidth = 2; g.beginPath(); for (let i = 0; i <= 12; i++) g.lineTo(-40 + i * 7, 22 + Math.sin(i * 1.7 + s.rot * 9) * 5); g.stroke(); g.restore();
  });
  cardTex.needsUpdate = true;
}
function showCard(on, name = '') {
  if (on) { signs = []; drawCard(name); }
  cardG.visible = on;
}
function sign(w, name) {
  const text = line('people.farewell.wish');
  signs.push({ text, color: ['#2F6FB5', '#C2577A', '#2E9E4A', '#7A6FD0', '#B5651D', '#D64550'][signs.length % 6], rot: rand(-0.12, 0.12) });
  if (signs.length <= 9) drawCard(name);
  return text;
}
// the company card on its blue lanyard (handed back to HR on the last day)
let badgeTex = null;
const badge = () => ({ color: '#2F6FB5', tex: (badgeTex ||= canvasTex(80, 104, (g, w, h) => {
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h); g.fillStyle = '#2F6FB5'; g.fillRect(0, 0, w, 24);
  g.fillStyle = '#FFFFFF'; g.font = `800 12px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(tr('people.farewell.badge'), w / 2, 12, w - 6);
  g.fillStyle = '#C9D3DE'; g.beginPath(); g.arc(w / 2, 52, 16, 0, Math.PI * 2); g.fill(); g.fillRect(w / 2 - 22, 74, 44, 6); g.fillRect(w / 2 - 16, 86, 32, 5);
})) });
// "Bàn trống" on the desk of an area whose project said goodbye, and its carpet rolled up beside it (a few at most)
const marks = [];
let markTex = null;
function mark(i) {
  if (marks[i]) return marks[i];
  markTex ||= canvasTex(256, 96, (g, w, h) => { g.fillStyle = '#F6F1E7'; g.fillRect(0, 0, w, h); g.fillStyle = '#6B7280'; g.fillRect(0, 0, w, 10); g.fillStyle = '#2B2F36'; g.font = `800 40px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; const t = tr('people.farewell.empty'); fitText(g, t, w - 24); g.fillText(t, w / 2, h / 2 + 5, w - 24); });
  const g = new THREE.Group(); g.userData.dynamic = true; g.visible = false; scene.add(g);
  const tent = new THREE.Group(); g.add(tent);
  for (const s of [-1, 1]) {   // a folded card standing on the desk, readable from both sides
    const p = put(tent, new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.165), new THREE.MeshStandardMaterial({ map: markTex, roughness: 0.8 })), 0, 0.078, s * 0.03);
    p.rotation.set(-s * 0.36, s < 0 ? Math.PI : 0, 0);
  }
  const roll = put(g, cyl(0.07, 0.07, 1, mat('#9AA2AE', { roughness: 0.95 }), 12), 0, 0.07, 0); roll.rotation.z = Math.PI / 2;
  marks[i] = { g, tent, roll, key: '' };
  return marks[i];
}
function placeMark(m, u, colour) {
  const d = UNITS[u].desks[0], D = DESKS[d], [x, z] = dLocal(D, -0.38, -0.12), rug = teamTags[u]?.rug;   // (at the end of the desk, clear of the screens)
  m.tent.position.set(x, 0.782, z); m.tent.rotation.y = D.ry;
  if (rug) { rug.geometry.computeBoundingBox(); const bb = rug.geometry.boundingBox, len = bb.max.x - bb.min.x; m.roll.visible = true; m.roll.scale.set(1, len * 0.96, 1); m.roll.position.set(rug.position.x, 0.07, rug.position.z + bb.max.z + 0.12); m.roll.material.color.set(colour); }
  else m.roll.visible = false;
  m.g.visible = true;
}
// the area's carpet rolling itself up (k 1 → 0) or out again (0 → 1), from its front edge
function rugReset(u) {
  const rug = teamTags[u]?.rug; if (!rug || rug.userData.z0 == null) return;
  rug.scale.z = 1; rug.position.z = rug.userData.z0; delete rug.userData.z0;
}
function rugTo(u, colour, k) {
  const rug = teamTags[u]?.rug; if (!rug) return;
  rug.geometry.computeBoundingBox();
  const bb = rug.geometry.boundingBox, depth = bb.max.z - bb.min.z;
  rug.userData.z0 ??= rug.position.z;
  rug.material.color.set(colour); rug.visible = k > 0.01;
  rug.scale.z = Math.max(0.01, k); rug.position.z = rug.userData.z0 + (depth / 2) * (1 - k);
}
const colourOf = (name) => PALETTE[hash(name) % PALETTE.length];

/* ---------- one farewell ---------- */
// the area to pack up: the one the project last had on this device, else any area nobody works in now
function areaFor(name) {
  const busy = busyUnits(), u = areaOf(name);
  if (u >= 0 && !busy.has(u)) return u;
  const free = UNITS.map((x, k) => k).filter((k) => !busy.has(k));
  return free.find((k) => UNITS[k].dept < 0) ?? free[0] ?? -1;   // (an open-floor area first: it has a carpet)
}
function person(name) {
  const H = ['#3B2618', '#1E1E24', '#9A4A24', '#5A3825', '#2B2B2B', '#7A4E2D'], h = hash(name);
  const cfg = { name, shirt: colourOf(name), hair: H[h % H.length], style: ['bob', 'spiky', 'ponytail', 'bun', 'plain', 'curly'][(h >>> 3) % 6], acc: [null, 'glasses', null][(h >>> 7) % 3], outfit: 'shirt', pants: '#3A3F4A', shoes: '#1B1B1E' };
  if (!leaver) {
    const { Staff } = staffKit();
    leaver = new (class extends Staff { step() { if (F?.w === this) stepFarewell(); } })(cfg, '__farewell');
  } else { Object.assign(leaver.cfg, cfg); leaver.setName(name); leaver.tagDot.style.background = cfg.shirt; leaver.rebuild(); }
  return leaver;
}
function start(name) {
  if (F || replay.on || gatheringNow()) return false;
  const u = areaFor(name), desk = u >= 0 ? UNITS[u].desks[0] : -1, w = person(name);
  F = { name, u, desk, w, stage: 'arrive', since: state.sim, box: F?.box || makeBox(), colour: colourOf(name) };
  const { arrive } = staffKit();
  w.wearCard(badge()); w.dress(true);
  chatLife('farewell', { name, every: 60e3 });
  arrive(w, () => {
    if (F?.w !== w) return;
    if (desk < 0) { F.stage = 'wait'; w.dress(false); return; }   // (nowhere free to pack: straight to the party)
    w.goTo(DESK_SPOTS[desk], () => {
      if (F?.w !== w) return;
      w.dress(false); w.anim = 'tidy'; F.stage = 'pack'; F.until = state.sim + (reduceMotion || FORCE ? 3 : 7);
      say(w, 'people.farewell.pack');
      boxOnDesk(F.box, desk); if (u >= 0) rugTo(u, F.colour, 1);
    });
  });
  return true;
}
function party() {
  const w = F.w, host = PRO ? hrOnDuty() : null, name = F.name;
  const g = farewellParty({ long: reduceMotion ? 30 : FORCE ? 45 : 75, host: host && !host.chore && !host.job && host.phase !== 'walk' ? host : null, guest: w,
    open: tr('people.farewell.open', { name }),
    onStart: (g) => {
      showCard(true, name);
      const here = (p) => p.chore?.gathering === g, h = g.members;
      // each signs the card with a line, in turn
      h.forEach((p, i) => later(2 + i * 2.2, () => { if (here(p)) say(p, sign(p, name), null, 3500); }));
      const after = 3 + h.length * 2.2;
      later(Math.max(10, after - 6), () => { for (const p of h) if (here(p)) { p.carry = 'cake'; p.anim = 'coffee'; } sfx.play('pop'); });   // (a slice each)
      // the group photo: everyone turned to the camera, "Một, hai, ba… cười nào!", the flash, the picture in the chat
      later(after, () => {
        const by = here(g.host || {}) ? g.host : h[0];
        if (by) say(by, 'people.farewell.photo', null, 3000);
        for (const p of [...h, w]) if (here(p)) { p.carry = null; p.anim = 'idle'; p.waveUntil = state.sim + 2.5; }
        later(1.6, () => { flash(); sfx.play('click'); chatLife('farewellPhoto', { name, photo: chatPhoto(cardG), every: 60e3 }); });
      });
      // the company card handed back to HR
      later(after + 7, () => {
        if (!here(w)) return;
        say(w, 'people.farewell.badgeBack'); w.wearCard(null);
        if (host && here(host)) later(1.8, () => say(host, 'people.farewell.badgeGot'));
      });
      later(after + 12, () => here(w) && say(w, 'people.farewell.thanks'));
      if (!reduceMotion) confetti(MEET.x, 2.4, MEET.z);
    },
    onEnd: () => { showCard(false); if (F?.w === w) leave(); },
  });
  if (!g) return false;
  g.host = host;
  F.stage = 'party'; toast(tr('people.farewell.toast', { name }), 6000);
  return true;
}
// back to the desk for the box, then out by the lift with it; the carpet rolls up, "Bàn trống"
function leave() {
  const w = F.w, desk = F.desk, { depart } = staffKit();
  F.stage = 'leave'; w.chore = null; w.after = null;
  const out = () => {
    boxInArms(F.box, w); F.carried = true; say(w, 'people.farewell.bye');
    depart(w, () => { F.box.visible = false; F.box.removeFromParent(); w.carry = null; F.stage = 'roll'; F.rollFrom = state.sim; });
  };
  if (desk < 0) { out(); return; }
  w.goTo(DESK_SPOTS[desk], () => { w.anim = 'tidy'; w.afterAt = state.sim + (reduceMotion ? 0.4 : 1.6); w.after = out; });
}
function stepFarewell() {
  if (!F) return;
  if (replay.on) { abandon(); return; }
  if (F.stage === 'pack' && state.sim > F.until) { F.stage = 'wait'; F.w.anim = 'idle'; }
  if (F.stage === 'wait' && state.sim > (F.retryAt || 0)) {
    F.retryAt = state.sim + 6;
    if (!napOn && !gatheringNow() && !party() && state.sim - F.since > 240) leave();   // (nobody about to come: a quiet goodbye)
  }
}
function abandon() {
  if (!F) return;
  const w = F.w;
  w.chore = null; w.after = null; w.offstage = true; w.carry = null; w.wearCard(null); w.path = []; w.phase = 'idle';
  F.box.visible = false; if (F.u >= 0) { rugTo(F.u, F.colour, 0); rugReset(F.u); }
  last = { name: F.name, stage: 'abandoned' }; F = null;
}
// the white flash of the phone held up for the group photo
function flash() {
  if (reduceMotion) return;
  const st = $('stage'); if (!st) return;
  const f = document.createElement('div'); f.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:.85;pointer-events:none;transition:opacity .6s ease-out;z-index:5';
  st.append(f); requestAnimationFrame(() => { f.style.opacity = '0'; }); setTimeout(() => f.remove(), 800);
}
// after it has gone: the carpet rolls itself up, the server is told, the desk gets its card
function stepRoll() {
  const k = Math.max(0, 1 - (state.sim - F.rollFrom) / (reduceMotion ? 0.3 : 2.6));
  if (F.u >= 0) rugTo(F.u, F.colour, k);
  if (k > 0) return;
  const name = F.name;
  if (F.u >= 0) { rugReset(F.u); teamTags[F.u].rug && (teamTags[F.u].rug.visible = false); }
  held.add(name); rememberGone(name, F.u);
  if (!DEMO && state.isLocal) post({ op: 'farewell', name });
  const p = T.projects.find((x) => x.name === name); if (p) { p.farewell = Date.now(); p.due = false; } else T.projects.push({ name, farewell: Date.now(), due: false });
  last = { name, stage: 'done', u: F.u, carried: !!F.carried }; F = null;
  syncMarks(true);
}

/* ---------- coming back to the old company ---------- */
const seenBack = new Set();
function welcome(w, name, backAt) {
  const key = `office-back:${name}:${backAt}`;
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch { /* storage blocked */ }
  const s = sessions.get(w.id), d = s?.desk ?? -1, u = d >= 0 ? unitOfDesk[d] : -1, box = makeBox(), colour = colourOf(name);
  const mate = [...workers.values()].find((x) => x !== w && !x.sub && sessions.get(x.id)?.status === 'rest' && x.root.visible);
  chatLife('back', { id: mate?.id, name, every: 60e3 });
  if (mate) later(2, () => say(mate, 'people.farewell.tease'));
  if (u >= 0) rugTo(u, colour, 0.01);
  boxInArms(box, w, true);
  const unpack = () => {
    w.carry = null; w.keepBox = false; boxOnDesk(box, d); say(w, 'people.farewell.backSay');
    w.errand({ type: 'idle', anim: 'tidy', wait: 0, hold: reduceMotion ? 0.5 : 2.6, linger: 0.4, at: () => { box.visible = false; box.removeFromParent(); return null; } });
    if (u >= 0) { const from = state.sim; const grow = () => { const k = Math.min(1, (state.sim - from) / (reduceMotion ? 0.3 : 2.4)); rugTo(u, colour, k); if (k < 1) later(0.05, grow); else rugReset(u); }; grow(); }
    syncMarks(true);
  };
  // walking in: unpacked at the desk; already sitting there (the page opened after): unpacked now
  const wait = () => { if (!workers.has(w.id) || d < 0) { box.visible = false; box.removeFromParent(); w.carry = null; w.keepBox = false; return; } if (w.phase === 'walk' || w.liftRide || w.liftWait || w.station !== 'desk' || w.after || w.chore) { later(0.5, wait); return; } unpack(); };   // (and the coat off first)
  wait();
}
function checkBacks() {
  for (const p of T.projects) {
    if (!p.back || seenBack.has(`${p.name}:${p.back}`) || Date.now() - p.back > 15 * 60e3) continue;
    const w = [...workers.values()].find((x) => !x.sub && projOf(sessions.get(x.id)) === p.name);
    if (!w) continue;
    seenBack.add(`${p.name}:${p.back}`); held.delete(p.name); rememberGone(p.name, -1);
    welcome(w, p.name, p.back);
  }
}

/* ---------- the marks on empty desks ---------- */
let marksKey = '';
function syncMarks(force = false) {
  const busy = busyUnits(), shown = [];
  for (const p of T.projects) {
    if (!p.farewell || shown.length >= 4 || (F && F.name === p.name)) continue;
    const u = goneArea(p.name); if (u < 0 || busy.has(u) || shown.some((x) => x.u === u)) continue;
    shown.push({ u, colour: colourOf(p.name) });
  }
  const key = shown.map((x) => `${x.u}:${x.colour}`).join('|');
  if (!force && key === marksKey) return;
  marksKey = key;
  shown.forEach((x, i) => placeMark(mark(i), x.u, x.colour));
  for (let i = shown.length; i < marks.length; i++) marks[i].g.visible = false;
}

/* ---------- each frame (a look every second) ---------- */
export function updateFarewell() {
  if (F?.stage === 'roll') stepRoll();
  if (state.sim < checkAt) return;
  checkAt = state.sim + 1;
  if (replay.on) { if (F) abandon(); return; }
  checkBacks(); syncMarks();
  if (F || !T.days && !FORCE) return;
  const d = officeNow(), m = d.getHours() * 60 + d.getMinutes();
  // office hours, not over lunch and the nap, nobody else's party on
  if (!FORCE && (m < 540 || m > 1050 || (m >= 690 && m < 810) || napOn || gatheringNow())) return;
  const due = T.projects.find((p) => p.due && !held.has(p.name) && ![...sessions.values()].some((s) => projOf(s) === p.name));
  if (due) start(due.name);
}

/* ---------- the server's list, and Settings → More ---------- */
const tq = () => (TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : '');
const post = (body) => fetch(`/api/tenure${tq()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
/** the live stream's { k: 'tenure' } (demo/demo.js) */
export function setTenure(d) {
  if (!d) return;
  T = { days: d.days ?? T.days, choices: d.choices || T.choices, projects: Array.isArray(d.projects) ? d.projects : [] };
  for (const p of T.projects) if (p.farewell) held.delete(p.name);
  drawSettings(); syncMarks(true);
}
function drawSettings() {
  const box = $('st-farewell'); if (!box || DEMO) return;
  box.hidden = false;
  box.querySelector('[data-fw-tgl]').setAttribute('aria-checked', String(T.days > 0));
  for (const b of box.querySelectorAll('[data-fw-days]')) { b.setAttribute('aria-pressed', String(Number(b.dataset.fwDays) === T.days)); b.disabled = !T.days; }
}
async function load() { if (DEMO) return; const r = await fetch(`/api/tenure${tq()}`).then((x) => x.json()).catch(() => null); if (r?.ok) setTenure(r); }

/* ---------- for tests (?debug) ---------- */
const debug = {
  set: (list, days = 30) => setTenure({ days, projects: list }),   // [{ name, due, farewell, back }]
  go: (name) => start(name || T.projects.find((p) => p.due)?.name || 'old-project'),
  party: () => !!F && F.stage !== 'party' && party(),
  back: (name) => { const p = T.projects.find((x) => x.name === name) || (T.projects.push({ name }), T.projects[T.projects.length - 1]); p.farewell = 0; p.back = Date.now(); checkBacks(); return seenBack.has(`${name}:${p.back}`); },
  state: () => ({ stage: F?.stage || null, name: F?.name || null, who: F && { x: +F.w.pos.x.toFixed(1), z: +F.w.pos.y.toFixed(1), phase: F.w.phase, off: !!F.w.offstage, lift: !!(F.w.liftWait || F.w.liftRide || F.w.liftHold || F.w.waitLift), after: !!F.w.after, chore: !!F.w.chore, anim: F.w.anim }, u: F?.u ?? null, card: !!cardG?.visible, signs: signs.length, lanyard: !!F?.w.lanyard, carry: F?.w.carry || null, last,
    marks: marks.filter((m) => m.g.visible).length, rugs: teamTags.map((t, u) => (t.rug?.visible ? `${u}:${t.rug.scale.z.toFixed(2)}` : '')).filter(Boolean) }),
  at: () => { const u = F?.u ?? last?.u; if (u == null || u < 0) return null; const d = DESKS[UNITS[u].desks[0]]; return { x: d.x, z: d.z }; },
};
if (P.has('debug')) setTimeout(function hook() { if (!window.__office) { setTimeout(hook, 200); return; } window.__office.farewell = debug; }, 0);

export function setup() {
  // the card on the meeting table: a big greeting card standing on its easel back, turned to the room
  cardTex = canvasTex(512, 320, () => {});
  cardG = new THREE.Group(); cardG.visible = false; cardG.userData.dynamic = true; scene.add(cardG);
  // (on the camera's side of the table, turned to it; bigger than life, so it reads)
  cardG.position.set(MEET.x + (PRO ? 0.15 : 0.25), 0.8, MEET.z + (PRO ? 0.22 : 0.25)); cardG.rotation.y = Math.PI / 5;
  put(cardG, new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.55), new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.8 })), 0, 0.27, 0).rotation.x = -0.18;
  put(cardG, new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.52), mat('#E8865F', { roughness: 0.8 })), 0, 0.25, -0.08).rotation.set(0.32, Math.PI, 0);
  // Settings → More: on or off, after how many days
  const box = $('st-farewell');
  if (box && !DEMO) {
    $('btn-look')?.addEventListener('click', () => { if (!$('pop-look').hidden) load(); });
    box.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-fw-tgl]'), n = e.target.closest('[data-fw-days]');
      if (!t && !n) return;
      const days = t ? (T.days ? 0 : 30) : Number(n.dataset.fwDays);
      const r = await post({ op: 'config', days });
      if (r?.ok) setTenure(r); else toast(r?.message || tr('drawer.unreachable'), 6000);
    });
  }
  load();
}
