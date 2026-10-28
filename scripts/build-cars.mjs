#!/usr/bin/env node
// Builds public/assets/vehicles/cars.json from Kenney's Car Kit (CC0, https://kenney.nl/assets/car-kit): the car
// bodies the city's traffic uses, already turned nose along +x and split in two, the paint (drawn white, so each car
// can be painted its own colour) and the rest (glass, lights, bumpers, tyres) with its colours baked in from the kit's
// palette texture. The wheels are baked into the rest, where the kit puts them.
//
//   node scripts/build-cars.mjs "<Car Kit folder>/Models/GLB format"
//
// The paint is found by the kit's palette: an 8 × 4 grid of colour cells, each a light-to-dark gradient. The body's
// paint is the saturated cell it uses most; its triangles keep the gradient as a grey (so a car painted any colour still
// has its highlights), and lights, glass and trim in other cells keep their colours. The wheel is stored once, with
// where each car has its four. Output: positions int16 (1/2000 m), normals int8, colours bytes, indices uint16, base64.
// Re-run it only to change which models are used.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2];
if (!SRC || !fs.existsSync(path.join(SRC, 'sedan.glb'))) { console.error('usage: node scripts/build-cars.mjs "<Car Kit>/Models/GLB format"'); process.exit(1); }
const MODELS = ['sedan', 'sedan-sports', 'hatchback-sports', 'suv', 'suv-luxury', 'truck', 'van', 'delivery', 'taxi', 'ambulance', 'firetruck'];
const SCALE = 1.2;   // the kit's cars are 1.5 m wide: a little bigger, to fill a lane

const png = PNG.sync.read(fs.readFileSync(path.join(SRC, 'Textures', 'colormap.png')));
const texel = (u, v) => {
  const x = Math.min(png.width - 1, Math.max(0, Math.floor(u * png.width))), y = Math.min(png.height - 1, Math.max(0, Math.floor(v * png.height)));
  const i = (y * png.width + x) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]];
};
const cellOf = (u, v) => `${Math.min(7, Math.floor(u * 8))},${Math.min(3, Math.floor(v * 4))}`;
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function readGlb(file) {
  const b = fs.readFileSync(file), jsonLen = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + jsonLen).toString());
  const binStart = 20 + jsonLen + 8, bin = b.subarray(binStart, binStart + b.readUInt32LE(20 + jsonLen));
  const read = (k) => {
    const a = j.accessors[k], v = j.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const T = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType];
    const off = (v.byteOffset || 0) + (a.byteOffset || 0), stride = v.byteStride || n * T.BYTES_PER_ELEMENT, out = new Float64Array(a.count * n);
    const dv = new DataView(bin.buffer, bin.byteOffset + off);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < n; c++) {
      const o = i * stride + c * T.BYTES_PER_ELEMENT;
      out[i * n + c] = T === Float32Array ? dv.getFloat32(o, true) : T === Uint16Array ? dv.getUint16(o, true) : T === Uint32Array ? dv.getUint32(o, true) : dv.getUint8(o);
    }
    return out;
  };
  return { j, read };
}
// a node's transform as a function of a point (translation, rotation, scale; the kit's nodes have no parents)
function nodeXf(n) {
  const [tx, ty, tz] = n.translation || [0, 0, 0], [qx, qy, qz, qw] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1];
  const rot = (x, y, z) => {   // q * v * q^-1
    const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
    return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
  };
  return { point: (x, y, z) => { const [a, b, c] = rot(x * sx, y * sy, z * sz); return [a + tx, b + ty, c + tz]; }, normal: (x, y, z) => rot(x, y, z) };
}
// the kit's +z forward, y up → ours: +x forward (a quarter turn), scaled
const ours = ([x, y, z]) => [z * SCALE, y * SCALE, -x * SCALE];
const oursN = ([x, y, z]) => [z, y, -x];

const out = {};
let wheelMesh = null;
for (const name of MODELS) {
  const { j, read } = readGlb(path.join(SRC, `${name}.glb`));
  const tris = [], wheels = [];   // tris: { p: [[x,y,z]×3], n: [[…]×3], c: [r,g,b], cell, body }
  for (const node of j.nodes) {
    if (node.mesh == null) continue;
    if (node.name.startsWith('wheel')) {   // where the wheel goes (the mesh itself is kept once, from the first car)
      wheels.push({ t: node.translation || [0, 0, 0], r: node.rotation || [0, 0, 0, 1], s: node.scale || [1, 1, 1] });
      if (!wheelMesh) wheelMesh = { j, read, mesh: node.mesh };
      continue;
    }
    const xf = nodeXf(node), body = node.name === 'body';
    for (const prim of j.meshes[node.mesh].primitives) {
      const P = read(prim.attributes.POSITION), N = read(prim.attributes.NORMAL), UV = read(prim.attributes.TEXCOORD_0), I = prim.indices != null ? read(prim.indices) : [...Array(P.length / 3).keys()];
      for (let t = 0; t < I.length; t += 3) {
        const ids = [I[t], I[t + 1], I[t + 2]];
        const u = ids.reduce((s, k) => s + UV[k * 2], 0) / 3, v = ids.reduce((s, k) => s + UV[k * 2 + 1], 0) / 3;
        tris.push({ p: ids.map((k) => ours(xf.point(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]))), n: ids.map((k) => oursN(xf.normal(N[k * 3], N[k * 3 + 1], N[k * 3 + 2]))), c: texel(u, v), cell: cellOf(u, v), body });
      }
    }
  }
  // the paint: the body's most-used saturated palette cell, by area
  const area = (t) => { const [a, b, c] = t.p, u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; return Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2; };
  const sat = ([r, g, b]) => (Math.max(r, g, b) - Math.min(r, g, b)) / (Math.max(r, g, b) || 1);
  const tally = new Map();
  for (const t of tris) if (t.body && sat(t.c) > 0.35) tally.set(t.cell, (tally.get(t.cell) || 0) + area(t));
  const cell = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const paintTris = tris.filter((t) => t.body && t.cell === cell), rest = tris.filter((t) => !(t.body && t.cell === cell));
  // the kit's glass is pale blue: cars in Vietnam have tinted windows, so the glass goes dark (keeping its shading)
  for (const t of rest) { const [r, g, b] = t.c; if (b > 235 && g > 225 && r > 200) { const k = (r + g + b) / (225 + 242 + 255); t.c = [Math.round(38 * k), Math.round(48 * k), Math.round(60 * k)]; } }
  const mid = paintTris.reduce((s, t) => s + lum(t.c) * area(t), 0) / paintTris.reduce((s, t) => s + area(t), 0);
  for (const t of paintTris) { const g = Math.round(Math.min(255, Math.max(0, (lum(t.c) / mid) * 215))); t.c = [g, g, g]; }   // the gradient, as grey around 0.84
  // two indexed meshes, vertices shared where position, normal and colour all match
  const pack = (list, withColor) => {
    const key = new Map(), pos = [], nrm = [], col = [], idx = [];
    for (const t of list) for (let k = 0; k < 3; k++) {
      const p = t.p[k].map((v) => Math.round(v * 2000)), n = t.n[k].map((v) => Math.round(Math.max(-1, Math.min(1, v)) * 127));
      const id = `${p}|${n}|${withColor ? t.c : ''}`;
      if (!key.has(id)) { key.set(id, pos.length / 3); pos.push(...p); nrm.push(...n); if (withColor) col.push(...t.c); }
      idx.push(key.get(id));
    }
    const b64 = (A) => Buffer.from(A.buffer).toString('base64');
    return { pos: b64(Int16Array.from(pos)), nrm: b64(Int8Array.from(nrm)), ...(withColor ? { col: b64(Uint8Array.from(col)) } : {}), idx: b64(Uint16Array.from(idx)), verts: pos.length / 3 };
  };
  const xs = tris.flatMap((t) => t.p.map((p) => p[0])), ys = tris.flatMap((t) => t.p.map((p) => p[1])), zs = tris.flatMap((t) => t.p.map((p) => p[2]));
  out[name] = { paint: pack(paintTris, true), rest: pack(rest, true), wheels, box: [Math.min(...xs), Math.min(...ys), Math.min(...zs), Math.max(...xs), Math.max(...ys), Math.max(...zs)].map((v) => +v.toFixed(3)) };
  console.log(name.padEnd(17), 'paint cell', cell.padEnd(5), 'tris', String(paintTris.length).padStart(4), '+', String(rest.length).padStart(4), 'box', out[name].box.join(' '));
}
let wheel = null;
{
  const { j, read, mesh } = wheelMesh, wt = [];
  for (const prim of j.meshes[mesh].primitives) {
    const P = read(prim.attributes.POSITION), N = read(prim.attributes.NORMAL), UV = read(prim.attributes.TEXCOORD_0), I = read(prim.indices);
    for (let t = 0; t < I.length; t += 3) {
      const ids = [I[t], I[t + 1], I[t + 2]], u = ids.reduce((s, k) => s + UV[k * 2], 0) / 3, v = ids.reduce((s, k) => s + UV[k * 2 + 1], 0) / 3;
      wt.push({ p: ids.map((k) => [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]]), n: ids.map((k) => [N[k * 3], N[k * 3 + 1], N[k * 3 + 2]]), c: texel(u, v) });
    }
  }
  const key = new Map(), pos = [], nrm = [], col = [], idx = [];
  for (const t of wt) for (let k = 0; k < 3; k++) {
    const p = t.p[k].map((v) => Math.round(v * 2000)), n = t.n[k].map((v) => Math.round(v * 127)), id = `${p}|${n}|${t.c}`;
    if (!key.has(id)) { key.set(id, pos.length / 3); pos.push(...p); nrm.push(...n); col.push(...t.c); }
    idx.push(key.get(id));
  }
  const b64 = (A) => Buffer.from(A.buffer).toString('base64');
  wheel = { pos: b64(Int16Array.from(pos)), nrm: b64(Int8Array.from(nrm)), col: b64(Uint8Array.from(col)), idx: b64(Uint16Array.from(idx)), verts: pos.length / 3 };
}
const file = path.join(ROOT, 'public', 'assets', 'vehicles', 'cars.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify({ source: 'Kenney Car Kit 3.1 (CC0), https://kenney.nl/assets/car-kit', scale: SCALE, models: out, wheel }));
console.log(`${path.relative(ROOT, file)} · ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
