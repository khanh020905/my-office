// The pantry's duty board and the cups at its sink (company floor; who does what today: people/duty.js). A magnetic
// whiteboard on the pantry's back wall, over the cupboards beside the team photo: "TRỰC NHẬT" in marker, today's date,
// the four chores and a name each, a tick and the time once done, and in red what yesterday's people still owe. At the
// sink, the cups and glasses brought back through the day: in the basin first, then along the counter either side, then
// stacked; washed after lunch. Two draws: the board (one mesh, its frame merged, one canvas) and the cups (one
// instanced mesh whose count is the pile).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PRO } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { canvasTex, fitText, mat, toonMat } from '../../scene/blocks.js';
import { PILE_MAX } from '../../../shared/duty.js';
import { t as tr } from '../../../i18n/index.js';

const FONT = '"Be Vietnam Pro", system-ui, sans-serif';
const BOARD = { x: 11.0, y: 3.08, z: -7.955, w: 1.6, h: 1.09 };   // (big enough to read from the usual camera, over the cupboards)
export const SINK = { x: 12.55, z: -7.55 };
let tex = null, key = '', cups = null, face = null;

/* ---------- the board ---------- */
// little marker drawings beside each chore: a cup, a bin bag, a leaf, a cloth
function icon(g, kind, x, y) {
  g.save(); g.translate(x, y); g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
  const c = { cups: '#2E6FD1', trash: '#3A3F47', plants: '#2E9E4A', table: '#C2577A' }[kind]; g.strokeStyle = c; g.fillStyle = c;
  if (kind === 'cups') { g.strokeRect(-9, -9, 15, 18); g.beginPath(); g.arc(8, 0, 5, -Math.PI / 2, Math.PI / 2); g.stroke(); }
  else if (kind === 'trash') { g.beginPath(); g.moveTo(-9, 10); g.quadraticCurveTo(-12, -4, -3, -6); g.lineTo(3, -6); g.quadraticCurveTo(12, -4, 9, 10); g.closePath(); g.fill(); g.beginPath(); g.moveTo(-3, -7); g.lineTo(-5, -12); g.moveTo(3, -7); g.lineTo(5, -12); g.stroke(); }
  else if (kind === 'plants') { g.beginPath(); g.moveTo(0, 11); g.lineTo(0, -2); g.stroke(); g.beginPath(); g.ellipse(-5, -5, 7, 4, -0.6, 0, 7); g.fill(); g.beginPath(); g.ellipse(6, -8, 7, 4, 0.6, 0, 7); g.fill(); }
  else { g.beginPath(); g.moveTo(-11, -6); g.lineTo(9, -9); g.lineTo(11, 7); g.lineTo(-9, 9); g.closePath(); g.stroke(); g.beginPath(); g.moveTo(-6, -2); g.lineTo(6, -4); g.moveTo(-5, 3); g.lineTo(7, 1); g.stroke(); }
  g.restore();
}
/** The board as `b` says: { date, off ('weekend' | 'holiday' | ''), rows: [{ chore, name, at ('hh:mm' when done), busy }],
    owe: [{ chore, name }] }. Drawn again only when it changes. */
export function drawBoard(b) {
  if (!tex) return;
  const k = JSON.stringify(b); if (k === key) return;
  key = k;
  const g = tex.image.getContext('2d'), W = tex.image.width, H = tex.image.height;
  g.fillStyle = '#FBFBF8'; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(120,140,160,.08)'; for (let i = 0; i < 9; i++) g.fillRect(0, 60 + i * 34, W, 1);   // (faint ruled lines)
  g.textBaseline = 'middle';
  g.fillStyle = '#C8261B'; g.font = `900 34px ${FONT}`; g.textAlign = 'left'; g.fillText(tr('people.duty.board.title'), 22, 34);
  g.fillStyle = '#1F4E9E'; g.font = `700 22px ${FONT}`; g.textAlign = 'right'; g.fillText(b.date, W - 20, 36);
  g.strokeStyle = '#C8261B'; g.lineWidth = 3; g.beginPath(); g.moveTo(22, 58); g.lineTo(W - 20, 58); g.stroke();
  if (b.off) {
    g.textAlign = 'center'; g.fillStyle = '#2E9E4A'; g.font = `900 46px ${FONT}`; g.fillText(tr(`people.duty.board.${b.off}`), W / 2, 160);
    g.fillStyle = '#5E6670'; g.font = `600 22px ${FONT}`; g.fillText(tr('people.duty.board.noDuty'), W / 2, 214);
  } else if (!b.rows.length) {
    g.textAlign = 'center'; g.fillStyle = '#5E6670'; g.font = `600 24px ${FONT}`; g.fillText(tr('people.duty.board.nobody'), W / 2, 170);
  } else {
    b.rows.forEach((r, i) => {
      const y = 92 + i * 52;
      icon(g, r.chore, 38, y);
      g.textAlign = 'left'; g.fillStyle = '#1E232B'; g.font = `800 25px ${FONT}`; g.fillText(tr(`people.duty.chores.${r.chore}`), 60, y);
      g.fillStyle = r.at ? '#7A8494' : '#1F4E9E'; g.font = `700 25px ${FONT}`; const name = r.name || '—'; fitText(g, name, 150); g.fillText(name, 262, y);
      g.textAlign = 'right';
      if (r.at) { g.fillStyle = '#2E9E4A'; g.font = `900 26px ${FONT}`; g.fillText(`✓ ${r.at}`, W - 20, y); g.strokeStyle = 'rgba(46,158,74,.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(60, y + 2); g.lineTo(412, y + 2); g.stroke(); }
      else if (r.busy) { g.fillStyle = '#E8742A'; g.font = `700 20px ${FONT}`; g.fillText(tr('people.duty.board.doing'), W - 20, y); }
    });
    if (b.owe.length) {
      g.textAlign = 'left'; g.fillStyle = '#C8261B'; g.font = `800 20px ${FONT}`;
      const text = tr('people.duty.board.owe', { list: b.owe.map((o) => `${tr(`people.duty.chores.${o.chore}`)} (${o.name})`).join(', ') });
      fitText(g, text, W - 44); g.fillText(text, 22, H - 24);
    }
  }
  tex.needsUpdate = true;
}

/* ---------- the cups at the sink ---------- */
// the slots, in the order they fill: the basin, the counter left of it, right of it, then stacked over the basin
const SLOTS = (() => {
  const out = [], y0 = 1.0;
  for (const z of [-7.46, -7.63]) for (const x of [12.41, 12.55, 12.69]) out.push([x, y0, z, 0]);
  for (const z of [-7.34, -7.5, -7.66]) for (const x of [12.14, 12.25]) out.push([x, 0.99, z, 0]);
  for (const z of [-7.34, -7.5, -7.66]) for (const x of [12.86, 12.97]) out.push([x, 0.99, z, 0]);
  for (const z of [-7.48, -7.6]) for (const x of [12.45, 12.6, 12.68]) out.push([x + 0.02, y0 + 0.085, z + 0.03, 0.5]);
  return out.slice(0, PILE_MAX);
})();
/** how many cups show at the sink now */
export function setPile(n) { if (cups) cups.count = Math.max(0, Math.min(SLOTS.length, n)); }
export const pileShown = () => cups?.count ?? 0;
/** the board's face, to point at and click (interact/props.js) */
export const boardMeshes = () => (face ? [face] : []);

export function setup() {
  if (!PRO) return;
  // the board: an aluminium frame, the white face, a tray of markers along the bottom
  tex = canvasTex(512, 349, () => {});
  const frame = mergeGeometries([
    new THREE.BoxGeometry(BOARD.w + 0.06, 0.035, 0.03).translate(0, BOARD.h / 2 + 0.0175, 0), new THREE.BoxGeometry(BOARD.w + 0.06, 0.035, 0.03).translate(0, -BOARD.h / 2 - 0.0175, 0),
    new THREE.BoxGeometry(0.03, BOARD.h, 0.03).translate(-BOARD.w / 2 - 0.015, 0, 0), new THREE.BoxGeometry(0.03, BOARD.h, 0.03).translate(BOARD.w / 2 + 0.015, 0, 0),
    new THREE.BoxGeometry(0.6, 0.025, 0.07).translate(0.2, -BOARD.h / 2 - 0.045, 0.03),
  ]);
  const g = new THREE.Group(); g.position.set(BOARD.x, BOARD.y, BOARD.z); scene.add(g);
  g.add(new THREE.Mesh(frame, mat('#BFC6CE', { metalness: 0.5, roughness: 0.4 })));
  face = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h), toonMat({ map: tex, roughness: 0.35 })); face.position.z = 0.012; face.userData.noMerge = true; g.add(face);
  // two markers on the tray, a red and a blue
  for (const [x, c] of [[0.1, '#C8261B'], [0.24, '#1F4E9E']]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.13, 8).rotateZ(Math.PI / 2), mat(c, { roughness: 0.5 })); m.position.set(x, -BOARD.h / 2 - 0.022, 0.045); g.add(m); }
  // the cups: a mug (its handle) as one geometry, each slot its own turn and colour
  const body = new THREE.CylinderGeometry(0.042, 0.035, 0.09, 12).translate(0, 0.045, 0), handle = new THREE.TorusGeometry(0.025, 0.007, 6, 10, Math.PI).rotateZ(-Math.PI / 2).translate(0.042, 0.048, 0);
  const geo = mergeGeometries([body, handle]);
  cups = new THREE.InstancedMesh(geo, mat('#FFFFFF', { roughness: 0.35 }), SLOTS.length); cups.castShadow = true; cups.userData.dynamic = true;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), C = new THREE.Color(), COLORS = ['#FFFFFF', '#F3E9D8', '#3F7CC4', '#D6ECF5', '#E8742A', '#FFFFFF', '#2E9E4A', '#F2D3B3'];
  SLOTS.forEach(([x, y, z, tilt], i) => {
    Q.setFromEuler(E.set(0, (i * 2.3) % (Math.PI * 2), tilt * (i % 2 ? 1 : -1)));
    cups.setMatrixAt(i, M.compose(new THREE.Vector3(x, y, z), Q, new THREE.Vector3(1, 1, 1)));
    cups.setColorAt(i, C.set(COLORS[(i * 5) % COLORS.length]));
  });
  cups.computeBoundingSphere(); cups.count = 0; scene.add(cups);
}
