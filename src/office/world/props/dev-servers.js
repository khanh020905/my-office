// Mini servers for each running dev server, and forgotten ones.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { el, rand } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { mat, put, rbox } from '../../scene/blocks.js';
import { LAY } from '../layout.js';
import { DESKS, dLocal } from '../desks.js';
import { sessions } from '../../people/workers.js';
import { openMac } from '../../ui/mac-drawer.js';
import { t as tr } from '../../../i18n/index.js';

let devBodyM;
export const devPool = [];
function devBox() {
  const g = new THREE.Group(); g.visible = false; scene.add(g);
  const body = rbox(0.16, 0.22, 0.18, devBodyM, 0.016); body.position.y = 0.11; g.add(body);
  for (let r = 0; r < 3; r++) put(g, rbox(0.12, 0.012, 0.004, '#3A414C', 0.002), 0, 0.06 + r * 0.035, 0.091);
  const led = new THREE.MeshBasicMaterial({ color: '#3DDC84' });
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.006), led), -0.045, 0.185, 0.091);
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.008, 0.035), led), 0, 0.224, 0.03);   // seen from the camera above
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.23, 32), new THREE.MeshBasicMaterial({ color: '#FF4D4D', transparent: true, opacity: 0.6, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.006; ring.visible = false; g.add(ring);
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 32;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.043), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  label.position.set(0.012, 0.185, 0.0935); g.add(label);
  g.traverse((o) => { o.userData.devBox = true; });
  return { g, led, ring, cv, tex, port: null, ph: rand(0, 6), left: false, cpu: 0 };
}
function devLabelPaint(b, port) {
  if (b.port === port) return;
  b.port = port;
  const c = b.cv.getContext('2d'); c.clearRect(0, 0, 96, 32);
  c.fillStyle = '#9FE8B8'; c.font = '700 22px ui-monospace, Menlo, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(port ? `:${port}` : 'dev', 48, 17); b.tex.needsUpdate = true;
}
let lostTag;
export let lostObj;
export function syncDevBoxes(snap) {
  const list = (snap?.devServers || []).filter((d) => d.owner);
  const byId = new Map([...sessions.values()].map((s) => [s.id, s]));
  const perDesk = new Map(); let lost = 0;
  while (devPool.length < Math.min(list.length, 16)) devPool.push(devBox());
  devPool.forEach((b, i) => {
    const d = list[i]; b.g.visible = false;
    if (!d) return;
    const s = d.owner.alive ? byId.get(d.owner.sid) : null;
    if (s && s.desk >= 0) {
      const k = perDesk.get(s.desk) || 0; perDesk.set(s.desk, k + 1);
      if (k > 1) return;
      const dk = DESKS[s.desk], [bx, bz] = dLocal(dk, -0.6 + k * 0.22, 0.25); b.g.position.set(bx, 0.775, bz); b.g.rotation.y = dk.ry; b.g.scale.setScalar(1.25); b.left = false; b.ring.visible = false;
    } else if (!d.owner.alive) {
      if (lost > 3) return;
      b.g.position.set(LAY.lost[0], 0, LAY.lost[1] + lost * 0.36); b.g.rotation.y = LAY.lost[2]; b.g.scale.setScalar(1.7); b.left = true; b.ring.visible = true; lost++;
    } else return;
    b.g.visible = true; b.cpu = d.cpu || 0; b.title = tr('world.dev.title', { label: d.label, ports: d.ports.join(', '), n: d.ports.length });
    devLabelPaint(b, d.ports[0]);
  });
  lostObj.visible = lost > 0;
  if (lost) lostTag.lastChild.data = tr('world.dev.lost', { n: lost });
}
export function updateDevBoxes(t) {
  for (const b of devPool) {
    if (!b.g.visible) continue;
    if (b.left) {
      b.led.color.set(Math.sin(t * 3 + b.ph) > 0 ? '#FF4D4D' : '#5A1414');
      const k = (t * 0.8 + b.ph) % 1; b.ring.scale.setScalar(1 + k * 0.9); b.ring.material.opacity = 0.65 * (1 - k);
    }
    else { const busy = b.cpu > 20; b.led.color.set(busy ? (Math.sin(t * 14 + b.ph) > 0 ? '#3DDC84' : '#14502C') : '#3DDC84'); }
  }
}

export function setup() {
  /* dev servers: a mini server on the desk of the session that started it; once that session has closed, the box moves
     to the server-room floor between the glass and the racks, with a red light (forgotten). Clicking a box opens the Mac panel. */
  devBodyM = mat('#232830', { roughness: 0.5, metalness: 0.45 });
  lostTag = el('div', 'tag tag--lost');
   lostTag.append(el('i'), document.createTextNode(''));
  lostObj = new CSS2DObject(lostTag);
   lostObj.position.set(...LAY.lostTag);
   lostObj.visible = false;
   scene.add(lostObj);
  lostTag.addEventListener('click', () => openMac());
}
