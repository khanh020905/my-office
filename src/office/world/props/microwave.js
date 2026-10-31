// The pantry's microwave corner (company floor): two microwaves side by side on a low cabinet against the library's
// wall, where everyone who brought lunch from home warms it at noon (people/comnha.js). Each one as they look in an
// office: a white body, the door hinged on the left with its dark window, the control panel on the right with a green
// display (the time, then the minutes counting down, then "End"). Running, its inside lights up and the glass plate turns
// with the box on it; at the end three beeps ("tít tít tít", with the sound on) and the door opens. A box left with its
// lid clipped shut pops it halfway; cá kho or mắm leaves wavy smell lines over it for a while. A note taped to the
// cabinet asks for the lids to be opened. What moves is drawn only while it moves and is on screen.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PRO, officeNow, reduceMotion } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { canvasTex, cyl, mat, put, rbox } from '../../scene/blocks.js';
import { shaded } from '../desks.js';
import { seen } from '../backdrops/street-folk.js';
import { sfx } from '../../audio/sfx.js';
import { t as tr } from '../../../i18n/index.js';

const FONT = '"Be Vietnam Pro", system-ui, sans-serif';
export const MW = { g: null, ovens: [], spots: [] };
// the boxes people bring (people/comnha.js picks one per person): a clear plastic box with a four-clip coloured lid
// (the Lock&Lock kind), a glass one, a stainless two-tier tin
export const BOX_KINDS = ['blue', 'green', 'pink', 'glass', 'inox'];
const LID = { blue: '#2F7FD0', green: '#3FA35B', pink: '#E06B9A', glass: '#2E86C1', inox: '#C9CED6' };
let boxGeos = null;
/** the closed box, its base and its lid apart (the lid pops): { body, lid } geometries per kind, shared */
export function boxGeo(kind) {
  if (!boxGeos) {
    boxGeos = {};
    for (const k of BOX_KINDS) {
      if (k === 'inox') {
        boxGeos[k] = {
          body: shaded([[new THREE.CylinderGeometry(0.06, 0.058, 0.05, 16).translate(0, 0.025, 0), '#D7DBE0'], [new THREE.CylinderGeometry(0.061, 0.061, 0.006, 16).translate(0, 0.05, 0), '#AEB4BC'],
            [new THREE.CylinderGeometry(0.058, 0.056, 0.045, 16).translate(0, 0.076, 0), '#D7DBE0'], [new THREE.TorusGeometry(0.03, 0.005, 5, 10, Math.PI).translate(0, 0.1, 0), '#8E949C']]),
          lid: shaded([[new THREE.CylinderGeometry(0.06, 0.06, 0.012, 16), '#C9CED6']]).translate(0, 0.104, 0),
        };
        continue;
      }
      const glass = k === 'glass';
      boxGeos[k] = {
        body: shaded([[new THREE.BoxGeometry(0.17, 0.055, 0.12).translate(0, 0.0275, 0), glass ? '#DCEFF3' : '#EEF1F2'],
          [new THREE.BoxGeometry(0.15, 0.03, 0.1).translate(0, 0.03, 0), '#F4EFE2'], [new THREE.BoxGeometry(0.06, 0.012, 0.08).translate(0.035, 0.05, 0), '#8B4A26']]),
        lid: shaded([[new THREE.BoxGeometry(0.176, 0.014, 0.126).translate(0, 0.062, 0), LID[k]],
          ...[[0, 0.066], [0, -0.066], [0.091, 0], [-0.091, 0]].map(([x, z]) => [new THREE.BoxGeometry(z ? 0.05 : 0.01, 0.022, z ? 0.01 : 0.05).translate(x, 0.054, z), LID[k]])]),
      };
    }
  }
  return boxGeos[kind] || boxGeos.blue;
}
let boxM;
export const boxMat = () => (boxM ||= mat('#FFFFFF', { roughness: 0.45, vertexColors: true }));

/* ---------- the displays: one small canvas for both, a row each ---------- */
let dispTex = null, dispKey = ['', ''];
function drawDisplay(i, text) {
  if (dispKey[i] === text) return;
  dispKey[i] = text;
  const g = dispTex.image.getContext('2d'), w = dispTex.image.width, h = dispTex.image.height / 2, y = i * h;
  g.fillStyle = '#0B1410'; g.fillRect(0, y, w, h);
  g.fillStyle = '#62F0B4'; g.font = `700 ${Math.round(h * 0.72)}px ui-monospace, Menlo, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, y + h / 2 + 1);
  dispTex.needsUpdate = true;
}

/* ---------- smell lines: wavy strokes that rise and fade (shared texture, a few sprites) ---------- */
let smellTex = null;
const wisps = [];
function smellSprites() {
  smellTex ||= canvasTex(64, 128, (g, w, h) => {
    g.lineWidth = 6; g.lineCap = 'round'; g.strokeStyle = 'rgba(128,150,92,.95)';
    g.beginPath(); for (let y = h - 6; y > 8; y -= 2) g.lineTo(w / 2 + Math.sin(y / 13) * 14, y); g.stroke();
  });
  for (let k = 0; k < 6; k++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smellTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; s.scale.set(0.16, 0.32, 1); s.userData.dynamic = true; scene.add(s);
    wisps.push({ s, oven: null, t: 0, ph: k / 3 });
  }
}

/* ---------- one oven ---------- */
// local frame: x along the front (the door on the left, the panel on the right), y up, z out of the front; the body's
// bottom centre at the origin. Its inside is a real hollow (the liner seen from within), so the plate and the box show
// through the window when it is lit and when the door is open.
const BIG = 1.2;   // (a little bigger than life, as the desks' things are, so it reads from the usual camera)
const W = 0.46, H = 0.27, D = 0.36, CAV = { x0: -0.215, x1: 0.08, y0: 0.035, y1: 0.235, z0: -0.15, z1: D / 2 - 0.004 };
function oven(i, at) {
  const g = new THREE.Group(); g.position.copy(at.pos); g.rotation.y = at.ry; g.scale.setScalar(BIG); MW.g.add(g);
  const white = mat('#ECEDEE', { roughness: 0.5 }), grey = mat('#3A3F46', { roughness: 0.4 });
  // the shell round the cavity (static: merged with the cabinet)
  put(g, rbox(W, 0.035, D, white, 0.012), 0, 0.0175, 0);
  put(g, rbox(W, H - CAV.y1, D, white, 0.012), 0, (H + CAV.y1) / 2, 0);
  put(g, rbox(CAV.x1 - CAV.x0, CAV.y1 - CAV.y0, D / 2 + CAV.z0 + 0.002, white, 0.004), (CAV.x0 + CAV.x1) / 2, (CAV.y0 + CAV.y1) / 2, (-D / 2 + CAV.z0) / 2);
  put(g, rbox(W / 2 + CAV.x0 + 0.002, H, D, white, 0.006), (-W / 2 + CAV.x0) / 2, H / 2, 0);
  put(g, rbox(W / 2 - CAV.x1, H, D, white, 0.012), (CAV.x1 + W / 2) / 2, H / 2, 0);
  // the panel: a dark strip, the display's bezel, the keypad, the start button, the dial
  put(g, new THREE.Mesh(new THREE.BoxGeometry(W / 2 - CAV.x1 - 0.02, H - 0.05, 0.004), grey), (CAV.x1 + W / 2) / 2, H / 2, D / 2 + 0.002);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) put(g, new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.014, 0.006), mat('#5B626B', { roughness: 0.5 })), CAV.x1 + 0.045 + c * 0.032, 0.165 - r * 0.022, D / 2 + 0.005);
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.006), mat('#4C8A5E', { roughness: 0.5 })), CAV.x1 + 0.077, 0.09, D / 2 + 0.005);
  put(g, cyl(0.022, 0.022, 0.012, mat('#C9CED6', { metalness: 0.5, roughness: 0.3 }), 14), CAV.x1 + 0.077, 0.05, D / 2 + 0.007).rotation.x = Math.PI / 2;
  // vents along its right side
  for (let k = 0; k < 6; k++) put(g, new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.01, 0.06), grey), W / 2 + 0.001, 0.17 - k * 0.018, -0.05);
  // the cavity's liner, seen from inside: lit while it runs or stands open
  const linerM = mat('#C9CCC6', { roughness: 0.7, side: THREE.BackSide, emissive: '#FFC870', emissiveIntensity: 0 });
  const liner = put(g, new THREE.Mesh(new THREE.BoxGeometry(CAV.x1 - CAV.x0 - 0.004, CAV.y1 - CAV.y0 - 0.004, CAV.z1 - CAV.z0), linerM), (CAV.x0 + CAV.x1) / 2, (CAV.y0 + CAV.y1) / 2, (CAV.z0 + CAV.z1) / 2);
  liner.userData.dynamic = true; liner.visible = false;
  // the glass plate and what turns on it
  const plate = new THREE.Group(); plate.position.set((CAV.x0 + CAV.x1) / 2, CAV.y0 + 0.004, (CAV.z0 + CAV.z1) / 2 - 0.005); plate.userData.dynamic = true; plate.visible = false; g.add(plate);
  put(plate, cyl(0.125, 0.12, 0.008, mat('#CFE3E8', { roughness: 0.15 }), 24), 0, 0.004, 0);
  const box = new THREE.Mesh(boxGeo('blue').body, boxMat()), lid = new THREE.Mesh(boxGeo('blue').lid, boxMat());
  box.position.y = 0.008; box.scale.setScalar(0.92); box.add(lid); box.visible = false; plate.add(box);
  // the door, on its hinge at the left edge: the frame and handle, and the window (more see-through once lit)
  const hinge = new THREE.Group(); hinge.position.set(-W / 2, 0, D / 2); hinge.userData.dynamic = true; g.add(hinge);
  const dw = CAV.x1 - (-W / 2) + 0.004, dh = H - 0.02, fx = dw / 2;
  const frame = shaded([
    [new THREE.BoxGeometry(dw, 0.04, 0.02).translate(fx, 0.03, 0.01), '#E3E5E7'], [new THREE.BoxGeometry(dw, 0.04, 0.02).translate(fx, dh - 0.01, 0.01), '#E3E5E7'],
    [new THREE.BoxGeometry(0.035, dh - 0.06, 0.02).translate(0.0175, dh / 2 + 0.01, 0.01), '#E3E5E7'], [new THREE.BoxGeometry(0.05, dh - 0.06, 0.02).translate(dw - 0.025, dh / 2 + 0.01, 0.01), '#E3E5E7'],
    [new THREE.BoxGeometry(0.016, 0.16, 0.022).translate(dw - 0.022, dh / 2 + 0.01, 0.03), '#9AA1A9'],   // the handle
  ]);
  const door = put(hinge, new THREE.Mesh(frame, mat('#FFFFFF', { roughness: 0.45, vertexColors: true })), 0, 0, 0); door.castShadow = false;
  const winM = new THREE.MeshStandardMaterial({ color: '#141A20', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.9, depthWrite: false });
  const win = put(hinge, new THREE.Mesh(new THREE.PlaneGeometry(dw - 0.085, dh - 0.06), winM), 0.035 + (dw - 0.085) / 2, dh / 2 + 0.01, 0.012); win.renderOrder = 2;
  // the display: its row of the shared canvas, drawn with the other's as one mesh (setup)
  const disp = new THREE.PlaneGeometry(0.1, 0.03).translate(CAV.x1 + 0.077, 0.218, D / 2 + 0.006), uv = disp.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setY(k, (1 - i) * 0.5 + uv.getY(k) * 0.5);
  g.updateMatrixWorld(true); disp.applyMatrix4(g.matrix);
  const O = {
    i, g, door, win, hinge, liner, linerM, plate, box, lid, winM, disp,
    stage: 'idle', open: 0, openGoal: 0, until: 0, total: 0, smell: 0, popAt: 0, popped: false, by: null, beeps: 0,
    top: g.localToWorld(new THREE.Vector3((CAV.x0 + CAV.x1) / 2, H + 0.05, 0)),
    load(kind) { const G = boxGeo(kind); box.geometry = G.body; lid.geometry = G.lid; lid.position.set(0, 0, 0); lid.rotation.set(0, 0, 0); box.visible = true; plate.visible = true; this.popped = false; },
    unload() { box.visible = false; },
  };
  return O;
}

/* ---------- running them (people/comnha.js says what) ---------- */
/** start: `secs` of heating; smelly: cá kho or mắm inside; pop: its lid left clipped (pops a little after half way) */
export function runOven(O, secs, { smelly = false, pop = false } = {}) {
  O.stage = 'run'; O.openGoal = 0; O.total = secs; O.until = 0; O.left = secs; O.smell = smelly ? 1 : 0; O.popAt = pop ? secs * 0.45 : 0; O.beeps = 0;
  sfx.play('click');
}
export const openOven = (O, on = true) => { O.openGoal = on ? 1 : 0; };
// (dt: the sim's; done(O): the beeps have gone, the door opens; popped(O): the lid went)
let calmT = 0;
export function updateOvens(dt, done, popped) {
  if (!PRO || !MW.g) return;
  // (nothing going on, most of the day: only the displays' clock, once a second)
  const calm = MW.ovens.every((O) => O.stage === 'idle' && !O.open && !O.openGoal && O.smell <= 0);
  if (calm && (calmT += dt) < 1) return;
  calmT = 0;
  let look = null;
  const inView = () => (look ??= seen(MW.at.x, MW.at.z, 0.9));
  for (const O of MW.ovens) {
    // the door swings to where it is going (a little over 100°)
    if (O.open !== O.openGoal) {
      O.open = reduceMotion ? O.openGoal : THREE.MathUtils.clamp(O.open + Math.sign(O.openGoal - O.open) * dt * 2.6, 0, 1);
      O.hinge.rotation.y = -O.open * 1.85;
    }
    const lit = O.stage === 'run' || O.open > 0.05;
    O.liner.visible = lit || O.open > 0; O.plate.visible = O.box.visible || lit;
    O.linerM.emissiveIntensity = lit ? 1.5 : 0; O.winM.opacity = O.stage === 'run' ? 0.3 : 0.9;
    if (O.stage === 'run') {
      O.left -= dt;
      if (inView()) O.plate.rotation.y += dt * 0.55;   // (about one turn in twelve seconds, as theirs)
      if (O.popAt && !O.popped && O.total - O.left >= O.popAt) { O.popped = true; sfx.play('pop'); popped?.(O); }
      if (O.left <= 0) { O.stage = 'done'; O.left = 0; O.beeps = 1; sfx.play('micro'); done?.(O); }
    }
    if (O.popped && O.box.visible) {   // the lid off the box, tipped over on its edge
      O.lid.position.y += (0.05 - O.lid.position.y) * Math.min(1, dt * 14); O.lid.position.x += (0.05 - O.lid.position.x) * Math.min(1, dt * 14);
      O.lid.rotation.z += (0.7 - O.lid.rotation.z) * Math.min(1, dt * 14);
    }
    O.smell = Math.max(0, O.smell - (O.stage === 'run' ? 0 : dt / 45));   // (lingers about three quarters of a minute after)
  }
  if (!inView()) { for (const w of wisps) if (w.s.visible) w.s.visible = false; return; }
  // the displays: the time, the minutes left, or "End"
  const now = officeNow(), clock = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  for (const O of MW.ovens) drawDisplay(O.i, O.stage === 'run' ? `${Math.floor(Math.ceil(O.left) / 60)}:${String(Math.ceil(O.left) % 60).padStart(2, '0')}` : O.stage === 'done' ? 'End' : clock);
  // smell lines over whichever oven smells (two wisps each, rising and fading in turn)
  let k = 0;
  for (const O of MW.ovens) {
    if (O.smell <= 0.02 || reduceMotion) continue;
    for (let j = 0; j < 3 && k < wisps.length; j++, k++) {
      const w = wisps[k]; w.t = (w.t + dt / 2.4) % 1;
      const u = (w.t + j / 3) % 1;
      w.s.visible = true; w.s.material.opacity = Math.sin(u * Math.PI) * 0.8 * Math.min(1, O.smell * 1.5);
      w.s.position.set(O.top.x + (j - 1) * 0.07, O.top.y + u * 0.45, O.top.z + Math.sin(u * 6 + j) * 0.03);
    }
  }
  for (; k < wisps.length; k++) if (wisps[k].s.visible) wisps[k].s.visible = false;
}

/* ---------- the corner ---------- */
function note() {
  // a sheet of A5 taped to the cabinet's front: the office's rule, in red marker
  const tex = canvasTex(256, 180, (g, w, h) => {
    g.fillStyle = '#FBFAF4'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(240,226,160,.75)'; g.fillRect(18, 0, 48, 16); g.fillRect(w - 66, 0, 48, 16);
    g.fillStyle = '#C62828'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = [tr('world.microwave.note1'), tr('world.microwave.note2'), tr('world.microwave.note3')];
    lines.forEach((l, k) => { g.font = `${k ? 600 : 800} ${k ? 24 : 30}px ${FONT}`; const fw = g.measureText(l).width; if (fw > w - 20) g.font = g.font.replace(/\d+px/, `${Math.floor((k ? 24 : 30) * (w - 20) / fw)}px`); g.fillText(l, w / 2, 46 + k * 50); });
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.176), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  m.userData.noMerge = true;
  return m;
}
export function setup() {
  if (!PRO) return;
  // against the pantry's side of the wall it shares with the library, between the big bin and the door to the floor
  const X = 8.68, Z0 = -4.95, Z1 = -3.65, TOP = 0.9;
  MW.at = { x: X + 0.25, z: (Z0 + Z1) / 2 };
  MW.g = new THREE.Group(); scene.add(MW.g);
  const body = mat('#E6E1D8', { roughness: 0.7 }), top = mat('#3B3F46', { roughness: 0.35 });
  put(MW.g, rbox(0.42, TOP - 0.03, Z1 - Z0, body, 0.03), X + 0.21, (TOP - 0.03) / 2, (Z0 + Z1) / 2);
  put(MW.g, rbox(0.46, 0.04, Z1 - Z0 + 0.04, top, 0.015), X + 0.23, TOP - 0.02, (Z0 + Z1) / 2);
  for (const z of [Z0 + 0.32, Z1 - 0.32]) put(MW.g, rbox(0.02, 0.62, 0.6, mat('#D9D2C6', { roughness: 0.7 }), 0.01), X + 0.425, 0.44, z);
  // on top of them, as always: a roll of kitchen paper lying on one, the washing-up liquid on the other
  put(MW.g, cyl(0.055, 0.055, 0.22, mat('#F7F6F2', { roughness: 0.9 }), 14), X + 0.16, TOP + H * BIG + 0.055, Z1 - 0.38).rotation.x = Math.PI / 2;
  put(MW.g, cyl(0.03, 0.035, 0.15, mat('#F2C230', { roughness: 0.3 }), 10), X + 0.12, TOP + H * BIG + 0.075, Z0 + 0.2);
  const sheet = note(); sheet.position.set(X + 0.438, 0.58, Z1 - 0.32); sheet.rotation.y = Math.PI / 2; MW.g.add(sheet);
  // the two ovens, facing the room
  dispTex = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#0B1410'; g.fillRect(0, 0, w, h); }); dispTex.anisotropy = 1;
  MW.ovens = [Z0 + 0.32, Z0 + 0.96].map((z, i) => oven(i, { pos: new THREE.Vector3(X + 0.2, TOP, z), ry: Math.PI / 2 }));
  const disp = new THREE.Mesh(mergeGeometries(MW.ovens.map((O) => O.disp)), new THREE.MeshBasicMaterial({ map: dispTex, toneMapped: false }));
  disp.userData.dynamic = true; MW.g.add(disp);
  // where you stand to use each: by its panel side (clear of the door as it swings), turned to it
  MW.spots = MW.ovens.map((O) => { const x = 9.48, z = O.g.position.z - 0.3; return { x, z, face: Math.atan2(X + 0.2 - x, O.g.position.z - z), node: 'PA2', sit: false }; });
  smellSprites();
  drawDisplay(0, '12:00'); drawDisplay(1, '12:00');
}
// for the props (interact/props.js): what you point at, the doors (the rest is merged with the room's furniture: no
// draw calls of its own)
export const mwMeshes = () => MW.ovens.flatMap((O) => [O.door, O.win]);
