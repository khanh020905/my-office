// Beach backdrop: sand, surf, palms, umbrellas and loungers.
import * as THREE from 'three';
import { state } from '../../core/state.js';
import { canvasTex } from '../../scene/blocks.js';
import { GY, cPick, cR, cr, mergedTo, vmat } from '../terrace.js';
import { dotTex } from './city.js';
import { flyer, geoAt, karst, nightBits, palm, ribbon, sdToXZ, tallOk, waterTex } from './shared.js';

/* ---------- beach: sand, a shore with breaking foam, palms, umbrellas and loungers, round basket boats, fishing
   boats bobbing at sea, Hạ Long-style islands, a lighthouse that sweeps its beam at night, thatched huts with string lights ---------- */
export function buildBeach(G) {
  state.envSeed = 4242;
  const shoreD = (s) => -27 + 2.5 * Math.sin(s / 15) + 1.2 * Math.sin(s / 6);
  const seaTex = waterTex('#2D8FB8', '#BFE7F3'); seaTex.repeat.set(0.06, 0.06);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), new THREE.MeshStandardMaterial({ map: seaTex, roughness: 0.12, metalness: 0.15 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = GY - 0.14; sea.receiveShadow = true; G.add(sea);
  // sand: a strip mesh from the shoreline (dipping into the water) to far in front
  const pos = [], idx = [], cols = [], S0 = -200, S1 = 200, STEP = 4, rows = [-1.6, 0, 2.5, 7, 220];
  const sandC = new THREE.Color('#E6CF9D'), wetC = new THREE.Color('#C7AF7E');
  for (let s = S0, i = 0; s <= S1; s += STEP, i++) for (const r of rows) {
    const [x, z] = sdToXZ(s, shoreD(s) + r); pos.push(x, r < 0 ? GY - 0.32 : r < 2.5 ? GY - 0.08 : GY, z);
    const c = r < 2.5 ? wetC : sandC; cols.push(c.r, c.g, c.b);
  }
  const R = rows.length, N = (S1 - S0) / STEP + 1;
  for (let i = 0; i < N - 1; i++) for (let j = 0; j < R - 1; j++) { const a = i * R + j, b = (i + 1) * R + j; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const sandG = new THREE.BufferGeometry(); sandG.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sandG.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); sandG.setIndex(idx); sandG.computeVertexNormals();
  const sand = new THREE.Mesh(sandG, vmat({ roughness: 0.97 })); sand.receiveShadow = true; G.add(sand);
  // foam lines that roll in and out, and a band of shallow turquoise water
  const shorePts = []; for (let s = S0; s <= S1; s += 3) shorePts.push(sdToXZ(s, shoreD(s)));
  const shallow = new THREE.Mesh(ribbon(shorePts.map(([x, z]) => [x - 3, z - 3]), 9, GY - 0.12), new THREE.MeshBasicMaterial({ color: '#7FD6DA', transparent: true, opacity: 0.45, depthWrite: false }));
  G.add(shallow);
  const foamTex = canvasTex(128, 32, (g) => { const gr = g.createLinearGradient(0, 0, 0, 32); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 32); });
  const foams = [0, 1].map((k) => { const m = new THREE.Mesh(ribbon(shorePts, 1.6, GY - 0.1), new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, depthWrite: false })); m.renderOrder = 2; G.add(m); return { m, ph: k * Math.PI }; });
  const solid = [], greens = [], lit = [];
  const onSand = (x, z, pad = 1.5) => x + z > shoreD(x - z) + pad;
  // palms along the beach and the sides
  for (let i = 0; i < 70; i++) { const s = cR(-120, 120), d = cR(-26, 60), [x, z] = sdToXZ(s, d); if (onSand(x, z, 3) && tallOk(x, z, 7)) palm(greens, x, z, cR(0.95, 1.25)); }
  // umbrellas + loungers between the office and the sea
  const umbrella = (x, z) => {
    const c = cPick(['#E8473F', '#F2B33D', '#3E8EDE', '#2BB3A3', '#F07FA8']);
    solid.push(geoAt(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 5), x, GY + 1.25, z, '#EDEDED'));
    solid.push(geoAt(new THREE.ConeGeometry(1.5, 0.7, 10, 1, true), x, GY + 2.55, z, c));
    for (const k of [-1, 1]) solid.push(geoAt(new THREE.BoxGeometry(0.7, 0.12, 1.9).rotateX(-0.12), x + k * 0.9, GY + 0.35, z + 1.4, '#F4F1EA'));
    solid.push(geoAt(new THREE.CylinderGeometry(0.6, 0.6, 0.02, 12), x + 0.4, GY + 0.01, z + 2.4, cPick(['#3E8EDE', '#F2B33D', '#E8473F'])));
  };
  for (let s = -80; s <= 80; s += cR(7, 11)) { const d = shoreD(s) + cR(6, 12), [x, z] = sdToXZ(s, d); if (onSand(x, z, 4) && tallOk(x, z, 3)) umbrella(x, z); }
  // basket boats on the wet sand and in the shallows
  const basket = (x, z, y) => {
    solid.push(geoAt(new THREE.SphereGeometry(1.1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 0.5, 1), x, y + 0.56, z, '#5B4532'));
    solid.push(geoAt(new THREE.CylinderGeometry(1.0, 1.0, 0.05, 16), x, y + 0.3, z, '#3E2F22'));
    solid.push(geoAt(new THREE.TorusGeometry(1.1, 0.08, 6, 22).rotateX(Math.PI / 2), x, y + 0.56, z, '#2E6FA8'));
    solid.push(geoAt(new THREE.BoxGeometry(1.7, 0.06, 0.18), x, y + 0.5, z, '#7A5A3E'));
  };
  for (let s = -70; s <= 70; s += cR(9, 15)) { const d = shoreD(s) + cR(0.5, 3), [x, z] = sdToXZ(s, d); if (tallOk(x, z, 1.5)) basket(x, z, GY - 0.1); }
  // thatched huts with string lights (sides), a lighthouse on a rocky point, islands at sea
  const hutLights = [];
  for (const [s, d] of [[-40, -10], [-52, 4], [42, -12], [56, 2], [-34, -18], [36, -20]]) {
    const [x, z] = sdToXZ(s, d); if (!tallOk(x, z, 5)) continue;
    for (const [a, b] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) solid.push(geoAt(new THREE.CylinderGeometry(0.1, 0.12, 2.6, 6), x + a, GY + 1.3, z + b, '#7A5A3E'));
    solid.push(geoAt(new THREE.ConeGeometry(3.2, 1.8, 4).rotateY(Math.PI / 4), x, GY + 3.4, z, '#C9A65C'));
    solid.push(geoAt(new THREE.BoxGeometry(2.6, 0.9, 1.0), x, GY + 0.45, z + 1.0, '#8B6B4A'));
    for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; hutLights.push(x + Math.cos(a) * 2.4, GY + 2.5 - Math.abs(Math.sin(a * 2)) * 0.25, z + Math.sin(a) * 2.4); }
    lit.push(geoAt(new THREE.PlaneGeometry(2.4, 0.6), x, GY + 1.0, z + 1.52, '#FFFFFF'));
  }
  const [lx, lz] = sdToXZ(-58, -34);
  for (let i = 0; i < 9; i++) karst(solid, lx + cR(-5, 5), lz + cR(-5, 5), cR(1.8, 3.2), cR(1.5, 3.2), cPick(['#6E6A64', '#7B766F', '#625E59']));
  for (let i = 0; i < 6; i++) solid.push(geoAt(new THREE.CylinderGeometry(0.95 - i * 0.05, 1.0 - i * 0.05, 1.6, 16), lx, GY + 2.6 + i * 1.6, lz, i % 2 ? '#D9473C' : '#F4F1EA'));
  solid.push(geoAt(new THREE.CylinderGeometry(1.05, 1.05, 0.2, 16), lx, GY + 12.3, lz, '#2B2F36'));
  solid.push(geoAt(new THREE.ConeGeometry(0.85, 1.0, 16), lx, GY + 14.0, lz, '#2B2F36'));
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.1, 16), new THREE.MeshBasicMaterial({ color: '#FFF6D8' })); lamp.position.set(lx, GY + 12.95, lz); G.add(lamp);
  const beamTex = canvasTex(32, 128, (g) => { const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,245,210,.7)'); gr.addColorStop(1, 'rgba(255,245,210,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 128); });
  const beam = new THREE.Group(); beam.position.set(lx, GY + 12.95, lz); G.add(beam);
  for (const k of [0, Math.PI]) { const b = new THREE.Mesh(new THREE.ConeGeometry(2.6, 34, 16, 1, true).translate(0, -17, 0).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); b.rotation.y = k; beam.add(b); }
  for (let i = 0; i < 18; i++) { const s = cR(-150, 150), d = cR(-150, -70), [x, z] = sdToXZ(s, d); karst(greens, x, z, cR(4, 9), cR(10, 24), cPick(['#557A49', '#4D7044', '#647F55'])); }
  // fishing boats: blue hull with a red band, a little cabin, bobbing and drifting
  const boats = [];
  for (let i = 0; i < 6; i++) {
    const s = cR(-70, 70), d = cR(-70, -40), [x, z] = sdToXZ(s, d);
    const g = new THREE.Group(); g.position.set(x, GY - 0.1, z); g.rotation.y = cR(0, Math.PI * 2); G.add(g);
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.7, 5.6, 8, 1).rotateZ(Math.PI / 2).scale(1, 0.55, 1), new THREE.MeshStandardMaterial({ color: '#2F6FB3', roughness: 0.6 })); hull.position.y = 0.4; hull.castShadow = true; g.add(hull);
    const band = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.15, 1.75), new THREE.MeshStandardMaterial({ color: '#C8383A', roughness: 0.6 })); band.position.y = 0.95; g.add(band);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.2), new THREE.MeshStandardMaterial({ color: '#F1EDE4', roughness: 0.7 })); cab.position.set(-0.6, 1.5, 0); g.add(cab);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshBasicMaterial({ color: '#D9302C', side: THREE.DoubleSide })); flag.position.set(-0.6, 2.6, 0.3); g.add(flag);
    boats.push({ g, ph: cR(0, 6), sp: cR(-0.25, 0.25) });
  }
  mergedTo(G, solid, vmat({ roughness: 0.8 }));
  mergedTo(G, greens, vmat({ roughness: 0.95 }));
  const litOn = nightBits(G, lit, new THREE.Color(2.2, 1.55, 0.75));
  const strings = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(hutLights, 3)), new THREE.PointsMaterial({ map: dotTex, color: new THREE.Color(2.6, 1.9, 1.0), size: 5, sizeAttenuation: false, transparent: true, depthWrite: false }));
  G.add(strings);
  const boatLights = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(boats.length * 3, 3)), new THREE.PointsMaterial({ map: dotTex, color: new THREE.Color(2.6, 2.1, 1.2), size: 6, sizeAttenuation: false, transparent: true, depthWrite: false }));
  boatLights.frustumCulled = false; G.add(boatLights);
  // moonlight on the water at night
  const glintTex = canvasTex(64, 512, (g) => { for (let i = 0; i < 260; i++) { const y = cR(0, 512), spread = 6 + (y / 512) * 26, x = 32 + cR(-1, 1) * spread * cr(); g.fillStyle = `rgba(255,246,214,${cR(0.25, 0.9) * (0.4 + y / 900)})`; g.fillRect(x, y, cR(3, 10), 1.5); } });
  glintTex.wrapT = THREE.RepeatWrapping;
  const glint = new THREE.Mesh(new THREE.PlaneGeometry(9, 70).rotateX(-Math.PI / 2).rotateY(Math.PI / 4), new THREE.MeshBasicMaterial({ map: glintTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  { const [gx, gz] = sdToXZ(0, -66); glint.position.set(gx, GY - 0.1, gz); } G.add(glint);
  const gulls = [0, 1, 2, 3, 4, 5].map((i) => ({ ...flyer(G, '#ECEFF2', 0.9), r: cR(14, 26), cx: cR(-30, 20), cz: cR(-50, -30), y: cR(8, 13), ph: i * 1.1, sp: cR(0.15, 0.25) }));
  return {
    update(dt, t) {
      seaTex.offset.x += dt * 0.006; seaTex.offset.y += dt * 0.004; glintTex.offset.y = (t * 0.03) % 1;
      for (const f of foams) { const k = (Math.sin(t * 0.6 + f.ph) + 1) / 2; f.m.position.set(-k * 1.4, 0, -k * 1.4); f.m.material.opacity = 0.25 + 0.75 * (1 - k); }
      const p = boatLights.geometry.attributes.position;
      boats.forEach((b, i) => { b.g.position.y = GY - 0.12 + Math.sin(t * 1.2 + b.ph) * 0.08; b.g.rotation.z = Math.sin(t * 0.9 + b.ph) * 0.05; b.g.rotation.y += b.sp * dt * 0.05; p.setXYZ(i, b.g.position.x, b.g.position.y + 2.2, b.g.position.z); });
      p.needsUpdate = true;
      beam.rotation.y = t * 0.6;
      for (const f of gulls) { const a = t * f.sp + f.ph; f.g.position.set(f.cx + Math.cos(a) * f.r, f.y + Math.sin(a * 2) * 0.6, f.cz + Math.sin(a) * f.r); f.g.rotation.y = -a; const flap = Math.sin(t * 6 + f.ph) * 0.45; f.wings[0].rotation.z = flap; f.wings[1].rotation.z = -flap; }
    },
    night(on) {
      beam.visible = on; strings.visible = on; boatLights.visible = on; glint.visible = on; if (litOn) litOn(on);
      lamp.material.color.set(on ? new THREE.Color(3, 2.7, 1.8) : '#FFF6D8');
      sea.material.color.set(on ? '#7C93B8' : '#FFFFFF'); sand.material.color.set(on ? '#8C93A8' : '#FFFFFF');
      shallow.material.opacity = on ? 0.14 : 0.45;
      for (const f of gulls) f.g.visible = !on;
    },
  };
}
