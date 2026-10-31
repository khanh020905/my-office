// A pickleball court by a park near the office (city backdrop), as they have sprung up all over Vietnam's cities since
// 2024: one outdoor court, the real size (20 × 44 ft: 6.10 × 13.41 m), laid lengthways across the park's edge and the
// old lane of a street no traffic uses any more; the blue acrylic court on green, its white lines 2 in wide (the
// non-volley zone, the "kitchen", 7 ft either side of the net; the centre lines from it to the baselines), the net 34
// in high in the middle and 36 in at the posts (22 ft long, the posts a foot outside the sidelines), a chain-link
// fence round it with dark green windscreens at the ends, four poles of LED floodlights for the evening, the board at
// the gate ("Sân pickleball · 200.000–300.000đ/giờ sau 17h"), two benches with water bottles, bags, spare paddles and
// a bucket of balls (the perforated yellow ones). The neighbourhood plays on weekday evenings and weekend mornings and
// evenings, in visors, tennis skirts and court shoes: doubles, the server calling the score ("4-2-1"), the return
// deep, the drop into the kitchen, then the dinks back and forth at the kitchen line, now and then a lob. Some
// evenings the office books it (people/pickle.js); then a point is one of its test runs when one happens: each passing
// test a shot over the net, the first failing one into the net. Nothing here is anyone's artwork: the name, the board
// and the emblem are drawn here. ?pickle: the court in use now; ?debug: street.pickleDebug.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { el, officeNow } from '../../core/env.js';
import { canvasTex } from '../../scene/blocks.js';
import { camera } from '../../scene/renderer.js';
import { fp } from '../../interact/first-person.js';
import { GY, boxAt, colorize, mergeAll, vmat } from '../terrace.js';
import { sfx } from '../../audio/sfx.js';
import { toast } from '../../ui/activity.js';
import { seen } from './street-folk.js';
import { t as tr } from '../../../i18n/index.js';

const Q0 = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const FORCE = Q0.has('pickle');
// the court in metres (USA Pickleball's rule book): its width and length, the kitchen's depth, the net's height in the
// middle and at the posts, where the posts stand (12 in outside the sidelines), the lines' width
export const COURT = { W: 6.096, L: 13.411, K: 2.134, NET_C: 0.864, NET_P: 0.914, POST: 3.353, LINE: 0.051 };
export const PRICE = [200, 300], FEE = 280, SHARE = 70;   // an hour after 17:00, in thousands of đồng; the office's booking and each one's share
const HL = COURT.L / 2, HW = COURT.W / 2, KL = COURT.K, TOP = 0.22;   // (TOP: the court's surface above the road)
const FONT = '"Be Vietnam Pro", system-ui, sans-serif';
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// the neighbourhood's hours on the court: weekday evenings; weekend mornings and evenings
const localHours = (d) => { const h = d.getHours() + d.getMinutes() / 60, we = d.getDay() === 0 || d.getDay() === 6; return (h >= 17 && h < 21.5) || (we && ((h >= 6 && h < 9.5) || (h >= 15.5 && h < 17))); };

/** Where the court goes: the park nearest the office (not the two with the bánh mì cart and the trà đá stall, which
    `parks` leaves out, nor one with a paved square) that has a street without traffic beside it (one running through the
    office's own block: no lane is laid in it); the court lengthways across that street's lane and the park, its fence
    inside the park's pavements on the other two sides. parks: [x0, x1, z0, z1], nearest first. Returns the fence's
    rectangle, the court's axis, and the park's pavements it closes. */
export function pickleSite({ SB, HALF, parks }) {
  const quiet = (axis, v) => (axis === 'x' ? v > SB.x0 && v < SB.x1 : v > SB.z0 && v < SB.z1), P = 1.3;
  for (const [x0, x1, z0, z1] of parks) {
    if (quiet('x', x0 - HALF)) return { axis: 'x', x0: x0 - 2 * HALF, x1, z0: z0 + P, z1: z1 - P, park: [x0, x1, z0, z1], shut: 'x' };
    if (quiet('x', x1 + HALF)) return { axis: 'x', x0, x1: x1 + 2 * HALF, z0: z0 + P, z1: z1 - P, park: [x0, x1, z0, z1], shut: 'x' };
    if (quiet('z', z0 - HALF)) return { axis: 'z', x0: x0 + P, x1: x1 - P, z0: z0 - 2 * HALF, z1, park: [x0, x1, z0, z1], shut: 'z' };
    if (quiet('z', z1 + HALF)) return { axis: 'z', x0: x0 + P, x1: x1 - P, z0, z1: z1 + 2 * HALF, park: [x0, x1, z0, z1], shut: 'z' };
  }
  return null;
}

/* ---------- the printing: the windscreen's band, the board at the gate, the net's mesh ---------- */
const RP = { wind: [0, 0, 1024, 128], board: [0, 128, 512, 384], ball: [512, 128, 128, 128] };
// the emblem: a paddle and a ball, drawn here
function emblem(g, cx, cy, s, paddle = '#F2C230', ball = '#D7E84A') {
  g.save(); g.translate(cx, cy); g.rotate(-0.5);
  g.fillStyle = '#1E2125'; g.fillRect(-s * 0.09, s * 0.35, s * 0.18, s * 0.5);
  g.fillStyle = paddle; g.beginPath(); g.roundRect(-s * 0.32, -s * 0.62, s * 0.64, s * 1.0, s * 0.22); g.fill();
  g.strokeStyle = '#1E2125'; g.lineWidth = s * 0.06; g.stroke();
  g.restore();
  g.fillStyle = ball; g.beginPath(); g.arc(cx + s * 0.42, cy - s * 0.42, s * 0.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(0,0,0,.45)'; for (const [a, b] of [[0, 0], [-0.08, 0.06], [0.08, 0.07], [0.02, -0.09]]) { g.beginPath(); g.arc(cx + s * (0.42 + a), cy - s * (0.42 + b), s * 0.03, 0, Math.PI * 2); g.fill(); }
}
function drawPickle(g) {
  g.clearRect(0, 0, 1024, 512);
  // the windscreen: dark green mesh fabric, the name and the emblem along it in white
  { const [x, y, w, h] = RP.wind;
    g.fillStyle = '#1F4D3A'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < w; i += 4) g.fillRect(x + i, y, 1, h);
    for (const k of [0, 1]) { const cx = x + w * (0.25 + k * 0.5); emblem(g, cx - 150, y + h / 2 + 4, 70); g.fillStyle = '#FFFFFF'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `900 46px ${FONT}`; g.fillText('PICKLEBALL', cx - 100, y + h / 2 + 2, 250); } }
  // the board at the gate
  { const [x, y, w, h] = RP.board;
    g.fillStyle = '#FFFFFF'; g.fillRect(x, y, w, h);
    g.fillStyle = '#1F4D3A'; g.fillRect(x, y, w, 104);
    emblem(g, x + 66, y + 54, 72);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `900 46px ${FONT}`; g.fillText('SÂN PICKLEBALL', x + 118, y + 54, w - 130);
    g.fillStyle = '#2D5E9E'; g.fillRect(x, y + 104, w, 8);
    g.fillStyle = '#1E2125'; g.textAlign = 'center'; g.font = `800 30px ${FONT}`; g.fillText('Cho thuê sân theo giờ', x + w / 2, y + 150, w - 30);
    g.fillStyle = '#C8102E'; g.font = `900 40px ${FONT}`; g.fillText('200.000–300.000đ/giờ', x + w / 2, y + 204, w - 30);
    g.fillStyle = '#1E2125'; g.font = `700 28px ${FONT}`; g.fillText('sau 17h', x + w / 2, y + 244, w - 30);
    g.font = `600 24px ${FONT}`; g.fillText('Thuê vợt · bóng · nước suối', x + w / 2, y + 296, w - 30);
    g.fillText('Mở cửa 5:00 – 22:00', x + w / 2, y + 334, w - 30);
    g.strokeStyle = '#1F4D3A'; g.lineWidth = 8; g.strokeRect(x + 4, y + 4, w - 8, h - 8); }
  // the ball's skin: yellow-green, the holes dark
  { const [x, y, w, h] = RP.ball; g.fillStyle = '#D9EA4E'; g.fillRect(x, y, w, h); g.fillStyle = '#5E6A1E';
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(x + 13 + i * 25 + (j % 2) * 12, y + 26 + j * 38, 6, 0, Math.PI * 2); g.fill(); } }
}

/** site: pickleSite's; folk: street-folk.js; closeWalk(ax, az, bx, bz, on) shuts a stretch of pavement; INS: how far in
    from the kerb people walk */
export function buildPickle(G, { site, folk, low, closeWalk, INS }) {
  const dead = { update() {}, night() {}, blocked: () => false, spots: () => [], office: null, debug: { state: () => ({ none: true }) } };
  if (!site) return dead;
  const cx = (site.x0 + site.x1) / 2, cz = (site.z0 + site.z1) / 2, AX = site.axis === 'x';
  const LF = AX ? site.x1 - site.x0 : site.z1 - site.z0, WF = AX ? site.z1 - site.z0 : site.x1 - site.x0;   // the fence's length and width
  // the frame: x along the court (the net at 0), z across it, y up from the road; its +z side faces the camera's side
  const M = new THREE.Matrix4().makeBasis(AX ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), AX ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)).setPosition(cx, GY, cz);
  const yaw0 = AX ? 0 : Math.PI / 2, V = new THREE.Vector3(), V2 = new THREE.Vector3();
  const W = (lx, lz, ly = TOP, out = V) => out.set(lx, ly, lz).applyMatrix4(M);
  const ends = [W(-LF / 2, 0, 0).clone(), W(LF / 2, 0, 0).clone()];   // (for the view check)
  const L2 = (x, z) => { const dx = x - cx, dz = z - cz; return AX ? [dx, dz] : [-dz, dx]; };   // world → the court's x, z
  const Q = new THREE.Group(); Q.matrixAutoUpdate = false; Q.matrix.copy(M); G.add(Q);
  // the park's two pavements under the fence: nobody walks them now
  const [p0, p1, q0, q1] = site.park;
  if (AX) { for (const x of [p0 + INS, p1 - INS]) closeWalk(x, q0 + INS, x, q1 - INS, true); } else { for (const z of [q0 + INS, q1 - INS]) closeWalk(p0 + INS, z, p1 - INS, z, true); }

  /* the ground, the court, the net, the fence, the lights, the benches: one mesh */
  const parts = [], hf = LF / 2, wf = WF / 2, FH = 3.0, POST = '#24463A';
  const cyl = (r0, r1, h, x, y, z, c, n = 8) => colorize(new THREE.CylinderGeometry(r0, r1, h, n).translate(x, y, z), c);
  const flat = (w, d, x, z, y, c) => colorize(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z), c);
  parts.push(boxAt(LF, TOP, WF, 0, TOP / 2, 0, '#A3A7A6'));   // the slab over the lane and the lawn
  parts.push(flat(LF - 0.08, WF - 0.08, 0, 0, TOP + 0.002, '#2F7356'), flat(COURT.L, COURT.W, 0, 0, TOP + 0.004, '#2C5C9C'));   // green round, blue court
  { const y = TOP + 0.006, lw = COURT.LINE, c = '#F4F6F2';
    for (const s of [-1, 1]) {
      parts.push(flat(lw, COURT.W, s * (HL - lw / 2), 0, y, c));                // the baselines
      parts.push(flat(COURT.L, lw, 0, s * (HW - lw / 2), y, c));                // the sidelines
      parts.push(flat(lw, COURT.W, s * (KL + lw / 2), 0, y, c));                // the kitchen (non-volley) lines: 7 ft from the net to their far edge
      parts.push(flat(HL - KL - lw, lw, s * (KL + lw + (HL - KL - lw) / 2), 0, y, c));   // the centre lines, kitchen line to baseline
    } }
  // the net: two posts outside the sidelines, the top cable, a strap down the middle (the mesh is printed: below)
  for (const s of [-1, 1]) parts.push(cyl(0.035, 0.035, COURT.NET_P + 0.04, 0, TOP + (COURT.NET_P + 0.04) / 2, s * COURT.POST, '#2B2F36'), cyl(0.12, 0.14, 0.05, 0, TOP + 0.025, s * COURT.POST, '#2B2F36', 12));
  parts.push(boxAt(0.012, COURT.NET_C - 0.06, 0.05, 0, TOP + 0.06 + (COURT.NET_C - 0.06) / 2, 0, '#F4F6F2'));
  // the fence: posts every ~2.5 m, a top and a bottom rail; the gate on the +z side near the +x end
  const GATE = [hf - 2.6, hf - 1.4];
  const fencePosts = (len, n) => Array.from({ length: n + 1 }, (_, i) => -len / 2 + (i * len) / n);
  for (const x of fencePosts(LF, Math.round(LF / 2.5))) for (const s of [-1, 1]) parts.push(cyl(0.035, 0.035, FH, x, TOP + FH / 2, s * (wf - 0.04), POST));
  for (const z of fencePosts(WF, Math.round(WF / 2.5)).slice(1, -1)) for (const s of [-1, 1]) parts.push(cyl(0.035, 0.035, FH, s * (hf - 0.04), TOP + FH / 2, z, POST));
  for (const y of [TOP + 0.08, TOP + FH - 0.02]) {
    for (const s of [-1, 1]) parts.push(boxAt(LF, 0.04, 0.04, 0, y, s * (wf - 0.04), POST), boxAt(0.04, 0.04, WF, s * (hf - 0.04), y, 0, POST));
  }
  parts.push(cyl(0.04, 0.04, FH, GATE[0], TOP + FH / 2, wf - 0.04, POST), cyl(0.04, 0.04, FH, GATE[1], TOP + FH / 2, wf - 0.04, POST), boxAt(GATE[1] - GATE[0], 0.05, 0.05, (GATE[0] + GATE[1]) / 2, TOP + 2.1, wf - 0.04, POST));
  // the gate stands open, swung out onto the pavement
  parts.push(boxAt(0.03, 1.95, 1.1, GATE[1] - 0.04, TOP + 1.05, wf + 0.55, POST));
  // the floodlights: a pole at each corner, two LED heads on an arm leaning over the court (the heads' faces: below)
  const LEDS = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (hf - 0.05), z = sz * (wf - 0.05);
    parts.push(cyl(0.06, 0.09, 6.4, x, TOP + 3.2, z, '#6B737C', 10), boxAt(0.34, 0.02, 0.34, x, TOP + 0.01, z, '#6B737C'));
    for (const k of [-1, 1]) {
      const hx = x - sx * 0.5, hz = z - sz * 0.3 + k * 0.3 * sx;
      parts.push(boxAt(0.06, 0.06, 0.62, x - sx * 0.25, TOP + 6.3, z - sz * 0.15, '#6B737C'));
      parts.push(colorize(new THREE.BoxGeometry(0.46, 0.07, 0.3).rotateZ(sx * 0.45).rotateX(-sz * 0.3).translate(hx, TOP + 6.25, hz), '#3A4048'));
      LEDS.push([hx, hz, sx, sz]);
    }
  }
  // two benches by the far fence, either side of the net; a cooler box; a bucket of balls by the near post
  const BENCH = [[-1.9, -(wf - 0.36)], [1.9, -(wf - 0.36)]];
  for (const [bx, bz] of BENCH) {
    for (const k of [-0.08, 0.08]) parts.push(boxAt(1.6, 0.03, 0.14, bx, TOP + 0.43, bz + k, '#A8794A'));
    parts.push(boxAt(1.6, 0.12, 0.03, bx, TOP + 0.66, bz - 0.15, '#A8794A'));
    for (const s of [-0.7, 0.7]) parts.push(boxAt(0.05, 0.42, 0.34, bx + s, TOP + 0.21, bz, '#3A3F47'), boxAt(0.05, 0.3, 0.05, bx + s, TOP + 0.58, bz - 0.15, '#3A3F47'));
  }
  parts.push(boxAt(0.5, 0.36, 0.34, 0.6, TOP + 0.18, -(wf - 0.32), '#2E86DE'), boxAt(0.52, 0.06, 0.36, 0.6, TOP + 0.39, -(wf - 0.32), '#F4F4F2'));   // the cooler
  parts.push(cyl(0.16, 0.13, 0.3, 0.25, TOP + 0.15, COURT.POST + 0.35, '#3A3F47', 12), cyl(0.15, 0.15, 0.01, 0.25, TOP + 0.3, COURT.POST + 0.35, '#D7E84A', 12));   // the bucket of balls
  const base = new THREE.Mesh(mergeAll(parts), vmat({ roughness: 0.62, metalness: 0.12, side: THREE.DoubleSide }));
  base.castShadow = !low; base.receiveShadow = true; Q.add(base);

  /* what is on the benches (bottles, bags, paddles, balls): only near, where you would see them */
  const props = [];
  const BOTTLE = ['#9FD3EA', '#BFE6F2', '#F2C230', '#E8473B'];
  BENCH.forEach(([bx, bz], b) => {
    for (let i = 0; i < 3; i++) props.push(cyl(0.035, 0.035, 0.2, bx - 0.55 + i * 0.12, TOP + 0.55, bz + 0.03, BOTTLE[(i + b) % 4], 8), cyl(0.018, 0.018, 0.03, bx - 0.55 + i * 0.12, TOP + 0.665, bz + 0.03, '#2E86DE', 6));
    props.push(colorize(new THREE.CapsuleGeometry(0.13, 0.42, 3, 8).rotateZ(Math.PI / 2).translate(bx + 0.35, TOP + 0.6, bz), b ? '#2B2F36' : '#C8102E'));   // a paddle bag
    for (let i = 0; i < 2; i++) props.push(colorize(new THREE.BoxGeometry(0.012, 0.27, 0.2).rotateZ(0.25).translate(bx - 0.1 + i * 0.07, TOP + 0.6, bz + 0.2), i ? '#2E86DE' : '#F2C230'), colorize(new THREE.CylinderGeometry(0.015, 0.015, 0.13, 6).rotateZ(0.25).translate(bx - 0.1 + i * 0.07 + 0.05, TOP + 0.4, bz + 0.2), '#1E2125'));
  });
  for (let i = 0; i < 7; i++) props.push(colorize(new THREE.SphereGeometry(0.037, 8, 6).translate(0.25 + Math.cos(i * 2.4) * 0.08, TOP + 0.33 + (i > 4 ? 0.03 : 0), COURT.POST + 0.35 + Math.sin(i * 2.4) * 0.08), '#D7E84A'));
  const detail = new THREE.Mesh(mergeAll(props), vmat({ roughness: 0.5 })); Q.add(detail);

  // the printing: the windscreens along the ends, the board at the gate, the ball's skin
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const paint = () => { drawPickle(canvas.getContext('2d')); tex.needsUpdate = true; };
  paint(); document.fonts?.ready.then(paint);
  const plane = (w, h, [rx, ry, rw, rh]) => { const p = new THREE.PlaneGeometry(w, h), uv = p.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (rx + uv.getX(i) * rw) / 1024, 1 - (ry + (1 - uv.getY(i)) * rh) / 512); return p; };
  const prints = [];
  for (const s of [-1, 1]) for (const out of [1, -1]) prints.push(plane(WF - 0.1, 1.8, RP.wind).rotateY(s * out * Math.PI / 2).translate(s * (hf - 0.04 + out * 0.012), TOP + 1.12, 0));   // (one face out, one in: each reads the right way)
  const BX = GATE[0] - 1.1;   // the board, on the fence beside the gate, facing out
  prints.push(plane(1.1, 0.82, RP.board).translate(BX, TOP + 1.55, wf + 0.01));
  Q.add(new THREE.Mesh(mergeAll(prints), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 })));
  // the chain link: one diamond tile repeated along every side above (and at the ends, beside) the windscreen
  const linkTex = canvasTex(32, 32, (g) => { g.clearRect(0, 0, 32, 32); g.strokeStyle = 'rgba(40,52,48,.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 16); g.lineTo(16, 0); g.lineTo(32, 16); g.lineTo(16, 32); g.closePath(); g.stroke(); });
  linkTex.wrapS = linkTex.wrapT = THREE.RepeatWrapping; linkTex.colorSpace = THREE.SRGBColorSpace;
  const link = (w, h, at) => { const p = new THREE.PlaneGeometry(w, h), uv = p.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 12, uv.getY(i) * h * 12); return at(p); };
  const mesh = [link(LF, FH, (p) => p.translate(0, TOP + FH / 2, -(wf - 0.04)))];
  for (const [a, b] of [[-hf, GATE[0]], [GATE[1], hf]]) mesh.push(link(b - a, FH, (p) => p.translate((a + b) / 2, TOP + FH / 2, wf - 0.04)));
  mesh.push(link(1.1, 1.95, (p) => p.rotateY(Math.PI / 2).translate(GATE[1] - 0.04, TOP + 1.05, wf + 0.55)));
  for (const s of [-1, 1]) mesh.push(link(WF, FH - 2.02, (p) => p.rotateY(Math.PI / 2).translate(s * (hf - 0.04), TOP + 2.02 + (FH - 2.02) / 2, 0)));
  const fence = new THREE.Mesh(mergeAll(mesh), new THREE.MeshBasicMaterial({ map: linkTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  fence.renderOrder = 2; Q.add(fence);
  // the net's mesh: a fine dark grid under the white tape, its top sagging from 36 in at the posts to 34 in in the middle
  const netTex = canvasTex(512, 64, (g) => { g.clearRect(0, 0, 512, 64); g.strokeStyle = 'rgba(20,22,26,.85)'; g.lineWidth = 1; for (let x = 0; x <= 512; x += 6) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, 64); g.stroke(); } for (let y = 0; y <= 64; y += 6) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(512, y + 0.5); g.stroke(); } g.fillStyle = '#F4F6F2'; g.fillRect(0, 0, 512, 6); g.fillStyle = '#1E2125'; g.fillRect(0, 60, 512, 4); });
  { const n = new THREE.PlaneGeometry(COURT.POST * 2 - 0.08, 1, 24, 1).rotateY(Math.PI / 2), pos = n.attributes.position;
    for (let i = 0; i < pos.count; i++) { const z = pos.getZ(i), top = pos.getY(i) > 0, k = (z / (COURT.POST - 0.04)) ** 2; pos.setY(i, TOP + (top ? COURT.NET_C + (COURT.NET_P - COURT.NET_C) * k : 0.1)); }
    n.computeVertexNormals();
    const net = new THREE.Mesh(n, new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false })); net.renderOrder = 2; Q.add(net); }
  // the LED heads' faces: grey by day, white when lit; a soft pool of their light over the court
  const ledM = new THREE.MeshBasicMaterial({ color: '#4A5058' });
  Q.add(new THREE.Mesh(mergeAll(LEDS.map(([x, z, sx, sz]) => new THREE.PlaneGeometry(0.42, 0.26).rotateX(Math.PI / 2).rotateZ(sx * 0.45).rotateX(-sz * 0.3).translate(x, TOP + 6.21, z))), ledM));
  const poolTex = canvasTex(128, 64, (g) => { const r = g.createRadialGradient(64, 32, 4, 64, 32, 64); r.addColorStop(0, 'rgba(255,255,255,.55)'); r.addColorStop(0.7, 'rgba(255,255,255,.3)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 64); });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(LF + 3, WF + 3).rotateX(-Math.PI / 2).translate(0, TOP + 0.012, 0), new THREE.MeshBasicMaterial({ map: poolTex, color: '#E8F0FF', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.visible = false; Q.add(pool);
  // the ball, and its shadow on the court
  const ballGeo = new THREE.SphereGeometry(0.037, 12, 8), uvb = ballGeo.attributes.uv;
  for (let i = 0; i < uvb.count; i++) uvb.setXY(i, (RP.ball[0] + uvb.getX(i) * RP.ball[2]) / 1024, 1 - (RP.ball[1] + (1 - uvb.getY(i)) * RP.ball[3]) / 512);
  const ball = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 })); ball.visible = false; Q.add(ball);
  const shade = new THREE.Mesh(new THREE.CircleGeometry(0.05, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.3, depthWrite: false })); shade.visible = false; Q.add(shade);

  /* ---------- the people: the neighbourhood's players and those waiting on the benches (their own figures) ---------- */
  const crowd = folk(G, 8, { low, shadows: false }), SL = crowd.take(8);
  const LOOK = [
    { shirt: '#F25C8A', pants: '#F4F4F2', skirt: '#F4F4F2', visor: '#F4F4F2', hair: '#2B2420', paddle: '#2E86DE', skirted: true },
    { shirt: '#F4F4F2', pants: '#2B2F36', visor: '#1E2125', hair: '#1E1A18', paddle: '#F2C230' },
    { shirt: '#2A9D8F', pants: '#2B3A55', visor: '#F4F4F2', hair: '#3A2A20', paddle: '#D8323C' },
    { shirt: '#B8E3F2', pants: '#F4F4F2', skirt: '#1F2A44', visor: '#F25C8A', hair: '#2B2420', paddle: '#7A4FD8', skirted: true },
    { shirt: '#F2C230', pants: '#2B2F36', visor: '#2B2F36', hair: '#1E1A18', paddle: '#2E86DE' },
    { shirt: '#F4F4F2', pants: '#F25C8A', skirt: '#F25C8A', visor: '#F4F4F2', hair: '#3A2A20', paddle: '#D8323C', skirted: true },
    { shirt: '#3F7CC4', pants: '#2B2F36', visor: '#F4F4F2', hair: '#2B2420', paddle: '#F2C230' },
    { shirt: '#E8742A', pants: '#2B3A55', visor: '#1E2125', hair: '#1E1A18', paddle: '#2A9D8F' },
  ];
  SL.forEach((i, k) => crowd.dress(i, LOOK[k]));
  const bubble = (() => { const d = el('div', 'tag shop-say pickle-say'); d.hidden = true; const o = new CSS2DObject(d); o.visible = false; G.add(o); return o; })();
  const tally = (() => { const d = el('div', 'tag pickle-tally'); d.hidden = true; const o = new CSS2DObject(d); o.visible = false; G.add(o); return o; })();
  let now = 0;
  const say = (lx, lz, text, secs = 2.6) => { const p = W(lx, lz, TOP + 2.0); bubble.position.copy(p); bubble.element.textContent = text; bubble.element.hidden = false; bubble.visible = true; bubble.until = now + secs; };
  const showTally = (text, tone = '') => { tally.position.copy(W(0, 0, TOP + 3.3)); tally.element.textContent = text; tally.element.className = `tag pickle-tally ${tone}`; tally.element.hidden = false; tally.visible = true; tally.until = now + 6; };

  /* ---------- the game: doubles, two a side (side -1 is the court's x < 0), a rally a shot at a time ---------- */
  // where a player stands: back at the baseline or up at the kitchen line, on its half (zs: the court's z side)
  const homeOf = (p) => ({ x: p.side * (p.up ? KL + 0.4 : HL + 0.35), z: p.zs * (p.up ? 1.3 : 1.45) });
  const P = [0, 1, 2, 3].map((n) => ({ n, side: n < 2 ? -1 : 1, zs: n % 2 ? 1 : -1, x: 0, z: 0, gx: 0, gz: 0, up: false, hitT: -9, kind: 'local', fi: SL[n], mv: 0, serveSwing: false }));
  const R = { on: false, phase: 'gap', at: 0, serving: 0, serverNo: 2, score: [0, 0], shot: null, n: 0, want: 0, end: '', recv: -1, run: null, points: 0, office: false };
  // the player of `team` (0: side -1, 1: side +1) nearer to z
  const nearer = (team, z) => { const a = P[team * 2], b = P[team * 2 + 1]; return Math.abs(a.z - z) <= Math.abs(b.z - z) ? a : b; };
  // a shot's flight: arcs (from, to, apex, seconds) one after another; contact: where the next player meets it
  const reach = (p) => (p.kind === 'office' ? 0.5 : 0.72);
  function arc(a, b, apex, dur) { return { a, b, h: Math.max(apex - Math.max(a.y, b.y), 0.05), dur }; }
  function shoot(kind) {
    const h = P[R.hitter], s = h.side, team = s < 0 ? 0 : 1, opp = 1 - team;
    const c0 = { x: h.x - s * 0.3, y: TOP + reach(h), z: h.z + 0.12 * h.zs };
    h.hitT = now; h.serveSwing = kind === 'serve';
    if (R.n >= 1) for (const q of P) if ((q.side < 0 ? 0 : 1) === team) q.up = true;   // (after the return, and the third shot, a team goes up)
    const flight = { kind, legs: [], t0: now, to: null, out: '' };
    const last = R.want > 0 && R.n + 1 >= R.want ? R.end : '';
    if (last === 'net') {   // into the net: it meets the tape low and drops back on the hitter's side
      const N = { x: -s * 0.03, y: TOP + rnd(0.35, 0.75), z: c0.z * 0.6 + rnd(-0.6, 0.6) }, F = { x: s * rnd(0.25, 0.7), y: TOP + 0.04, z: N.z };
      flight.legs.push(arc(c0, N, Math.max(c0.y, N.y) + 0.25, 0.5), arc(N, F, N.y + 0.02, 0.32), arc(F, { x: F.x + s * 0.4, y: TOP + 0.04, z: F.z }, TOP + 0.12, 0.3));
      flight.out = 'net';
    } else if (last === 'out') {   // long: over the baseline (or wide of a sideline), then on to the fence
      const B = { x: -s * (HL + rnd(0.3, 0.9)), y: TOP + 0.04, z: rnd(-2.6, 2.6) }, F = { x: -s * (hf - 0.3), y: TOP + 0.04, z: B.z * 1.1 };
      flight.legs.push(arc(c0, B, TOP + rnd(1.6, 2.4), 0.95), arc(B, F, TOP + 0.5, 0.45));
      flight.out = 'out';
    } else {
      // a bounce on the other side (a volley in the dinks now and then: straight to the player), and the one who meets it
      const lob = kind === 'rally' && R.n >= 3 && Math.random() < 0.08, drive = kind === 'rally' && !lob && R.n >= 3 && Math.random() < 0.12;
      const k2 = kind === 'serve' ? 'serve' : kind === 'return' ? 'return' : kind === 'third' ? 'drop' : lob ? 'lob' : drive ? 'drive' : 'dink';
      const deep = k2 === 'serve' || k2 === 'return' || k2 === 'lob';
      const to = k2 === 'serve' ? P[R.recv] : null, bz = to ? to.zs * rnd(0.6, 2.6) : rnd(-2.5, 2.5);
      const B = { x: -s * (deep ? rnd(4.6, 6.3) : rnd(0.5, 1.9)), y: TOP + 0.04, z: bz };
      if (last === 'winner') {   // past them: down the line or between, on to the fence, the one there lunging for it
        B.z = pick([-1, 1]) * rnd(2.0, 2.9); B.x = -s * rnd(deep ? 4.5 : 2.6, 6.0);
        const F = { x: -s * (hf - 0.4), y: TOP + 0.04, z: B.z * 1.15 };
        flight.legs.push(arc(c0, B, TOP + (deep ? 2.0 : 1.3), deep ? 1.0 : 0.7), arc(B, F, TOP + 0.45, 0.5));
        flight.out = 'winner'; const q = nearer(opp, B.z); q.gx = B.x - s * 0.6; q.gz = B.z * 0.85;
      } else if (k2 === 'drive') {   // a speed-up: hard and flat at the body, volleyed back
        const q = nearer(opp, h.z), C = { x: q.side * (KL + 0.15), y: TOP + reach(q) + 0.1, z: q.z + 0.15 * q.zs };
        flight.legs.push(arc(c0, C, Math.max(c0.y, C.y) + 0.35, 0.42));
        flight.to = q.n;
      } else {
        const q = to || nearer(opp, bz);
        const back = deep ? rnd(0.8, 1.3) : rnd(0.5, 0.9);
        const C = { x: B.x - s * back, y: TOP + reach(q), z: B.z * 0.92 };
        C.x = Math.sign(C.x) * Math.min(Math.abs(C.x), HL + 0.8);
        const apex = TOP + (k2 === 'lob' ? rnd(3.8, 4.6) : k2 === 'dink' || k2 === 'drop' ? COURT.NET_C + rnd(0.2, 0.42) : k2 === 'serve' ? rnd(1.4, 1.8) : rnd(1.5, 2.0));
        const speed = k2 === 'dink' ? rnd(3.4, 4.4) : k2 === 'drop' ? 5.2 : k2 === 'lob' ? 6.5 : 8.5, d1 = Math.hypot(B.x - c0.x, B.z - c0.z);
        flight.legs.push(arc(c0, B, apex, d1 / speed + (k2 === 'lob' ? 0.6 : 0)), arc(B, C, Math.max(B.y, C.y) + (deep ? 0.55 : 0.3), deep ? 0.5 : 0.36));
        flight.to = q.n;
        // the one who meets it gets there (back for a lob; up and across for a dink)
        q.gx = C.x + q.side * 0.32; q.gz = C.z - 0.1 * q.zs;
        if (k2 === 'lob') q.up = false;
      }
    }
    flight.dur = flight.legs.reduce((a, l) => a + l.dur, 0);
    R.shot = flight; R.n++;
    // the run's point: the tests counted off a shot at a time
    if (R.run?.point && flight.out !== 'net') showTally(tr('people.pickle.tally.count', { n: Math.min(R.run.pass, R.n * R.run.per), of: R.run.pass, label: R.run.label }), 'run');
    if (inView) sfx.play('pock');
  }
  // a point: the server calls the score, serves diagonally; the receiver's partner up at the kitchen, the rest back
  function servePoint() {
    const team = R.serving, srv = P.find((p) => (p.side < 0 ? 0 : 1) === team && (R.score[team] % 2 === 0 ? p.zs === (team ? -1 : 1) : p.zs === (team ? 1 : -1)));
    const opp = 1 - team, diag = -srv.zs, recv = P.find((p) => (p.side < 0 ? 0 : 1) === opp && p.zs === diag);
    for (const p of P) { p.up = (p.side < 0 ? 0 : 1) === opp && p !== recv; const h = homeOf(p); p.gx = h.x; p.gz = h.z; }
    srv.gx = srv.side * (HL + 0.3); srv.gz = srv.zs * 1.5; recv.gx = recv.side * (HL + 0.5); recv.gz = recv.zs * 1.5;
    R.hitter = srv.n; R.recv = recv.n; R.n = 0; R.phase = 'call'; R.at = now + 1.4;
    // how long this rally runs, and how it ends: a finished test run's (its passing tests the shots over the net, then
    // the winner, or the first failing one into the net), else as rallies go
    const run = R.run;
    if (run?.ready && !run.point) { run.point = true; const shots = Math.ceil(run.pass / run.per); R.want = run.ok ? Math.max(1, shots) : shots + 1; R.end = run.ok ? 'winner' : 'net'; }
    else { R.want = Math.round(rnd(2, 13)); R.end = R.want <= 1 ? 'net' : pick(['net', 'net', 'out', 'winner', 'winner']); }
    const call = `${R.score[team]}-${R.score[opp]}-${R.serverNo}`;
    if (inView || R.office) say(srv.x, srv.z, call, 1.6);
  }
  // the point is over: who won the rally (the side that did not make the error, or hit the winner)
  function pointOver(by) {
    const lostBy = R.shot.out === 'winner' ? 1 - by : by, won = 1 - lostBy;
    R.points++;
    if (won === R.serving) R.score[won]++;
    else if (R.serverNo === 1) R.serverNo = 2;
    else { R.serving = 1 - R.serving; R.serverNo = 1; }   // (side out)
    if (R.score.some((x) => x >= 11) && Math.abs(R.score[0] - R.score[1]) >= 2) { R.score = [0, 0]; R.serving = 1 - R.serving; R.serverNo = 2; R.games = (R.games || 0) + 1; }
    const p = P[R.shot.hitter ?? R.hitter];
    if (inView || R.office) say(p.x, p.z, tr(R.shot.out === 'net' ? 'people.pickle.say.net' : R.shot.out === 'out' ? 'people.pickle.say.out' : 'people.pickle.say.winner'), 2.2);
    R.lastEnd = R.shot.out; R.lastWon = won;
    if (R.run?.point) endRun();
    R.phase = 'dead'; R.at = now + 2.6;
  }
  /* a test run on the office's game (people/pickle.js): each passing test a shot over the net, the first failing one
     into it. The rally starts with the run; its result tells how many shots (one a test, or one for several when there
     are many) and how it ends. */
  function startRun(label) {
    if (!R.on || !R.office) return false;
    R.run = { label, pass: null, fail: null, ok: null, per: 1, ready: false, point: false };
    showTally(tr('people.pickle.tally.run', { label }), 'run');
    return true;
  }
  function resultRun(ok, pass, fail) {
    const run = R.run; if (!run || run.ready) return false;
    // (no count from the runner's output: a likely one)
    run.ok = ok; run.pass = Number.isFinite(pass) ? pass : ok ? Math.round(rnd(8, 18)) : Math.round(rnd(2, 9)); run.fail = Number.isFinite(fail) ? fail : ok ? 0 : 1;
    run.per = Math.max(1, Math.ceil(run.pass / 30)); run.ready = true;   // (a long run: a shot for every few tests)
    if (R.phase === 'flight' && (R.want === 0 || R.want > R.n + 1)) { R.want = R.n + 1; R.end = pick(['out', 'winner']); }   // (the point being played ends: the run's is next)
    return true;
  }
  function endRun() {
    const run = R.run; R.run = null;
    if (!run || run.pass == null) return;
    R.lastRun = { label: run.label, ok: run.ok, pass: run.pass, fail: run.fail, shots: R.n, end: R.shot?.out || '' };
    showTally(run.ok ? tr('people.pickle.tally.pass', { n: run.pass, label: run.label }) : tr('people.pickle.tally.fail', { n: run.pass, f: run.fail, label: run.label }), run.ok ? 'ok' : 'fail');
  }
  function stepGame() {
    if (R.phase === 'gap' || R.phase === 'dead') { if (now >= R.at) servePoint(); return; }
    if (R.phase === 'call') { if (now >= R.at) { R.phase = 'flight'; shoot('serve'); } return; }
    // in flight: when it reaches the one meeting it, they hit the next (until the rally's end)
    const s = R.shot;
    if (now - s.t0 >= s.dur) {
      if (s.out) { s.hitter = R.hitter; pointOver(P[R.hitter].side < 0 ? 0 : 1); return; }
      R.hitter = s.to;
      shoot(R.n === 1 ? 'return' : R.n === 2 ? 'third' : 'rally');
    }
  }
  // the ball where its flight is now
  function ballAt(out) {
    const s = R.shot; let u = now - s.t0;
    for (const l of s.legs) {
      if (u <= l.dur || l === s.legs[s.legs.length - 1]) { const k = Math.min(1, u / l.dur); out.set(l.a.x + (l.b.x - l.a.x) * k, l.a.y + (l.b.y - l.a.y) * k + 4 * l.h * k * (1 - k), l.a.z + (l.b.z - l.a.z) * k); return out; }
      u -= l.dur;
    }
    return out;
  }
  // the players' feet: towards where they should be, a quick shuffle
  function movePlayers(dt) {
    for (const p of P) {
      if (R.phase === 'gap') { const h = homeOf(p); p.gx = h.x; p.gz = h.z; }
      else if (R.phase !== 'flight' || (R.shot && R.shot.to !== p.n)) { if (now - p.hitT > 0.5 && R.phase === 'flight') { const h = homeOf(p); p.gx += (h.x - p.gx) * Math.min(1, dt * 1.5); p.gz += (h.z - p.gz) * Math.min(1, dt * 1.5); } }
      const dx = p.gx - p.x, dz = p.gz - p.z, d = Math.hypot(dx, dz), st = Math.min(d, dt * 3.2);
      if (d > 0.01) { p.x += (dx / d) * st; p.z += (dz / d) * st; }
      p.mv = d > 0.05 ? 1 : 0;
    }
  }
  // the right arm's swing: back, through the ball, the follow-through (an underhand serve lower), the ready position
  const SWING = [[-0.45, 0.85], [-0.16, 0.3], [0, 1.05], [0.22, 1.55], [0.7, 0.9]], SERVE = [[-0.6, 0.3], [-0.2, -0.35], [0, 0.55], [0.3, 1.7], [0.8, 0.9]];
  const keyed = (K, t) => { if (t <= K[0][0]) return K[0][1]; for (let i = 1; i < K.length; i++) if (t <= K[i][0]) { const [a, va] = K[i - 1], [b, vb] = K[i]; return va + ((vb - va) * (t - a)) / (b - a); } return K[K.length - 1][1]; };
  const nextHit = (p) => (R.phase === 'flight' && R.shot && R.shot.to === p.n ? R.shot.t0 + R.shot.dur : R.phase === 'call' && R.hitter === p.n ? R.at : Infinity);
  const swingOf = (p) => { const until = nextHit(p), tau = until < Infinity ? now - until : now - p.hitT; return keyed(p.serveSwing && tau >= 0 ? SERVE : until < Infinity && R.phase === 'call' ? SERVE : SWING, tau); };
  function poseLocals(t) {
    for (const p of P) {
      if (p.kind !== 'local') continue;
      const a = W(p.x, p.z, TOP), legs = p.mv ? [Math.sin(t * 11 + p.n) * 0.4, -Math.sin(t * 11 + p.n) * 0.4] : [0.2, -0.12];
      const base = p.side > 0 ? Math.PI : 0, to = R.phase === 'flight' ? Math.atan2(-(ballV.z - p.z), ballV.x - p.x) : base;
      const yaw = yaw0 + base + Math.atan2(Math.sin(to - base), Math.cos(to - base)) * 0.4;
      crowd.pose(p.fi, { x: a.x, y: a.y, z: a.z, yaw, lean: -0.12, legs, arms: [[0.55, 0.25], [swingOf(p), 0.12]], paddle: true, visor: true, shoes: true, skirt: !!LOOK[SL.indexOf(p.fi)]?.skirted, bob: p.mv ? Math.abs(Math.cos(t * 11)) * 0.03 : 0 });
    }
  }
  const ballV = new THREE.Vector3();

  /* ---------- who is on the court: the neighbourhood, or the office (and the neighbourhood waiting its turn) ---------- */
  let inView = false, lit = false, night = false, checkAt = -1, near = false, booked = null, filmer = -1;
  const SEATS = [[-2.5, -(wf - 0.36)], [-1.3, -(wf - 0.36)], [1.3, -(wf - 0.36)], [2.5, -(wf - 0.36)]];
  function startGame(office) {
    Object.assign(R, { on: true, phase: 'gap', at: now + (office ? 3 : 1), serving: Math.random() < 0.5 ? 0 : 1, serverNo: 2, score: [0, 0], n: 0, run: null, office, points: 0, games: 0, shot: null });
    for (const p of P) { const h = homeOf(p); p.x = p.gx = h.x; p.z = p.gz = h.z; p.up = false; }
  }
  function stopGame() { R.on = false; R.run = null; ball.visible = shade.visible = false; for (const i of SL) crowd.hide(i); crowd.flush(); tally.visible = false; tally.element.hidden = true; }
  // the benches: the neighbourhood waiting (more at the weekend; one films the office's game when nobody else does)
  function poseBench(t, n) {
    for (let k = 0; k < SEATS.length; k++) {
      const fi = SL[4 + k];
      if (k >= n) { crowd.hide(fi); continue; }
      const [x, z] = SEATS[k], a = W(x, z, TOP), filming = k === filmer, drink = !filming && Math.sin(t * 0.37 + k * 2.1) > 0.82;
      crowd.pose(fi, { x: a.x, y: a.y, z: a.z, yaw: yaw0 - Math.PI / 2, sit: filming ? null : a.y + 0.45, legs: [0, 0], arms: filming ? [[1.45, -0.05], [1.35, 0.1]] : drink ? [[0.2, 0.05], [2.4, -0.2]] : [[0.9, -0.3], [0.9, -0.3]], visor: true, shoes: true, phone: filming, skirt: filming && !!LOOK[4 + k]?.skirted });
    }
  }
  function update(dt, t) {
    now = t;
    if (t - checkAt > 0.4 || t < checkAt) {
      checkAt = t; inView = seen(cx, cz) || ends.some((e) => seen(e.x, e.z));
      // near enough to see what is on the benches: walking up to it, or the office's camera zoomed in on it
      const firstP = !!fp?.on, d = firstP ? Math.hypot(fp.pos.x - cx, fp.pos.y - cz) : Math.hypot(camera.position.x - cx, camera.position.z - cz) * 0.5 / Math.max(0.4, camera.zoom || 1);
      near = d < 22;
      detail.visible = near && inView;
      const d0 = officeNow(), locals = FORCE || localHours(d0);
      // the office's booking (people/pickle.js) takes the court; else the neighbourhood's game in its hours
      if (booked) { if (!R.on || !R.office) { P.forEach((p, k) => { p.kind = booked.slots.includes(k) ? 'office' : 'local'; }); startGame(true); } }
      else if (locals && (!R.on || R.office)) { for (const p of P) p.kind = 'local'; startGame(false); }
      else if (!locals && R.on && !R.office) stopGame();
      lit = night && R.on;
      pool.visible = lit; ledM.color.set(lit ? '#FFFFFF' : '#4A5058');
    }
    if (bubble.visible && t > bubble.until) { bubble.visible = false; bubble.element.hidden = true; }
    if (tally.visible && t > tally.until) { tally.visible = false; tally.element.hidden = true; }
    if (!R.on) { if (inView) crowd.flush(); return; }
    stepGame(); movePlayers(dt);
    const flying = R.phase === 'flight' || R.phase === 'dead';
    if (flying && R.shot) ballAt(ballV);
    if (!inView && !R.office) { ball.visible = shade.visible = false; return; }
    ball.visible = shade.visible = flying && !!R.shot && (R.phase === 'flight' || now < R.at - 1.2);
    if (ball.visible) { ball.position.copy(ballV); shade.position.set(ballV.x, TOP + 0.008, ballV.z); shade.scale.setScalar(Math.max(0.4, 1.2 - (ballV.y - TOP) * 0.3)); }
    if (inView) { poseLocals(t); const we = [0, 6].includes(officeNow().getDay()); poseBench(t, R.office ? (filmer >= 0 ? 3 : 2) : we ? 3 : 1); crowd.flush(); }
  }

  /* what people/pickle.js needs: book the court for the office, where each of its four stands and how it swings, the
     score, the test runs, a word from someone there */
  const Qs = {
    // the court for the office's players (slots 0–3 on the court, by team); film: a local films for them (no fifth one)
    book(slots, film) { booked = { slots }; filmer = film ? 0 : -1; checkAt = -1; },
    release() { booked = null; filmer = -1; checkAt = -1; if (R.office) stopGame(); },
    // one of them called away: a neighbour from the bench takes the paddle ("ghép kèo")
    free(k) { if (!booked) return; booked.slots = booked.slots.filter((x) => x !== k); P[k].kind = 'local'; },
    booked: () => !!booked,
    // slot k's place (world), which way it faces (atan2(dx, dz)), its swing (-1 … 1.7: back, through, follow-through), whether it moves
    player(k, out = {}) {
      const p = P[k], a = W(p.x, p.z, TOP), look = R.phase === 'flight' ? ballV : { x: -p.side * 3, z: p.z }, b = W(look.x, look.z, TOP, V2);
      out.x = a.x; out.z = a.z; out.y = a.y; out.face = Math.atan2(b.x - a.x, b.z - a.z); out.swing = swingOf(p); out.moving = !!p.mv; return out;
    },
    // where to stand to watch (the fifth one, filming): by the net post outside the near sideline, facing the court
    watch() { const a = W(-0.6, wf - 0.45, TOP), b = W(0, 0, TOP, V2); return { x: a.x, z: a.z, y: a.y, face: Math.atan2(b.x - a.x, b.z - a.z) }; },
    // the gate (the way in and out) and a spot just inside it
    gate() { const a = W((GATE[0] + GATE[1]) / 2, wf + 0.9, TOP); return { x: a.x, z: a.z }; },
    inside() { const a = W((GATE[0] + GATE[1]) / 2, wf - 0.6, TOP); return { x: a.x, z: a.z }; },
    ground: GY + TOP,
    score: () => ({ score: [...R.score], serving: R.serving, serverNo: R.serverNo, points: R.points, games: R.games || 0 }),
    test: (e) => (e.type === 'test' ? startRun(e.runner || e.label || 'test') : resultRun(e.type === 'testok', e.pass, e.fail)),
    say: (k, text) => { const p = P[k]; say(p.x, p.z, text); },
    object: () => Q,
  };
  return {
    update,
    night(on) { night = on; checkAt = -1; },
    // walking in: the fence (but the gate) and the net are in the way; the court itself you can walk onto
    blocked(x, z, r) {
      const [lx, lz] = L2(x, z);
      if (Math.abs(lx) > hf + r || Math.abs(lz) > wf + r) return false;
      const onFence = Math.abs(Math.abs(lz) - (wf - 0.04)) < r + 0.05 && !(lz > 0 && lx > GATE[0] + 0.1 && lx < GATE[1] - 0.1) || Math.abs(Math.abs(lx) - (hf - 0.04)) < r + 0.05;
      return onFence || (Math.abs(lx) < r + 0.05 && Math.abs(lz) < COURT.POST + 0.05);
    },
    // in first person: at the gate, the court's price and who is on it
    spots: () => { const a = W((GATE[0] + GATE[1]) / 2, wf + 0.7, TOP); return [{ kind: 'pickle', x: a.x, z: a.z, label: tr('fp.pickle', { price: `${PRICE[0]}–${PRICE[1]}k` }), act: () => { sfx.play('pock'); toast(tr(booked ? 'fp.pickleOffice' : R.on ? 'fp.pickleLocals' : 'fp.pickleFree', { fee: `${(FEE * 1000).toLocaleString('vi-VN')}đ` })); } }]; },
    office: Qs,
    debug: {
      state: () => ({ at: [+cx.toFixed(1), +cz.toFixed(1)], axis: site.axis, size: [+LF.toFixed(2), +WF.toFixed(2)], on: R.on, office: R.office, phase: R.phase, n: R.n, want: R.want, end: R.end, score: [...R.score], serving: R.serving, serverNo: R.serverNo, points: R.points, lit, near, inView, run: R.run ? { label: R.run.label, pass: R.run.pass, ok: R.run.ok, ready: R.run.ready, point: R.run.point } : null, lastEnd: R.lastEnd || '', lastRun: R.lastRun || null, kinds: P.map((p) => p.kind) }),
      court: () => ({ ...COURT, kitchenLine: KL, posts: COURT.POST }),
      // where to stand to look at it (for pictures): outside the near fence, along from the net, looking across the court
      view: (far = 1) => { const a = W(-3.2 * far, wf + 2.0 + 3 * far, 0), b = W(0.5, 0, 0, V2); return { x: a.x, z: a.z, yaw: Math.atan2(b.x - a.x, b.z - a.z) }; },
      quick: () => { R.at = Math.min(R.at, now + 0.2); return R.phase; },
    },
  };
}
