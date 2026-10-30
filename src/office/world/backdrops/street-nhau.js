/* A quán nhậu on the park's edge across the street from the office (city backdrop), as they are all over Vietnam: low
   blue plastic tables and red and blue stools on the pavement's edge, a polystyrene ice chest and crates of beer (a
   made-up "BIA", no real brand), on the tables the ice bucket, glasses, cans and the mồi (peanuts, grilled dried squid,
   snails, a salad, a hotpot steaming on its gas burner), a charcoal grill smoking at the end with the owner fanning it,
   a waiter going to and fro, a hand-painted sign, a string of bulbs over it after dark. Open 16:30–23:00, fuller
   in the evening and on Fridays and Saturdays; the regulars at their tables raise their glasses now and then
   ("Một, hai, ba, dô!"). Some evenings people from the office come down for a few rounds (people/nhau.js): they sit
   at the long table nearest the kerb, and go home by Grab or taxi. Now and then a regular rides off on his own
   scooter: with the alcohol checkpoint up (street-csgt.js), he is stopped on the way. A chip over the sign opens a
   card: the menu (illustrative prices of a street-side place), who from the office is there and how many rounds.
   ?nhau: open now. */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { $, el, officeNow, replay } from '../../core/env.js';
import { canvasTex } from '../../scene/blocks.js';
import { boxAt, colorize, mergeAll, vmat } from '../terrace.js';
import { sfx } from '../../audio/sfx.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/activity.js';
import { puffs } from './street-corner.js';
import { seen } from './street-folk.js';
import { t as tr } from '../../../i18n/index.js';

const FORCE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('nhau');
export const OPEN = [16.5, 23];
// the menu, prices in thousands of đồng (an illustrative street-side place in Ho Chi Minh City: most dishes 30–100k)
export const MENU = [['beer', 20], ['towel', 2], ['peanut', 15], ['squid', 120], ['snail', 90], ['clam', 60], ['salad', 120], ['wings', 90], ['greens', 40], ['hotpot', 199], ['tea', 3]];
const TABLE = '#2F6FB5', STOOLS = ['#D62F2F', '#2E6FD1'], SKIN = '#EDC4A2', ST = 0.4, TOP = 0.6;
const GX = 2.5, GZ = 0.95, SX = -1.75;   // the grill (at the end, towards the street), the sign
const SHIRTS = ['#3F7CC4', '#2F6B45', '#8C3A3A', '#5B5B66', '#C77D2E', '#2B2F36', '#7E5BA6', '#E0E0E0', '#B0485A'];
const rnd = (a, b) => a + Math.random() * (b - a);
const yawTo = (dx, dz) => Math.atan2(-dz, dx);   // (figures face +x; this turns them to face (dx, dz))

/* the clink of glasses: two short bright tings, a little apart, only with the office's sounds on */
let actx = null;
if (typeof addEventListener !== 'undefined') addEventListener('pointerdown', () => { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ } } if (actx?.state === 'suspended') actx.resume(); }, { passive: true });
function clink() {
  if (!actx || actx.state !== 'running' || !sfx?.on || replay.on) return;
  const t0 = actx.currentTime + 0.02;
  for (const [f, dt, v] of [[2637, 0, 0.05], [3136, 0.045, 0.04], [2793, 0.11, 0.035], [3520, 0.16, 0.025]]) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = f + Math.random() * 40;
    g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(v, t0 + dt + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.5);
    o.connect(g).connect(actx.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.55);
  }
}

/* the card: the menu, the office's table, the regulars */
let card = null;
function renderCard(Qs) {
  const body = card.querySelector('.csgt-body'); body.replaceChildren();
  card.querySelector('.csgt-sub').textContent = tr(Qs.open() ? 'world.nhau.subOpen' : 'world.nhau.subShut', { a: '16:30', b: '23:00' });
  const g = Qs.group();
  const sec = (k) => body.append(el('p', 'nhau-h', tr(`world.nhau.card.${k}`)));
  sec('office');
  if (g.length) {
    const ul = el('ul', 'nhau-who');
    for (const m of g) { const li = el('li'); li.append(el('b', null, m.name), el('span', null, tr(`world.nhau.card.stage.${m.stage}`, { n: m.drinks }))); ul.append(li); }
    body.append(ul, el('p', 'csgt-empty', tr('world.nhau.card.rounds', { n: Qs.toasts() })));
  } else body.append(el('p', 'csgt-empty', tr('world.nhau.card.noOffice')));
  body.append(el('p', 'csgt-empty', tr('world.nhau.card.locals', { n: Qs.locals() })));
  sec('menu');
  const menu = el('dl', 'nhau-menu');
  for (const [k, p] of MENU) menu.append(el('dt', null, tr(`world.nhau.menu.${k}`)), el('dd', null, `${(p * 1000).toLocaleString('vi-VN')}đ`));
  body.append(menu, el('p', 'csgt-foot', tr('world.nhau.card.foot')));
}
function openCard(Qs) {
  if (!card) {
    card = el('section', 'csgt-card nhau-card'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', tr('world.nhau.name'));
    const head = el('header', 'csgt-head'), ico = el('span', 'csgt-ico'), title = el('div', 'csgt-title'), close = el('button', 'icon-btn csgt-close');
    ico.append(icon('coffee')); title.append(el('h3', null, tr('world.nhau.name')), el('p', 'csgt-sub', ''));
    close.type = 'button'; close.setAttribute('aria-label', tr('common.close')); close.append(icon('x')); close.addEventListener('click', () => { card.hidden = true; });
    head.append(ico, title, close); card.append(head, el('div', 'csgt-body'));
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && card && !card.hidden) card.hidden = true; });
    ($('stage-wrap') || document.body).append(card);
  }
  card.hidden = false; renderCard(Qs); card.refresh = () => !card.hidden && renderCard(Qs);
}

/** finder: street-spots.js; folk: street-folk.js's figures; depart: street-life.js (a scooter standing at the kerb, off) */
export function buildNhau(G, { finder, folk, low, depart, far = [] }) {
  const dead = { update() {}, night() {}, spots: () => [], police() {}, lane: null, s: 0, office: null, debug: { state: () => ({ open: false, none: true }) } };
  // (a park's edge is 10.6 m, the finder keeps 2.4 m clear at each end, or 1.5 at a corner: the place is 5.8 m long)
  const f = [{ near: 42 }, { near: 60 }, { near: 60, corner: true, depth: 2.2, d: 2.45 }].reduce((got, o) => got || finder.find({ len: 5.8, depth: 2.4, d: 2.6, lawn: true, far, ...o }), null);
  if (!f) return dead;
  // the frame: x along the kerb, z out towards the street (2.6 m in from the kerb at 0), y up from the grass
  const W = (lx, lz, ly = 0) => f.at(lx, lz, ly);
  const Q = new THREE.Group(); Q.matrixAutoUpdate = false; Q.matrix.copy(f.M); G.add(Q);
  const parts = [], at = (g, x, y, z) => g.translate(x, y, z), cyl = (r0, r1, h, x, y, z, c, n = 12) => colorize(at(new THREE.CylinderGeometry(r0, r1, h, n), x, y, z), c);
  // the tables (two pushed together for the office) and their stools; where everyone sits
  const T = [{ x: -1.25, z: 0.15, w: 1.26 }, { x: 0.62, z: -0.05, w: 0.62 }, { x: 1.98, z: 0.25, w: 0.62 }];
  for (const t of T) {
    parts.push(boxAt(t.w, 0.035, 0.62, t.x, TOP, t.z, TABLE));
    for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) parts.push(boxAt(0.035, TOP - 0.02, 0.035, t.x + sx * (t.w / 2 - 0.05), (TOP - 0.02) / 2, t.z + sz * 0.26, TABLE));
    if (t.w > 1) parts.push(boxAt(0.012, 0.004, 0.62, t.x, TOP + 0.02, t.z, '#26588F'));   // (the seam between the two)
  }
  const seat = (t, dx, dz) => ({ x: T[t].x + dx, z: T[t].z + dz, face: yawTo(-dx, -dz) });
  const OFFICE = [seat(0, -0.95, 0), seat(0, -0.32, -0.58), seat(0, 0.32, -0.58), seat(0, -0.32, 0.6), seat(0, 0.32, 0.6), seat(0, 0.95, 0)];
  const LOCAL = [seat(1, -0.52, 0), seat(1, 0.52, 0), seat(1, 0, -0.55), seat(1, 0, 0.55), seat(2, -0.52, 0), seat(2, 0.52, 0), seat(2, 0, -0.55)];
  [...OFFICE, ...LOCAL].forEach((s, i) => { parts.push(cyl(0.14, 0.17, ST - 0.02, s.x, (ST - 0.02) / 2, s.z, STOOLS[i % 2]), cyl(0.155, 0.155, 0.025, s.x, ST - 0.01, s.z, STOOLS[i % 2])); });
  // the ice chest, crates of beer, the grill, the sign's legs, the poles for the bulbs
  parts.push(boxAt(0.44, 0.4, 0.6, -2.48, 0.2, 0.8, '#F4F4F2'), boxAt(0.46, 0.06, 0.62, -2.48, 0.43, 0.8, '#2E6FD1'));
  for (let k = 0; k < 3; k++) {
    parts.push(boxAt(0.32, 0.26, 0.44, -2.5, 0.13 + k * 0.27, -0.55, k % 2 ? '#F2C200' : '#C8102E'));
    for (let i = 0; i < 6; i++) parts.push(cyl(0.022, 0.022, 0.05, -2.5 - 0.07 + Math.floor(i / 3) * 0.14, 0.28 + k * 0.27, -0.55 - 0.15 + (i % 3) * 0.15, '#1F5E2E', 6));
  }
  parts.push(cyl(0.2, 0.15, 0.16, GX, 0.52, GZ, '#2B2B2E', 16), boxAt(0.36, 0.012, 0.3, GX, 0.61, GZ, '#5A5E66'));
  for (let a = 0; a < 3; a++) parts.push(boxAt(0.025, 0.46, 0.025, GX + Math.cos(a * 2.1) * 0.13, 0.23, GZ + Math.sin(a * 2.1) * 0.13, '#2B2B2E'));
  for (let i = 0; i < 4; i++) parts.push(boxAt(0.32, 0.012, 0.012, GX, 0.63, GZ - 0.1 + i * 0.065, '#8A6A45'), boxAt(0.06, 0.03, 0.03, GX - 0.05, 0.645, GZ - 0.1 + i * 0.065, '#7A3B1C'), boxAt(0.06, 0.03, 0.03, GX + 0.05, 0.645, GZ - 0.1 + i * 0.065, '#7A3B1C'));
  for (const x of [-2.8, 2.8]) parts.push(boxAt(0.05, 2.4, 0.05, x, 1.2, -1.15, '#3A3F47'));
  parts.push(boxAt(0.03, 1.15, 0.03, SX - 0.45, 0.57, 1.18, '#4A3A2A'), boxAt(0.03, 1.15, 0.03, SX + 0.45, 0.57, 1.18, '#4A3A2A'));
  const base = new THREE.Mesh(mergeAll(parts), vmat({ roughness: 0.65 })); base.castShadow = !low; Q.add(base);
  const coals = new THREE.Mesh(new THREE.CircleGeometry(0.17, 16).rotateX(-Math.PI / 2).translate(GX, 0.6, GZ), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.7, 0.15) })); Q.add(coals);

  // what is on each table while someone sits at it: glasses of beer on ice, cans, the ice bucket, the mồi; the hotpot
  const glass = (x, z) => [cyl(0.034, 0.028, 0.1, x, TOP + 0.07, z, '#E3A12C', 10), cyl(0.035, 0.035, 0.015, x, TOP + 0.125, z, '#FFF8E8', 10)];
  const can = (x, z) => [cyl(0.03, 0.03, 0.115, x, TOP + 0.075, z, '#2E7D32', 10), cyl(0.026, 0.026, 0.006, x, TOP + 0.135, z, '#C9CED6', 10)];
  const plate = (x, z, food, c) => { const out = [cyl(0.1, 0.085, 0.015, x, TOP + 0.025, z, '#F7F7F2', 16)]; for (let i = 0; i < food; i++) out.push(colorize(new THREE.SphereGeometry(0.022, 6, 5).scale(1.2, 0.7, 1).translate(x + Math.cos(i * 2.4) * 0.05 * (i % 3) / 2, TOP + 0.045, z + Math.sin(i * 2.4) * 0.05 * (i % 3) / 2), c)); return out; };
  const bucket = (x, z) => [cyl(0.085, 0.07, 0.13, x, TOP + 0.085, z, '#B9C0C8', 14), cyl(0.078, 0.078, 0.01, x, TOP + 0.15, z, '#EAF6FF', 14)];
  const dishes = T.map((t, ti) => {
    const list = [...bucket(t.x - t.w * 0.18, t.z + 0.12), ...can(t.x + t.w * 0.22, t.z - 0.18), ...can(t.x + t.w * 0.28, t.z - 0.1)];
    for (const s of ti === 0 ? OFFICE : LOCAL.filter((s) => Math.hypot(s.x - t.x, s.z - t.z) < 0.7)) list.push(...glass(t.x + (s.x - t.x) * 0.55, t.z + (s.z - t.z) * 0.55));
    list.push(...plate(t.x + 0.1, t.z - 0.12, 9, '#C8935A'), ...plate(t.x - 0.12, t.z - 0.16, 6, '#E9D9B5'));   // peanuts, the squid
    if (ti !== 2) list.push(...plate(t.x + t.w * 0.3, t.z + 0.15, 10, '#5A3B26'));   // snails
    if (ti === 0) list.push(...plate(t.x - 0.42, t.z + 0.14, 5, '#5E9A40'), cyl(0.15, 0.15, 0.05, t.x + 0.05, TOP + 0.04, t.z + 0.06, '#3A3F47', 16), cyl(0.16, 0.14, 0.11, t.x + 0.05, TOP + 0.12, t.z + 0.06, '#C9CED6', 18), cyl(0.15, 0.15, 0.01, t.x + 0.05, TOP + 0.175, t.z + 0.06, '#D9572B', 18));
    const o = new THREE.Mesh(mergeAll(list), vmat({ roughness: 0.4, metalness: 0.15 })); o.visible = false; Q.add(o);
    return o;
  });
  // the hand-painted sign: the name in red on yellow, what they serve under it
  const signTex = canvasTex(320, 160, (g) => {
    g.fillStyle = '#F7D23E'; g.fillRect(0, 0, 320, 160); g.strokeStyle = '#B5121B'; g.lineWidth = 8; g.strokeRect(5, 5, 310, 150);
    g.fillStyle = '#B5121B'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '800 22px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText(tr('world.nhau.sign0'), 160, 30);
    g.font = '900 44px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText(tr('world.nhau.sign1'), 160, 74);
    g.fillStyle = '#1E2A5A'; g.font = '700 20px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText(tr('world.nhau.sign2'), 160, 122);
  });
  { const m = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.75 }); for (const r of [0, Math.PI]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), m); p.position.set(SX, 1.38, 1.18 + (r ? -0.006 : 0.006)); p.rotation.y = r; Q.add(p); } }
  // the string of bulbs, sagging between the two poles (lit after dark)
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.3, 0.25) }), 15), wire = [];
  for (let i = 0; i < 15; i++) {
    const u = i / 14, x = -2.8 + u * 5.6, y = 2.36 - Math.sin(u * Math.PI) * 0.32, z = -1.15 + Math.sin(u * Math.PI) * 0.75;
    bulbs.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y - 0.06, z)); wire.push(new THREE.Vector3(x, y, z));
  }
  Q.add(bulbs, new THREE.Line(new THREE.BufferGeometry().setFromPoints(wire), new THREE.LineBasicMaterial({ color: '#2B2B2E' })));
  const smoke = puffs(G, 4, { size: 0.42, rise: 1.4, period: 2.8, color: '#BDBAB5' }), steam = puffs(G, 3, { size: 0.26, rise: 0.6, period: 2.2, color: '#F4F4F4' });

  // the people of the place: the regulars (on the stools), the waiter, the owner at the grill
  const crowd = folk(G, LOCAL.length + 2, { low, shadows: false }), WAITER = LOCAL.length, OWNER = LOCAL.length + 1;
  LOCAL.forEach((_, i) => crowd.dress(i, { shirt: SHIRTS[(i * 4 + 1) % SHIRTS.length], pants: i % 3 ? '#363D4C' : '#4A4F5A' }));
  crowd.dress(WAITER, { shirt: '#1E2125', pants: '#1E2125', sleeves: '#F2F2F2' }); crowd.dress(OWNER, { shirt: '#F2F2F2', sleeves: SKIN, pants: '#5A4A3A' });   // (the owner in a vest top)
  const sayEl = () => { const d = el('div', 'tag shop-say nhau-say'); d.hidden = true; const o = new CSS2DObject(d); o.visible = false; G.add(o); return o; };
  const bubbles = [sayEl(), sayEl()];
  const sayAt = (k, p, text, ms = 2400) => { const b = bubbles[k]; b.position.set(p.x, p.y + 1.95, p.z); b.element.textContent = text; b.element.hidden = false; b.visible = true; b.until = now + ms / 1000; };
  // the chip over the sign
  const chipEl = el('button', 'zone zone--hot nhau-chip'); chipEl.type = 'button';
  const chipLive = el('span', 'z-live'), ico = el('span', 'z-ico'); ico.append(icon('coffee'));
  chipEl.append(ico, el('span', null, tr('world.nhau.chip')), chipLive);
  const chip = new CSS2DObject(chipEl); chip.position.copy(W(SX, 1.18, 2.0)); chip.visible = false; G.add(chip);

  /* the evening: open hours, how many regulars, the office's table */
  let wpos = null, now = 0, open = false, regulars = 0, seatedAt = -1, office = [], toasts = 0, nextDo = 0, waiterAt = 0, waiterTo = null, police = null, leaver = null, onYou = null;
  const want = (h) => {   // how many regulars by the hour: a couple early, full by eight, thinning after ten; more on Fridays and Saturdays
    const wk = officeNow().getDay(), late = wk === 5 || wk === 6;
    return Math.min(LOCAL.length, (h < 18 ? 2 : h < 19.5 ? 4 : h < 22 ? 5 : 3) + (late ? 2 : 0));
  };
  const seatsTaken = new Array(LOCAL.length).fill(false);
  const sOf = (p) => (f.L?.axis === 'x' ? p.x : p.z);   // (along the kerb's lane)
  const posOf = (s, y = 0) => { const p = W(s.x, s.z, y); return { x: p.x, y: p.y, z: p.z }; };
  const worldYaw = (s) => { const a = W(s.x, s.z), b = W(s.x + Math.cos(s.face), s.z - Math.sin(s.face)); return yawTo(b.x - a.x, b.z - a.z); };
  function poseLocals(t) {
    for (let i = 0; i < LOCAL.length; i++) {
      if (!seatsTaken[i] || leaver?.i === i) continue;
      const s = LOCAL[i], p = posOf(s), ti = i < 4 ? 1 : 2;
      // hands at the table; now and then a sip; at a "dô" the glasses up
      const toast = t < (T[ti].doUntil || 0), sip = !toast && Math.sin(t * 0.7 + i * 1.9) > 0.86, laugh = !toast && Math.sin(t * 0.37 + i * 2.7) > 0.93;
      crowd.pose(i, { x: p.x, y: p.y, z: p.z, yaw: worldYaw(s), sit: p.y + ST, lean: laugh ? 0.18 : -0.05, arms: [[0.75, 0.1], toast ? [2.55, 0.2] : sip ? [2.2, 0.15] : [0.72, 0.1]] });
    }
  }
  function poseStaff(t, dt) {
    // the owner fanning the coals; the waiter between the ice chest and a table with someone at it
    const o = posOf({ x: GX, z: GZ + 0.45 }), g = posOf({ x: GX, z: GZ });
    crowd.pose(OWNER, { x: o.x, y: o.y, z: o.z, yaw: yawTo(g.x - o.x, g.z - o.z), lean: -0.12, arms: [[0.5, 0.1], [1.25 + Math.sin(t * 11) * 0.3, 0.25]] });
    if (!waiterTo || t > waiterAt) {
      const busy = T.map((tt, k) => k).filter((k) => (k === 0 ? office.length > 0 : LOCAL.some((s, i) => seatsTaken[i] && (i < 4 ? 1 : 2) === k)));
      const back = waiterTo && waiterTo.k !== -1;
      waiterTo = back || !busy.length ? { k: -1, ...posOf({ x: -2.1, z: 1.0 }) } : (() => { const k = busy[Math.floor(Math.random() * busy.length)]; return { k, ...posOf({ x: T[k].x + 0.2, z: T[k].z + 0.55 }) }; })();
      waiterAt = t + rnd(5, 9);
    }
    const w = wpos ??= { ...posOf({ x: -2.1, z: 1.0 }) }, dx = waiterTo.x - w.x, dz = waiterTo.z - w.z, d = Math.hypot(dx, dz), step = Math.min(d, dt * 1.1);
    if (d > 0.05) { w.x += (dx / d) * step; w.z += (dz / d) * step; w.yaw = yawTo(dx, dz); }
    const walking = d > 0.05, ph = t * 7;
    crowd.pose(WAITER, { x: w.x, y: w.y, z: w.z, yaw: w.yaw ?? 0, legs: walking ? [Math.sin(ph) * 0.45, -Math.sin(ph) * 0.45] : [0, 0], arms: [[walking ? -Math.sin(ph) * 0.3 : 0.1, 0.08], [walking ? 1.1 : 0.1, 0.1]] });
  }
  // a regular going home on his own scooter after a few: off his stool, along the pavement to the kerb, and away (the
  // police, if their alcohol checkpoint is up, will want a word)
  function sendLocalOff() {
    const taken = LOCAL.map((_, i) => i).filter((i) => seatsTaken[i] && i >= 4);
    if (!taken.length || leaver) return false;
    const i = taken[Math.floor(Math.random() * taken.length)], from = posOf(LOCAL[i]), to = posOf({ x: LOCAL[i].x, z: 2.05 });
    leaver = { i, x: from.x, y: from.y, z: from.z, to, t0: now };
    police?.(null);   // (the checkpoint up the street hears he's leaving)
    sayAt(1, from, tr('world.nhau.say.leave'), 2200);
    return true;
  }
  function stepLeaver(dt) {
    const L = leaver, dx = L.to.x - L.x, dz = L.to.z - L.z, d = Math.hypot(dx, dz);
    if (d > 0.05) { const s = Math.min(d, dt * 1.0); L.x += (dx / d) * s; L.z += (dz / d) * s; crowd.pose(L.i, { x: L.x, y: L.y, z: L.z, yaw: yawTo(dx, dz), legs: [Math.sin(now * 7) * 0.45, -Math.sin(now * 7) * 0.45], arms: [[-Math.sin(now * 7) * 0.3, 0.08], [Math.sin(now * 7) * 0.3, 0.08]] }); return; }
    // at the kerb: on his scooter and off (street-life.js); the checkpoint gets to hear of him
    crowd.hide(L.i); seatsTaken[L.i] = false; leaver = null; regulars--;
    const r = depart(f.L, sOf(L.to), { livery: 'plain', side: 1.92, jacket: SHIRTS[(L.i * 4 + 1) % SHIRTS.length] });
    if (r) { r.release(); police?.(r.vehicle, { drinks: 3 + Math.floor(Math.random() * 6) }); }
  }
  function syncRegulars(h) {
    const n = open ? want(h) : 0;
    for (let i = 0; i < LOCAL.length; i++) {
      const on = i < n && (leaver?.i !== i);
      if (on !== seatsTaken[i] && leaver?.i !== i) { seatsTaken[i] = on; if (!on) crowd.hide(i); }
    }
    regulars = seatsTaken.filter(Boolean).length;
  }
  function update(dt, t, hour) {
    now = t;
    const h = hour ?? (officeNow().getHours() + officeNow().getMinutes() / 60), wasOpen = open;
    open = FORCE || (h >= OPEN[0] && h < OPEN[1]);
    if (open !== wasOpen) { chip.visible = open; if (!open) { for (let i = 0; i < LOCAL.length + 2; i++) crowd.hide(i); seatsTaken.fill(false); leaver = null; dishes.forEach((d) => { d.visible = false; }); } }
    if (!open) { smoke.show(t, 0, 0, 0, false); steam.show(t, 0, 0, 0, false); crowd.flush(); for (const b of bubbles) { b.visible = false; } return; }
    if (t - seatedAt > 20 || seatedAt < 0) { seatedAt = t; syncRegulars(h); }
    const g = W(GX, GZ, 0.65), pot = W(T[0].x + 0.05, T[0].z + 0.06, TOP + 0.2), inView = seen(f.x, f.z);
    smoke.show(t, g.x, g.y, g.z, inView); steam.show(t, pot.x, pot.y, pot.z, inView && office.length > 0);
    dishes.forEach((d, k) => { d.visible = k === 0 ? office.length > 0 : LOCAL.some((s, i) => seatsTaken[i] && (i < 4 ? 1 : 2) === k); });
    coals.material.color.setRGB(2.2 + Math.sin(t * 3) * 0.3, 0.7, 0.15);
    for (const b of bubbles) if (b.visible && t > b.until) { b.visible = false; b.element.hidden = true; }
    // the regulars' "dô": a table at a time, every minute or two
    if (t > nextDo) {
      nextDo = t + (FORCE ? rnd(8, 14) : rnd(45, 110));
      const ti = Math.random() < 0.5 ? 1 : 2, who = LOCAL.findIndex((s, i) => seatsTaken[i] && (i < 4 ? 1 : 2) === ti && leaver?.i !== i);
      if (who >= 0) { T[ti].doUntil = t + 2.2; sayAt(0, posOf(LOCAL[who]), tr('world.nhau.say.mot'), 2200); if (inView) clink(); }
    }
    if (!inView && !FORCE) { crowd.flush(); return; }
    poseLocals(t); poseStaff(t, dt);
    if (leaver) stepLeaver(dt);
    crowd.flush();
    const live = tr(office.length ? 'world.nhau.chipOffice' : 'world.nhau.chipOpen', { n: regulars + office.length, m: office.length });
    if (chipLive.textContent !== live) chipLive.textContent = live;
  }
  // what people/nhau.js needs: the office's places, where to stand for a ride, a clink, who is there
  const Qs = {
    open: () => open,
    name: () => tr('world.nhau.short'),
    // the office's six stools: where to stand (world), which way to face (an office person's facing: atan2(dx, dz)), and
    // the ground their feet go to so that sitting puts them on the stool (a chibi sits 0.49 above its feet)
    seats: () => OFFICE.map((s) => { const p = W(s.x, s.z), c = W(T[0].x, T[0].z); return { x: p.x, z: p.z, face: Math.atan2(c.x - p.x, c.z - p.z), y: p.y + ST - 0.49 }; }),
    // on the pavement in front (on the walk network), and where to wait for a ride at the kerb
    entry: () => { const p = W(T[0].x, 1.65); return { x: p.x, z: p.z }; },
    pickup: (i) => { const p = W(-2.2 + i * 0.75, 2.25); return { x: p.x, z: p.z }; },
    kerb: (i) => ({ L: f.L, s: sOf(W(-2.2 + i * 0.75, 2.6)) }),
    group: () => office, setGroup(list) { office = list; card?.refresh?.(); },
    toasts: () => toasts, toast() { toasts++; if (seen(f.x, f.z)) clink(); card?.refresh?.(); },
    locals: () => regulars,
    onYou(fn) { onYou = fn; },
  };
  chipEl.addEventListener('click', (e) => { e.stopPropagation(); if (card && !card.hidden) card.hidden = true; else openCard(Qs); });
  return {
    update, night(on) { bulbs.material.color.copy(on ? new THREE.Color(3, 2.2, 1.2) : new THREE.Color(0.35, 0.3, 0.25)); },
    lane: f.L, s: f.s,
    police(fn) { police = fn; },
    // in first person: E by the place to sit down (with the office's lot, if they are here: they cheer), a trà đá
    spots: () => (open ? [{ kind: 'nhau', ...(() => { const p = W(T[0].x, 1.3); return { x: p.x, z: p.z }; })(), label: tr(office.length ? 'world.nhau.fpJoin' : 'world.nhau.fp'), act: () => { toast(tr(office.length ? 'world.nhau.fpJoinDone' : 'world.nhau.fpDone')); onYou?.(); if (seen(f.x, f.z)) clink(); } }] : []),
    office: Qs,
    debug: { state: () => ({ open, regulars, office: office.map((m) => ({ name: m.name, stage: m.stage, drinks: m.drinks })), toasts, at: [+f.x.toFixed(1), +f.z.toFixed(1)] }), local: () => sendLocalOff(), card: () => { openCard(Qs); return !card.hidden; } },
  };
}
