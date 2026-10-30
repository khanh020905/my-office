/* A bank's ATM booth on the pavement at a park's edge near the office (city backdrop), in Vietcombank's green, the bank
   whose booths stand on every street in Vietnam: a white cabin on a concrete step, the green fascia lit from inside with
   the bank's name and its mark (a V turning into a heart, light green to green), "ATM 24/7" down the sides, the glass
   front with a frosted band, inside the machine with its lit header, screen, keypad and slots; a little air
   conditioner on the side, a camera dome at the corner. Someone comes by now and then. On paydays (the 5th, the 10th
   and the month's last day, the usual salary days) a queue forms along the pavement, longest at lunch and after work,
   and some evening the machine runs out of cash for a while ("Hết tiền rồi!"), as it does; people from the office go
   down to withdraw too (people/payday.js), waiting their turn in the line. None of it is the bank's artwork: the name
   is set here, the mark drawn here. ?payday: today is one. */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { el, officeNow } from '../../core/env.js';
import { boxAt, colorize, mergeAll, vmat } from '../terrace.js';
import { sfx } from '../../audio/sfx.js';
import { toast } from '../../ui/activity.js';
import { LAWN, PAVE, inside } from './street-spots.js';
import { seen } from './street-folk.js';
import { t as tr } from '../../../i18n/index.js';

const FORCE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('payday');
export const VCB = '#009A49', VCB_DARK = '#00703C', VCB_LIGHT = '#8DC63F';
const FONT = '"Be Vietnam Pro", system-ui, sans-serif';
/** today is a payday: the 5th, the 10th or the month's last day (?payday: always) */
export function isPayday(d = officeNow()) {
  if (FORCE) return true;
  const day = d.getDate(), last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return day === 5 || day === 10 || day === last;
}
const rnd = (a, b) => a + Math.random() * (b - a);
const yawTo = (dx, dz) => Math.atan2(-dz, dx);   // (figures face +x)
const SHIRTS = [['#DCE6F2', '#2B2F36'], ['#2E6FB5', '#2B3A55'], ['#1F9E4A', '#2B2F36'], ['#F2F2F2', '#1F2A44'], ['#B85C7A', '#3A3F47'], ['#7A8A9A', '#4A4F5A'], ['#E8DCC8', '#33415C'], ['#3F7CC4', '#33415C']];

/* ---------- the printing: one canvas ---------- */
const RA = { fascia: [0, 0, 512, 144], side: [0, 144, 512, 144], band: [0, 288, 512, 64], screen: [0, 352, 192, 144], header: [192, 352, 320, 80], note: [192, 432, 320, 80] };
// the mark: two leaves meeting at the bottom, a V that is also a heart, light green into green
function vheart(g, cx, cy, s) {
  const gr = g.createLinearGradient(cx, cy - s, cx, cy + s); gr.addColorStop(0, '#C7E04A'); gr.addColorStop(1, '#2DB24A');
  g.save(); g.fillStyle = gr;
  for (const k of [-1, 1]) {
    g.beginPath(); g.moveTo(cx, cy + s);
    g.bezierCurveTo(cx + k * s * 0.15, cy + s * 0.2, cx + k * s * 1.05, cy - s * 0.05, cx + k * s * 0.82, cy - s * 0.8);
    g.bezierCurveTo(cx + k * s * 0.55, cy - s * 0.25, cx + k * s * 0.25, cy + s * 0.15, cx, cy + s);
    g.fill();
  }
  g.restore();
}
function drawAtm(g) {
  const fill = ([x, y, w, h], c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const green = ([x, y, w, h]) => { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#0BB45A'); gr.addColorStop(1, VCB_DARK); g.fillStyle = gr; g.fillRect(x, y, w, h); };
  g.clearRect(0, 0, 512, 512);
  // the fascia over the front: the mark and the name, in white on green
  { const [x, y, w, h] = RA.fascia; green(RA.fascia);
    g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(x, y, w, 10);
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(x + 74, y + h / 2, 46, 0, Math.PI * 2); g.fill();
    vheart(g, x + 74, y + h / 2 + 2, 34);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `500 64px ${FONT}`; g.fillText('Vietcombank', x + 136, y + h / 2 + 2, w - 150); }
  // down the sides: ATM, round the clock
  { const [x, y, w, h] = RA.side; green(RA.side);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 92px ${FONT}`; g.fillText('ATM', x + w * 0.4, y + h / 2 + 4);
    g.font = `800 40px ${FONT}`; g.fillText('24/7', x + w * 0.78, y + h / 2 + 6);
    vheart(g, x + w * 0.1, y + h / 2, 30); }
  // the frosted band across the glass: green stripes, the name small
  { const [x, y, w, h] = RA.band; fill(RA.band, 'rgba(240,248,244,.92)');
    g.fillStyle = VCB; g.fillRect(x, y + 6, w, 6); g.fillRect(x, y + h - 12, w, 6);
    g.fillStyle = VCB_DARK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `600 26px ${FONT}`; g.fillText('Vietcombank · ATM', x + w / 2, y + h / 2, w - 20); }
  // the machine's screen: the bank's green bar, a greeting, put your card in or scan
  { const [x, y, w] = RA.screen; fill(RA.screen, '#EAF6EE');
    g.fillStyle = VCB; g.fillRect(x, y, w, 30); g.fillStyle = '#FFFFFF'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `600 17px ${FONT}`; g.fillText('Vietcombank', x + 30, y + 15); vheart(g, x + 15, y + 15, 9);
    g.fillStyle = '#16301F'; g.textAlign = 'center'; g.font = `700 17px ${FONT}`; g.fillText('Xin chào Quý khách', x + w / 2, y + 56);
    g.font = `500 13px ${FONT}`; g.fillText('Vui lòng đưa thẻ', x + w / 2, y + 82); g.fillText('hoặc quét mã QR', x + w / 2, y + 100);
    g.fillStyle = VCB_LIGHT; g.beginPath(); g.roundRect(x + w / 2 - 22, y + 112, 44, 26, 4); g.fill(); g.fillStyle = '#F7C600'; g.fillRect(x + w / 2 - 14, y + 120, 10, 8); }
  // the lit header over the machine
  { const [x, y, w, h] = RA.header; green(RA.header);
    vheart(g, x + 44, y + h / 2, 24);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `900 44px ${FONT}`; g.fillText('ATM', x + 84, y + h / 2 + 2);
    g.font = `500 22px ${FONT}`; g.fillText('Vietcombank', x + 186, y + h / 2 + 2, w - 196); }
  // a notice on the glass by the door
  { const [x, y, w] = RA.note; fill(RA.note, '#FFFFFF'); g.fillStyle = VCB; g.fillRect(x, y, w, 8);
    g.fillStyle = '#16301F'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 20px ${FONT}`; g.fillText('Rút tiền bằng mã QR', x + w / 2, y + 32, w - 16);
    g.font = `500 16px ${FONT}`; g.fillText('Che tay khi nhập mã PIN', x + w / 2, y + 58, w - 16); }
}

/** finder: street-spots.js; crowd: street-folk.js figures (slots taken here); far: [x, z, r] to keep clear of */
export function buildAtm(G, { finder, crowd, far = [] }) {
  const dead = { update() {}, blocked: () => false, spots: () => [], office: null, debug: { state: () => ({ none: true }) } };
  // (the booth at one end of a stretch of the park's edge; the pavement in front of the rest is for the queue)
  const f = [{ near: 40 }, { near: 60 }].reduce((got, o) => got || finder.find({ len: 4.2, depth: 1.3, d: 2.0, lawn: true, far, ...o }), null);
  if (!f) return dead;
  const BX = -1.35, PV = PAVE - LAWN;   // the booth's middle along the edge; the pavement's height in the frame (y 0 is the grass)
  const W = (lx, lz, ly = 0) => f.at(lx, lz, ly);
  const Q = new THREE.Group(); Q.matrixAutoUpdate = false; Q.matrix.copy(f.M); G.add(Q);

  /* the booth: a step, the white cabin, the glass front, the green fascia; the machine inside */
  const parts = [], X = (x) => BX + x, H0 = 0.06, H = 2.5, WD = 1.5, DP = 1.3;
  parts.push(boxAt(WD + 0.2, 0.12, DP + 0.2, X(0), 0, 0, '#A9AEB4'));
  parts.push(boxAt(WD, 0.04, DP, X(0), H0 + 0.02, 0, '#D6D9DC'));   // the floor
  parts.push(boxAt(WD, H - 0.42, 0.06, X(0), H0 + (H - 0.42) / 2, -DP / 2 + 0.03, '#F2F4F3'));
  for (const s of [-1, 1]) {
    parts.push(boxAt(0.06, H - 0.42, DP, X(s * (WD / 2 - 0.03)), H0 + (H - 0.42) / 2, 0, '#F2F4F3'));
    parts.push(boxAt(0.065, 1.3, 0.1, X(s * (WD / 2 - 0.03)), H0 + 0.95, DP / 2 - 0.2, VCB_LIGHT));   // (a light-green stripe down each side)
    parts.push(boxAt(0.08, H - 0.42, 0.08, X(s * (WD / 2 - 0.04)), H0 + (H - 0.42) / 2, DP / 2 - 0.04, '#C9CED6'));   // the front's posts
  }
  parts.push(boxAt(0.05, H - 0.42, 0.06, X(-0.12), H0 + (H - 0.42) / 2, DP / 2 - 0.03, '#C9CED6'));   // the door's edge
  parts.push(boxAt(0.025, 0.36, 0.05, X(-0.04), H0 + 1.05, DP / 2 + 0.02, '#9AA2AD'));   // its handle
  parts.push(boxAt(WD + 0.06, 0.06, DP + 0.06, X(0), H0 + H, 0, '#E3E6E9'));   // the roof
  parts.push(boxAt(WD + 0.06, 0.42, DP + 0.06, X(0), H0 + H - 0.21, 0, VCB_DARK));   // (the fascia's box: printed on its faces)
  parts.push(boxAt(0.36, 0.5, 0.22, X(WD / 2 + 0.14), H0 + 1.65, -0.25, '#EEF0F2'), boxAt(0.02, 0.4, 0.18, X(WD / 2 + 0.33), H0 + 1.65, -0.25, '#9AA2AD'));   // the air conditioner
  parts.push(colorize(new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI).translate(X(-WD / 2 + 0.15), H0 + H - 0.44, DP / 2 - 0.15), '#1E2125'));   // the camera dome
  // the machine: its body, the slanted shelf with the keypad, the card slot and the cash slot, a bin for the receipts
  parts.push(boxAt(0.68, 1.42, 0.5, X(0), H0 + 0.71, -0.36, '#5E6670'), boxAt(0.7, 0.05, 0.52, X(0), H0 + 1.42, -0.36, '#4A515B'));
  parts.push(colorize(new THREE.BoxGeometry(0.56, 0.04, 0.24).rotateX(0.32).translate(X(0), H0 + 0.98, -0.06), '#3A3F47'));
  for (let i = 0; i < 12; i++) parts.push(boxAt(0.045, 0.012, 0.04, X(-0.07 + (i % 3) * 0.055), H0 + 1.0 + Math.floor(i / 3) * 0.018, -0.12 + Math.floor(i / 3) * 0.05, i === 11 ? '#2EA44F' : i === 9 ? '#D62F2F' : '#C9CED6'));
  parts.push(boxAt(0.12, 0.03, 0.02, X(0.18), H0 + 1.08, -0.1, '#1E2125'), boxAt(0.3, 0.035, 0.02, X(0), H0 + 0.82, -0.105, '#1E2125'));
  parts.push(colorize(new THREE.CylinderGeometry(0.11, 0.1, 0.36, 12).translate(X(0.56), H0 + 0.18, -0.4), '#2B2F36'));
  const base = new THREE.Mesh(mergeAll(parts), vmat({ roughness: 0.55, metalness: 0.15 })); base.castShadow = true; base.receiveShadow = true; Q.add(base);

  // the printing: the fascia on all four sides (the name front and back, ATM down the sides), the band and the notice on
  // the glass, the screen and the header on the machine; lit from inside (brighter after dark)
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const paint = () => { drawAtm(canvas.getContext('2d')); tex.needsUpdate = true; };
  paint(); document.fonts?.ready.then(paint);
  const printM = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#FFFFFF', emissiveIntensity: 0.3, roughness: 0.5, transparent: true, alphaTest: 0.05 });
  const plane = (w, h, [rx, ry, rw, rh]) => { const p = new THREE.PlaneGeometry(w, h), uv = p.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (rx + uv.getX(i) * rw) / 512, 1 - (ry + (1 - uv.getY(i)) * rh) / 512); return p; };
  const fy = H0 + H - 0.21, prints = [
    plane(WD + 0.06, 0.4, RA.fascia).translate(X(0), fy, DP / 2 + 0.035),
    plane(WD + 0.06, 0.4, RA.fascia).rotateY(Math.PI).translate(X(0), fy, -DP / 2 - 0.035),
    plane(DP + 0.06, 0.4, RA.side).rotateY(Math.PI / 2).translate(X(WD / 2 + 0.035), fy, 0),
    plane(DP + 0.06, 0.4, RA.side).rotateY(-Math.PI / 2).translate(X(-WD / 2 - 0.035), fy, 0),
    plane(WD - 0.14, 0.18, RA.band).translate(X(0), H0 + 1.25, DP / 2 - 0.02),
    plane(0.32, 0.08, RA.note).translate(X(0.38), H0 + 1.55, DP / 2 - 0.018),
    plane(0.3, 0.225, RA.screen).translate(X(0), H0 + 1.22, -0.105),
    plane(0.66, 0.165, RA.header).translate(X(0), H0 + 1.58, -0.105),
  ];
  Q.add(new THREE.Mesh(mergeAll(prints), printM));
  const glassM = new THREE.MeshStandardMaterial({ color: '#CFE5DA', transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(WD - 0.14, H - 0.48).translate(X(0), H0 + (H - 0.42) / 2, DP / 2 - 0.025), glassM); glass.renderOrder = 2; Q.add(glass);
  const lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5).rotateX(Math.PI / 2).translate(X(0), H0 + H - 0.44, 0), new THREE.MeshBasicMaterial({ color: '#F4F8FF' })); Q.add(lamp);

  /* the queue: index 0 at the machine (in the booth), 1 at the door, then along the pavement */
  const spotL = (k) => (k === 0 ? { x: X(0), z: -0.02, y: H0 } : k === 1 ? { x: X(0), z: 1.02, y: PV } : { x: X(0.62 * (k - 1)), z: 1.14 + (k % 2) * 0.05, y: PV });
  const lookL = (k) => (k === 0 ? [0, -1] : (() => { const a = spotL(k), b = spotL(k - 1); return [b.x - a.x, b.z - a.z]; })());
  const queue = [];   // { local, i (a figure), x, z, y, … } or { office, ready, use, onUse, onDone }
  const SLOTS = crowd.take(8), free = [...SLOTS], gone = [];   // (gone: locals walking off)
  SLOTS.forEach((i, k) => crowd.dress(i, { shirt: SHIRTS[k % SHIRTS.length][0], pants: SHIRTS[k % SHIRTS.length][1], hair: ['#2B2420', '#1E1A18', '#3A2A20'][k % 3] }));
  const bubble = (() => { const d = el('div', 'tag shop-say atm-say'); d.hidden = true; const o = new CSS2DObject(d); o.visible = false; G.add(o); return o; })();
  const sayAt = (x, y, z, text, secs = 2.6) => { bubble.position.set(x, y + 1.95, z); bubble.element.textContent = text; bubble.element.hidden = false; bubble.visible = true; bubble.until = now + secs; };
  let now = 0, nextSpawn = 0, outUntil = 0, outDay = '', served = 0, used = 0, quick = false;   // (quick: ?debug, the line served in seconds)
  // how many in line from the street (not the office's), by the hour; on a payday longest at lunch and after work
  const want = (h) => {
    if (isPayday()) return FORCE ? 6 : h >= 17 && h < 19.5 ? 7 : h >= 11.5 && h < 13.5 ? 5 : h >= 19.5 && h < 22 ? 3 : h >= 7 && h < 22 ? 2 : 1;
    return h >= 7 && h < 22 ? 1 : 0;
  };
  function spawn(h) {
    if (!free.length || queue.length >= 9) return;
    const i = free.shift(), from = { x: X(6.2 + rnd(0, 1.5)), z: 1.35 };
    queue.push({ local: true, i, x: from.x, z: from.z, y: PV, use: rnd(12, 24) });
    nextSpawn = now + (isPayday() && want(h) > 2 ? rnd(5, 12) : rnd(50, 140));
  }
  const step = (p, to, dt, v = 1.0) => { const dx = to.x - p.x, dz = to.z - p.z, d = Math.hypot(dx, dz); if (d < 0.03) return true; const s = Math.min(d, dt * v); p.x += (dx / d) * s; p.z += (dz / d) * s; p.dir = [dx, dz]; return false; };
  function pose(p, walking, k, t) {
    const at = W(p.x, p.z, p.y), dir = (walking ? p.dir : k != null ? lookL(k) : p.dir) || [-1, 0], ph = t * 7 + p.i;
    const yaw = f.yaw + yawTo(dir[0], dir[1]);
    const using = k === 0 && p.using, phone = !walking && !using && Math.sin(t * 0.4 + p.i * 1.7) > 0.2;   // (waiting: on the phone)
    crowd.pose(p.i, { x: at.x, y: at.y, z: at.z, yaw, legs: walking ? [Math.sin(ph) * 0.45, -Math.sin(ph) * 0.45] : [0, 0],
      arms: walking ? [[-Math.sin(ph) * 0.3, 0.08], [Math.sin(ph) * 0.3, 0.08]] : using ? [[1.1, -0.1], [1.2 + Math.sin(t * 9) * 0.12, -0.1]] : phone ? [[0.2, 0], [1.6, -0.2]] : [[0.12, 0.02], [0.12, 0.02]] });
  }

  function update(dt, t, hour) {
    now = t;
    const d = officeNow(), h = hour ?? d.getHours() + d.getMinutes() / 60, payday = isPayday(d), inView = seen(f.x, f.z);
    printM.emissiveIntensity = h < 6 || h >= 18 ? 0.95 : 0.3;
    lamp.material.color.setScalar(h < 6 || h >= 18 ? 1.6 : 1);
    if (bubble.visible && t > bubble.until) { bubble.visible = false; bubble.element.hidden = true; }
    // some payday evening the machine runs dry for a while
    if (payday && h >= 18 && h < 20 && outDay !== d.toDateString() && Math.random() < dt / 600) {
      outDay = d.toDateString(); outUntil = t + 45;
      const fr = queue[0]; if (fr?.local) { const a = W(fr.x, fr.z, fr.y); sayAt(a.x, a.y, a.z, tr('people.atm.dry')); }
    }
    const dry = t < outUntil;
    // the front of the line: at the machine (an office person once they are there), a while, then off
    const fr = queue[0];
    if (fr && !fr.using && !dry && (fr.office ? fr.ready : fr.at0)) {
      fr.using = true; fr.until = t + (quick ? 1.5 : fr.use ?? rnd(12, 24)); fr.onUse?.();
      if (inView) sfx.play('beep');
    }
    if (fr?.using && t > fr.until) {
      queue.shift(); served++;
      if (fr.office) fr.onDone?.(); else { fr.out = 0; gone.push(fr); if (inView && Math.random() < 0.3) { const a = W(fr.x, fr.z, fr.y); sayAt(a.x, a.y, a.z, tr('people.atm.done')); } }
    }
    if (!quick && queue.filter((p) => p.local).length < want(h) && t > nextSpawn) spawn(h);
    // the locals: each to their place in the line, the ones done along the pavement and away
    queue.forEach((p, k) => {
      if (!p.local) return;
      const to = spotL(k); p.y = to.y;
      const there = step(p, to, dt, k === 0 ? 0.8 : 1.0);
      p.at0 = k === 0 && there;
      if (inView) pose(p, !there, there ? k : null, t);
    });
    for (let j = gone.length - 1; j >= 0; j--) {
      const p = gone[j], to = p.out === 0 ? { x: X(-0.5), z: 0.95 } : { x: X(-5.5), z: 1.35 };
      p.y = p.out === 0 ? H0 : PV;
      if (step(p, to, dt, 1.05)) { if (p.out === 0) p.out = 1; else { crowd.hide(p.i); free.push(p.i); gone.splice(j, 1); continue; } }
      if (inView) pose(p, true, null, t);
    }
    crowd.flush();
  }
  // what people/payday.js needs: the line (join, leave, where each place is), whether today is a payday
  const Qs = {
    payday: () => isPayday(),
    join(tok) { tok.office = true; tok.ready = false; queue.push(tok); return queue.length - 1; },
    leave(tok) { const k = queue.indexOf(tok); if (k >= 0) queue.splice(k, 1); },
    indexOf: (tok) => queue.indexOf(tok),
    length: () => queue.length,
    // place k in the world, and which way to face there (an office person's facing: atan2(dx, dz))
    spot(k) { const s = spotL(Math.min(k, 9)), a = W(s.x, s.z, s.y), [dx, dz] = lookL(Math.min(k, 9)), b = W(s.x + dx, s.z + dz); return { x: a.x, z: a.z, y: a.y, face: Math.atan2(b.x - a.x, b.z - a.z) }; },
    // on the pavement in front, for the walk there and back
    entry() { const a = W(X(1.2), 1.3); return { x: a.x, z: a.z }; },
    dry: () => now < outUntil,
  };
  return {
    update,
    blocked: (x, z, r) => inside(f, x, z, r, X(-WD / 2 - 0.1), X(WD / 2 + 0.36), -DP / 2 - 0.1, DP / 2 + 0.06),
    // in first person: at the door, take some money out (on a payday, after a wait in the line)
    spots: () => { const a = W(X(0), 1.15); return [{ kind: 'atm', x: a.x, z: a.z, label: tr('fp.atm', { n: queue.length }), act: () => { used++; sfx.play('beep'); toast(tr(queue.length > 2 ? 'fp.atmWait' : 'fp.atmDone', { n: queue.length })); } }]; },
    office: Qs,
    debug: { state: () => ({ payday: isPayday(), line: queue.length, locals: queue.filter((p) => p.local).length, office: queue.filter((p) => p.office).length, served, used, dry: now < outUntil, at: [+f.x.toFixed(1), +f.z.toFixed(1)] }),
      dry: () => { outUntil = now + 45; return true; },
      fast: () => { quick = true; outUntil = 0; if (queue[0]?.using) queue[0].until = Math.min(queue[0].until, now + 1.5); return queue.length; },
      line: () => queue.map((p) => ({ office: !!p.office, using: !!p.using, at0: !!p.at0, ready: !!p.ready, left: p.using ? +(p.until - now).toFixed(1) : null, at: p.local ? [+p.x.toFixed(2), +p.z.toFixed(2)] : null })),
      // where to stand to look at it (for pictures): out on the road, along from the booth, looking back at the line
      view: (far = 1) => { const a = W(X(3.4 * far), 2.0 + 2.6 * far), b = W(X(0.4), 0.6); return { x: a.x, z: a.z, yaw: Math.atan2(b.x - a.x, b.z - a.z) }; } },
  };
}
