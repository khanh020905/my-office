/* The traffic police (Cảnh sát giao thông, CSGT) on the streets round the office, as they work in Vietnam today: the stop
   procedure of Thông tư 73/2024/TT-BCA (signal with the whistle and the baton, the rider pulls in, the officer salutes
   per the CAND regulations, says why, asks for the papers, writes the record) and the fines of Nghị định 168/2024/NĐ-CP
   (in force since 1/1/2025), article 7 for motorbikes.
   - A patrol: now and then two officers in the yellow uniform ride by on white patrol bikes (C.S.G.T / TRAFFIC POLICE on
     the box, lights flashing), 6:00–22:00.
   - A checkpoint some mornings and late afternoons (helmets, three on a scooter, a phone, the red light at the crossing
     just before it), and some evenings for alcohol (more on Fridays and Saturdays): the bikes up on the office's
     pavement just after a crossing, a sign, cones along the kerb, one officer at the lane's edge with the baton, the
     other by the bikes; a reflective vest after dark. They stop one now and then: the scooter pulls in, the rider gets
     off, the officer salutes, says why, checks the licence and the registration (on VNeID), writes the biên bản (or
     tests the breath), the rider signs and rides on, or for a high reading walks off, the scooter held.
   A chip over the checkpoint opens a card: the stop, its steps, the fine range with its clause, and the biên bản itself
   (made-up names, plates and numbers: a pretend document). In first person, E by them does the same. Nothing is real
   money and nobody is real. ?csgt: a checkpoint now and stops every few seconds; __office.street.csgt for tests.
   Nothing runs while none is out but a look at the clock twice a second. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { $, el, officeNow, replay } from '../../core/env.js';
import { canvasTex } from '../../scene/blocks.js';
import { GY, boxAt, colorize, mergeAll, vmat } from '../terrace.js';
import { wx } from '../../life/weather.js';
import { sfx } from '../../audio/sfx.js';
import { icon } from '../../ui/icons.js';
import { chatSay } from '../../ui/group-chat.js';
import { sessions, workers } from '../../people/workers.js';
import { seen } from './street-folk.js';
import { t as tr } from '../../../i18n/index.js';

const FORCE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('csgt');
const UNIFORM = '#D3AF48', RED = '#C8102E', VISOR = '#5A3B24', GLOVE = '#F6F6F2', SHOES = '#17181B', SKIN = '#EDC4A2', HAIR = '#211C18';
const VEST = '#C9F23A', SILVER = '#DDE2E8', BIKE = '#F2F4F6', DARK = '#23262B', BLUE = '#1C4FA6';
const HIP = 0.72, SH = 1.24;
// arm poses [swing forward, raise outward, elbow bend], worked out for these arm lengths (the hand where it should be):
// the salute's fingertips at the kepi's brim, the baton held up high, a clipboard held level at the chest, writing on it
const SALUTE = [2.15, 0.35, 1.2], BATON_UP = [2.6, -0.1, 0.05], HOLD = [0.15, 0.1, 1.45], WRITE = [0.35, -0.3, 1.3], SHOW = [0.4, 0.05, 1.3], REST = [0.06, 0.08, 0.1];
const rnd = (a, b) => a + Math.random() * (b - a), pickOf = (a) => a[Math.floor(Math.random() * a.length)];

/* ---------- the law: what each stop is for (Nghị định 168/2024/NĐ-CP, điều 7: mô tô, xe gắn máy) ----------
   fine in thousands of đồng; pts: points off the licence (khoản 13); strip: the licence taken (months); held: the
   vehicle held (Luật Xử lý vi phạm hành chính, điều 125: up to 7 days before the decision) */
export const OFFENCES = {
  helmet: { law: 'điểm h khoản 2 Điều 7', fine: [400, 600], pts: 0 },
  three: { law: 'điểm g khoản 2 Điều 7', fine: [400, 600], pts: 0 },
  phone: { law: 'điểm đ khoản 4 Điều 7', fine: [800, 1000], pts: 4 },
  red: { law: 'điểm c khoản 7 Điều 7', fine: [4000, 6000], pts: 4 },
  alc1: { law: 'điểm a khoản 6 Điều 7', fine: [2000, 3000], pts: 4, mg: [0.06, 0.25] },
  alc2: { law: 'điểm b khoản 8 Điều 7', fine: [6000, 8000], pts: 10, mg: [0.26, 0.4], held: true },
  alc3: { law: 'điểm d khoản 9 Điều 7', fine: [8000, 10000], pts: 0, strip: [22, 24], mg: [0.41, 0.62], held: true },
  clear: { law: '', fine: null, pts: 0 },   // (an alcohol check that finds nothing)
};
const money = (k) => `${(k * 1000).toLocaleString('vi-VN')}`;
const FAMILY = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô', 'Dương'];
const MID = { m: ['Văn', 'Minh', 'Quốc', 'Hữu', 'Đức', 'Thanh'], f: ['Thị', 'Ngọc', 'Thu', 'Thanh', 'Mỹ', 'Bảo'] };
const GIVEN = { m: ['An', 'Bình', 'Cường', 'Dũng', 'Hải', 'Hùng', 'Khoa', 'Long', 'Nam', 'Phúc', 'Quân', 'Tài', 'Tuấn', 'Vinh'], f: ['Hà', 'Hương', 'Lan', 'Linh', 'Mai', 'Ngân', 'Nhi', 'Thảo', 'Trang', 'Uyên', 'Vy', 'Yến'] };
const RANKS = ['Trung uý', 'Thượng uý', 'Đại uý'];
const nameOf = (g) => `${pickOf(FAMILY)} ${pickOf(MID[g])} ${pickOf(GIVEN[g])}`;
// a made-up plate in the usual shape: province code, series letter and digit, five digits (59-X1 234.56)
const plate = () => `${pickOf(['59', '59', '51', '29', '30', '43', '65'])}-${pickOf('ABCDEFGHKLMNPSTUVXYZ'.split(''))}${1 + Math.floor(Math.random() * 9)} ${100 + Math.floor(Math.random() * 900)}.${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`;

/* ---------- people: officers and riders, few enough to be ordinary meshes ----------
   Proportions of the street's figures (street-folk.js): facing +x, its right along +z, feet on y = 0; arms in two parts
   (shoulder, elbow) and legs in two (hip, knee), so a salute, writing on a clipboard and sitting on a bike read. */
const matCache = new Map();
const M = (c, o = {}) => { const k = `${c}|${JSON.stringify(o)}`; if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o })); return matCache.get(k); };
const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = false; return o; };
function figure(look) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); body.position.y = HIP;
  const cloth = M(look.shirt), legsM = M(look.pants), skin = M(SKIN), hand = M(look.gloves || SKIN);
  body.add(mesh(new RoundedBoxGeometry(0.26, 0.56, 0.4, 2, 0.08).translate(0, 0.28, 0), cloth));
  body.add(mesh(new THREE.SphereGeometry(0.22, 14, 10).translate(0, 0.79, 0), skin));
  const head = {};
  // the head: hair, then a kepi (yellow crown, red band, brown peak, a small badge) or a helmet, or nothing over the hair
  head.hair = mesh(new THREE.SphereGeometry(0.232, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.55).rotateZ(0.3).translate(-0.02, 0.81, 0), M(look.hair || HAIR)); body.add(head.hair);
  head.bun = mesh(new THREE.SphereGeometry(0.09, 10, 8).translate(-0.24, 0.86, 0), M(look.hair || HAIR)); head.bun.visible = !!look.bun; body.add(head.bun);
  head.kepi = new THREE.Group();
  head.kepi.add(mesh(new THREE.CylinderGeometry(0.235, 0.205, 0.11, 18).translate(0, 1.035, 0), M(UNIFORM)), mesh(new THREE.CylinderGeometry(0.208, 0.208, 0.06, 18).translate(0, 0.955, 0), M(RED)),
    mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.016, 16, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 1.05).translate(0.06, 0.93, 0).rotateZ(-0.12), M(VISOR)),
    mesh(new THREE.CircleGeometry(0.035, 12).rotateY(Math.PI / 2).translate(0.212, 0.97, 0), M('#F2C230', { emissive: '#3A2A00' })));
  head.helmet = new THREE.Group();
  head.helmet.add(mesh(new THREE.SphereGeometry(0.25, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.56).translate(-0.02, 0.83, 0), M(look.helmet || '#F4F5F7', { roughness: 0.35 })),
    mesh(new RoundedBoxGeometry(0.12, 0.03, 0.3, 1, 0.012).rotateZ(-0.22).translate(0.21, 0.9, 0), M(look.helmet || '#F4F5F7', { roughness: 0.35 })));
  body.add(head.kepi, head.helmet);
  // an officer's collar tabs (red), belt and shoulder boards; the reflective vest for after dark
  let vest = null;
  if (look.officer) {
    for (const s of [-1, 1]) body.add(mesh(new THREE.BoxGeometry(0.03, 0.05, 0.07).translate(0.12, 0.52, s * 0.07), M(RED)), mesh(new THREE.BoxGeometry(0.16, 0.025, 0.09).translate(-0.01, 0.56, s * 0.15), M('#B9952F')));
    body.add(mesh(new THREE.BoxGeometry(0.275, 0.05, 0.41).translate(0, 0.06, 0), M('#3B2A1D')));
    vest = new THREE.Group();
    vest.add(mesh(new RoundedBoxGeometry(0.29, 0.42, 0.43, 2, 0.08).translate(0, 0.3, 0), M(VEST, { emissive: '#2A3A00' })));
    for (const y of [0.2, 0.36]) vest.add(mesh(new THREE.BoxGeometry(0.295, 0.035, 0.435).translate(0, y, 0), M(SILVER, { emissive: '#666666', metalness: 0.4 })));
    vest.visible = false; body.add(vest);
  }
  // arms: shoulder → upper arm → elbow → forearm and hand; what the hand holds hangs off the hand
  const arms = [-1, 1].map((side) => {
    const sh = new THREE.Group(); sh.position.set(0, SH - HIP, side * 0.25); body.add(sh);
    sh.add(mesh(new THREE.BoxGeometry(0.11, 0.27, 0.1).translate(0, -0.135, 0), cloth));
    const elbow = new THREE.Group(); elbow.position.y = -0.27; sh.add(elbow);
    elbow.add(mesh(new THREE.BoxGeometry(0.1, 0.24, 0.095).translate(0, -0.12, 0), look.shortSleeves ? skin : cloth));
    const h = new THREE.Group(); h.position.y = -0.26; elbow.add(h);
    h.add(mesh(new THREE.BoxGeometry(0.1, 0.09, 0.1), hand));
    return { side, sh, elbow, hand: h };
  });
  const legs = [-1, 1].map((side) => {
    const hip = new THREE.Group(); hip.position.set(0, HIP, side * 0.1); root.add(hip);
    hip.add(mesh(new THREE.BoxGeometry(0.15, 0.33, 0.15).translate(0, -0.165, 0), legsM));
    const knee = new THREE.Group(); knee.position.y = -0.33; hip.add(knee);
    knee.add(mesh(new THREE.BoxGeometry(0.14, 0.31, 0.14).translate(0, -0.155, 0), legsM), mesh(new THREE.BoxGeometry(0.22, 0.08, 0.15).translate(0.03, -0.35, 0), M(SHOES)));
    return { hip, knee };
  });
  root.visible = false;
  const F = {
    root, body, arms, legs, head, vest, look,
    wear(what) { head.kepi.visible = what === 'kepi'; head.helmet.visible = what === 'helmet'; head.hair.visible = what !== 'helmet'; },
    // f: { x, y, z, yaw, lean (forward < 0), arms: [[swing, raise, bend], …] (left, right), legs: [[swing, bend], …], walk (a phase) }
    pose(f) {
      root.visible = true; if (F.say) F.say.visible = true; root.position.set(f.x, f.y, f.z); root.rotation.y = f.yaw || 0; body.rotation.z = f.lean || 0;
      const w = f.walk;
      arms.forEach((a, k) => {
        const [sw = 0, rs = 0, bend = 0] = f.arms?.[k] || [w != null ? Math.sin(w + k * Math.PI) * 0.35 : 0, 0.06, w != null ? 0.25 : 0.08];
        a.sh.rotation.set(-a.side * rs, 0, sw); a.elbow.rotation.z = bend;
      });
      legs.forEach((l, k) => {
        const [sw = 0, bend = 0] = f.legs?.[k] || (w != null ? [Math.sin(w + k * Math.PI + Math.PI) * 0.42, Math.max(0, -Math.cos(w + k * Math.PI)) * 0.55] : [0, 0]);
        l.hip.rotation.z = sw; l.knee.rotation.z = -bend;
      });
    },
    hide() { root.visible = false; if (F.say) { F.say.visible = false; F.say.element.hidden = true; } },   // (a CSS2D label shows even under a hidden parent)
  };
  F.wear(look.hat || 'bare');
  return F;
}
// the things in hands, each hanging off a hand group (its local -y runs on along the forearm)
function baton() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.48, 8).translate(0, -0.22, 0), M('#F4F4F2', { emissive: '#222222' })));
  const tip = mesh(new THREE.SphereGeometry(0.03, 8, 6).translate(0, -0.46, 0), M('#FF3B30', { emissive: '#FF2A20', emissiveIntensity: 0 }));
  g.add(tip); g.userData.tip = tip;
  return g;
}
function clipboard() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.24, 0.015, 0.32), M('#8B5A2B')), mesh(new THREE.BoxGeometry(0.2, 0.017, 0.27).translate(0, 0.002, 0.01), M('#FBFBF7')), mesh(new THREE.BoxGeometry(0.08, 0.02, 0.03).translate(0, 0.008, -0.15), M('#9AA0A8', { metalness: 0.6 })));
  g.position.set(0.02, -0.06, 0.08); g.rotation.set(0.25, 0, 0);
  return g;
}
function breathTester() {
  const g = new THREE.Group(), scr = M('#9CFFB0', { emissive: '#2BD45A', emissiveIntensity: 0.6 });
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.15, 0.05).translate(0, -0.08, 0), M(DARK)), mesh(new THREE.BoxGeometry(0.008, 0.05, 0.035).translate(0.031, -0.06, 0), scr), mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 6).rotateZ(Math.PI / 2).translate(0.07, -0.02, 0), M('#F4F4F2')));
  return g;
}
function phone() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.075, 0.015, 0.14).translate(0.04, -0.05, 0), M(DARK)), mesh(new THREE.BoxGeometry(0.06, 0.017, 0.12).translate(0.04, -0.043, 0), M('#CFE6FF', { emissive: '#4C8DFF', emissiveIntensity: 0.5 })));
  return g;
}
const sheet = () => { const g = new THREE.Group(); g.add(mesh(new THREE.BoxGeometry(0.2, 0.006, 0.27).translate(0.06, -0.05, 0), M('#FBFBF7'))); return g; };

/* ---------- the patrol bike: white, the box at the back lettered C.S.G.T / TRAFFIC POLICE, a light bar over it ---------- */
let LETTER = null;
const lettering = () => (LETTER ??= canvasTex(256, 128, (g) => {
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 256, 128); g.fillStyle = BLUE; g.fillRect(0, 96, 256, 16);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 46px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText('C.S.G.T', 128, 40);
  g.font = '800 22px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText('TRAFFIC POLICE', 128, 78);
}));
function patrolBike() {
  const g = new THREE.Group(), white = vmat({ roughness: 0.35, metalness: 0.25 });
  const parts = [];
  for (const x of [0.66, -0.66]) parts.push(colorize(new THREE.CylinderGeometry(0.31, 0.31, 0.12, 16).rotateX(Math.PI / 2).translate(x, 0.31, 0), '#16181C'), colorize(new THREE.CylinderGeometry(0.15, 0.15, 0.13, 10).rotateX(Math.PI / 2).translate(x, 0.31, 0), '#9AA2AD'));
  parts.push(boxAt(0.62, 0.3, 0.24, 0.0, 0.48, 0, '#3A3F47'), boxAt(0.5, 0.08, 0.28, -0.24, 0.86, 0, '#1C1E22'));   // engine, seat
  parts.push(colorize(new RoundedBoxGeometry(0.52, 0.22, 0.34, 2, 0.08).translate(0.22, 0.84, 0), BIKE), colorize(new RoundedBoxGeometry(0.24, 0.34, 0.5, 2, 0.08).rotateZ(-0.35).translate(0.62, 0.98, 0), BIKE));
  parts.push(colorize(new THREE.BoxGeometry(0.03, 0.26, 0.42).rotateZ(-0.5).translate(0.7, 1.24, 0), '#BFD6E6'), boxAt(0.05, 0.08, 0.16, 0.76, 0.95, 0, '#FFF4D6'));   // windscreen, headlamp
  parts.push(colorize(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6).rotateX(Math.PI / 2).translate(0.5, 1.12, 0), '#2B2F36'), colorize(new THREE.CylinderGeometry(0.025, 0.03, 0.62, 6).rotateZ(-0.35).translate(0.6, 0.6, 0), '#2B2F36'));
  parts.push(colorize(new RoundedBoxGeometry(0.42, 0.34, 0.46, 2, 0.05).translate(-0.7, 1.02, 0), BIKE), boxAt(0.43, 0.05, 0.47, -0.7, 0.9, 0, BLUE));   // the box, a blue band
  parts.push(boxAt(0.02, 0.3, 0.02, -0.82, 1.32, 0, '#2B2F36'), boxAt(0.06, 0.05, 0.3, -0.82, 1.48, 0, DARK));   // the light bar's post and bar
  g.add(new THREE.Mesh(mergeAll(parts), white));
  const decal = new THREE.MeshStandardMaterial({ map: lettering(), roughness: 0.6 });
  for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), decal); p.position.set(-0.7, 1.08, s * 0.232); p.rotation.y = s > 0 ? 0 : Math.PI; g.add(p); }
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.045, 0.12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.05, 0.05) }));
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.045, 0.12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.08, 0.35) }));
  red.position.set(-0.82, 1.52, 0.08); blue.position.set(-0.82, 1.52, -0.08); g.add(red, blue);
  g.userData.lamps = { red, blue };
  g.visible = false;
  return g;
}
const LIT_R = new THREE.Color(3, 0.35, 0.3), LIT_B = new THREE.Color(0.4, 0.9, 3.2), DIM_R = new THREE.Color(0.35, 0.05, 0.05), DIM_B = new THREE.Color(0.05, 0.08, 0.35);
function flashLamps(bike, t, on) {
  const { red, blue } = bike.userData.lamps, k = Math.floor(t * 3) % 2;
  red.material.color.copy(on && k ? LIT_R : DIM_R); blue.material.color.copy(on && !k ? LIT_B : DIM_B);
}

/* ---------- the whistle: one long blast (a pea whistle's warble), only with the office's sounds on and in view ---------- */
let actx = null;
if (typeof addEventListener !== 'undefined') addEventListener('pointerdown', () => { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ } } if (actx?.state === 'suspended') actx.resume(); }, { passive: true });
function whistle() {
  if (!actx || actx.state !== 'running' || !sfx?.on || replay.on) return;
  const t0 = actx.currentTime + 0.02, dur = 0.85, o = actx.createOscillator(), trill = actx.createOscillator(), depth = actx.createGain(), g = actx.createGain();
  o.type = 'triangle'; o.frequency.setValueAtTime(2750, t0); trill.frequency.value = 34; depth.gain.value = 260;
  trill.connect(depth).connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.03); g.gain.setValueAtTime(0.07, t0 + dur - 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(actx.destination); o.start(t0); trill.start(t0); o.stop(t0 + dur + 0.05); trill.stop(t0 + dur + 0.05);
}

/* ---------- the card: the stop, its steps, the law, the biên bản ---------- */
let card = null, cardFor = null;
const fmt2 = (n) => String(n).padStart(2, '0');
function ticketHtml(st) {
  const O = OFFENCES[st.kind], d = new Date(st.at), e = new Date(st.doneAt || st.at + 9 * 60e3), P = (k, v) => tr(`world.csgt.paper.${k}`, v);
  const box = el('article', 'csgt-paper');
  const top = el('div', 'csgt-paper-top'), left = el('div'), right = el('div');
  left.append(el('b', null, P('unit')), el('span', null, P('team')), el('span', 'csgt-no', P('no', { no: st.no })));
  right.append(el('b', null, P('nation')), el('span', 'csgt-motto', P('motto')), el('i', null, P('placeDate', { d: d.getDate(), m: d.getMonth() + 1, y: d.getFullYear() })));
  top.append(left, right);
  box.append(top, el('h4', null, P('title')), el('p', 'csgt-paper-sub', P('sub')));
  const lines = [
    P('when', { h: fmt2(d.getHours()), m: fmt2(d.getMinutes()), d: d.getDate(), mo: d.getMonth() + 1, y: d.getFullYear(), place: P('place') }),
    P('by', { rank: st.officer.rank, name: st.officer.name }),
    P('to', { title: tr(`world.csgt.${st.g === 'f' ? 'mrs' : 'mr'}`), name: st.name, born: st.born }),
    P('vehicle', { plate: st.plate }),
    P('did', { act: tr(`world.csgt.act.${st.kind}`) + (st.mg ? P('mg', { mg: st.mg.toFixed(3).replace('.', ',') }) : '') }),
    P('law', { law: O.law }),
    P('measure', { measure: O.held ? P('held') : P('none') }),
    P('says', { says: P('accept') }),
    P('copies', { h: fmt2(e.getHours()), m: fmt2(e.getMinutes()) }),
  ];
  for (const l of lines) box.append(el('p', null, l));
  const signs = el('div', 'csgt-signs');
  for (const [who, name] of [[P('signer'), st.name], [P('writer'), `${st.officer.rank} ${st.officer.name}`]]) {
    const s = el('div'); s.append(el('b', null, who), el('small', null, P('signNote')), el('span', 'csgt-scrawl', st.signed || who === P('writer') ? name.split(' ').pop() : ''), el('span', null, name)); signs.append(s);
  }
  box.append(signs, el('p', 'csgt-mock', tr('world.csgt.mock')));
  return box;
}
const STEPS = ['signal', 'salute', 'reason', 'papers', 'write', 'sign', 'go'];
const ALC_STEPS = ['signal', 'salute', 'reason', 'papers', 'blow', 'write', 'sign', 'go'];
function renderCard(api) {
  if (!card) return;
  // the stop under way (or the last one); its record once written, else the last record written
  const st = api.current() || api.last(), body = card.querySelector('.csgt-body'); body.replaceChildren();
  const paper = st?.written ? st : api.last()?.written ? api.last() : null;
  card.querySelector('.csgt-sub').textContent = api.where();
  if (!st) { body.append(el('p', 'csgt-empty', tr('world.csgt.noStop'))); return; }
  const O = OFFENCES[st.kind];
  const head = el('div', 'csgt-stop');
  head.append(el('b', null, tr(`world.csgt.short.${st.kind}`)), el('span', null, `${st.plate} · ${st.done ? tr('world.csgt.done') : tr('world.csgt.now')}`));
  body.append(head);
  const steps = el('ol', 'csgt-steps'), list = st.alc ? (st.kind === 'clear' ? ALC_STEPS.filter((s) => s !== 'write' && s !== 'sign') : ALC_STEPS) : STEPS, at = list.indexOf(st.step);
  list.forEach((s, i) => { const li = el('li', null, tr(`world.csgt.step.${s}`)); li.dataset.state = st.done || i < at ? 'done' : i === at ? 'now' : 'next'; steps.append(li); });
  body.append(steps);
  if (O.fine) {
    const law = el('dl', 'csgt-law'), row = (k, v) => law.append(el('dt', null, tr(`world.csgt.law.${k}`)), el('dd', null, v));
    row('basis', tr('world.csgt.law.basisText', { law: O.law }));
    row('fine', tr('world.csgt.law.fineText', { a: money(O.fine[0]), b: money(O.fine[1]) }));
    row('points', O.strip ? tr('world.csgt.law.strip', { a: O.strip[0], b: O.strip[1] }) : O.pts ? tr('world.csgt.law.pts', { n: O.pts }) : tr('world.csgt.law.noPts'));
    if (O.held) row('held', tr('world.csgt.law.heldText'));
    row('pay', tr('world.csgt.law.payText'));
    body.append(law);
  } else if (st.mg != null || st.kind === 'clear') body.append(el('p', 'csgt-clear', tr('world.csgt.clearText')));
  if (O.fine && !st.written) body.append(el('p', 'csgt-empty', tr('world.csgt.paperSoon')));
  if (paper) { if (paper !== st) body.append(el('p', 'csgt-empty', tr('world.csgt.lastPaper'))); body.append(ticketHtml(paper)); }
  body.append(el('p', 'csgt-foot', tr('world.csgt.foot')));
}
function openCard(api) {
  if (!card) {
    card = el('section', 'csgt-card'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', tr('world.csgt.name'));
    const head = el('header', 'csgt-head'), ico = el('span', 'csgt-ico'), title = el('div', 'csgt-title'), close = el('button', 'icon-btn csgt-close');
    ico.append(icon('alert')); title.append(el('h3', null, tr('world.csgt.name')), el('p', 'csgt-sub', ''));
    close.type = 'button'; close.setAttribute('aria-label', tr('common.close')); close.append(icon('x')); close.addEventListener('click', closeCard);
    head.append(ico, title, close); card.append(head, el('div', 'csgt-body'));
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && card && !card.hidden) closeCard(); });
    ($('stage-wrap') || document.body).append(card);
  }
  card.hidden = false; cardFor = api; renderCard(api);
}
function closeCard() { if (card) card.hidden = true; cardFor = null; }

/* ---------- the police on the street ---------- */
export function buildCsgt(G, { laneAt, spotOf, SB, HALF, C, slots, pullOver, callRider, depart, lookOf, lightAt, riderParts, obstacle, inShop, eveningAt = null, avoid = [] }) {
  // where a checkpoint goes: just after a crossing (CSGT often stand where the red light can be seen), in the free stretch
  // between that crossing's zebra (4.8 m on) and the next stop line (9.8 m on), clear of taxi ranks, bus stops, stalls
  // and a wedding's tent. By day the office's own kerb (the street in front first, then its sides); for the evening's
  // alcohol checks the lane past the quán nhậu (street-nhau.js), a crossing or two after it, where its regulars ride by.
  const sides = [laneAt('x', SB.z1 + HALF, -1), laneAt('x', SB.z0 - HALF, 1), laneAt('z', SB.x1 + HALF, 1), laneAt('z', SB.x0 - HALF, -1)].filter(Boolean);
  const mid = (L) => (L.axis === 'x' ? C[0] : C[1]);
  function siteOn(L, ok) {
    for (const c of L.cross.filter(ok).sort((p, q) => Math.abs(p - mid(L)) - Math.abs(q - mid(L)))) {
      const s = (u) => c + L.dir * u, [cx, cz] = spotOf(L, s(7.2), 2.7);
      if (slots.some((sl) => sl.L === L && Math.abs(sl.s - s(7.2)) < 5)) continue;
      if (avoid.some(([x, z, r]) => Math.hypot(x - cx, z - cz) < r + 3.2)) continue;
      if (inShop?.(cx, cz, 1.5)) continue;
      return { L, c, s, at: (u, side) => spotOf(L, s(u), side) };
    }
    return null;
  }
  let day = null;
  for (const L of sides) {
    const [a, b] = L.axis === 'x' ? [SB.x0, SB.x1] : [SB.z0, SB.z1];
    day = siteOn(L, (c) => { const s0 = c + L.dir * 4.6, s1 = c + L.dir * 10; return Math.min(s0, s1) > a + 0.5 && Math.max(s0, s1) < b - 0.5; });
    if (day) break;
  }
  const eve = eveningAt?.L ? siteOn(eveningAt.L, (c) => { const d = (c - eveningAt.s) * eveningAt.L.dir; return d > 3 && d < 38; }) : null;
  const dead = { update() {}, night() {}, spots: () => [], expect: () => false, debug: { state: () => ({ phase: 'none' }) } };
  if (!day && !eve) return dead;
  const sites = { day: day || eve, eve: eve || day };
  // the stretch's own frame, set for whichever site is in use (takeSite()): along the lane, towards the kerb, which way is which
  let site, L, F, K, FWD = 0, BACK = 0, TO_ROAD = 0;
  const yawTo = ([dx, dz]) => Math.atan2(-dz, dx);
  const gy = (side) => (side > HALF ? GY + 0.12 : GY);
  const P = (u, side) => { const [x, z] = site.at(u, side); return { x, y: gy(side), z }; };
  // the layout, in metres after the crossing (u) and out from the road's middle (side)
  const POST = { u: 7.8, side: 1.95 }, STOP = { u: 6.0, side: 1.92 }, BIKES = [{ u: 7.05, side: 2.85 }, { u: 8.45, side: 2.85 }], SIGN = { u: 5.4, side: 2.8 }, BYB = { u: 9.2, side: 2.7 };
  const CONES = [[6.9, 2.0], [7.6, 1.76], [8.5, 1.74], [9.4, 1.76]];
  const signTex = canvasTex(256, 192, (g) => {
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 256, 192); g.strokeStyle = RED; g.lineWidth = 12; g.strokeRect(6, 6, 244, 180);
    g.fillStyle = '#F2C230'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 9 : 22; g.lineTo(128 + Math.cos(a) * r, 46 + Math.sin(a) * r); } g.fill();
    g.fillStyle = RED; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 25px "Be Vietnam Pro", system-ui, sans-serif';
    g.fillText(tr('world.csgt.sign1'), 128, 98); g.fillStyle = '#1B1E24'; g.font = '800 21px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText(tr('world.csgt.sign2'), 128, 134);
  });
  /* each site's set: the cones by the kerb and the sign on the pavement (the bikes and the chip move to the one in use) */
  function takeSite(st) {
    site = st; L = st.L; F = L.axis === 'x' ? [L.dir, 0] : [0, L.dir]; K = L.axis === 'x' ? [0, L.dir] : [-L.dir, 0];   // along the lane, towards the kerb
    FWD = yawTo(F); BACK = yawTo([-F[0], -F[1]]); TO_ROAD = yawTo([-K[0], -K[1]]);
    if (!st.set) {
      st.set = new THREE.Group(); st.set.visible = false; G.add(st.set);
      const coneParts = [];
      for (const [u, side] of CONES) {
        const p = P(u, side);
        coneParts.push(boxAt(0.26, 0.03, 0.26, p.x, p.y + 0.015, p.z, DARK), colorize(new THREE.ConeGeometry(0.11, 0.38, 14).translate(p.x, p.y + 0.21, p.z), '#F26B1D'), colorize(new THREE.CylinderGeometry(0.068, 0.082, 0.07, 14).translate(p.x, p.y + 0.22, p.z), '#F4F4F2'));
      }
      st.cones = new THREE.Mesh(mergeAll(coneParts), vmat({ roughness: 0.6 })); st.set.add(st.cones);
      const p = P(SIGN.u, SIGN.side), sg = new THREE.Group();
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 }));
      face.position.set(0.07, 0.62, 0); face.rotation.set(0, Math.PI / 2, -0.12);
      sg.add(face, new THREE.Mesh(mergeAll([boxAt(0.03, 0.62, 0.66, 0.05, 0.6, 0, '#C9CED6').rotateZ(-0.12), boxAt(0.03, 0.62, 0.66, -0.12, 0.6, 0, '#C9CED6').rotateZ(0.12)]), vmat({ roughness: 0.5 })));
      sg.position.set(p.x, p.y, p.z); sg.rotation.y = BACK; st.set.add(sg);
    }
    set = st.set; cones = st.cones;
    bikes.forEach((g, k) => { const p = P(BIKES[k].u, BIKES[k].side); g.position.set(p.x, p.y, p.z); g.rotation.y = FWD + 0.25; set.add(g); });
    set.add(heldG);
    const p = P(SIGN.u, SIGN.side); chip.position.set(p.x, p.y + 2.25, p.z);
  }
  let set = null, cones = null;
  const bikes = BIKES.map(() => patrolBike());
  bikes.forEach((g) => g.add(mesh(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(-0.24, 0.92, 0), M('#F4F5F7', { roughness: 0.35 }))));   // (the riding helmets, left on the seats)
  const heldG = new THREE.Group();   // (scooters held for the night: parkHeld)

  // the officers: A signals and handles the stop, B keeps watch by the bikes; their ranks and names are made up
  const officers = [0, 1].map(() => {
    const f = figure({ shirt: UNIFORM, pants: UNIFORM, gloves: GLOVE, hat: 'kepi', officer: true });
    f.baton = baton(); f.board = clipboard(); f.tester = breathTester(); f.paper = sheet();
    f.arms[1].hand.add(f.baton); f.arms[0].hand.add(f.board, f.tester, f.paper);
    f.board.visible = f.tester.visible = f.paper.visible = false;
    G.add(f.root);
    f.who = { rank: pickOf(RANKS), name: nameOf('m') };
    return f;
  });
  const [A, B] = officers;
  // the riders stopped: the driver, and passengers who get off too
  const riders = [0, 1, 2].map((i) => { const f = figure({ shirt: '#3A5A8C', pants: '#2F3A4C', hat: 'helmet', helmet: '#F2F2F2', bun: i === 0 }); f.phone = phone(); f.arms[1].hand.add(f.phone); f.phone.visible = false; G.add(f.root); return f; });
  // what a driver looks like while on the bike for a stop we have marked: bare-headed, or on the phone (street-life.js's
  // rider, drawn here instead of its own); a second passenger behind the first for three on a scooter
  const bodyG = (opts) => { const r = riderParts(false, opts); return { cloth: mergeAll(r.cloth), trim: mergeAll(r.trim) }; };
  const variants = { helmet: bodyG({ bare: true }), phone: bodyG({ phone: true }) };
  const pax2 = (() => { const r = riderParts(true); return { cloth: mergeAll(r.cloth).translate(-0.3, 0, 0), helmet: mergeAll(r.helmet).translate(-0.3, 0, 0), trim: mergeAll(r.trim).translate(-0.3, 0, 0) }; })();
  const onBike = new THREE.Group(); onBike.matrixAutoUpdate = false; onBike.visible = false; G.add(onBike);
  const ownCloth = new THREE.Mesh(variants.helmet.cloth, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  const ownTrim = new THREE.Mesh(variants.helmet.trim, vmat({ roughness: 0.8 }));
  const p2 = [new THREE.Mesh(pax2.cloth, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, color: '#7E5BA6' })), new THREE.Mesh(pax2.helmet, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, color: '#D9534F' })), new THREE.Mesh(pax2.trim, vmat({ roughness: 0.8 }))];
  onBike.add(ownCloth, ownTrim, ...p2);

  // speech, over whoever speaks; the chip over the checkpoint
  const bubble = () => { const d = el('div', 'tag shop-say csgt-say'); d.hidden = true; const o = new CSS2DObject(d); o.position.y = 2.05; return o; };
  for (const f of [...officers, ...riders]) { f.say = bubble(); f.root.add(f.say); }
  const chipEl = el('button', 'zone zone--hot csgt-chip'); chipEl.type = 'button';
  const chipLive = el('span', 'z-live'), chipIco = el('span', 'z-ico'); chipIco.append(icon('alert'));
  chipEl.append(chipIco, el('span', null, tr('world.csgt.chip')), chipLive);
  const chip = new CSS2DObject(chipEl); chip.visible = false; G.add(chip);   // (a CSS2D label ignores its parent's visibility)
  takeSite(sites.day);
  let nightOn = false, t0 = 0;
  const api = { current: () => (stop && !stop.done ? stop : null), last: () => lastStop, where: () => tr(FORCE || phase !== 'off' ? 'world.csgt.whereOn' : 'world.csgt.whereOff', { from: shift.from, to: shift.to }) };
  chipEl.addEventListener('click', (e) => { e.stopPropagation(); if (card && !card.hidden) closeCard(); else openCard(api); });

  const say = (f, key, vars, ms = 2600) => {
    const d = f.say.element, text = typeof key === 'string' && key.startsWith('world.') ? tr(key, vars) : key;
    d.textContent = text; d.hidden = !text; f.sayUntil = t0 + ms / 1000;
  };
  const quiet = (f) => { if (f.sayUntil && t0 > f.sayUntil) { f.say.element.hidden = true; f.sayUntil = 0; } };

  /* the shift: which days and hours; ?csgt now */
  let phase = 'off', shift = { from: '', to: '' }, lastDay = '', plan = [];
  const hourOf = () => { const d = officeNow(); return d.getHours() + d.getMinutes() / 60; };
  const hash = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  function planDay() {
    const d = officeNow(), key = d.toDateString(), wk = d.getDay(), late = wk === 5 || wk === 6;
    lastDay = key; plan = [];
    // a morning and a late afternoon on some days (the rush: helmets, three on a scooter, phones, the red light), and some
    // evenings an alcohol check, more on Fridays and Saturdays
    if (hash(`${key}m`) < 0.4) plan.push({ a: 6.8 + hash(`${key}ma`) * 0.6, len: 1 + hash(`${key}ml`) * 0.6, alc: false });
    if (hash(`${key}a`) < 0.35) plan.push({ a: 16.4 + hash(`${key}aa`) * 0.6, len: 1 + hash(`${key}al`) * 0.5, alc: false });
    if (hash(`${key}e`) < (late ? 0.75 : 0.35)) plan.push({ a: 19.6 + hash(`${key}ea`) * 1.2, len: 1.2 + hash(`${key}el`) * 0.8, alc: true });
  }
  const hm = (h) => `${fmt2(Math.floor(h) % 24)}:${fmt2(Math.floor((h % 1) * 60))}`;
  const evening = () => { const h = hourOf(); return h >= 19 || h < 4; };

  /* the patrol riding by: two bikes, one behind the other, along a street round the office */
  const patrol = [];   // { v, rider, bike, officer, pass }
  let nextPatrol = 0;
  function seatOn(bikeG, f) { bikeG.add(f.root); f.wear('helmet'); f.pose({ x: -0.18, y: 0.86 - HIP + 0.02, z: 0, yaw: 0, lean: -0.12, arms: [[1.05, 0.12, 0.35], [1.05, 0.12, 0.35]], legs: [[1.45, 1.55], [1.45, 1.55]] }); f.baton.visible = false; }
  function stand(f) { G.add(f.root); f.wear('kepi'); f.baton.visible = true; }
  function rideBy() {
    const ring = sides.flatMap((S) => [S, S.opp].filter(Boolean)), Lr = pickOf(ring), sC = mid(Lr), out = [];
    for (const [k, far] of [[0, 112], [1, 118]]) {
      const r = callRider(Lr, sC + Lr.dir * 46, { livery: 'plain', far });
      if (!r) break;
      const bike = patrolBike(); bike.matrixAutoUpdate = false; G.add(bike); seatOn(bike, officers[k]); bike.visible = true;
      const v = r.vehicle; v.ownAll = true; v.pax = false; v.deco = (m) => { bike.matrix.copy(m); bike.visible = true; };
      out.push({ v, rider: r, bike, f: officers[k], pass: sC + Lr.dir * 14, L: Lr });
    }
    patrol.push(...out);
    return out.length;
  }
  function endRide(p) {
    p.v.ownAll = false; delete p.v.deco; p.bike.visible = false; G.remove(p.bike); p.f.hide(); stand(p.f);
    patrol.splice(patrol.indexOf(p), 1);
  }

  /* the checkpoint: the bikes ride up and park on the pavement, the officers set the cones out, and later pack up */
  let removeObstacle = null, arrivals = [], leaving = [], setAt = 0, nextStopAt = 0;
  function setUp(now) {
    takeSite(shift.alc ? sites.eve : sites.day);
    phase = 'arriving'; setAt = t0; arrivals = [];
    if (!now) for (const [k, b] of BIKES.entries()) {
      const r = callRider(L, site.s(b.u), { livery: 'plain', far: 112 + k * 7, stay: true, side: b.side });   // (up onto the pavement)
      if (!r) { arrivals = []; break; }
      const bike = patrolBike(); bike.matrixAutoUpdate = false; G.add(bike); seatOn(bike, officers[k]); bike.visible = true;
      r.vehicle.ownAll = true; r.vehicle.pax = false; r.vehicle.deco = (m) => { bike.matrix.copy(m); bike.visible = true; };
      arrivals.push({ r, bike, f: officers[k] });
    }
    if (!arrivals.length) settle();
  }
  // the bikes in: up on the pavement, the officers off them, cones out, the post taken
  function settle() {
    for (const a of arrivals) { a.r.vehicle.ownAll = false; delete a.r.vehicle.deco; a.r.vanish(); a.bike.visible = false; G.remove(a.bike); }
    arrivals = [];
    for (const f of officers) { f.hide(); stand(f); }
    set.visible = true; chip.visible = true; bikes.forEach((b) => { b.visible = true; }); cones.visible = false;
    phase = 'setup'; setAt = t0;
    removeObstacle = obstacle(L, site.s(8.3), 1.7, 1.95, 0.36, (v) => v === stop?.v || v === marked?.v || v.passCones > t0);   // (traffic keeps out of the coned strip by the kerb; the one stopped pulls in beside it and out again)
    // a line in the company's group chat: the guard, or someone resting
    const here = [...sessions.values()].filter((s) => workers.has(s.id)), rest = here.filter((s) => s.status === 'rest');
    chatSay((rest.length ? pickOf(rest) : here.length ? pickOf(here) : null)?.id || 'guard', tr(shift.alc ? 'world.csgt.chatAlc' : 'world.csgt.chat'));
  }
  function packUp() {
    phase = 'leaving'; removeObstacle?.(); removeObstacle = null; cones.visible = false; set.visible = chip.visible = false; closeCard(); bikes.forEach((b) => { b.visible = false; });
    for (const f of [...officers, ...riders]) { f.hide(); f.say.element.hidden = true; }
    for (const h of held) h.free(); held.length = 0;
    leaving = [];
    for (const [k, b] of BIKES.entries()) {
      const r = depart(L, site.s(b.u), { livery: 'plain', side: b.side });
      if (!r) continue;
      const bike = patrolBike(); bike.matrixAutoUpdate = false; G.add(bike); seatOn(bike, officers[k]); bike.visible = true;
      r.vehicle.ownAll = true; r.vehicle.pax = false; r.vehicle.deco = (m) => { bike.matrix.copy(m); bike.visible = true; };
      leaving.push({ v: r.vehicle, bike, f: officers[k], from: t0 });
    }
    if (!leaving.length) { phase = 'off'; for (const f of officers) stand(f); }
  }

  /* a stop: the officer picks someone coming, signals, they pull in, and the steps follow on a clock */
  let stop = null, lastStop = null;
  const held = [];   // scooters held for the night: parked by the bikes until the checkpoint packs up
  let marked = null;   // { v, kind, at }: one riding up with something the officer will see (or a red light to run)
  const upstream = (v) => (site.s(STOP.u) - v.s) * L.dir;   // metres before the stop
  function candidate(minD, maxD) {
    let best = null;
    for (const v of L.list) {
      if (v.name !== 'moto' || !v.on || v.mode !== 'drive' || v.special || v.livery !== 'plain') continue;
      const d = upstream(v); if (d > minD && d < maxD && (!best || d < upstream(best))) best = v;
    }
    return best;
  }
  // nobody suitable on the way: one rides up the lane from out of sight (a scooter of the street's, street-life.js
  // callRider) and pulls in where the officer signals; quiet streets, or a page drawing few frames, still get their stops
  const comer = () => callRider(L, site.s(STOP.u), { livery: 'plain', far: FORCE ? rnd(32, 40) : rnd(55, 72), stay: true, side: STOP.side });
  function mark(kind) {
    const red = kind === 'red';
    let v = candidate(red ? 26 : 34, red ? 60 : 80), r = null;
    if (!v) { r = comer(); if (!r) return false; v = r.vehicle; }
    v.special = true; marked = { v, kind, at: t0, rider: r };
    const look = lookOf(v);
    if (kind === 'helmet' || kind === 'phone') {
      v.ownRider = true; ownCloth.geometry = variants[kind].cloth; ownTrim.geometry = variants[kind].trim; ownCloth.material.color.set(look.jacket || '#3A5A8C');
      v.deco = (m) => { onBike.matrix.copy(m); onBike.visible = true; p2.forEach((o) => { o.visible = false; }); ownCloth.visible = ownTrim.visible = true; };
    } else if (kind === 'three') {
      marked.hadPax = v.pax; v.pax = true;
      v.deco = (m) => { onBike.matrix.copy(m); onBike.visible = true; ownCloth.visible = ownTrim.visible = false; p2.forEach((o) => { o.visible = true; }); };
    } else if (red) v.runsRed = true;
    return true;
  }
  function unmark() {
    if (!marked) return;
    const { v, rider } = marked;
    if (rider) { if (rider.state === 'coming') rider.cancel(); else rider.release(); }   // (one we called up: on its way after all)
    v.runsRed = false; v.ownRider = false; delete v.deco; onBike.visible = false;
    if (marked.hadPax != null) v.pax = marked.hadPax;
    marked = null;
  }
  // forced: what the breath test will show (a regular from the quán nhậu: by how much he drank)
  function begin(v, kind, alc, forced = null, called = null) {
    const g = forced ? 'm' : Math.random() < 0.35 ? 'f' : 'm', look = lookOf(v), rider = called || pullOver(v, site.s(STOP.u), STOP.side);
    if (!rider) return false;
    const O = forced || (alc ? (Math.random() < 0.7 ? 'clear' : pickOf(['alc1', 'alc1', 'alc2', 'alc3'])) : kind);
    const mg = OFFENCES[O].mg ? rnd(...OFFENCES[O].mg) : alc ? 0 : null;
    stop = { v, rider, kind: O, alc, g, look, step: 'signal', stepAt: t0, at: officeNow().getTime(), name: nameOf(g), born: 1972 + Math.floor(Math.random() * 33), plate: plate(),
      officer: A.who, no: String(Math.floor(rnd(100000, 999999))), mg, fromQuan: !!forced, pax: kind === 'three' ? 2 : v.pax ? 1 : 0, whistled: false, written: false, signed: false, done: false };
    dressRiders(stop);
    return true;
  }
  function dressRiders(st) {
    const cl = st.look, bare = st.kind === 'helmet';
    riders[0].body.children[0].material = M(cl.jacket || '#3A5A8C');
    for (const a of riders[0].arms) { a.sh.children[0].material = M(cl.jacket || '#3A5A8C'); a.elbow.children[0].material = M(cl.jacket || '#3A5A8C'); }
    riders[0].head.helmet.children.forEach((m) => { m.material = M(cl.jacket || '#F2F2F2', { roughness: 0.35 }); });
    riders[0].wear(bare ? 'bare' : 'helmet'); riders[0].head.bun.visible = st.g === 'f';
    for (let k = 1; k < 3; k++) {
      const c = k === 1 ? cl.pax || '#7E5BA6' : '#7E5BA6';
      riders[k].body.children[0].material = M(c); for (const a of riders[k].arms) { a.sh.children[0].material = M(c); a.elbow.children[0].material = M(c); }
      riders[k].head.helmet.children.forEach((m) => { m.material = M(k === 1 ? cl.paxHelmet || '#F2F2F2' : '#D9534F', { roughness: 0.35 }); });
      riders[k].wear('helmet');
    }
  }
  const STEP_S = { signal: 0, salute: 2.8, reason: 2.6, papers: 3.4, blow: 3.6, write: 6.2, sign: 2.4, go: 3 };
  function next(st, step) { st.step = step; st.stepAt = t0; if (cardFor) renderCard(cardFor); }
  function finish(st) {
    st.done = true; st.doneAt = officeNow().getTime(); stop = null;
    if (st.step !== 'signal') lastStop = st;   // (one that never pulled in isn't a stop: the card keeps the last real one)
    st.v.ownRider = false; st.v.runsRed = false; delete st.v.deco; onBike.visible = false;
    if (st.step === 'signal' && st.pax === 2) st.v.pax = !!st.hadPax;   // (never stopped: the second passenger was ours)
    for (const f of riders) { f.hide(); f.phone.visible = false; f.say.element.hidden = true; }
    A.board.visible = A.tester.visible = A.paper.visible = false;
    nextStopAt = t0 + (FORCE ? rnd(6, 10) : rnd(35, 90));
    if (cardFor) renderCard(cardFor);
  }
  // the stop's clock: who stands where and does what at each step
  const ORDER = { day: ['salute', 'reason', 'papers', 'write', 'sign', 'go'], clear: ['salute', 'reason', 'papers', 'blow', 'go'], alc: ['salute', 'reason', 'papers', 'blow', 'write', 'sign', 'go'] };
  function stepStop(st) {
    const k = t0 - st.stepAt, v = st.v, O = OFFENCES[st.kind], stopP = P(STOP.u, STOP.side);
    const who = tr(`world.csgt.${st.g === 'f' ? 'chi' : 'anh'}`), Who = who[0].toUpperCase() + who.slice(1);
    const meet = { ...P(STOP.u + 1.2, 2.6), yaw: BACK }, post = { ...P(POST.u, POST.side), yaw: BACK };
    A.baton.visible = st.step === 'signal';   // (tucked away for the rest of the stop)
    if (st.step === 'signal') {
      // at the lane's edge, baton up towards them; one long blast of the whistle as they come
      A.pose({ ...post, arms: [REST, BATON_UP] });
      if (!st.whistled && upstream(v) < 26) { st.whistled = true; if (seen(stopP.x, stopP.z)) whistle(); say(A, 'world.csgt.say.stop', null, 1800); }
      if (st.rider.state === 'waiting') next(st, 'salute');
      else if (k > 30 || st.rider.state === 'gone') { st.v.passCones = t0 + 25; st.rider.release(); finish(st); }
      return;
    }
    // the riders: off the bike and on the pavement beside it, until the stop is over; then the driver back on (with a
    // first passenger who was on it before), a second passenger off on foot; held: all of them off on foot
    const back = st.step === 'go' && k > 1.6 && !O.held, walkOff = st.step === 'go' && k > 1.4;
    v.ownRider = !back; if (v.deco) { delete v.deco; onBike.visible = false; }
    if (st.pax) v.pax = back && (st.pax === 1 || !!st.hadPax);
    const lean = st.step === 'blow' && k > 0.6 && k < 2.4 ? -0.16 : st.step === 'sign' && k < 1.4 ? -0.18 : 0;
    const arm = st.step === 'papers' && st.shown ? SHOW : st.step === 'sign' && k < 1.4 ? [0.5, 0, 1.0] : REST;
    for (let i = 0; i <= 2; i++) {
      const f = riders[i], aboard = back && (i === 0 || (i === 1 && v.pax));
      if (i > st.pax || aboard) { if (f.root.visible) f.hide(); continue; }
      if (walkOff && (O.held || i > 0)) { const w = (k - 1.4) * 1.1; f.pose({ ...P(STOP.u - w - i * 0.7, 2.9), yaw: BACK, walk: k * 8 + i }); continue; }
      f.pose({ ...P(STOP.u + 0.1 - i * 0.62, 2.55 + (i ? 0.28 : 0)), yaw: FWD, lean: i ? 0 : lean, arms: i ? null : [REST, arm] });
    }
    // the officer: over to them (walking), salute, the reason, the papers, the breath test, the record, the signature
    if (st.step === 'salute') {
      const w = Math.min(1, k / 1.2);
      if (w < 1) A.pose({ x: post.x + (meet.x - post.x) * w, y: post.y + (meet.y - post.y) * w, z: post.z + (meet.z - post.z) * w, yaw: yawTo([meet.x - post.x, meet.z - post.z]), walk: k * 9 });
      else { A.pose({ ...meet, arms: [REST, SALUTE] }); if (!st.greeted) { st.greeted = true; say(A, 'world.csgt.say.greet', { who }); } }
    } else if (st.step === 'reason') {
      A.pose({ ...meet, arms: [[0.1, 0.06, 0.15], [0.35, 0.1, 0.55]] });
      if (!st.told) { st.told = true; say(A, `world.csgt.say.reason.${st.alc ? 'alc' : st.kind}`, { who, Who }, 2600); }
    } else if (st.step === 'papers') {
      A.pose({ ...meet, lean: -0.08, arms: [[0.1, 0.06, 0.15], [0.7, 0.05, 0.9]] });
      if (!st.asked) { st.asked = true; say(A, 'world.csgt.say.papers', { who }, 1700); }
      if (k > 1.6 && !st.shown) { st.shown = true; riders[0].phone.visible = true; say(riders[0], 'world.csgt.say.show', null, 1800); }
    } else if (st.step === 'blow') {
      riders[0].phone.visible = false; A.tester.visible = true;
      A.pose({ ...meet, lean: -0.06, arms: [[1.2, 0.05, 0.35], [0.3, 0.05, 0.3]] });
      if (!st.blew) { st.blew = true; say(A, 'world.csgt.say.blow', { who }, 1500); }
      if (k > 2.4 && !st.read) { st.read = true; say(A, st.kind === 'clear' ? 'world.csgt.say.clear' : 'world.csgt.say.positive', { who, mg: (st.mg || 0).toFixed(3).replace('.', ',') }, 3000); }
    } else if (st.step === 'write') {
      riders[0].phone.visible = false; A.tester.visible = false; A.board.visible = true;
      A.pose({ ...meet, lean: -0.1, arms: [HOLD, [WRITE[0], WRITE[1], WRITE[2] + Math.sin(k * 14) * 0.08]] });
      if (!st.wrote) { st.wrote = true; say(A, 'world.csgt.say.write', null, 2400); }
      if (k > 4.5 && !st.written) { st.written = true; if (cardFor) renderCard(cardFor); }
    } else if (st.step === 'sign') {
      A.pose({ ...meet, arms: [[0.6, 0.12, 1.0], REST] });   // (the clipboard held out to be signed)
      if (!st.askSign) { st.askSign = true; say(A, 'world.csgt.say.sign', { who }, 1400); }
      if (k > 1.2 && !st.signed) { st.signed = true; say(riders[0], 'world.csgt.say.ok', null, 1400); if (cardFor) renderCard(cardFor); }
    } else if (st.step === 'go') {
      A.board.visible = A.tester.visible = false; A.paper.visible = O.fine != null && k < 1.2;   // (their copy of the record)
      A.pose({ ...meet, arms: [k < 1.2 && O.fine ? [0.9, 0.1, 0.3] : REST, REST] });
      if (!st.bye) { st.bye = true; say(A, O.held ? 'world.csgt.say.held' : O.fine ? 'world.csgt.say.pay' : 'world.csgt.say.bye', { who }, 2800); }
    }
    for (const f of [A, ...riders]) quiet(f);
    if (k < STEP_S[st.step]) return;
    const order = ORDER[st.alc ? (st.kind === 'clear' ? 'clear' : 'alc') : 'day'], i = order.indexOf(st.step);
    if (i < order.length - 1) { next(st, order[i + 1]); return; }
    // over: they ride on; or, held, the scooter stays on the pavement by the bikes until the checkpoint packs up
    v.ownRider = false; v.passCones = t0 + 25;
    if (O.held) { st.rider.vanish(); held.push(parkHeld(P(BYB.u + 0.6, 2.95), st.look.paint)); } else st.rider.release();
    finish(st);
  }
  // a held scooter, parked on the pavement by the bikes, a yellow tag on its seat
  function parkHeld(p, color) {
    const one = new THREE.Group();
    one.add(mesh(new RoundedBoxGeometry(1.55, 0.5, 0.38, 2, 0.14).translate(0, 0.6, 0), M(color || '#C9CED6', { roughness: 0.4 })),
      new THREE.Mesh(mergeAll([0.6, -0.6].map((x) => colorize(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 14).rotateX(Math.PI / 2).translate(x, 0.27, 0), '#16181C'))), vmat()),
      mesh(new THREE.BoxGeometry(0.16, 0.02, 0.2).translate(-0.3, 0.86, 0), M('#F2C230')));
    one.position.set(p.x, p.y, p.z); one.rotation.y = FWD + 0.4; heldG.add(one);
    return { free() { heldG.remove(one); } };
  }

  // street-nhau.js: one of its regulars rode off on his own scooter after `drinks` rounds
  let awaited = null;
  let holdUntil = 0;
  function expect(v, { drinks = 4 } = {}) {
    if (!(phase === 'on' || phase === 'setup') || !shift.alc) return false;
    if (!v) { holdUntil = t0 + 45; return true; }   // (he's getting up: no one else stopped meanwhile)
    if (v.L !== L) return false;
    awaited = { v, drinks, at: t0 };
    return true;
  }

  /* each frame */
  let checkAt = -1;
  function update(dt, t, hour) {
    t0 = t;
    const day = officeNow().toDateString();
    if (day !== lastDay) planDay();
    // the patrol's bikes past the office: on their way out of sight, then back to ordinary scooters
    for (const p of [...patrol]) {
      flashLamps(p.bike, t, true);
      if (p.rider && (p.v.s - p.pass) * p.L.dir > 0 && p.rider.state === 'coming') { p.rider.cancel(); p.rider = null; }
      if (!p.v.on || (!p.rider && !p.v.special)) endRide(p);
    }
    for (const a of arrivals) flashLamps(a.bike, t, true);
    for (const p of [...leaving]) { flashLamps(p.bike, t, true); if (!p.v.on || !p.v.special || t - p.from > 90) { p.v.ownAll = false; delete p.v.deco; p.bike.visible = false; G.remove(p.bike); p.f.hide(); stand(p.f); leaving.splice(leaving.indexOf(p), 1); } }
    if (phase === 'leaving' && !leaving.length) phase = 'off';
    if (t - checkAt > 0.5 || t < checkAt) {
      checkAt = t;
      const h = hour ?? hourOf(), rain = wx.rain > 0.3;
      const due = FORCE ? true : plan.find((w) => h >= w.a && h < w.a + w.len);
      if (phase === 'off' && due && !rain && !patrol.length) { shift = FORCE ? { from: hm(h), to: hm(h + 3) } : { from: hm(due.a), to: hm(due.a + due.len) }; shift.alc = FORCE ? evening() : due.alc; setUp(FORCE && t < 30); }
      else if ((phase === 'on' || phase === 'setup') && (!due || rain) && !stop) packUp();
      if (phase === 'off' && !patrol.length && h >= 6 && h < 22 && !rain) {
        if (!nextPatrol) nextPatrol = t + rnd(8, 25) * 60;
        if (t > nextPatrol) { rideBy(); nextPatrol = t + rnd(25, 50) * 60; }
      }
    }
    if (phase === 'arriving') {
      if (arrivals.every((a) => a.r.state === 'waiting') || t - setAt > 45) settle();
      return;
    }
    if (phase !== 'setup' && phase !== 'on') return;
    const mid0 = P(7.5, 2.4), inView = seen(mid0.x, mid0.z);
    // night: vests on, baton tips lit; the bikes' lamps flash
    for (const f of officers) { f.vest.visible = nightOn; f.baton.userData.tip.material.emissiveIntensity = nightOn ? 2.4 : 0; }
    for (const b of bikes) flashLamps(b, t, nightOn);
    if (phase === 'setup') {
      // B sets the cones out, one by one; A takes the post
      const k = t - setAt;
      cones.visible = k > 1.5;
      A.pose({ ...P(POST.u, POST.side), yaw: BACK, arms: [REST, [0.1, 0.08, 0.2]] });
      B.pose({ ...P(BYB.u, BYB.side), yaw: TO_ROAD, walk: k < 3 ? k * 8 : null });
      if (k > 3.5) { phase = 'on'; nextStopAt = t + (FORCE ? 3 : rnd(20, 60)); }
      return;
    }
    const live = tr(stop ? (stop.alc ? 'world.csgt.chipCheck' : 'world.csgt.chipStop') : 'world.csgt.chipIdle');
    if (chipLive.textContent !== live) chipLive.textContent = live;
    // B keeps watch by the bikes (the baton's red tip after dark)
    B.pose({ ...P(BYB.u, BYB.side), yaw: TO_ROAD, arms: [REST, nightOn ? [0.55, 0.12, 0.6] : REST] });
    quiet(B);
    if (stop) { stepStop(stop); return; }
    A.pose({ ...P(POST.u, POST.side), yaw: BACK, arms: [REST, [0.1, 0.08, 0.2]] });
    quiet(A);
    // a regular from the quán nhậu riding off after a few (street-nhau.js): stopped for the breath test as he comes
    if (awaited) {
      const v = awaited.v, d = upstream(v);
      if (!v.on || d < 3 || t - awaited.at > 120) awaited = null;   // (by already, or gone another way)
      else if (v.mode === 'drive' && d < 42) {
        const lv = awaited.drinks >= 7 ? 'alc3' : awaited.drinks >= 5 ? 'alc2' : 'alc1';
        awaited = null; v.special = true; begin(v, 'alc', true, lv);
        return;
      }
    }
    if (!inView && !FORCE) return;   // (nobody looking: no stops)
    // someone marked on the way: stop them when they come into range (a red light: once they've run it)
    if (marked) {
      const v = marked.v, d = upstream(v), own = !!marked.rider;
      if (!v.on || (own ? marked.rider.state === 'gone' : v.mode !== 'drive') || d < (own ? -1 : 3) || t - marked.at > (own ? 70 : 40)) { unmark(); return; }
      if (marked.kind === 'red') {
        const stopLine = (site.c - L.dir * 5.2 - v.s - L.dir * v.half) * L.dir;   // metres to the crossing's stop line
        if (stopLine < 0 && !marked.ran) { marked.ran = lightAt(L, L.cross.indexOf(site.c), t) === 'r'; if (!marked.ran) { unmark(); return; } }
        if (!marked.ran) return;
      } else if (d > 32) return;
      const { kind, hadPax, rider } = marked;
      if (begin(v, kind, false, null, rider)) { stop.hadPax = hadPax; marked = null; } else unmark();
      return;
    }
    if (t < nextStopAt || awaited || t < holdUntil) return;   // (one from the quán on his way: that's who they're waiting for)
    nextStopAt = t + (FORCE ? 4 : rnd(20, 50));
    if (shift.alc || (FORCE && evening())) {   // evening: anyone may be asked to blow
      const v = candidate(26, 46), r = v ? null : comer();
      if (v || r) { (v || r.vehicle).special = true; begin(v || r.vehicle, 'alc', true, null, r); }
      return;
    }
    // by day: one riding up with something the officer will see; the red light only if it's about to turn
    const light = lightAt(L, L.cross.indexOf(site.c), t), kinds = ['helmet', 'helmet', 'three', 'phone', ...(light !== 'g' ? ['red', 'red'] : [])];
    mark(pickOf(kinds));
  }
  return {
    update(dt, t, hour) { update(dt, t, hour); },
    night(on) { nightOn = on; },
    expect,
    // in first person: by the checkpoint, E opens the card
    spots: () => (phase === 'on' || phase === 'setup' ? [{ kind: 'csgt', ...(() => { const p = P(SIGN.u + 1, 2.7); return { x: p.x, z: p.z }; })(), label: tr('world.csgt.fp'), act: () => openCard(api) }] : []),
    debug: {
      state: () => ({ phase, alc: !!shift.alc, stop: stop ? { kind: stop.kind, step: stop.step, written: stop.written, signed: stop.signed } : null, last: lastStop ? { kind: lastStop.kind, done: lastStop.done, written: lastStop.written, plate: lastStop.plate, fromQuan: lastStop.fromQuan } : null,
        patrol: patrol.length, site: { lane: `${L.axis}${L.v}${L.dir > 0 ? '+' : '-'}`, cross: site.c, evening: site === sites.eve && sites.eve !== sites.day, eveFound: sites.eve !== sites.day }, held: held.length, awaited: !!awaited }),
      // what's in the checkpoint's lane (scooters: their livery, metres before the stop, what they're doing), and one marked
      lane: () => ({ marked: marked && { kind: marked.kind, d: +upstream(marked.v).toFixed(1) }, motos: L.list.filter((v) => v.name === 'moto').map((v) => ({ livery: v.livery, d: +upstream(v).toFixed(1), mode: v.mode, special: !!v.special })) }),
      setUp: () => { if (phase === 'off') { shift = { from: hm(hourOf()), to: hm(hourOf() + 2), alc: evening() }; setUp(true); } return phase; },
      stop: (kind = 'helmet') => { if (phase !== 'on' || stop || marked) return false; if (kind === 'alc') { const v = candidate(10, 90), r = v ? null : comer(); return !!((v || r) && begin(v || r.vehicle, 'alc', true, null, r)); } return mark(kind); },
      patrol: () => rideBy(),
      card: () => { openCard(api); return !!card && !card.hidden; },
      off: () => { if (!stop) packUp(); return phase; },
    },
  };
}
