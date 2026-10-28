/* A wedding on the weekend (Saturday and Sunday by the office clock; ?wedding for any day): a house near the office puts
   up a tent (rạp cưới) over its pavement, pink and white pleats on poles, with a flower arch at the kerb under a sign
   (Lễ Vu Quy at the bride's home, Lễ Tân Hôn at the groom's) and 囍, and round tables with covered chairs inside.
   - 8:36–9:15: the bridal car (a white VinFast with flowers on the bonnet and ribbons) pulls up at the arch to fetch the
     bride; the family in áo dài wait under the arch with the couple, and wave them off.
   - 10:30–13:30 and 17:00–20:30: the feast. The tables fill up, the couple greet the guests at the arch, then go round
     the tables; a table raises its glasses now and then. The guests' scooters line the kerb, a man minding them.
   - After dark, strings of bulbs along the eaves.
   The tent is up 6:00–22:30. Which house it is changes with the date (one of the few nearest the office). Nobody walks
   that stretch of pavement meanwhile (street-life.js closes it); the scooters at the kerb are parked cars to the traffic. */
import * as THREE from 'three';
import { officeNow } from '../../core/env.js';
import { canvasTex } from '../../scene/blocks.js';
import { GY, boxAt, colorize, mergeAll, vmat } from '../terrace.js';
import { seen } from './street-folk.js';

const FORCE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('wedding');
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const UP = new THREE.Vector3(0, 1, 0), V = new THREE.Vector3();
const TABLES = [-2.25, -1.05, 1.05, 2.25], TZ = 0.6, EAVE = 2.25, RIDGE = 2.55, HALF_L = 3.0;
const BIKES = [-3.8, -3.1, -2.4, -1.7, -1.0, 1.0, 1.7, 2.4, 3.1, 3.8];   // along the kerb, in the road (local x)
const PAINTS = ['#D9534F', '#F2F2F2', '#2E86DE', '#3B3B3B', '#F2C200', '#7A1F2B', '#1E9E4A', '#C9CED6', '#22B8BE'];
const SERIF = '"Be Vietnam Pro", system-ui, sans-serif', HAN = '"PingFang SC", "Hiragino Sans", "Noto Sans CJK SC", "Microsoft YaHei", serif';

// one ball of flowers, low-poly
const bloom = (r, x, y, z, c) => colorize(new THREE.IcosahedronGeometry(r, 0).translate(x, y, z), c);
const FLOWERS = ['#F7C6D3', '#FFFFFF', '#E8476A', '#F7C6D3', '#FFE3EA', '#C8102E'];

/** K: from street-life.js: crowd, low, HALF, INS, C (the office's middle), blocks (the blocks round about, not the
    office's), parks, faces (buildings' street fronts), shops (the chain stores' fronts), slots (kerb places), laneAt,
    closeWalk, obstacle (something standing in a lane), callRider, depart, scooterParts, limb */
export function buildWedding(G, K) {
  const { crowd, low, HALF, INS, C, blocks, parks, faces, shops, slots, laneAt, closeWalk, obstacle, callRider, depart, scooterParts, limb } = K;

  /* ---------- where: the street-facing sides (+x, +z: the ones the camera sees) of the nearest blocks with houses ---------- */
  const isPark = (b) => parks.some((p) => Math.abs(p[0] - b.x0) < 0.05 && Math.abs(p[2] - b.z0) < 0.05);
  const onSide = (f, dir, b) => f.dir === dir && (dir === 'pz' ? Math.abs(f.z - (b.z1 - 1.3)) < 0.05 && f.x > b.x0 && f.x < b.x1 : Math.abs(f.x - (b.x1 - 1.3)) < 0.05 && f.z > b.z0 && f.z < b.z1);
  const sides = [];
  for (const b of blocks) {
    if (b.office || isPark(b)) continue;
    for (const dir of ['pz', 'px']) {
      if (!faces.some((f) => onSide(f, dir, b)) || shops.some((f) => onSide(f, dir, b))) continue;
      const out = dir === 'pz' ? [0, 1] : [1, 0], mid = dir === 'pz' ? [(b.x0 + b.x1) / 2, b.z1] : [b.x1, (b.z0 + b.z1) / 2];
      const L = dir === 'pz' ? laneAt('x', b.z1 + HALF, -1) : laneAt('z', b.x1 + HALF, 1);
      if (!L) continue;
      const sMid = dir === 'pz' ? mid[0] : mid[1];
      if (slots.some((sl) => sl.L === L && Math.abs(sl.s - sMid) < 7)) continue;   // (a shop's or the park's kerb place)
      const d = Math.hypot(mid[0] - C[0], mid[1] - C[1]);
      if (d > 42) continue;
      // the frame: x along the side, z out to the street, the wall at z = 0 (the kerb at 1.3), y = 0 on the pavement
      const ax = [out[1], -out[0]], M = new THREE.Matrix4().makeBasis(V.set(ax[0], 0, ax[1]).clone(), UP, new THREE.Vector3(out[0], 0, out[1])).setPosition(mid[0] - out[0] * 1.3, GY + 0.12, mid[1] - out[1] * 1.3);
      const corners = dir === 'pz' ? [[b.x0 + INS, b.z1 - INS], [b.x1 - INS, b.z1 - INS]] : [[b.x1 - INS, b.z0 + INS], [b.x1 - INS, b.z1 - INS]];
      sides.push({ dir, mid, d, L, sMid, sDir: L.axis === 'x' ? ax[0] : ax[1], M, inv: M.clone().invert(), yaw: Math.atan2(-ax[1], ax[0]), corners });
    }
  }
  sides.sort((a, b) => a.d - b.d);
  const cands = sides.slice(0, 3);

  /* ---------- the tent, the arch, the tables ---------- */
  const W = new THREE.Group(); W.matrixAutoUpdate = false; W.visible = false; G.add(W);
  const tent = [];
  for (const x of [-3, -1.5, 1.5, 3]) for (const z of [0.06, 1.22]) tent.push(colorize(new THREE.CylinderGeometry(0.035, 0.035, EAVE, 8).translate(x, EAVE / 2, z), '#F4F1EA'));
  // the roof: two slopes up to a ridge over the middle, in pleats of pink and white
  for (const [z0, z1] of [[0, 0.65], [1.3, 0.65]]) {
    const len = Math.hypot(z1 - z0, RIDGE - EAVE), ang = Math.atan2(RIDGE - EAVE, Math.abs(z1 - z0)) * (z1 > z0 ? -1 : 1);
    for (let k = 0; k < 24; k++) tent.push(colorize(new THREE.BoxGeometry(6.3 / 24, 0.025, len + 0.04).rotateX(ang).translate(-3.15 + (k + 0.5) * 6.3 / 24, (EAVE + RIDGE) / 2, (z0 + z1) / 2), k % 2 ? '#FFFFFF' : '#F7C6D3'));
  }
  // a gold band along both eaves, pink swags hanging from it, curtains tied back at the ends
  for (const z of [-0.01, 1.31]) tent.push(boxAt(6.3, 0.07, 0.03, 0, EAVE - 0.03, z, '#E0B23F'));
  for (let x = -2.95; x <= 2.96; x += 0.42) tent.push(colorize(new THREE.SphereGeometry(0.21, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 0.55, 0.12).translate(x, EAVE - 0.05, 1.33), '#E86A92'));
  for (const x of [-3.04, 3.04]) for (const z of [0.15, 1.12]) tent.push(colorize(new THREE.CylinderGeometry(0.06, 0.16, EAVE - 0.1, 8, 1, true).translate(x, (EAVE - 0.1) / 2, z), '#FFF6F8'));
  // the arch at the kerb: pillars of flowers, a half-ring of them over the top
  const flowers = [];
  for (const s of [-1, 1]) for (let y = 0.1, k = 0; y < 2.4; y += 0.12, k++) for (let j = 0; j < 3; j++) { const a = (k * 0.9 + (j * Math.PI * 2) / 3); flowers.push(bloom(0.09, s * 0.72 + Math.cos(a) * 0.07, y, 1.22 + Math.sin(a) * 0.07, k % 5 === 4 && j === 0 ? '#4C7A3F' : FLOWERS[(k + j * 2) % FLOWERS.length])); }
  for (let k = 0; k <= 16; k++) for (const dz of [-0.06, 0.06]) { const a = (Math.PI * k) / 16; flowers.push(bloom(0.1, Math.cos(a) * 0.72, 2.4 + Math.sin(a) * 0.55, 1.22 + dz, k % 4 === 2 && dz > 0 ? '#4C7A3F' : FLOWERS[(k + (dz > 0 ? 3 : 0)) % FLOWERS.length])); }
  // tables in white cloths with flowers in the middle, and chairs in white covers with a pink sash: each seen from its side
  const chairs = [];
  for (const x of TABLES) {
    tent.push(colorize(new THREE.CylinderGeometry(0.29, 0.33, 0.43, 16).translate(x, 0.215, TZ), '#FAFAFA'), bloom(0.06, x, 0.48, TZ, '#E8476A'));
    chairs.push({ x: x - 0.47, z: TZ, yaw: 0 }, { x: x + 0.47, z: TZ, yaw: Math.PI }, { x, z: 0.16, yaw: -Math.PI / 2 });
  }
  W.add(new THREE.Mesh(mergeAll(tent), vmat({ roughness: 0.75 })), new THREE.Mesh(mergeAll(flowers), vmat({ roughness: 0.9 })));
  W.children[0].castShadow = !low;
  const chairGeo = mergeAll([boxAt(0.3, 0.05, 0.3, 0, 0.3, 0, '#FAFAFA'), boxAt(0.29, 0.28, 0.29, 0, 0.14, 0, '#F2F2F2'), boxAt(0.04, 0.44, 0.3, -0.15, 0.53, 0, '#FAFAFA'),
    boxAt(0.05, 0.08, 0.32, -0.16, 0.49, 0, '#E86A92'), colorize(new THREE.SphereGeometry(0.05, 8, 6).translate(-0.19, 0.49, -0.05), '#E86A92'), colorize(new THREE.SphereGeometry(0.05, 8, 6).translate(-0.19, 0.49, 0.05), '#E86A92')]);
  const chairM = new THREE.InstancedMesh(chairGeo, vmat({ roughness: 0.8 }), chairs.length);
  chairs.forEach((c, i) => chairM.setMatrixAt(i, new THREE.Matrix4().compose(V.set(c.x, 0, c.z), new THREE.Quaternion().setFromAxisAngle(UP, c.yaw), new THREE.Vector3(1, 1, 1))));
  chairM.frustumCulled = false; W.add(chairM);
  // the feast on the tables: dishes round a hotpot, cans of beer
  const dishes = [];
  const FOOD = ['#E8B04A', '#7DBB3C', '#D9442B', '#F2F2F2', '#C98A3A', '#5E8C3A'];
  for (const x of TABLES) {
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; dishes.push(colorize(new THREE.CylinderGeometry(0.055, 0.045, 0.02, 10).translate(x + Math.cos(a) * 0.18, 0.44, TZ + Math.sin(a) * 0.18), FOOD[k])); }
    dishes.push(colorize(new THREE.CylinderGeometry(0.075, 0.07, 0.07, 12).translate(x, 0.465, TZ), '#3B3F45'));
    for (let k = 0; k < 3; k++) dishes.push(colorize(new THREE.CylinderGeometry(0.018, 0.018, 0.065, 8).translate(x - 0.08 + k * 0.08, 0.465, TZ + (k % 2 ? 0.1 : -0.1)), k % 2 ? '#C8102E' : '#2E7D32'));
  }
  const food = new THREE.Mesh(mergeAll(dishes), vmat({ roughness: 0.6 })); food.visible = false; W.add(food);

  /* ---------- the sign over the arch, 囍 above it, a backdrop on the wall ---------- */
  let vuQuy = true;
  const signTex = canvasTex(512, 128, () => {}), xiTex = canvasTex(128, 128, () => {}), backTex = canvasTex(256, 192, () => {});
  function paintSigns() {
    const draw = (tex, fn) => { const c = tex.image, g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); fn(g, c.width, c.height); tex.needsUpdate = true; };
    draw(signTex, (g, w, h) => {
      g.fillStyle = '#B5122B'; g.fillRect(0, 0, w, h); g.strokeStyle = '#E8C25A'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = '#FFE08A'; g.font = `900 64px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(vuQuy ? 'LỄ VU QUY' : 'LỄ TÂN HÔN', w / 2, h / 2 + 4);
    });
    const xi = (g, w, h, r) => { g.fillStyle = '#C8102E'; g.beginPath(); g.arc(w / 2, h / 2, r, 0, Math.PI * 2); g.fill(); g.fillStyle = '#FFD45C'; g.font = `900 ${Math.round(r * 1.3)}px ${HAN}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('囍', w / 2, h / 2 + r * 0.06); };
    draw(xiTex, (g, w, h) => xi(g, w, h, 60));
    draw(backTex, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#E86A92'); gr.addColorStop(1, '#B5122B'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = '#E8C25A'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12); xi(g, w, h, 62); });
  }
  const plate = (map, w, h, x, y, z, both = true) => { const m = new THREE.MeshBasicMaterial({ map }); for (const r of both ? [0, Math.PI] : [0]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.rotation.y = r; p.position.set(x, y, z + (r ? -0.004 : 0.004)); W.add(p); } };
  plate(signTex, 1.16, 0.29, 0, 2.47, 1.22);
  const xiGeo = new THREE.CircleGeometry(0.19, 24); for (const r of [0, Math.PI]) { const m = new THREE.Mesh(xiGeo, new THREE.MeshBasicMaterial({ map: xiTex, transparent: true })); m.rotation.y = r; m.position.set(0, 3.12, 1.22 + (r ? -0.004 : 0.004)); W.add(m); }
  plate(backTex, 1.6, 1.2, 0, 1.45, 0.03, false);
  paintSigns(); document.fonts?.ready.then(paintSigns);

  /* ---------- after dark: bulbs along the eaves and round the arch ---------- */
  const bulbs = [];
  for (const z of [0.02, 1.32]) for (let x = -3.0; x <= 3.01; x += 0.33) bulbs.push(x, EAVE - 0.08, z);
  for (let k = 0; k <= 10; k++) { const a = (Math.PI * k) / 10; bulbs.push(Math.cos(a) * 0.86, 2.4 + Math.sin(a) * 0.66, 1.28); }
  const lights = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(bulbs, 3)), new THREE.PointsMaterial({
    map: canvasTex(32, 32, (g) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); }),
    color: new THREE.Color(2.6, 2.0, 1.1), size: 6, sizeAttenuation: false, transparent: true, depthWrite: false }));
  lights.frustumCulled = false; lights.visible = false; W.add(lights);

  /* ---------- the guests' scooters at the kerb (in the road, along it) ---------- */
  const sc = scooterParts(), bikeBody = new THREE.InstancedMesh(mergeAll(sc.body), vmat({ roughness: 0.35, metalness: 0.3 }), BIKES.length), bikeTrim = new THREE.InstancedMesh(mergeAll(sc.trim), vmat({ roughness: 0.5, metalness: 0.2 }), BIKES.length);
  const Z0 = new THREE.Matrix4().makeScale(0, 0, 0), bikeAt = BIKES.map((x, i) => new THREE.Matrix4().compose(V.set(x, -0.12, 1.3 + HALF - 1.92), new THREE.Quaternion().setFromAxisAngle(UP, (i % 2 ? 1 : -1) * 0.05 + (x > 0 ? Math.PI : 0)), new THREE.Vector3(1, 1, 1)));
  BIKES.forEach((_, i) => { bikeBody.setColorAt(i, new THREE.Color(PAINTS[(i * 4 + 1) % PAINTS.length])); bikeBody.setMatrixAt(i, Z0); bikeTrim.setMatrixAt(i, Z0); });
  for (const o of [bikeBody, bikeTrim]) { o.frustumCulled = false; W.add(o); }
  bikeBody.castShadow = !low;

  /* ---------- the bridal car's flowers and ribbons, in the car's own frame (made once its model is in) ---------- */
  const deco = new THREE.Mesh(new THREE.BufferGeometry(), vmat({ roughness: 0.8 })); deco.matrixAutoUpdate = false; deco.visible = false; G.add(deco);
  let decoFor = null;
  function dressCar(v) {
    v.deco = (m) => { if (v.box && decoFor !== v.box) build(v.box); deco.matrix.copy(m); deco.visible = !!v.box; };   // (the model may still be loading)
  }
  function build(box) {
    {
      const [x0, , z0, x1, y1, z1] = box, hood = y1 * 0.68, w = (z1 - z0) / 2, parts = [];   // (the Car Kit's SUV: bonnet ~0.6–0.95 of the way forward)
      for (let k = 0; k < 22; k++) {   // a heart of roses on the bonnet, its point towards the front
        const a = (k / 22) * Math.PI * 2, hx = 16 * Math.sin(a) ** 3, hz = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
        parts.push(bloom(0.045, x1 * 0.62 - hz * 0.012, hood + 0.03, hx * 0.012, k % 3 ? '#E8476A' : '#FFFFFF'));
      }
      for (const [dx, dz] of [[0, 0], [0.06, 0.07], [0.06, -0.07], [-0.05, 0.08], [-0.05, -0.08]]) parts.push(bloom(0.055, x1 * 0.62 + dx, hood + 0.06, dz, '#F7C6D3'));
      for (const s of [-1, 1]) parts.push(limb(V.set(x1 * 0.93, hood - 0.12, 0).clone(), new THREE.Vector3(x1 * 0.36, y1 * 0.72, s * w * 0.98), 0.018, '#F28FA8'));   // ribbons to the mirrors
      parts.push(limb(new THREE.Vector3(x1 * 0.26, y1 + 0.02, 0), new THREE.Vector3(x0 * 0.78, y1 + 0.02, 0), 0.02, '#F28FA8'), bloom(0.07, x1 * 0.23, y1 + 0.06, 0, '#FFFFFF'));
      deco.geometry.dispose(); deco.geometry = mergeAll(parts.map((g) => (g.attributes.uv ? g : g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)))));
      decoFor = box;
    }
  }

  /* ---------- people ---------- */
  const guests = crowd.take(chairs.length), couple = crowd.take(2), family = crowd.take(4), minder = crowd.take(1);
  const SHIRTS = ['#3F7CC4', '#F2F2F2', '#D64550', '#2A9D8F', '#C9A227', '#8C4FA8', '#3B3B3B', '#F28FA8', '#6A8042', '#E8742A'];
  guests.forEach((i, n) => crowd.dress(i, { shirt: SHIRTS[(n * 3 + 1) % SHIRTS.length], hair: n % 4 === 3 ? '#A9A9A9' : '#2B2420', pants: n % 2 ? '#2F3A4C' : '#3B3B3B' }));
  if (couple.length === 2) { crowd.dress(couple[0], { shirt: '#FFFFFF', hair: '#241E1A', pants: '#FFFFFF' }); crowd.dress(couple[1], { shirt: '#1F2430', hair: '#241E1A', pants: '#1F2430' }); }
  ['#C8102E', '#E86A92', '#E0B23F', '#3A6FB0'].forEach((c, n) => family[n] != null && crowd.dress(family[n], { shirt: c, hair: n === 2 ? '#C9C9C9' : '#241E1A', pants: '#FAFAFA' }));   // áo dài over white trousers
  if (minder[0] != null) crowd.dress(minder[0], { shirt: '#6B7343', hair: '#2B2420', pants: '#363D4C' });
  const ORDER = chairs.map((_, i) => i).sort((a, b) => ((a * 5 + 2) % 7) - ((b * 5 + 2) % 7) || a - b);
  const all = [...guests, ...couple, ...family, ...minder];

  /* ---------- the day ---------- */
  let side = null, dateKey = '', up = false, nightOn = false, checkAt = -1, car = null, carV = null, bikesOn = '', unblock = [], inView = false;
  const world = (x, z) => V.set(x, 0, z).applyMatrix4(side.M);
  const sOf = (x) => side.sMid + x * side.sDir;
  function show(on) {
    up = on; W.visible = on;
    if (side) closeWalk(...side.corners[0], ...side.corners[1], on);
    if (!on) { all.forEach((i) => crowd.hide(i)); unblock.forEach((f) => f()); unblock = []; bikesOn = ''; car?.release(); car = null; }
  }
  function bikes(h, feast, fetch) {
    const want = BIKES.map((x) => feast || (fetch && Math.abs(x) > 2.3) || Math.abs(x) > 3.5);
    const key = want.join();
    if (key === bikesOn) return;
    bikesOn = key; unblock.forEach((f) => f()); unblock = [];
    want.forEach((on, i) => { bikeBody.setMatrixAt(i, on ? bikeAt[i] : Z0); bikeTrim.setMatrixAt(i, on ? bikeAt[i] : Z0); });
    bikeBody.instanceMatrix.needsUpdate = bikeTrim.instanceMatrix.needsUpdate = true;
    for (const sgn of [-1, 1]) {   // each row to the traffic: a parked thing along the kerb
      const xs = BIKES.filter((x, i) => want[i] && Math.sign(x) === sgn);
      if (!xs.length) continue;
      const a = sOf(Math.min(...xs)), b = sOf(Math.max(...xs));
      unblock.push(obstacle(side.L, (a + b) / 2, Math.abs(b - a) / 2 + 0.95, 1.92, 0.24));
    }
  }

  return {
    update(dt, t, h) {
      if (!cands.length) return;
      if (t - checkAt > 0.5) {
        checkAt = t;
        const d = officeNow(), key = d.toDateString(), day = d.getDay();
        if (key !== dateKey) { if (up) show(false); dateKey = key; side = cands[hash(key) % cands.length]; vuQuy = hash(key + '♥') % 2 === 0; paintSigns(); W.matrix.copy(side.M); }
        const want = (FORCE || day === 6 || day === 0) && h >= 6 && h < 22.5;
        if (want !== up) show(want);
        if (!up) return;
        inView = seen(side.mid[0], side.mid[1]);
        const fetch = h >= 8.6 && h < 9.25, feast = (h >= 10.5 && h < 13.5) || (h >= 17 && h < 20.5);
        bikes(h, feast, fetch);
        food.visible = feast; lights.visible = nightOn;
        // the bridal car: called up the street at 8:36 (or found waiting, a little later); off with the couple at 9:15
        if (fetch && !car) {
          const opt = { kind: 'vf8', paint: '#F4F4F4', side: 1.5, stay: true };
          car = h < 8.68 ? callRider(side.L, sOf(0), { ...opt, livery: 'car', far: 30 }) : depart(side.L, sOf(0), opt);
          if (car) { carV = car.vehicle; dressCar(carV); }
        }
        if (car && !fetch) { car.release(); car = null; }
      }
      if (carV && (!carV.on || !carV.special)) { carV.deco = null; carV = null; deco.visible = false; }
      if (!up || !inView) return;   // (nobody sees the guests move: they keep still)

      // the guests: filling the tables at the start of a feast, leaving at the end; a family table in between
      const feastA = h >= 10.5 && h < 13.5, feastB = h >= 17 && h < 20.5, [f0, f1] = feastA ? [10.5, 13.5] : feastB ? [17, 20.5] : [0, 0];
      const level = f1 ? Math.min(1, (h - f0) / 0.4, (f1 - h) / 0.4) : 0, seated = f1 ? Math.round(chairs.length * 0.95 * level) : h >= 9.25 && h < 21 ? 2 : 0;
      const round = f1 && h - f0 > 0.75, table = Math.floor(t / 20) % TABLES.length, toast = (t % 20) < 3.5;
      ORDER.forEach((c, n) => {
        const i = guests[c], ch = chairs[c];
        if (i == null) return;
        if (n >= seated) { crowd.hide(i); return; }
        const fwd = [Math.cos(ch.yaw), -Math.sin(ch.yaw)], w = world(ch.x - fwd[0] * 0.06, ch.z - fwd[1] * 0.06), here = round && toast && Math.floor(c / 3) === table;   // (three chairs a table)
        const eat = Math.max(0, Math.sin(t * 1.7 + c * 2.1)) * 0.5;
        crowd.pose(i, { x: w.x, sit: GY + 0.12 + 0.325, z: w.z, yaw: side.yaw + ch.yaw, arms: here ? [[0.5, 0], [2.1 + Math.sin(t * 8) * 0.08, -0.15]] : [[0.55, 0], [0.6 + eat, -0.1]], lean: -0.1 });
      });
      // the couple: under the arch with the family for the bridal car (gone with it at 9:15); at a feast, greeting at the
      // arch for the first 45 minutes, then going round the tables
      const fetchNow = h >= 8.6 && h < 9.33, inCar = h >= 9.25;
      const stand = (i, x, z, yaw, extra = {}) => { const w = world(x, z); crowd.pose(i, { x: w.x, y: GY + 0.12, z: w.z, yaw: side.yaw + yaw, ...extra }); };
      couple.forEach((i, k) => {
        const s = k ? 1 : -1;
        if (fetchNow && !inCar) stand(i, s * 0.24, 1.0, Math.PI / 2 * -1, { arms: [[k ? 0.25 : 0.1, 0], [k ? 0.1 : 0.25, 0]] });
        else if (f1 && !round) stand(i, s * 0.24, 1.02, -Math.PI / 2, { arms: [[0.3, 0], [0.3, 0]] });
        else if (round) { const tx = TABLES[table]; stand(i, tx + s * 0.22, 1.08, Math.PI / 2, { arms: [[0.4, 0], [toast ? 2.1 : 0.5, -0.15]] }); }
        else crowd.hide(i);
      });
      family.forEach((i, k) => {
        if (!fetchNow) { crowd.hide(i); return; }
        const wave = inCar ? Math.sin(t * 7 + k) * 0.35 : 0;
        stand(i, [-1.6, -0.75, 0.75, 1.6][k], 1.05, -Math.PI / 2, { arms: [[0.15, 0], inCar ? [2.5 + wave, 0.25] : [0.15, 0]] });
      });
      if (minder[0] != null) { if (bikesOn.includes('true')) stand(minder[0], 3.45, 1.05, -Math.PI / 2 + Math.sin(t * 0.3) * 0.5, { hat: true, arms: [[-0.35, -0.1], [-0.35, -0.1]] }); else crowd.hide(minder[0]); }
    },
    night(on) { nightOn = on; lights.visible = on && up; },
    // walking in: the tent over the pavement while it is up
    blocked(x, z, r = 0.25) {
      if (!up || !side) return false;
      const p = V.set(x, 0, z).applyMatrix4(side.inv);
      return p.x > -HALF_L - 0.1 - r && p.x < HALF_L + 0.1 + r && p.z > -r && p.z < 1.35 + r;
    },
    sites: cands.map((c) => c.mid),   // (where a tent may go up: kept clear by the power lines)
    debug: () => ({ sides: cands.map((s) => ({ dir: s.dir, mid: s.mid, d: +s.d.toFixed(1) })), side: side && { dir: side.dir, mid: side.mid }, up, car: carV && { mode: carV.mode, s: +carV.s.toFixed(1), deco: deco.visible, box: !!carV.box, verts: deco.geometry.attributes.position?.count, at: new THREE.Vector3().setFromMatrixPosition(deco.matrixWorld).toArray().map((n) => +n.toFixed(2)) } }),
  };
}
