// People for the street's set pieces (the park's mornings and evenings, the chess game at the trà đá stall, a wedding):
// figures like the pavement's walkers, but whose arms and legs move on their own, standing or sitting on a seat. One
// instanced mesh per body part for the whole crowd; each frame the owner of a slot poses it or hides it.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boxAt, colorize, mergeAll, vmat } from '../terrace.js';
import { camera, fpCam } from '../../scene/renderer.js';
import { wx } from '../../life/weather.js';

const SKIN = '#EDC4A2', HIP = 0.72, SHOULDER = 1.24;
export const SEAT = 0.645;   // the thighs' underside above a sitting figure's origin (a seat 0.32 high puts the feet on the ground)
const W = (g) => colorize(g, '#FFFFFF');   // painted per instance
const at = (g, x, y, z) => g.translate(x, y, z);
const Z0 = new THREE.Matrix4().makeScale(0, 0, 0), UP = new THREE.Vector3(0, 1, 0);

/* Body parts in the figure's own frame: facing +x, its right along +z, feet on y = 0 when standing. Arms hang from the
   shoulders and legs from the hips (their geometry starts at the joint), so a pose is a few angles. */
function bodyParts() {
  const lap = [];
  for (const z of [-0.1, 0.1]) lap.push(W(at(new THREE.BoxGeometry(0.44, 0.14, 0.15), 0.2, SEAT + 0.07, z)), W(at(new THREE.BoxGeometry(0.14, 0.4, 0.14), 0.38, 0.52, z)), boxAt(0.22, 0.07, 0.12, 0.43, 0.355, z, '#1E2125'));
  const racket = [colorize(at(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 6), 0, -0.6, 0), '#2B2F36'),
    colorize(new THREE.TorusGeometry(0.12, 0.013, 5, 18).scale(1, 1.25, 1).rotateY(Math.PI / 2).translate(0, -0.9, 0), '#D63B3B')];
  for (const r of [Math.PI / 2, -Math.PI / 2]) racket.push(colorize(new THREE.CircleGeometry(0.112, 14).scale(1, 1.25, 1).rotateY(r).translate(0, -0.9, 0), '#E8E4DA'));
  return {
    torso: [W(at(new RoundedBoxGeometry(0.26, 0.56, 0.4, 2, 0.08), 0, 1.0, 0))],
    head: [colorize(at(new THREE.SphereGeometry(0.24, 12, 8), 0, 1.52, 0), SKIN)],
    hair: [W(new THREE.SphereGeometry(0.255, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).rotateZ(0.35).translate(-0.03, 1.55, 0))],
    arm: [W(at(new THREE.BoxGeometry(0.12, 0.5, 0.1), 0, -0.23, 0))],
    leg: [W(at(new THREE.BoxGeometry(0.15, 0.62, 0.15), 0, -0.31, 0)), boxAt(0.22, 0.08, 0.16, 0.03, -0.6, 0, '#1E2125')],
    lap,
    // an old man's pith helmet (mũ cối)
    hat: [colorize(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(-0.02, 1.6, 0), '#6B7343'), colorize(at(new THREE.CylinderGeometry(0.34, 0.34, 0.02, 16), -0.02, 1.6, 0), '#5E6638')],
    racket,
    non: [colorize(new THREE.ConeGeometry(0.4, 0.22, 16).translate(0, 1.84, 0), '#E5D49C')],   // a conical hat (nón lá)
    // the pickleball court's (street-pickle.js): a sun visor (a band and its brim, painted), a pleated tennis skirt over
    // the hips (painted), white court shoes over the dark ones, a paddle in the right hand, a phone held up to film
    visor: [W(new THREE.CylinderGeometry(0.262, 0.262, 0.07, 16, 1, true).translate(0, 1.6, 0)), W(new THREE.CylinderGeometry(0.17, 0.17, 0.015, 16, 1, false, 0, Math.PI).translate(0.2, 1.575, 0))],
    skirt: [W(new THREE.CylinderGeometry(0.215, 0.29, 0.24, 14, 1, true).scale(0.8, 1, 1).translate(0, 0.66, 0))],
    shoes: [boxAt(0.235, 0.09, 0.17, 0.035, -0.6, 0, '#F4F5F2'), boxAt(0.24, 0.025, 0.175, 0.035, -0.64, 0, '#C9CED6')],
    paddle: [colorize(new THREE.CylinderGeometry(0.018, 0.018, 0.13, 6).translate(0, -0.56, 0), '#2B2F36'),
      W(new THREE.BoxGeometry(0.02, 0.27, 0.2).translate(0, -0.76, 0)), colorize(new THREE.BoxGeometry(0.024, 0.28, 0.012).translate(0, -0.76, 0.1), '#2B2F36'), colorize(new THREE.BoxGeometry(0.024, 0.28, 0.012).translate(0, -0.76, -0.1), '#2B2F36')],
    phone: [boxAt(0.02, 0.15, 0.075, 0.03, -0.55, 0, '#1E2125'), colorize(new THREE.PlaneGeometry(0.068, 0.135).rotateY(Math.PI / 2).translate(0.041, -0.55, 0), '#8FD3FF')],
  };
}

/** n figures, in G. dress(i, colours) once, then each frame pose(i, f) or hide(i), and flush() at the end. f: { x, y (the
    ground), z, yaw, s (scale: 0.62 a child), sit (the seat's top, world y, instead of y), lean (forward < 0), arms:
    [[swing, raise], [swing, raise]] (left, right; swing forward > 0, π straight up; raise out to the side), legs: [l, r]
    (forward > 0), hat (true: a pith helmet; 'non': a conical hat), racket (in the right hand), tip (the whole body tipped back about the hips: π/2 lies on its back,
    head towards -x), faceHat (the hat over the face, for a nap); on the pickleball court: visor, skirt, shoes (white court
    shoes), paddle (in the right hand), phone (the left hand, filming) } */
export function folk(G, n, { low = false, shadows = true } = {}) {
  const P = bodyParts(), m = {};
  for (const [k, list] of Object.entries(P)) {
    const o = new THREE.InstancedMesh(mergeAll(list), vmat({ roughness: 0.85, side: k === 'racket' || k === 'visor' || k === 'skirt' ? THREE.DoubleSide : THREE.FrontSide }), k === 'arm' || k === 'leg' || k === 'shoes' ? n * 2 : n);
    o.frustumCulled = false; o.visible = false;
    for (let i = 0; i < o.count; i++) o.setMatrixAt(i, Z0);
    if (shadows && (k === 'torso' || k === 'head')) o.castShadow = !low;
    o.userData.setPiece = true; G.add(o); m[k] = o;
  }
  const on = new Uint8Array(n), hat = new Uint8Array(n), non = new Uint8Array(n), racket = new Uint8Array(n), col = new THREE.Color();
  const kit = { visor: new Uint8Array(n), skirt: new Uint8Array(n), shoes: new Uint8Array(n), paddle: new Uint8Array(n), phone: new Uint8Array(n) };   // (the court's)
  const B = new THREE.Matrix4(), U = new THREE.Matrix4(), A = new THREE.Matrix4(), T = new THREE.Matrix4(), R = new THREE.Matrix4();
  const q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  let free = 0, dirty = false;
  const paint = (o, i, c) => { o.setColorAt(i, col.set(c)); o.instanceColor.needsUpdate = true; };
  function hide(i) {
    if (!on[i]) return;
    on[i] = hat[i] = non[i] = racket[i] = 0; dirty = true;
    for (const k of ['torso', 'head', 'hair', 'lap', 'hat', 'non', 'racket', 'visor', 'skirt', 'paddle', 'phone']) m[k].setMatrixAt(i, Z0);
    for (const k of ['arm', 'leg', 'shoes']) { m[k].setMatrixAt(i * 2, Z0); m[k].setMatrixAt(i * 2 + 1, Z0); }
    for (const a of Object.values(kit)) a[i] = 0;
  }
  return {
    // n slots for one owner
    take(k) { const out = []; for (let j = 0; j < k && free < n; j++) out.push(free++); return out; },
    dress(i, { shirt = '#3F7CC4', hair = '#2B2420', pants = '#363D4C', sleeves, visor = '#F4F4F2', skirt = '#F4F4F2', paddle = '#D8323C' } = {}) {
      paint(m.torso, i, shirt); paint(m.hair, i, hair); paint(m.leg, i * 2, pants); paint(m.leg, i * 2 + 1, pants); paint(m.lap, i, pants);
      paint(m.arm, i * 2, sleeves || shirt); paint(m.arm, i * 2 + 1, sleeves || shirt);
      paint(m.visor, i, visor); paint(m.skirt, i, skirt); paint(m.paddle, i, paddle);
    },
    pose(i, f) {
      on[i] = 1; hat[i] = (f.hat && f.hat !== 'non') || f.faceHat ? 1 : 0; non[i] = f.hat === 'non' ? 1 : 0; racket[i] = f.racket ? 1 : 0; dirty = true;
      for (const k in kit) kit[k][i] = f[k] ? 1 : 0;
      const s = f.s ?? 1, sit = f.sit != null;
      q.setFromAxisAngle(UP, f.yaw || 0); p.set(f.x, (sit ? f.sit - SEAT * s : f.y) + (f.bob || 0), f.z); sc.setScalar(s); B.compose(p, q, sc);
      if (f.tip) B.multiply(T.makeTranslation(0, HIP, 0)).multiply(R.makeRotationZ(f.tip)).multiply(T.makeTranslation(0, -HIP, 0));
      U.copy(B);
      if (f.lean) U.multiply(T.makeTranslation(0, HIP, 0)).multiply(R.makeRotationZ(f.lean)).multiply(T.makeTranslation(0, -HIP, 0));
      m.torso.setMatrixAt(i, U); m.head.setMatrixAt(i, U); m.hair.setMatrixAt(i, U);
      m.visor.setMatrixAt(i, f.visor ? U : Z0); m.skirt.setMatrixAt(i, f.skirt && !sit ? B : Z0);
      if (f.faceHat) m.hat.setMatrixAt(i, A.copy(U).multiply(T.makeTranslation(0.12, 1.52, 0)).multiply(R.makeRotationZ(-Math.PI / 2)).multiply(T.makeTranslation(0, -1.52, 0)));
      else m.hat.setMatrixAt(i, f.hat && f.hat !== 'non' ? U : Z0);
      m.non.setMatrixAt(i, f.hat === 'non' ? U : Z0);
      for (const [k, side] of [[0, -1], [1, 1]]) {
        const [sw = 0, rs = 0] = f.arms?.[k] || [];
        A.copy(U).multiply(T.makeTranslation(0, SHOULDER, side * 0.25)).multiply(R.makeRotationX(-side * rs)).multiply(T.makeRotationZ(sw));
        m.arm.setMatrixAt(i * 2 + k, A);
        if (k === 1) { m.racket.setMatrixAt(i, f.racket ? A : Z0); m.paddle.setMatrixAt(i, f.paddle ? A : Z0); }
        else m.phone.setMatrixAt(i, f.phone ? A : Z0);
      }
      if (sit) { m.lap.setMatrixAt(i, B); for (const j of [0, 1]) { m.leg.setMatrixAt(i * 2 + j, Z0); m.shoes.setMatrixAt(i * 2 + j, Z0); } return; }
      m.lap.setMatrixAt(i, Z0);
      for (const [k, side] of [[0, -1], [1, 1]]) {
        A.copy(B).multiply(T.makeTranslation(0, HIP, side * 0.1)).multiply(R.makeRotationZ(f.legs?.[k] || 0));
        m.leg.setMatrixAt(i * 2 + k, A); m.shoes.setMatrixAt(i * 2 + k, f.shoes ? A : Z0);
      }
    },
    hide,
    // where a posed figure's right hand is (for a racket's swing, a phone's glow): the end of the right arm's last matrix
    hand(i, out) { m.arm.getMatrixAt(i * 2 + 1, A); return out.set(0, -0.5, 0).applyMatrix4(A); },
    // each part drawn only up to the highest slot out (the hidden ones below it are folded to nothing)
    flush() {
      if (!dirty) return; dirty = false;
      const top = (a) => { for (let i = n - 1; i >= 0; i--) if (a[i]) return i + 1; return 0; };
      const all = top(on), tops = { arm: all * 2, leg: all * 2, hat: top(hat), non: top(non), racket: top(racket), visor: top(kit.visor), skirt: top(kit.skirt), shoes: top(kit.shoes) * 2, paddle: top(kit.paddle), phone: top(kit.phone) };
      for (const [k, o] of Object.entries(m)) { o.count = tops[k] ?? all; o.visible = o.count > 0; o.instanceMatrix.needsUpdate = true; }
    },
  };
}

/* ---------- running the set pieces cheaply ---------- */
const NDC = new THREE.Vector3();
// whether (x, z) is on screen or near it, in the office's camera or walking in: what nobody sees needn't move
export function seen(x, z, y = -0.2) {
  for (const cam of [camera, fpCam]) {
    NDC.set(x, y, z).project(cam);
    if (NDC.z > -1 && NDC.z < 1 && Math.abs(NDC.x) < 1.35 && Math.abs(NDC.y) < 1.35) return true;
  }
  return false;
}
const inHours = (h, when) => (typeof when[0] === 'number' ? [when] : when).some(([a, b]) => h >= a && h < b);
/** steps a set piece's parts: each has `when` ([from, to] hours, or a list of them), `at` ([x, z], for the view check),
    update(t, dt, h), off(), away() (gone out of view, optional), and `dry` if it goes on in the rain. The hours, the rain and the view are looked at a few
    times a second; between, only the parts that are on and in view are stepped (none: nothing to do). */
export function stepper(parts, look = seen) {
  let checkAt = -1, live = [];
  for (const p of parts) p.on = false;
  return (dt, t, h) => {
    if (t - checkAt > 0.3 || t < checkAt) {
      checkAt = t; live = [];
      const rain = wx.rain > 0.05;
      for (const p of parts) {
        const want = (p.dry || !rain) && inHours(h, p.when);
        if (want !== p.on) { p.on = want; if (!want) p.off(); }
        const vis = want && (!p.at || look(p.at[0], p.at[1]));
        if (p.vis && !vis) p.away?.();   // (out of view: let go of anything that needs looking after)
        p.vis = vis;
        if (vis) live.push(p);
      }
    }
    for (const p of live) p.update(t, dt, h);
  };
}
