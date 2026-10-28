// Merging static meshes into fewer draw calls, then starting.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PRO } from './env.js';
import { SOFTWARE_GL, camera, renderer, scene } from '../scene/renderer.js';
import { lampBulbs } from '../scene/blocks.js';
import { bollards } from '../world/terrace.js';
import { glassM } from '../world/windows.js';
import { clockG, globeTilt, shelf } from '../world/furniture/room-pieces.js';
import { ledMesh } from '../world/furniture/server-racks.js';
import { rocket } from '../world/furniture/rocket.js';
import { board, boardFace } from '../world/furniture/board.js';
import { doorPivot } from '../world/entrance.js';
import { pillowM } from '../people/bedding.js';
import { DESKS, chairs, screens } from '../world/desks.js';
import { coffeeLed } from '../world/furniture/coffee.js';
import { floorLampGroups, roomPlants } from '../world/furniture/plants-lamps.js';
import { PRO_FX } from '../world/pro/pieces.js';
import { aqLight, bubbles, fishes, weeds } from '../world/props/aquarium.js';
import { arcM, marqM } from '../world/props/arcade.js';
import { paper, paperM, prnLed } from '../world/props/printer.js';
import { tvM } from '../world/props/tv.js';
import { neonM } from '../world/props/neon.js';
import { cat } from '../world/props/cat.js';
import { vac } from '../world/props/vacuum.js';
import { binM, bins, paperBallM } from '../world/props/bins.js';
import { devPool } from '../world/props/dev-servers.js';
import { lite, setLite } from '../ui/lite.js';
import { toast } from '../ui/activity.js';
import { PROPS, flakeM, hlMat, propMeshes } from '../interact/props.js';
import { PLACES } from '../interact/place-chips.js';
import { syncToggles } from '../ui/settings.js';
import { buildGrid, fp } from '../interact/first-person.js';
import { loop } from './loop.js';
import { t as tr } from '../../i18n/index.js';

/* ---------- fewer draw calls, same picture ----------
   The office is ~1,400 small meshes (books, legs, slots, leaves), and the frame was spent on draw-call overhead:
   3,300 calls and ~13 ms a frame on an M1 Pro, the same at a lower resolution. So once the scene is built, static
   meshes that share a kind of material are merged, per piece of furniture, into one mesh each, every part keeping its
   colour as a vertex colour: same picture, far fewer calls. Anything that moves, blinks, changes colour or is looked
   up by code stays as it was. The first-person walls are taken from the separate meshes first. */
function optimizeStatic() {
  if (!fp.grid) fp.grid = buildGrid();
  const denyMat = new Set([...screens, ...lampBulbs, ...bollards, ...chairs, coffeeLed, prnLed, aqLight, arcM, marqM, tvM, neonM, glassM, paperM, binM, paperBallM, pillowM, flakeM,
    ...(PRO ? [PRO_FX.logoM, ...PRO_FX.stalls.map((x) => x.sign)] : []),
    boardFace.material, ...DESKS.map((d) => d.bed.m)]);
  const denyObj = new Set([board, doorPivot, rocket, globeTilt, clockG, cat.g, vac.g, paper, ledMesh, ...bins.map((b) => b.g), ...fishes.map((f) => f.g), ...bubbles,
    ...weeds.map((w) => w.w), ...devPool.map((b) => b.g), ...DESKS.flatMap((d) => [d.chair.userData.back, d.bed.blanket, d.bed.folded]), ...(PRO ? PRO_FX.stalls.map((x) => x.pivot) : [])]);
  const denied = (o) => { for (let q = o; q; q = q.parent) if (denyObj.has(q) || q.userData.worker || q.userData.dynamic || q.userData.noMerge) return true; return false; };
  const mergeable = (m) => m.isMesh && !m.isInstancedMesh && !m.isSkinnedMesh && m.visible && !Array.isArray(m.material) && m.material && !m.material.transparent
    && !denyMat.has(m.material) && !m.children.length && !m.geometry.morphAttributes?.position && !denied(m);
  // roughness to the nearest quarter and metalness to the nearest half: a part at 0.4 and one at 0.6 look the same at
  // this distance, and merging them saves a draw call per desk (and its shadow), 44 times over on the headquarters floor
  const q = (v, step) => (typeof v === 'number' ? Math.round(v / step) * step : v);
  const sig = (m) => { const x = m.material; return [x.type, q(x.roughness, 0.25), q(x.metalness, 0.5), x.map?.uuid, x.side, x.flatShading, x.emissive?.getHex(), x.emissiveIntensity, x.toneMapped, m.castShadow, m.receiveShadow].join('|'); };
  const inv = new THREE.Matrix4(), rel = new THREE.Matrix4();
  // merges `meshes` into `container` (meshes must not move relative to it); returns the meshes that now draw them
  function mergeInto(meshes, container) {
    container.updateMatrixWorld(true); inv.copy(container.matrixWorld).invert();
    const buckets = new Map();
    for (const m of meshes) if (mergeable(m)) { const k = sig(m); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(m); }
    const made = [];
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const geos = [], used = [];
      for (const m of list) {
        rel.multiplyMatrices(inv, m.matrixWorld);
        if (rel.determinant() < 0) continue;   // mirrored parts would turn inside out
        let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        g.applyMatrix4(rel);
        const c = m.material.color || new THREE.Color(1, 1, 1), n = g.attributes.position.count, col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        geos.push(g); used.push(m);
      }
      if (used.length < 2) continue;
      const geo = mergeGeometries(geos, false); if (!geo) continue;
      const material = used[0].material.clone(); material.vertexColors = true; material.userData.own = true; if (material.color) material.color.setRGB(1, 1, 1);
      if (typeof material.roughness === 'number') { material.roughness = q(material.roughness, 0.25); material.metalness = q(material.metalness, 0.5); }
      const mesh = new THREE.Mesh(geo, material); mesh.castShadow = used[0].castShadow; mesh.receiveShadow = used[0].receiveShadow;
      container.add(mesh);
      for (const m of used) m.parent.remove(m);
      made.push({ mesh, used });
    }
    return made;
  }
  scene.updateMatrixWorld(true);
  let before = 0; scene.traverse((o) => { if (o.isMesh) before++; });
  // furniture you can point at: merged per piece, inside its own group when it has one (it may bounce or sway)
  const groupOf = { shelf, board, ...(PRO ? { foosball: PRO_FX.foosball } : {}) };
  DESKS.forEach((d, i) => { groupOf['desk' + i] = d.g; });
  roomPlants.forEach((g, i) => { groupOf['plant' + i] = g; });
  floorLampGroups.forEach((g, i) => { groupOf['lamp' + i] = g; });
  for (const p of PROPS.values()) {
    if (p.bin || p.id === 'cat' || p.id === 'vac' || p.id === 'clock' || p.id === 'board') continue;
    let container = groupOf[p.id];
    if (!container) { container = new THREE.Group(); container.userData.merged = p.id; scene.add(container); }
    const made = mergeInto(p.meshes, container);
    if (!made.length) continue;
    const gone = new Set(made.flatMap((x) => x.used));
    p.meshes = p.meshes.filter((m) => !gone.has(m)).concat(made.map((x) => x.mesh));
    for (const x of made) x.mesh.userData.prop = p;
  }
  // waste bins: the three body parts (one shared material, squashed only as a whole) drawn as one; the paper stays apart
  for (const b of bins) {
    const parts = b.g.children.filter((m) => m.isMesh && m.material === binM && !m.children.length);
    if (parts.length < 2) continue;
    b.g.updateMatrixWorld(true); inv.copy(b.g.matrixWorld).invert();
    const geo = mergeGeometries(parts.map((m) => { const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()); for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g.applyMatrix4(rel.multiplyMatrices(inv, m.matrixWorld)); }), false);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, binM); mesh.castShadow = true; b.g.add(mesh);
    for (const m of parts) m.removeFromParent();
    const p = PROPS.get('bin' + bins.indexOf(b));
    if (p) { p.meshes = p.meshes.filter((m) => !parts.includes(m)).concat(mesh); mesh.userData.prop = p; }
  }
  // everything else that never moves: walls, floor, rugs, trinkets, the terrace
  const rest = [];
  scene.traverse((o) => { if (o.isMesh && !o.userData.prop && !(o.parent && o.parent.userData.merged)) rest.push(o); });
  const staticGroup = new THREE.Group(); staticGroup.userData.merged = 'static'; scene.add(staticGroup);
  mergeInto(rest, staticGroup);
  propMeshes.length = 0;
  for (const p of PROPS.values()) for (const m of p.meshes) propMeshes.push(m);
  for (const pl of Object.values(PLACES)) pl.own = null;
  let after = 0; scene.traverse((o) => { if (o.isMesh) after++; });
  return { before, after };
}
let merged;

export function setup() {
  syncToggles();
  merged = optimizeStatic();
  if (lite) setLite(true);
  { const warm = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), hlMat); warm.position.set(0, -5, 0); scene.add(warm); renderer.compile(scene, camera); scene.remove(warm); }
  if (new URLSearchParams(location.search).has('debug')) console.info('office meshes', merged);
  if (SOFTWARE_GL) setTimeout(() => toast(tr('world.softwareGl'), 6000), 1500);
  loop();
}
