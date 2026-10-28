// Countryside backdrop: rice paddies, dikes, a river, a bridge, a village.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeChibi, chibiPose, applyChibiPose } from '../../people/chibi-rig.js';
import { state } from '../../core/state.js';
import { canvasTex, mat } from '../../scene/blocks.js';
import { BULB_OFF, GY, bollards, boxAt, cI, cPick, cR, colorize, cr, mergeAll, mergedTo, vmat } from '../terrace.js';
import { dotTex } from './city.js';
import { curvePts, distToPolyline, flyer, geoAt, karst, nearOffice, nightBits, poolsAt, prism, ribbon, roundTree, sdToXZ, tallOk, waterTex } from './shared.js';

/* ---------- countryside: rice paddies with dikes, a river and a bridge, a village gate, bamboo, tile-roof and narrow
   town houses, haystacks, grazing buffalo, egrets, kites with kids, limestone karsts in the haze, fireflies at night ---------- */
export function buildCountry(G) {
  state.envSeed = 712;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), mat('#86A85B', { roughness: 0.96 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = GY; ground.receiveShadow = true; G.add(ground);
  const solid = [], greens = [], dikes = [], lit = [], hayG = [];
  // river: across the screen behind the office, meandering
  const riverD = (s) => -31 + 6 * Math.sin(s / 17) + 2 * Math.sin(s / 7);
  const riverPts = []; for (let s = -170; s <= 170; s += 3) riverPts.push(sdToXZ(s, riverD(s)));
  const banks = ribbon(riverPts, 10, GY + 0.015, '#6E8E48'); greens.push(banks);
  const wTex = waterTex('#5E9FC0', '#CFE8F2'); wTex.repeat.set(1, 0.4);
  const water = new THREE.Mesh(ribbon(riverPts, 7, GY + 0.03), new THREE.MeshStandardMaterial({ map: wTex, color: '#FFFFFF', roughness: 0.15, metalness: 0.1 }));
  water.receiveShadow = true; G.add(water);
  // dirt path from the office door, over a bridge, to the village gate
  const sB = -16, dB = riverD(sB);
  const pathPts = curvePts([[-8.9, 1.5], [-13, 1.2], sdToXZ(-13, -16), sdToXZ(-15, -24), sdToXZ(sB, dB), sdToXZ(-17, -42), sdToXZ(-19, -52), sdToXZ(-26, -66)]);
  greens.push(ribbon(pathPts, 2.4, GY + 0.04, '#C9AB78'));
  const [bx, bz] = sdToXZ(sB, dB);
  for (const [w, h, y, c] of [[2.8, 0.3, 0.55, '#8B6B4A'], [2.9, 0.12, 0.72, '#A07C55']]) solid.push(geoAt(new THREE.BoxGeometry(w, h, 11), bx, GY + y, bz, c, Math.PI / 4));
  for (const k of [-1, 1]) for (let t = -5; t <= 5; t += 1.25) { const [ox, oz] = [Math.cos(Math.PI / 4) * k * 1.35 + Math.sin(Math.PI / 4) * t, -Math.sin(Math.PI / 4) * k * 1.35 + Math.cos(Math.PI / 4) * t]; solid.push(geoAt(new THREE.BoxGeometry(0.12, 0.7, 0.12), bx + ox, GY + 1.1, bz + oz, '#6B4F35')); }
  for (const k of [-1, 1]) solid.push(geoAt(new THREE.BoxGeometry(0.1, 0.1, 11), bx + Math.cos(Math.PI / 4) * k * 1.35, GY + 1.42, bz - Math.sin(Math.PI / 4) * k * 1.35, '#6B4F35', Math.PI / 4));
  // the village gate where the path enters the village
  { const [gx, gz] = sdToXZ(-19, -52), yaw = Math.PI / 4;
    const piece = (w, h, d, ox, oy, c) => solid.push(geoAt(new THREE.BoxGeometry(w, h, d), gx + Math.cos(yaw) * ox, GY + oy, gz - Math.sin(yaw) * ox, c, yaw));
    for (const k of [-1, 1]) { piece(0.9, 4.2, 0.9, k * 2.1, 2.1, '#D8CBB0'); piece(1.1, 0.4, 1.1, k * 2.1, 4.3, '#B5533C'); }
    piece(5.6, 0.7, 1.0, 0, 4.0, '#D8CBB0'); solid.push(geoAt(prism(6.6, 1.1, 1.6), gx, GY + 4.35, gz, '#B5533C', yaw + Math.PI / 2)); }
  // rice paddies: fields with dikes, four crops, kept clear of the river, the path and the office
  const fieldTex = canvasTex(64, 64, (g) => { g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(0,0,0,.16)'; for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 3, 64); });
  fieldTex.wrapS = fieldTex.wrapT = THREE.RepeatWrapping;
  const crops = [], floods = [], clumps = [];
  const villages = [[-46, -60, 13], [34, -56, 12], [0, -86, 15], [-48, -16, 10], [-8, -48, 9], [24, -44, 7]].map(([s, d, r]) => ({ s, d, r }));
  const inVillage = (x, z, pad = 0) => villages.some((v) => { const [vx, vz] = sdToXZ(v.s, v.d); return Math.hypot(x - vx, z - vz) < v.r + pad; });
  for (let gx = -100; gx < 64; gx += 9) for (let gz = -100; gz < 60; gz += 7.5) {
    const w = 9 - 0.4, d = 7.5 - 0.4, cx = gx + 4.5, cz = gz + 3.75;
    if (nearOffice(cx, cz, 4) || inVillage(cx, cz, 4) || distToPolyline(cx, cz, pathPts) < 5.5) continue;
    const s = cx - cz, dd = cx + cz; if (Math.abs(dd - riverD(s)) < 9) continue;
    const kind = cr(), y = GY + 0.05;
    if (kind < 0.16) floods.push(new THREE.BoxGeometry(w, 0.04, d).translate(cx, y, cz));
    else {
      const c = kind < 0.52 ? '#8DC04B' : kind < 0.74 ? '#6EA93E' : kind < 0.92 ? '#D7B54C' : '#A88B5A';
      const g = new THREE.BoxGeometry(w, 0.06, d), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 1.2, uv.getY(i) * d / 1.2);
      crops.push(colorize(g.translate(cx, y, cz), c));
      if (kind < 0.92 && Math.hypot(cx - 2, cz - 2) < 46) for (let i = 0; i < 26; i++) clumps.push([cx + cR(-w / 2 + 0.4, w / 2 - 0.4), cz + cR(-d / 2 + 0.4, d / 2 - 0.4), c]);
    }
    for (const [ox, oz, lw, ld] of [[0, -d / 2 - 0.2, w + 0.4, 0.42], [0, d / 2 + 0.2, w + 0.4, 0.42], [-w / 2 - 0.2, 0, 0.42, d], [w / 2 + 0.2, 0, 0.42, d]]) dikes.push(boxAt(lw, 0.24, ld, cx + ox, GY + 0.12, cz + oz, '#7C9A4B'));
  }
  const cropMesh = new THREE.Mesh(mergeAll(crops), new THREE.MeshStandardMaterial({ map: fieldTex, vertexColors: true, roughness: 0.9 })); cropMesh.receiveShadow = true; G.add(cropMesh);
  const floodTex = waterTex('#9CC6D6', '#E8F6FA'); floodTex.repeat.set(0.05, 0.05);
  if (floods.length) { const f = new THREE.Mesh(mergeAll(floods), new THREE.MeshStandardMaterial({ map: floodTex, roughness: 0.08, metalness: 0.15 })); f.receiveShadow = true; G.add(f); }
  mergedTo(G, dikes, vmat({ roughness: 0.95 }), false);
  if (clumps.length) {
    const im = new THREE.InstancedMesh(new THREE.ConeGeometry(0.13, 0.5, 5).translate(0, 0.25, 0), new THREE.MeshStandardMaterial({ roughness: 0.9 }), clumps.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    clumps.forEach(([x, z, c], i) => { m4.compose(new THREE.Vector3(x, GY + 0.07, z), q, new THREE.Vector3(1, cR(0.8, 1.3), 1)); im.setMatrixAt(i, m4); im.setColorAt(i, new THREE.Color(c).multiplyScalar(0.92)); });
    im.receiveShadow = true; G.add(im);
  }
  // villages: tile-roof cottages and narrow pastel town houses, bamboo hedges, banana and areca palms, haystacks
  const house = (x, z, yaw) => {
    const w = cR(4.4, 5.6), d = cR(3.4, 4), h = cR(2.4, 2.8), wall = cPick(['#F1E3B5', '#EDD9A4', '#F4EEDF', '#E9C98D']), roof = cPick(['#B5533C', '#C0623F', '#A84A36']);
    const add = (g, ox, oy, oz, c) => solid.push(geoAt(g, x + Math.cos(yaw) * ox + Math.sin(yaw) * oz, GY + oy, z - Math.sin(yaw) * ox + Math.cos(yaw) * oz, c, yaw));
    add(new THREE.BoxGeometry(w, h, d), 0, h / 2, 0, wall);
    add(prism(d + 1.0, 1.6, w + 0.8).rotateY(Math.PI / 2), 0, h, 0, roof);
    add(new THREE.BoxGeometry(w + 0.2, 0.25, 1.3), 0, 0.12, d / 2 + 0.6, '#BFB39C');
    for (const k of [-1, 1]) add(new THREE.BoxGeometry(0.16, h, 0.16), k * (w / 2 - 0.2), h / 2, d / 2 + 1.1, '#7A5A3E');
    add(new THREE.BoxGeometry(0.9, 1.7, 0.06), 0, 0.85, d / 2 + 0.02, '#5A3A26');
    for (const k of [-1, 1]) { const ox = k * w * 0.3; lit.push(geoAt(new THREE.PlaneGeometry(0.8, 0.7), x + Math.cos(yaw) * ox + Math.sin(yaw) * (d / 2 + 0.03), GY + 1.4, z - Math.sin(yaw) * ox + Math.cos(yaw) * (d / 2 + 0.03), '#FFFFFF', yaw)); }
  };
  const townHouse = (x, z, yaw) => {
    const w = cR(3.6, 4.4), d = cR(6, 8), fl = cI(2, 3), h = fl * 3, c = cPick(['#F6C1C1', '#BFE3D0', '#F9E3A1', '#C9DAF2', '#F4D0A9', '#E6E1F5']);
    const add = (g, ox, oy, oz, col) => solid.push(geoAt(g, x + Math.cos(yaw) * ox + Math.sin(yaw) * oz, GY + oy, z - Math.sin(yaw) * ox + Math.cos(yaw) * oz, col, yaw));
    add(new THREE.BoxGeometry(w, h, d), 0, h / 2, 0, c);
    add(new THREE.BoxGeometry(w + 0.2, 0.5, d + 0.2), 0, h + 0.25, 0, '#E9E4DA');
    for (let f = 1; f < fl; f++) add(new THREE.BoxGeometry(w, 0.18, 1.0), 0, f * 3, d / 2 + 0.5, '#E9E4DA');
    add(new THREE.CylinderGeometry(0.5, 0.5, 1.1, 12).rotateZ(Math.PI / 2), w * 0.15, h + 1.1, -d * 0.25, '#C8CDD2');
    for (let f = 0; f < fl; f++) lit.push(geoAt(new THREE.PlaneGeometry(w * 0.55, 1.3), x + Math.sin(yaw) * (d / 2 + 0.03), GY + f * 3 + 1.6, z + Math.cos(yaw) * (d / 2 + 0.03), '#FFFFFF', yaw));
  };
  const bamboo = (x, z, n = cI(9, 16)) => {
    for (let i = 0; i < n; i++) {
      const ox = x + cR(-1.6, 1.6), oz = z + cR(-1.6, 1.6), h = cR(6, 9), lean = cR(-0.12, 0.12);
      solid.push(geoAt(new THREE.CylinderGeometry(0.06, 0.09, h, 5).translate(0, h / 2, 0).rotateZ(lean), ox, GY, oz, cPick(['#9DB65A', '#8FAA4E', '#A8BF63'])));
      greens.push(geoAt(new THREE.IcosahedronGeometry(cR(0.9, 1.4), 1).scale(1.1, 0.55, 1.1), ox - Math.sin(lean) * h, GY + h * 0.95, oz, cPick(['#5E8F3A', '#6FA046', '#557F35'])));
    }
  };
  const banana = (x, z) => {
    solid.push(geoAt(new THREE.CylinderGeometry(0.16, 0.22, 2.2, 7), x, GY + 1.1, z, '#7E9B55'));
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + cR(-0.3, 0.3); greens.push(geoAt(new THREE.BoxGeometry(1.9, 0.04, 0.6).translate(0.95, 0, 0).rotateZ(cR(0.1, 0.6)).rotateY(a), x, GY + 2.2, z, cPick(['#6DAA3E', '#7FBA48']))); }
  };
  const areca = (x, z) => {
    const h = cR(6, 8); solid.push(geoAt(new THREE.CylinderGeometry(0.1, 0.13, h, 6), x, GY + h / 2, z, '#9E9A86'));
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; greens.push(geoAt(new THREE.BoxGeometry(1.5, 0.04, 0.4).translate(0.75, 0, 0).rotateZ(-0.35).rotateY(a), x, GY + h, z, '#5E9440')); }
  };
  const haystack = (x, z) => { hayG.push(geoAt(new THREE.CylinderGeometry(0.9, 1.0, 1.0, 10), x, GY + 0.5, z, '#D2AE55')); hayG.push(geoAt(new THREE.ConeGeometry(1.0, 1.6, 10), x, GY + 1.8, z, '#DDBA62')); hayG.push(geoAt(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 4), x, GY + 2.9, z, '#6B4F35')); };
  for (const v of villages) {
    const [vx, vz] = sdToXZ(v.s, v.d);
    for (let i = 0; i < Math.round(v.r * 0.7); i++) {
      const a = cR(0, Math.PI * 2), r = cR(2, v.r - 2), x = vx + Math.cos(a) * r, z = vz + Math.sin(a) * r, yaw = cPick([0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) + cR(-0.15, 0.15);
      if (!tallOk(x, z, 8) || Math.abs(x + z - riverD(x - z)) < 6.5) continue;
      const k = cr(); if (k < 0.45) house(x, z, yaw); else if (k < 0.7) townHouse(x, z, yaw); else if (k < 0.8) haystack(x, z); else if (k < 0.9) banana(x, z); else areca(x, z);
    }
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + cR(-0.2, 0.2), x = vx + Math.cos(a) * (v.r + 1.5), z = vz + Math.sin(a) * (v.r + 1.5); if (tallOk(x, z, 9)) bamboo(x, z, cI(6, 11)); }
  }
  // bamboo and trees along the river and dikes, haystacks in harvested fields
  for (let s = -150; s <= 150; s += cR(9, 16)) { const [x, z] = sdToXZ(s, riverD(s) + (cr() < 0.5 ? -6.5 : 6.5)); if (tallOk(x, z, 9)) (cr() < 0.5 ? bamboo(x, z, cI(5, 9)) : roundTree(greens, x, z, cR(0.9, 1.3))); }
  for (let i = 0; i < 26; i++) { const x = cR(-95, 60), z = cR(-95, 60); if (tallOk(x, z, 3) && !inVillage(x, z) && Math.abs(x + z - riverD(x - z)) > 7) (cr() < 0.5 ? haystack(x, z) : roundTree(greens, x, z, cR(0.8, 1.2))); }
  // limestone karsts and hills in the haze
  for (let i = 0; i < 22; i++) { const s = cR(-150, 150), d = cR(-140, -95), [x, z] = sdToXZ(s, d); karst(greens, x, z, cR(5, 11), cR(14, 30), cPick(['#557A49', '#4D7044', '#5E8250'])); }
  for (const side of [-1, 1]) for (let i = 0; i < 6; i++) { const s = side * cR(80, 130), d = cR(-70, 20), [x, z] = sdToXZ(s, d); karst(greens, x, z, cR(5, 9), cR(12, 22)); }
  mergedTo(G, solid, vmat({ roughness: 0.8 }));
  mergedTo(G, greens, vmat({ roughness: 0.95 }));
  mergedTo(G, hayG, vmat({ roughness: 1 }));
  const litOn = nightBits(G, lit, new THREE.Color(2.2, 1.55, 0.75));
  // lanterns along the path near the office, pools of light at night
  const lanterns = [], lampSpots = [];
  for (let i = 6; i < pathPts.length - 4; i += 9) { const [x, z] = pathPts[i]; lanterns.push(geoAt(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 5), x + 1.6, GY + 1.2, z, '#3B3029')); lampSpots.push([x + 1.2, z]); }
  mergedTo(G, lanterns, vmat({ roughness: 0.6 }));
  const lampBulb = new THREE.MeshBasicMaterial({ color: BULB_OFF.clone() }); bollards.push(lampBulb);
  if (lampSpots.length) G.add(new THREE.Mesh(mergeAll(lampSpots.map(([x, z]) => new THREE.SphereGeometry(0.22, 10, 8).translate(x + 0.4, GY + 2.5, z))), lampBulb));
  const pools = poolsAt(G, lampSpots, 5);
  // buffalo grazing (head bobs), egrets standing and flying, kites with kids holding the strings
  const buffalo = [];
  const bufM = new THREE.MeshStandardMaterial({ color: '#4B4A50', roughness: 0.85 }), hornM = new THREE.MeshStandardMaterial({ color: '#D9D2C2', roughness: 0.6 });
  for (const [s, d] of [[-30, -40], [22, -42], [40, -24], [-58, -30], [8, -60]]) {
    const [x, z] = sdToXZ(s, d); if (!tallOk(x, z, 2)) continue;
    const g = new THREE.Group(); g.position.set(x, GY, z); g.rotation.y = cR(0, Math.PI * 2); G.add(g);
    const body = new THREE.Mesh(new RoundedBoxGeometry(2.2, 1.1, 1.05, 2, 0.35), bufM); body.position.y = 1.15; body.castShadow = true; g.add(body);
    for (const [lx, lz] of [[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.8, 6), bufM); l.position.set(lx, 0.4, lz); g.add(l); }
    const head = new THREE.Group(); head.position.set(1.15, 1.25, 0); g.add(head);
    const hm = new THREE.Mesh(new RoundedBoxGeometry(0.75, 0.55, 0.6, 2, 0.18), bufM); hm.position.set(0.35, -0.2, 0); hm.castShadow = true; head.add(hm);
    for (const k of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 12, Math.PI * 0.9), hornM); h.position.set(0.15, 0.12, k * 0.32); h.rotation.set(Math.PI / 2, 0, k > 0 ? 0 : Math.PI); head.add(h); }
    buffalo.push({ head, ph: cR(0, 6) });
  }
  const egretS = [];
  for (let i = 0; i < 14; i++) { const x = cR(-90, 55), z = cR(-90, 55); if (!tallOk(x, z, 1.5) || inVillage(x, z)) continue; egretS.push(geoAt(new THREE.SphereGeometry(0.22, 8, 6).scale(1.6, 1, 1), x, GY + 0.75, z, '#F6F6F2'), geoAt(new THREE.CylinderGeometry(0.04, 0.05, 0.6, 5).rotateZ(-0.5), x + 0.3, GY + 1.05, z, '#F6F6F2'), geoAt(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 4), x, GY + 0.33, z, '#222222')); }
  mergedTo(G, egretS, vmat({ roughness: 0.6 }));
  const flyers = [0, 1, 2, 3, 4].map((i) => ({ ...flyer(G, '#F6F6F2', 1.0), r: cR(18, 30), cx: cR(-40, 10), cz: cR(-50, -25), y: cR(9, 14), ph: i * 1.3, sp: cR(0.12, 0.2) }));
  const kites = [];
  for (const [s, d, col] of [[-34, -20, '#E8473F'], [30, -34, '#F2B33D'], [-6, -46, '#3E8EDE']]) {
    const [kx, kz] = sdToXZ(s, d); if (!tallOk(kx, kz, 2)) continue;
    const kid = makeChibi({ name: 'kid' + s, look: state.LOOK, shirt: col, hair: '#2B2420', style: cPick(['plain', 'bob', 'ponytail']), pants: '#2F3B52' }, 0.6);
    kid.root.position.set(kx, GY, kz); kid.root.rotation.y = -Math.PI * 0.75; G.add(kid.root);
    applyChibiPose(kid.P, chibiPose(kid.P, 'hand', 0), 1);
    const kite = new THREE.Group(); G.add(kite);
    const sail = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.9, 0), new THREE.Vector3(-0.65, 0, 0), new THREE.Vector3(0, -1.0, 0), new THREE.Vector3(0, 0.9, 0), new THREE.Vector3(0, -1.0, 0), new THREE.Vector3(0.65, 0, 0)]), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
    sail.geometry.computeVertexNormals(); kite.add(sail);
    for (let t = 1; t <= 5; t++) { const bow = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.12), new THREE.MeshBasicMaterial({ color: t % 2 ? '#FFFFFF' : col, side: THREE.DoubleSide })); bow.position.y = -1.0 - t * 0.45; kite.add(bow); }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#F4F1E8', transparent: true, opacity: 0.7 }));
    G.add(line);
    kites.push({ kite, line, hx: kx + 0.25, hy: GY + 1.25 * 0.6 + 0.3, hz: kz, base: [kx - 9, GY + cR(17, 22), kz - 9], ph: cR(0, 6) });
  }
  // fireflies over the fields and bamboo at night
  const FF = 260, ffBase = new Float32Array(FF * 3), ffPos = new Float32Array(FF * 3), ffCol = new Float32Array(FF * 3), ffPh = [];
  for (let i = 0; i < FF; i++) { let x, z; do { x = cR(-70, 40); z = cR(-70, 40); } while (nearOffice(x, z, 1)); ffBase.set([x, GY + cR(0.4, 2.6), z], i * 3); ffPh.push(cR(0, 10)); }
  const fireflies = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(ffPos, 3)).setAttribute('color', new THREE.BufferAttribute(ffCol, 3)), new THREE.PointsMaterial({ map: dotTex, size: 5, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  fireflies.frustumCulled = false; G.add(fireflies);
  let isNight = false;
  return {
    update(dt, t) {
      wTex.offset.y -= dt * 0.04; floodTex.offset.x += dt * 0.004;
      for (const b of buffalo) b.head.rotation.z = -0.55 + Math.sin(t * 0.7 + b.ph) * 0.18;
      for (const f of flyers) { const a = t * f.sp + f.ph; f.g.position.set(f.cx + Math.cos(a) * f.r, f.y + Math.sin(a * 2) * 0.6, f.cz + Math.sin(a) * f.r); f.g.rotation.y = -a; const flap = Math.sin(t * 7 + f.ph) * 0.5; f.wings[0].rotation.z = flap; f.wings[1].rotation.z = -flap; }
      for (const k of kites) { const [x, y, z] = k.base; k.kite.position.set(x + Math.sin(t * 0.5 + k.ph) * 1.6, y + Math.sin(t * 0.9 + k.ph) * 0.8, z + Math.cos(t * 0.4 + k.ph) * 1.2); k.kite.rotation.set(0, Math.PI / 4, Math.sin(t * 1.3 + k.ph) * 0.25); const p = k.line.geometry.attributes.position; p.setXYZ(0, k.hx, k.hy, k.hz); p.setXYZ(1, k.kite.position.x, k.kite.position.y - 1.0, k.kite.position.z); p.needsUpdate = true; }
      if (isNight) for (let i = 0; i < FF; i++) {
        const ph = ffPh[i], b = Math.max(0, Math.sin(t * 1.7 + ph * 3)) ** 3;
        ffPos[i * 3] = ffBase[i * 3] + Math.sin(t * 0.3 + ph) * 0.8; ffPos[i * 3 + 1] = ffBase[i * 3 + 1] + Math.sin(t * 0.5 + ph * 2) * 0.4; ffPos[i * 3 + 2] = ffBase[i * 3 + 2] + Math.cos(t * 0.27 + ph) * 0.8;
        ffCol[i * 3] = 1.6 * b; ffCol[i * 3 + 1] = 2.4 * b; ffCol[i * 3 + 2] = 0.5 * b;
      }
      if (isNight) { fireflies.geometry.attributes.position.needsUpdate = true; fireflies.geometry.attributes.color.needsUpdate = true; }
    },
    night(on) {
      isNight = on; fireflies.visible = on; if (pools) pools.visible = on; if (litOn) litOn(on);
      ground.material.color.set(on ? '#5E7D45' : '#86A85B');
      for (const f of flyers) f.g.visible = !on;
    },
  };
}
