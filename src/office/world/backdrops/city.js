// The city backdrop: street grid, buildings, rooftops, lamps and traffic.
import * as THREE from 'three';
import { state } from '../../core/state.js';
import { HQ } from '../../core/env.js';
import { canvasTex, mat } from '../../scene/blocks.js';
import { BULB_OFF, GY, bollards, boxAt, cI, cPick, cR, colorize, cr, mergeAll, mergedTo, vmat } from '../terrace.js';
import { buildStreetLife } from './street-life.js';
import { buildShops, officeMiddle } from './shops.js';

export let dotTex;
export let poolTex;
/* city around the terrace: a street grid, buildings at real floor scale (3 units a floor) with mostly dark windows and a
   few lit ones, rooftop clutter, lamps with pools of light, street life (street-life.js), and a blue haze that swallows
   the far blocks.
   Bodies, roofs, clutter and lamps are merged per material, so the whole city costs a handful of draw calls.
   A seeded random keeps the same skyline on every load. */
export function buildCity(G) {
  state.envSeed = 20261026;
  const STREET_W = 4.4, BLOCK = 15, FH = 3.0, BW = 1.9;
  // asphalt: fine grain, a few patches and cracks, tiled every 5 m (the colour, day or night, multiplies it)
  const asphalt = canvasTex(256, 256, (g) => {
    g.fillStyle = '#E4E4E4'; g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 9000; k++) { const v = 180 + Math.floor(cr() * 75); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(cr() * 256, cr() * 256, 1 + cr() * 1.5, 1 + cr() * 1.5); }
    for (let k = 0; k < 5; k++) { g.fillStyle = 'rgba(0,0,0,.07)'; g.beginPath(); g.ellipse(cr() * 256, cr() * 256, 18 + cr() * 40, 10 + cr() * 25, cr() * 3, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1;
    for (let k = 0; k < 4; k++) { let x = cr() * 256, y = cr() * 256; g.beginPath(); g.moveTo(x, y); for (let n = 0; n < 6; n++) { x += (cr() - 0.5) * 30; y += (cr() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
  });
  asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping; asphalt.repeat.set(64, 64); asphalt.anisotropy = 8;
  const street = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), mat('#1B1F27', { roughness: 0.92, map: asphalt }));
  street.rotation.x = -Math.PI / 2; street.position.y = GY; street.receiveShadow = true; G.add(street);
  const XS = [], ZS = [];
  // (three more rows in front than the camera usually sees: a low photo looks out over them)
  for (let k = -6; k <= 4; k++) { XS.push(18 + k * BLOCK); ZS.push(16.2 + k * BLOCK); }
  // The office's own superblock (terrace + its sidewalks): no streets or buildings inside.
  // (headquarters reaches a block further forward: its superblock takes the next street in too)
  const SB = { x0: -12 + STREET_W / 2, x1: 18 - STREET_W / 2, z0: -13.8 + STREET_W / 2, z1: (HQ ? 31.2 : 16.2) - STREET_W / 2 };
  const inSB = (x, z) => x > SB.x0 && x < SB.x1 && z > SB.z0 && z < SB.z1;

  /* facade styles: a one-floor, one-bay module (day) and a 32 x 64 cell atlas of lit windows (night) */
  const FACADES = [
    { win: [0.05, 0.3, 0.95, 0.95], glass: ['#B8D3E0', '#2A4458'], wall: '#DCE3E8', rough: 0.3, metal: 0.45, strips: true },
    { win: [0.28, 0.33, 0.72, 0.84], glass: ['#9EB3C4', '#232D38'], wall: '#F4F1EB', rough: 0.88, metal: 0, frame: '#FFFFFF' },
    { win: [0.25, 0.3, 0.75, 0.8], glass: ['#94A9BA', '#1F252C'], wall: '#FFFFFF', rough: 0.92, metal: 0, brick: true, frame: '#E9E2D6' },
    { win: [0.12, 0.3, 0.88, 0.88], glass: ['#AFC6D6', '#263441'], wall: '#EFEFEF', rough: 0.7, metal: 0.05, balcony: true },
  ];
  const FACADE_TINTS = [['#86A9BC', '#6F92A8', '#93ADA9', '#647F96'], ['#CFC8BC', '#BDB6AA', '#D8D1C3', '#ADA79B'], ['#A4573F', '#904B39', '#B26549', '#7D4535'], ['#DCD8D0', '#C3CACF', '#E4DED2', '#A3AEB6']];
  const buildingMats = [];
  const styleMats = FACADES.map((st) => {
    const base = canvasTex(64, 64, (g) => {
      const [x0, y0, x1, y1] = st.win, X = (f) => f * 64, Y = (f) => (1 - f) * 64;
      g.fillStyle = st.wall; g.fillRect(0, 0, 64, 64);
      if (st.brick) { g.fillStyle = 'rgba(0,0,0,.08)'; for (let y = 2; y < 64; y += 5) g.fillRect(0, y, 64, 1); }
      if (st.strips) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, Y(0.3), 64, Y(0) - Y(0.3)); }
      const gr = g.createLinearGradient(0, Y(y1), 0, Y(y0)); gr.addColorStop(0, st.glass[0]); gr.addColorStop(0.45, st.glass[1]); gr.addColorStop(1, st.glass[1]);
      g.fillStyle = gr; g.fillRect(X(x0), Y(y1), X(x1) - X(x0), Y(y0) - Y(y1));
      if (st.frame) { g.strokeStyle = st.frame; g.lineWidth = 2; g.strokeRect(X(x0), Y(y1), X(x1) - X(x0), Y(y0) - Y(y1)); g.fillStyle = st.frame; g.fillRect(X(x0) - 2, Y(y0), X(x1) - X(x0) + 4, 3); }
      if (st.strips) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(31, Y(y1), 2, Y(y0) - Y(y1)); g.fillRect(0, Y(y1), 2, Y(y0) - Y(y1)); }
      if (st.balcony) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, Y(0.3), 64, 4); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(0, Y(0.3) - 2, 64, 2); g.fillStyle = 'rgba(40,46,54,.55)'; g.fillRect(0, Y(0.5), 64, 2); }
    });
    base.wrapS = base.wrapT = THREE.RepeatWrapping;
    const lit = canvasTex(512, 1024, (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, 512, 1024);
      const [x0, y0, x1, y1] = st.win;
      for (let r = 0; r < 64; r++) {
        const kind = cr(), p = kind < 0.6 ? 0.05 : kind < 0.88 ? 0.22 : 0.55;
        let run = 0;
        for (let c = 0; c < 31; c++) {
          let on = cr() < p;
          if (st.strips) { if (run > 0) { on = true; run--; } else if (on) run = cI(1, 5); }
          if (!on) continue;
          const k = cr(), col = k < 0.68 ? '#FFD39A' : k < 0.84 ? '#FFF1DA' : k < 0.95 ? '#BCD6FF' : '#7FA8FF';
          g.globalAlpha = k >= 0.95 ? 0.4 : cR(0.35, 0.85);
          g.fillStyle = col;
          const cx = c * 16, cy = (63 - r) * 16;
          g.fillRect(cx + x0 * 16, cy + (1 - y1) * 16, (x1 - x0) * 16, (y1 - y0) * 16);
        }
      }
      g.globalAlpha = 1;
    });
    lit.wrapS = lit.wrapT = THREE.RepeatWrapping; lit.repeat.set(1 / 32, 1 / 64);
    const m = new THREE.MeshStandardMaterial({ map: base, emissiveMap: lit, emissive: '#FFFFFF', emissiveIntensity: 0, vertexColors: true, roughness: st.rough, metalness: st.metal });
    buildingMats.push(m);
    return m;
  });
  // Shop fronts: eight designs in one strip (lit glass, awning, a sign), shown on street-facing ground floors.
  const SHOP_N = 8;
  const shopTex = canvasTex(1024, 128, (g) => {
    const signs = ['#FF5D73', '#3DDC84', '#F2B544', '#4FC3F7', '#B388FF', '#FF8A3D', '#E0E0E0', '#64FFDA'];
    for (let i = 0; i < SHOP_N; i++) {
      const x = i * 128;
      g.fillStyle = '#1C2026'; g.fillRect(x, 0, 128, 128);
      const gr = g.createLinearGradient(0, 44, 0, 128); gr.addColorStop(0, '#FFE7B8'); gr.addColorStop(1, '#C98E4A');
      g.fillStyle = gr; g.fillRect(x + 8, 46, 112, 82);
      g.fillStyle = 'rgba(0,0,0,.35)'; for (let k = 1; k < 4; k++) g.fillRect(x + 8 + k * 28, 46, 3, 82);
      g.fillStyle = signs[i]; g.fillRect(x + 14, 10, 100, 24);
      g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(x + 26, 19, 76, 6);
    }
  });
  const shopM = new THREE.MeshStandardMaterial({ map: shopTex, emissiveMap: shopTex, emissive: '#FFFFFF', emissiveIntensity: 0, roughness: 0.6 });
  buildingMats.push(shopM);

  const parts = FACADES.map(() => []), roofs = [], clutter = [], shops = [], fronts = [], greens = [], slabs = [], lanes = [], beaconPos = [];
  const parks = [], solids = [];   // whole blocks left as parks, and every building's footprint (for the street life)
  const trees = [], plazas = [];   // the parks' trees ([x, z, size]) and paved squares ([x0, x1, z0, z1]), for the street life too
  // The parks near the office, nearest first (the order street-life.js puts them in): the third and fourth have a paved
  // square in the middle for the park life (street-park.js); the nearest two keep their lawns (the bánh mì cart and the
  // trà đá stall are on them).
  const wholePark = (cx, cz) => { const depth = cx + cz, side = cx - cz; return !(depth < -20) && !(Math.abs(side) > 27 && depth < 6) && !(depth >= 6 && Math.abs(side) > 34); };
  const OM = officeMiddle(), toOM = ([x0, x1, z0, z1]) => Math.hypot(OM[0] - THREE.MathUtils.clamp(OM[0], x0, x1), OM[1] - THREE.MathUtils.clamp(OM[1], z0, z1));
  const squareAt = new Set((() => {
    const all = [];
    for (let i = 0; i < XS.length - 1; i++) for (let j = 0; j < ZS.length - 1; j++) {
      const r = [XS[i] + STREET_W / 2, XS[i + 1] - STREET_W / 2, ZS[j] + STREET_W / 2, ZS[j + 1] - STREET_W / 2];
      if (!inSB((r[0] + r[1]) / 2, (r[2] + r[3]) / 2) && wholePark((r[0] + r[1]) / 2, (r[2] + r[3]) / 2)) all.push(r);
    }
    return all.filter((r) => toOM(r) < 30).sort((a, b) => toOM(a) - toOM(b)).slice(2, 4).map((r) => `${r[0].toFixed(1)},${r[2].toFixed(1)}`);
  })());
  function addBox(style, x, z, w, d, y0, h, tint, offU, offV) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, n = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(n.getY(i)) > 0.5) { uv.setXY(i, 31.02, 0.02); continue; }
      const bays = Math.max(1, Math.round((Math.abs(n.getX(i)) > 0.5 ? d : w) / BW));
      uv.setXY(i, offU + uv.getX(i) * bays, offV + y0 / FH + uv.getY(i) * (h / FH));
    }
    parts[style].push(colorize(g.translate(x, GY + y0 + h / 2, z), tint));
  }
  function rooftop(x, z, w, d, y, floors) {
    roofs.push(boxAt(w + 0.24, 0.4, d + 0.24, x, GY + y + 0.2, z, '#3B4049'));
    roofs.push(boxAt(w - 0.5, 0.05, d - 0.5, x, GY + y + 0.42, z, '#4A505A'));
    const top = GY + y + 0.44, sp = (a) => cR(-a / 2 + 0.7, a / 2 - 0.7);
    for (let i = cI(1, Math.min(5, Math.floor((w * d) / 12) + 1)); i > 0; i--) clutter.push(boxAt(0.9, 0.62, 0.9, x + sp(w), top + 0.31, z + sp(d), '#8E949C'));
    if (cr() < 0.4 && w > 3.5 && d > 3.5) clutter.push(boxAt(2.0, 1.8, 1.6, x + sp(w) * 0.6, top + 0.9, z + sp(d) * 0.6, '#5C636D'));
    if (cr() < 0.3 && w > 3 && d > 3) {
      const tx = x + sp(w) * 0.7, tz = z + sp(d) * 0.7;
      clutter.push(colorize(new THREE.CylinderGeometry(0.75, 0.75, 1.5, 12).translate(tx, top + 1.55, tz), '#6E5B4B'));
      clutter.push(colorize(new THREE.ConeGeometry(0.8, 0.45, 12).translate(tx, top + 2.52, tz), '#5A4A3D'));
      for (const [a, b] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) clutter.push(boxAt(0.08, 0.8, 0.08, tx + a, top + 0.4, tz + b, '#3B3F45'));
    }
    if (floors >= 8 && cr() < 0.55) {
      const h = cR(2.5, 5), ax = x + sp(w) * 0.5, az = z + sp(d) * 0.5;
      clutter.push(boxAt(0.1, h, 0.1, ax, top + h / 2, az, '#2E3238'));
      beaconPos.push(ax, top + h + 0.1, az);
    }
  }
  function tree(x, z, s = 1) {
    trees.push([x, z, s]);
    greens.push(colorize(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 1.4 * s, 6).translate(x, GY + 0.12 + 0.7 * s, z), '#5B4433'));
    const c = cPick(['#3E6B3A', '#4C7A3F', '#36603A', '#58834A']);
    greens.push(colorize(new THREE.IcosahedronGeometry(0.95 * s, 1).translate(x, GY + 0.12 + 1.9 * s, z), c));
    greens.push(colorize(new THREE.IcosahedronGeometry(0.7 * s, 1).translate(x + 0.4 * s, GY + 0.12 + 2.5 * s, z - 0.2 * s), c));
  }
  function park(x0, x1, z0, z1, square = false) {
    greens.push(boxAt(x1 - x0, 0.06, z1 - z0, (x0 + x1) / 2, GY + 0.15, (z0 + z1) / 2, '#2E4630'));
    // a paved square: light tiles with a darker edge, the trees moved out onto the lawn round it (the same random numbers
    // drawn, so the rest of the city stays as it was)
    const P = square ? [x0 + 1.3, x1 - 1.3, z0 + 1.3, z1 - 1.3] : null;
    if (P) {
      const cx = (P[0] + P[1]) / 2, cz = (P[2] + P[3]) / 2, w = P[1] - P[0], d = P[3] - P[2];
      greens.push(boxAt(w, 0.02, d, cx, GY + 0.18, cz, '#BDB4A3'));
      for (let k = 1; k < 6; k++) { greens.push(boxAt(0.025, 0.004, d - 0.2, P[0] + (w * k) / 6, GY + 0.191, cz, '#A69D8C'), boxAt(w - 0.2, 0.004, 0.025, cx, GY + 0.191, P[2] + (d * k) / 6, '#A69D8C')); }
      for (const [bw, bd, bx, bz] of [[w, 0.1, cx, P[2] + 0.05], [w, 0.1, cx, P[3] - 0.05], [0.1, d, P[0] + 0.05, cz], [0.1, d, P[1] - 0.05, cz]]) greens.push(boxAt(bw, 0.03, bd, bx, GY + 0.19, bz, '#8E877B'));
      plazas.push(P);
    }
    for (let i = cI(3, 7); i > 0; i--) {
      let x = cR(x0 + 1, x1 - 1), z = cR(z0 + 1, z1 - 1);
      const s = cR(0.8, 1.25);
      if (P && x > P[0] - 0.3 && x < P[1] + 0.3 && z > P[2] - 0.3 && z < P[3] + 0.3) {
        const gaps = [x - P[0], P[1] - x, z - P[2], P[3] - z], k = gaps.indexOf(Math.min(...gaps));
        if (k === 0) x = x0 + 0.65; else if (k === 1) x = x1 - 0.65; else if (k === 2) z = z0 + 0.65; else z = z1 - 0.65;
      }
      tree(x, z, s);
    }
  }
  function building(x0, x1, z0, z1, floors, faces) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    solids.push([x0, x1, z0, z1, GY + floors * FH]);   // (its top: for the street's shade on a hot day)
    const style = floors >= 9 ? (cr() < 0.7 ? 0 : 3) : cPick([1, 2, 3, 1, 2]), tint = cPick(FACADE_TINTS[style]);
    const offU = cI(0, 30), offV = cI(0, 63);
    const n1 = floors >= 8 && Math.min(w, d) > 5.5 ? Math.max(3, Math.round(floors * cR(0.4, 0.62))) : floors;
    addBox(style, cx, cz, w, d, 0, n1 * FH, tint, offU, offV);
    let tx = cx, tz = cz, tw = w, td = d;
    if (n1 < floors) {
      rooftop(cx, cz, w, d, n1 * FH, 0);
      tw = w * cR(0.55, 0.75); td = d * cR(0.55, 0.75); tx = cx + cR(-1, 1) * (w - tw) / 2; tz = cz + cR(-1, 1) * (d - td) / 2;
      addBox(style, tx, tz, tw, td, n1 * FH, (floors - n1) * FH, tint, offU, offV);
    }
    rooftop(tx, tz, tw, td, floors * FH, floors);
    // ground-floor shops on street-facing sides the camera sees (+x, +z)
    const shop = (len, place, front) => {
      const plain = len >= 3 && cr() >= 0.35;
      let g = null;
      if (plain) {
        const i = cI(0, SHOP_N - 1); g = new THREE.PlaneGeometry(len - 0.6, FH * 0.82); const uv = g.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / SHOP_N);
        g = place(g);
      }
      fronts.push({ ...front, len, plain: g });
    };
    if (faces.px) shop(d, (g) => g.rotateY(Math.PI / 2).translate(x1 + 0.03, GY + FH * 0.41, cz), { dir: 'px', x: x1, z: cz });
    if (faces.pz) shop(w, (g) => g.translate(cx, GY + FH * 0.41, z1 + 0.03), { dir: 'pz', x: cx, z: z1 });
  }
  function fillBlock(x0, x1, z0, z1) {
    slabs.push(boxAt(x1 - x0, 0.12, z1 - z0, (x0 + x1) / 2, GY + 0.06, (z0 + z1) / 2, '#8D939B'));
    const m = 1.3, bx0 = x0 + m, bx1 = x1 - m, bz0 = z0 + m, bz1 = z1 - m, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const depth = cx + cz, side = cx - cz;
    const back = depth < -20, sideways = Math.abs(side) > 27 && depth < 6, front = depth >= 6 && Math.abs(side) > 34;
    if (!back && !sideways && !front) { park(bx0, bx1, bz0, bz1, squareAt.has(`${x0.toFixed(1)},${z0.toFixed(1)}`)); parks.push([x0, x1, z0, z1]); return; }   // keep the view of the office clear
    const far = Math.max(0, -depth - 20);
    const lots = [], gap = 0.5, split = cr();
    if (split < 0.25) lots.push([bx0, bx1, bz0, bz1]);
    else if (split < 0.6) { const mx = cR(bx0 + 3, bx1 - 3); lots.push([bx0, mx - gap / 2, bz0, bz1], [mx + gap / 2, bx1, bz0, bz1]); }
    else { const mx = (bx0 + bx1) / 2, mz = (bz0 + bz1) / 2; lots.push([bx0, mx - gap / 2, bz0, mz - gap / 2], [mx + gap / 2, bx1, bz0, mz - gap / 2], [bx0, mx - gap / 2, mz + gap / 2, bz1], [mx + gap / 2, bx1, mz + gap / 2, bz1]); }
    for (const [a, b, c, d] of lots) {
      if (cr() < 0.1) { park(a, b, c, d); continue; }
      const floors = front ? 1 : far < 12 ? cI(2, 4) : cI(3, 5) + Math.floor(Math.min(10, (far - 12) * 0.2)) + (cr() < 0.16 ? cI(5, 11) : 0);
      building(a, b, c, d, floors, { px: Math.abs(b - bx1) < 0.01, pz: Math.abs(d - bz1) < 0.01 });
    }
  }
  for (let i = 0; i < XS.length - 1; i++) for (let j = 0; j < ZS.length - 1; j++) {
    const x0 = XS[i] + STREET_W / 2, x1 = XS[i + 1] - STREET_W / 2, z0 = ZS[j] + STREET_W / 2, z1 = ZS[j + 1] - STREET_W / 2;
    if (inSB((x0 + x1) / 2, (z0 + z1) / 2)) continue;
    fillBlock(x0, x1, z0, z1);
  }
  const [mx, mz] = officeMiddle(), nearest = fronts.filter((f) => f.len >= 7.5).sort((a, b) => Math.hypot(a.x - mx, a.z - mz) - Math.hypot(b.x - mx, b.z - mz)).slice(0, 3);
  const stores = buildShops(G, nearest);
  for (const f of fronts) if (f.plain && !f.store) shops.push(f.plain);
  slabs.push(boxAt(SB.x1 - SB.x0, 0.12, SB.z1 - SB.z0, (SB.x0 + SB.x1) / 2, GY + 0.06, (SB.z0 + SB.z1) / 2, '#8D939B'));
  // lane dashes (zebras and stop lines come with the street life, below)
  const zMin = ZS[0] - 6, zMax = ZS[ZS.length - 1] + 6, xMin = XS[0] - 6, xMax = XS[XS.length - 1] + 6;
  for (const x of XS) for (let z = zMin; z < zMax; z += 3) if (!inSB(x, z)) lanes.push(boxAt(0.12, 0.01, 1.4, x, GY + 0.01, z, '#6B6F76'));
  for (const z of ZS) for (let x = xMin; x < xMax; x += 3) if (!inSB(x, z)) lanes.push(boxAt(1.4, 0.01, 0.12, x, GY + 0.01, z, '#6B6F76'));

  /* street lamps on both sidewalks, every 12 units, with a pool of light under each */
  const lampGeo = [], bulbGeo = [], pools = [];
  const lamp = (x, z, ax, az) => {
    if (x > -9.4 && x < 12.6 && z > -7.2 && z < 11.2) return;   // not on the terrace
    lampGeo.push(colorize(new THREE.CylinderGeometry(0.06, 0.08, 3.8, 6).translate(x, GY + 1.9, z), '#2B2F36'));
    lampGeo.push(boxAt(ax ? 1.0 : 0.08, 0.07, az ? 1.0 : 0.08, x + ax * 0.45, GY + 3.75, z + az * 0.45, '#2B2F36'));
    bulbGeo.push(boxAt(ax ? 0.4 : 0.18, 0.06, az ? 0.4 : 0.18, x + ax * 0.85, GY + 3.68, z + az * 0.85, '#FFFFFF'));
    pools.push(new THREE.PlaneGeometry(4.8, 4.8).rotateX(-Math.PI / 2).translate(x + ax * 1.0, GY + 0.14, z + az * 1.0));
  };
  for (const x of XS) for (let z = zMin + 4, k = 0; z < zMax; z += 9, k++) { if (!inSB(x, z)) { if (k % 2) lamp(x - STREET_W / 2 - 0.5, z, 1, 0); else lamp(x + STREET_W / 2 + 0.5, z, -1, 0); } }
  for (const z of ZS) for (let x = xMin + 4, k = 0; x < xMax; x += 9, k++) { if (!inSB(x, z)) { if (k % 2) lamp(x, z - STREET_W / 2 - 0.5, 0, 1); else lamp(x, z + STREET_W / 2 + 0.5, 0, -1); } }

  /* traffic, the lights, the bus stop and people on the pavements (street-life.js) */
  const life = buildStreetLife(G, { XS, ZS, STREET_W, SB, shops: nearest, parks, solids, trees, plazas, faces: fronts });
  lanes.push(...life.marks);
  FACADES.forEach((_, i) => mergedTo(G, parts[i], styleMats[i]));
  mergedTo(G, roofs, vmat({ roughness: 0.9 }));
  mergedTo(G, clutter, vmat({ roughness: 0.7, metalness: 0.15 }));
  mergedTo(G, greens, vmat({ roughness: 0.95 }));
  const slabMesh = mergedTo(G, slabs, vmat({ roughness: 0.92 }), false);   // sidewalks: light concrete by day, dark at night
  mergedTo(G, lanes, new THREE.MeshBasicMaterial({ vertexColors: true }), false);
  if (shops.length) { const o = new THREE.Mesh(mergeAll(shops), shopM); G.add(o); }
  mergedTo(G, lampGeo, vmat({ roughness: 0.4, metalness: 0.5 }));
  const lampBulbM = new THREE.MeshBasicMaterial({ color: BULB_OFF.clone() }); bollards.push(lampBulbM);
  mergedTo(G, bulbGeo, lampBulbM, false);
  const poolMesh = new THREE.Mesh(mergeAll(pools), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
  poolMesh.renderOrder = 1; G.add(poolMesh);
  const beacons = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(beaconPos, 3)),
    new THREE.PointsMaterial({ map: dotTex, color: new THREE.Color(3, 0.35, 0.3), size: 7, sizeAttenuation: false, transparent: true, depthWrite: false }));
  G.add(beacons);

  function updateCity(dt, t) {
    life.update(dt, t); stores.update();
    beacons.material.opacity = (t % 1.6) < 0.25 ? 1 : 0.18;
  }
  function setCityNight(on) { street.material.color.set(on ? '#1B1F27' : '#5B616A'); for (const m of buildingMats) m.emissiveIntensity = on ? 0.9 : 0; slabMesh.material.color.setScalar(on ? 0.33 : 1); poolMesh.visible = on; life.night(on); stores.night(on); }
  // street: for people from the office going out (outings.js): the way on foot, the GrabFood rider, the shops' doors
  return { update: updateCity, night: setCityNight, street: { ...life.street, doors: stores.doors } };
}

export function setup() {
  dotTex = canvasTex(32, 32, (g) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,.7)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); });
  poolTex = canvasTex(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 2, 64, 64, 63); r.addColorStop(0, 'rgba(255,196,120,.34)'); r.addColorStop(0.45, 'rgba(255,170,90,.12)'); r.addColorStop(1, 'rgba(255,160,80,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
}
