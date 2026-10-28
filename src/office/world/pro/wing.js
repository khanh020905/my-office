// Headquarters' wing: in front of the company floor, a corridor along it, a corridor down the middle and four department
// rooms of two pods each (the desks, pods' screens and carpets come from the shared code). Each room's door plaque
// shows the project that sits in it, and turns back to "Department n" when the room empties.
import * as THREE from 'three';
import { HQ, rand } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { canvasTex, fitText, mat, put, rbox, toonMat } from '../../scene/blocks.js';
import { metal, potPlant, woodMid } from '../terrace.js';
import { wallWindow } from '../windows.js';
import { makeSofa } from '../furniture/room-pieces.js';
import { trinket } from '../props/trinkets.js';
import { DEPTS, WING } from '../layout.js';
import { floorZone, glassWall, gridTex, lowWall, plateTex, speckTex } from './pieces.js';
import { t as tr } from '../../../i18n/index.js';

/** DEPT_SIGNS[i](name) redraws room i's door plaque: the project's name, or '' for a free room. */
export const DEPT_SIGNS = [];
const ACCENTS = ['#3F7CC4', '#6A8042', '#D97757', '#8C4FA8'];
const CARPETS = ['#5E6B7D', '#66735C', '#7B6A5E', '#655F7A'];
const FONT = '"Be Vietnam Pro", system-ui, sans-serif';

// a door plaque that can be redrawn: dark plate, the room's colour down its left edge
function plaque(i, x, y, z, ry) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const draw = (name) => {
    const g = c.getContext('2d'), n = i + 1;
    g.fillStyle = '#1E232B'; g.fillRect(0, 0, 512, 160); g.fillStyle = ACCENTS[i]; g.fillRect(0, 0, 14, 160);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = name ? '#F3EFE8' : '#9AA3B0'; g.font = `800 ${name ? 56 : 46}px ${FONT}`;
    const title = name ? tr('world.dept.name', { name }) : tr('world.dept.free', { n }); fitText(g, title, 456); g.fillText(title, 263, 66);
    g.fillStyle = '#A9B2C0'; g.font = `600 26px ${FONT}`; g.fillText(name ? tr('world.dept.sub', { n }) : tr('world.dept.freeSub'), 263, 122);
    tex.needsUpdate = true;
  };
  draw('');
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.28), new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.position.set(x, y, z); m.rotation.y = ry; m.userData.noMerge = true; scene.add(m);
  let shown = '';
  DEPT_SIGNS[i] = (name) => { if (name === shown) return; shown = name; draw(name); };
}

// a whiteboard with three columns of sticky notes (on a wall, or on two legs when `stand` is set)
function sprintBoard(i, x, y, z, ry, w = 1.3, h = 0.8, stand = false) {
  const g0 = new THREE.Group(); g0.position.set(x, 0, z); g0.rotation.y = ry; scene.add(g0);
  const tex = canvasTex(512, Math.round((512 * h) / w), (g, cw, ch) => {
    g.fillStyle = '#FBFBF8'; g.fillRect(0, 0, cw, ch);
    g.fillStyle = '#1E232B'; g.font = `800 30px ${FONT}`; g.fillText(tr('world.dept.board'), 18, 40);
    g.fillStyle = ACCENTS[i]; g.fillRect(18, 52, 120, 5);
    const cols = tr('world.dept.cols', null, 'list'), colW = (cw - 36) / 3;
    cols.forEach((t, k) => {
      const cx = 18 + k * colW;
      g.fillStyle = '#7A8494'; g.font = `700 20px ${FONT}`; g.fillText(t, cx + 6, 88);
      g.fillStyle = 'rgba(30,35,43,.12)'; g.fillRect(cx + colW - 3, 70, 2, ch - 86);
      for (let n = 0, cnt = [4, 3, 3][k]; n < cnt; n++) {
        const px = cx + 8 + (n % 2) * (colW / 2 - 4), py = 102 + Math.floor(n / 2) * 62;
        if (py + 52 > ch - 8) break;
        g.fillStyle = ['#FFE27A', '#FFB4A2', '#A8E6CF', '#BDE0FE'][(n + k + i) % 4]; g.fillRect(px, py, colW / 2 - 14, 52);
        g.fillStyle = 'rgba(30,35,43,.35)'; for (let l = 0; l < 3; l++) g.fillRect(px + 6, py + 10 + l * 12, (colW / 2 - 26) * rand(0.5, 1), 4);
      }
    });
  });
  put(g0, rbox(w + 0.08, h + 0.08, 0.04, '#C9CED6', 0.01), 0, y, 0);
  put(g0, new THREE.Mesh(new THREE.PlaneGeometry(w, h), toonMat({ map: tex, roughness: 0.7 })), 0, y, 0.022);
  put(g0, rbox(w * 0.6, 0.03, 0.06, '#9AA0AA', 0.005), 0, y - h / 2 - 0.05, 0.04);   // the marker tray
  if (stand) for (const sx of [-1, 1]) {
    put(g0, rbox(0.04, y - h / 2, 0.04, metal, 0.01), sx * (w / 2 - 0.05), (y - h / 2) / 2, 0);
    put(g0, rbox(0.06, 0.03, 0.42, metal, 0.01), sx * (w / 2 - 0.05), 0.015, 0);
  }
}

// a low cabinet along a wall, with books and a frame on it
function credenza(x, z, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
  put(g, rbox(1.8, 0.68, 0.48, mat('#E4DFD6', { roughness: 0.6 }), 0.02), 0, 0.34, 0);
  for (const sx of [-0.6, 0, 0.6]) put(g, rbox(0.56, 0.56, 0.02, mat('#D6D0C5', { roughness: 0.6 }), 0.01), sx, 0.36, 0.245);
  put(g, rbox(1.84, 0.04, 0.52, woodMid, 0.01), 0, 0.7, 0);
  trinket('books', x - 0.5, 0.72, z, 0.2); trinket('frame', x + 0.45, 0.72, z, -0.15);
}

function buildWing() {
  const Z0 = WING.z0, Z1 = WING.z1, mid = (Z0 + Z1) / 2, len = Z1 - Z0;
  /* shell: the slab, and the left outer wall carried on from the core's */
  put(scene, rbox(22.6, 0.5, len, '#7A5A3E', 0.05), 3, -0.25, mid + 0.15);
  put(scene, rbox(0.3, 4.2, len, mat('#EEE8DE', { roughness: 0.9 }), 0.04), -8.15, 2.1, mid + 0.15);
  put(scene, rbox(0.42, 0.14, len, '#E2D9C8', 0.03), -8.15, 4.25, mid + 0.15);
  put(scene, rbox(0.06, 0.18, len, '#6E5440', 0.02), -7.97, 0.09, mid + 0.15);
  for (const z of [12.4, 16.8, 20.6, 24.4]) wallWindow(-7.98, 2.1, z, 1.5, 1.5, Math.PI / 2, 2);

  /* floors: corridors in pale tiles, each room its own carpet */
  const corridor = gridTex('#D7D2CA', 'rgba(120,110,100,.25)', 2);
  floorZone(-8, 14, WING.corA[0], WING.corA[1], corridor, 1.2);
  floorZone(WING.corB[0], WING.corB[1], WING.corA[1], Z1, corridor, 1.2);
  DEPTS.forEach((d, i) => floorZone(d.x0, d.x1, d.z0, d.z1, speckTex(CARPETS[i], 3000, 0.06), 0.8));

  /* walls: the core's front gets two doors; glass between the rooms and the corridors, half walls between rooms */
  const [dw, de] = WING.doors;
  lowWall(-8, Z0, -3.6, Z0);
  lowWall(-3.6, Z0, 8.6, Z0, [[dw - 0.6 + 3.6, dw + 0.6 + 3.6], [de - 0.6 + 3.6, de + 0.6 + 3.6]]);
  lowWall(8.6, Z0, 14, Z0);
  for (const d of DEPTS.filter((x) => x.door.side === 'n')) glassWall(d.x0, d.z0, d.x1, d.z0, [[d.door.at - 0.6 - d.x0, d.door.at + 0.6 - d.x0]]);
  const [bx0, bx1] = WING.corB, door = DEPTS[2].door.at - WING.corA[1];
  glassWall(bx0, WING.corA[1], bx0, Z1, [[door - 0.6, door + 0.6]]);
  glassWall(bx1, WING.corA[1], bx1, Z1, [[door - 0.6, door + 0.6]]);
  lowWall(-8, WING.split, bx0, WING.split);
  lowWall(bx1, WING.split, 14, WING.split);

  /* door plaques: on the face the camera sees (into the room for the back rooms, the corridor for the front left) */
  plaque(0, DEPTS[0].door.at + 1.35, 1.62, DEPTS[0].z0 + 0.045, 0);
  plaque(1, DEPTS[1].door.at + 1.35, 1.62, DEPTS[1].z0 + 0.045, 0);
  plaque(2, bx0 + 0.045, 1.62, DEPTS[2].door.at - 1.35, Math.PI / 2);
  plaque(3, bx1 + 0.045, 1.62, DEPTS[3].door.at + 1.35, Math.PI / 2);

  /* the rooms: a sprint board, a credenza, plants in the corners; the two front rooms a sofa by the open edge */
  sprintBoard(0, -7.96, 1.5, 14.6, Math.PI / 2, 1.4, 0.9);
  sprintBoard(1, 12.2, 1.3, 11.3, 0, 1.3, 0.8, true);
  sprintBoard(2, -5.4, 0.78, WING.split + 0.1, 0, 1.3, 0.72);
  sprintBoard(3, 11.9, 0.78, WING.split + 0.1, 0, 1.3, 0.72);
  credenza(-6.3, 11.3); credenza(6.2, 11.3); credenza(-1.3, WING.split + 0.45); credenza(7.3, WING.split + 0.45);
  for (const [x, z, s, k] of [[-7.5, 11.25, 1.0, 'monstera'], [1.75, 11.3, 0.9, 'snake'], [-7.5, 17.85, 0.95, 'bush'], [1.75, 17.85, 0.9, 'snake'],
    [4.75, 11.3, 0.9, 'snake'], [13.55, 11.3, 1.0, 'monstera'], [4.75, 17.85, 0.9, 'bush'], [13.55, 17.85, 0.95, 'snake'],
    [-7.5, 18.9, 0.9, 'snake'], [13.55, 18.9, 0.9, 'snake'], [-7.45, 25.5, 1.05, 'monstera'], [1.6, 25.5, 0.95, 'bush'], [5.2, 25.5, 0.95, 'bush'], [13.5, 25.5, 1.05, 'monstera']]) potPlant(x, z, s, k);
  makeSofa(-5.4, 25.35, 1.9, 0, '#4F6D8F', ['#F2B33D', '#E8742A']);
  makeSofa(10.2, 25.35, 1.9, 0, '#6B4F3A', ['#BDE0FE', '#E2B04A']);

  /* corridors: the company's sign at the end of corridor A, plants where the corridors end */
  put(scene, rbox(0.03, 2.7, 1.6, mat('#2F4A3D', { roughness: 0.9 }), 0.005), -7.985, 1.35, (WING.corA[0] + WING.corA[1]) / 2);
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.42), new THREE.MeshBasicMaterial({ map: plateTex(tr('world.dept.hq'), tr('world.dept.hqSub'), { bg: '#2F4A3D', fg: '#F3EFE8', sub: '#B9D6C4' }) }));
    m.position.set(-7.965, 1.95, (WING.corA[0] + WING.corA[1]) / 2); m.rotation.y = Math.PI / 2; scene.add(m); }
  potPlant(13.55, 9.9, 1.1, 'monstera'); potPlant(2.7, 25.55, 0.95, 'bush'); potPlant(3.9, 25.55, 0.95, 'snake');
}

export function setup() {
  if (HQ) buildWing();
}
