// Thế Giới Di Động (thegioididong.com), as its shops look in Vietnam in 2026: the long yellow sign with the name in black,
// all lower case and leaning forward a little, and the mark beside it (a figure on the move in a circle: "the world" and
// "on the move"), yellow and black the chain's two colours; the glass front with the promotions on it (trả góp 0%, thu
// cũ đổi mới); inside, long white tables of phones on their stands with yellow price tags, the wall of accessories, the
// till in black and yellow at the back; staff in yellow shirts and black trousers; open 8:00–22:00. At the door an
// inflatable dancer ("người hơi") in the chain's colours flails all day, as at phone shops' openings and promotions
// everywhere. When Claude Code on this computer moves to a new version, someone runs down to "lên đời" (people/outings.js).
// None of it is the chain's artwork: the lettering is set here, the mark drawn here. shops.js places it (TGDD).
import * as THREE from 'three';
import { boxAt, colorize, mergeAll, vmat } from '../terrace.js';

export const TG_YELLOW = '#FFD400';
const INK = '#141414', FL = 0.12, CEIL = 2.75, FONT = '"Be Vietnam Pro", system-ui, sans-serif';

/* ---------- the printing: where each thing is in the shop's 1024 × 512 cell ---------- */
const RT = { sign: [0, 0, 1024, 140], band: [0, 140, 1024, 70], posterA: [0, 210, 200, 260], posterB: [200, 210, 200, 260], panel: [400, 210, 420, 110],
  hours: [400, 330, 200, 30], tag: [620, 330, 120, 60], wall: [400, 400, 624, 70] };

// the mark: a figure on the move (a head, a body swept forward, arms flung wide) in a circle, in one colour
function mark(g, cx, cy, s, c) {
  g.save(); g.strokeStyle = c; g.fillStyle = c; g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = s * 0.12; g.beginPath(); g.arc(cx, cy, s, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(cx + s * 0.12, cy - s * 0.46, s * 0.17, 0, Math.PI * 2); g.fill();   // the head
  g.lineWidth = s * 0.17;
  g.beginPath(); g.moveTo(cx + s * 0.02, cy - s * 0.22); g.quadraticCurveTo(cx - s * 0.08, cy + s * 0.12, cx - s * 0.32, cy + s * 0.55); g.stroke();   // the body, then a leg
  g.beginPath(); g.moveTo(cx - s * 0.1, cy + s * 0.18); g.quadraticCurveTo(cx + s * 0.2, cy + s * 0.3, cx + s * 0.28, cy + s * 0.62); g.stroke();   // the other leg
  g.lineWidth = s * 0.13;
  g.beginPath(); g.moveTo(cx - s * 0.62, cy - s * 0.38); g.quadraticCurveTo(cx - s * 0.1, cy - s * 0.12, cx + s * 0.6, cy - s * 0.02); g.stroke();   // the arms, flung wide
  g.restore();
}
// "thegioididong.com": heavy lower case, leaning forward (the way the name is set on its signs), fitted in a width
function name(g, x, y, w, size, c) {
  g.save(); g.fillStyle = c; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.font = `900 ${size}px ${FONT}`;
  const k = Math.min(1, w / g.measureText('thegioididong.com').width);
  g.translate(x, y); g.transform(1, 0, -0.16, 1, 0, 0); g.scale(k, 1);
  g.fillText('thegioididong', 0, 0);
  const tw = g.measureText('thegioididong').width;
  g.font = `800 ${Math.round(size * 0.78)}px ${FONT}`; g.fillText('.com', tw + size * 0.04, size * 0.06);
  g.restore();
}
// a phone, front on: its body, the screen lit, the island at the top
function phone(g, x, y, w, h, body = '#222') {
  g.fillStyle = body; g.beginPath(); g.roundRect(x, y, w, h, w * 0.16); g.fill();
  const sg = g.createLinearGradient(x, y, x + w, y + h); sg.addColorStop(0, '#5B8DEF'); sg.addColorStop(0.5, '#A66CFF'); sg.addColorStop(1, '#FF8A65');
  g.fillStyle = sg; g.beginPath(); g.roundRect(x + w * 0.07, y + w * 0.07, w * 0.86, h - w * 0.14, w * 0.11); g.fill();
  g.fillStyle = '#111'; g.beginPath(); g.roundRect(x + w * 0.36, y + w * 0.12, w * 0.28, w * 0.07, w * 0.04); g.fill();
}
function draw(g, cx, cy, dark) {
  const at = ([x, y, w, h]) => [cx + x, cy + y, w, h];
  // the sign: yellow, the mark in a black ring, the name in black, a dark edge under it
  { const [x, y, w, h] = at(RT.sign);
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = TG_YELLOW; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x, y, w, 12);   // (lit from inside: brighter at the top)
    g.fillStyle = INK; g.fillRect(x, y + h - 9, w, 9);
    mark(g, x + 120, y + h * 0.47, 46, INK);   // (the sign's ends go behind the piers: everything inside them)
    name(g, x + 196, y + h * 0.48, w - 300, 96, INK);
    if (dark) { g.fillStyle = 'rgba(8,10,14,.62)'; g.fillRect(x, y, w, h); }
    g.restore(); }
  // the band along the back wall, over the accessories: yellow, the name again and again
  { const [x, y, w, h] = at(RT.band);
    g.fillStyle = TG_YELLOW; g.fillRect(x, y, w, h); g.fillStyle = INK; g.fillRect(x, y + h - 8, w, 8);
    for (let k = 0; k < 3; k++) { mark(g, x + 40 + k * 340, y + h / 2 - 2, 20, INK); name(g, x + 72 + k * 340, y + h / 2 - 2, 240, 34, INK); } }
  // the promotions on the glass: instalments at 0%, an old phone for a new one
  for (const [r, top, big, under] of [[RT.posterA, 'TRẢ GÓP', '0%', 'Duyệt nhanh 15 phút'], [RT.posterB, 'THU CŨ', 'ĐỔI MỚI', 'Lên đời liền tay']]) {
    const [x, y, w, h] = at(r);
    g.fillStyle = INK; g.fillRect(x + 6, y + 6, w - 12, h - 12);
    g.fillStyle = TG_YELLOW; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 26px ${FONT}`; g.fillText(top, x + w / 2, y + 34, w - 20);
    g.font = `900 ${big.length > 3 ? 34 : 64}px ${FONT}`; g.fillText(big, x + w / 2, y + 84, w - 16);
    phone(g, x + w / 2 - 34, y + 118, 68, 100);
    g.fillStyle = '#FFFFFF'; g.font = `700 15px ${FONT}`; g.fillText(under, x + w / 2, y + h - 26, w - 16);
  }
  // the till's front: black, the mark and the name in yellow, THU NGÂN
  { const [x, y, w, h] = at(RT.panel);
    g.fillStyle = INK; g.fillRect(x, y, w, h); g.fillStyle = TG_YELLOW; g.fillRect(x, y + h - 10, w, 10);
    mark(g, x + 52, y + h * 0.45, 30, TG_YELLOW); name(g, x + 96, y + h * 0.4, w - 120, 46, TG_YELLOW);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'left'; g.font = `800 17px ${FONT}`; g.fillText('THU NGÂN', x + 98, y + h * 0.78); }
  // the hours on the door; a price tag (the tables' little ones); the wall's words
  { const [x, y, w, h] = at(RT.hours);
    g.fillStyle = TG_YELLOW; g.beginPath(); g.roundRect(x + 2, y + 2, w - 4, h - 4, 8); g.fill();
    g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 17px ${FONT}`; g.fillText('MỞ CỬA 8:00 – 22:00', x + w / 2, y + h / 2 + 1, w - 10); }
  { const [x, y, w, h] = at(RT.tag);
    g.fillStyle = TG_YELLOW; g.fillRect(x, y, w, h); g.fillStyle = '#D32F2F'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 22px ${FONT}`; g.fillText('-20%', x + w / 2, y + h / 2); }
  { const [x, y, w, h] = at(RT.wall);
    g.clearRect(x, y, w, h);
    g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 30px ${FONT}`; g.fillText('Phụ kiện chính hãng · Bảo hành 1 đổi 1', x + w / 2, y + h / 2, w - 20); }
}

/* ---------- the fittings, in the shop's own frame ---------- */
function fit(D, r, low, SW) {
  const inner = [], glass = [], fix = [], spots = [], half = SW / 2;
  const b = (w, h, d, x, y, z, c) => inner.push(boxAt(w, h, d, x, FL + y, z, c));
  const block = (x0, x1, z0, z1) => fix.push([x0, x1, z0, z1]);
  for (let x = -half; x < half - 0.01; x += 0.6) for (let z = -D; z < -0.01; z += 0.6) {
    const w = Math.min(0.6, half - x), d = Math.min(0.6, -z);
    inner.push(colorize(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x + w / 2, FL + 0.004, z + d / 2), (Math.round((x + half) / 0.6) + Math.round(-z / 0.6)) % 2 ? '#E7E9EC' : '#DCDFE3'));
  }
  b(SW, CEIL - FL, 0.06, 0, (CEIL - FL) / 2, -D + 0.03, '#F7F7F5');
  for (const s of [-1, 1]) { b(0.06, CEIL - FL, D, s * (half - 0.03), (CEIL - FL) / 2, -D / 2, '#F7F7F5'); b(0.02, 0.22, D - 0.1, s * (half - 0.065), CEIL - FL - 0.3, -D / 2, TG_YELLOW); }
  b(SW, 0.04, D, 0, CEIL - FL - 0.04, -D / 2, '#FFFFFF');
  for (const x of [-1.7, 0.5, 2.4]) b(0.12, 0.02, D - 0.8, x, CEIL - FL - 0.07, -D / 2, '#FFFFFF');   // long light strips
  b(SW, CEIL - 2.42, 0.05, 0, (2.42 + CEIL) / 2 - FL, -0.05, '#F7F7F5');
  // two long white tables of phones, front to back: each on its stand, a yellow tag in front
  const tables = [[-1.75, -0.95, -3.25], [0.5, -1.0, -3.0]];
  for (const [tx, z0, z1] of tables) {
    const L = z0 - z1, tz = (z0 + z1) / 2;
    b(0.9, 0.04, L, tx, 0.9, tz, '#F4F4F2'); b(0.84, 0.86, L - 0.06, tx, 0.43, tz, '#2B2F36');
    for (let z = z1 + 0.18; z < z0 - 0.1; z += 0.34 * (low ? 2 : 1)) for (const sx of [-0.24, 0.24]) {
      inner.push(colorize(new THREE.BoxGeometry(0.075, 0.15, 0.008).rotateY(sx < 0 ? -Math.PI / 2 : Math.PI / 2).rotateZ(sx < 0 ? 0.25 : -0.25).translate(tx + sx * 0.8, FL + 1.0, z), ['#1E1E1E', '#C9CED6', '#3A4A6B', '#E8D8C8'][Math.floor(r() * 4)]));
      b(0.02, 0.06, 0.03, tx + sx * 0.9, 0.95, z, '#9AA2AD');
      b(0.005, 0.035, 0.06, tx + sx * 1.6, 0.93, z, TG_YELLOW);
    }
    block(tx - 0.47, tx + 0.47, z1 - 0.02, z0 + 0.02);
  }
  // the wall of accessories on the left: cases, chargers, earphones in rows of colour
  b(0.22, 1.8, D - 0.9, -half + 0.14, 1.1, -(D + 0.6) / 2, '#E9ECEF');
  for (let y = 0.45; y < 1.95; y += 0.27) for (let z = -1.0; z > -D + 0.4; z -= 0.16 * (low ? 2 : 1)) b(0.06, 0.18, 0.11, -half + 0.28, y, z, ['#E41E2B', '#1C4FA0', '#F7C600', '#2E9E4A', '#F2F2F2', '#1E1E1E', '#7E3FA6'][Math.floor(r() * 7)]);
  block(-half, -half + 0.32, -D, -0.6);
  // the till at the back on the right: black with its yellow edge (printed), the register, shelves of boxed phones behind
  b(1.6, 0.98, 0.6, 2.4, 0.49, -2.6, INK); b(1.66, 0.05, 0.66, 2.4, 1.0, -2.6, '#F4F4F2');
  b(0.36, 0.1, 0.3, 2.75, 1.08, -2.72, '#1E2125'); b(0.32, 0.22, 0.02, 2.75, 1.24, -2.8, '#2B3A55'); b(0.22, 0.15, 0.02, 2.75, 1.17, -2.46, '#2B3A55');
  b(0.09, 0.13, 0.06, 2.1, 1.09, -2.42, '#1E2125');
  b(2.2, 1.9, 0.32, 2.2, 0.95, -D + 0.18, '#ECEEF0');
  for (let y = 0.3; y < 1.8; y += 0.3) for (let x = 1.2; x < 3.2; x += 0.2 * (low ? 2 : 1)) b(0.16, 0.22, 0.2, x, y, -D + 0.22, r() < 0.5 ? '#F2F2F2' : '#1E1E1E');
  block(1.55, 3.3, -2.95, -2.25); block(1.05, 3.3, -D, -D + 0.38);
  // two stools by the first table, to sit and try a phone
  const seats = [];
  for (const z of [-1.5, -2.5]) {
    const x = -2.45;
    inner.push(colorize(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14).translate(x, FL + 0.66, z), INK)); inner.push(colorize(new THREE.CylinderGeometry(0.025, 0.025, 0.64, 6).translate(x, FL + 0.33, z), '#9AA2AD'));
    seats.push({ x, z, top: 0.69, dir: [1, 0], put: [x + 0.42, 0.92, z] });
    block(x - 0.18, x + 0.18, z - 0.18, z + 0.18);
  }
  // walking in: a phone case from the table, a fast charger at the till (paid there); a stool to sit and try a phone
  spots.push({ kind: 'side', item: { id: 'phoneCase', price: 99, carry: 'grocery' }, x: -0.75, z: -1.6, face: Math.PI / 2 });
  spots.push({ kind: 'pay', item: { id: 'charger', price: 149, carry: 'grocery' }, x: 2.4, z: -1.95, face: Math.PI });
  spots.push({ kind: 'seat', x: -2.0, z: -1.5, face: 0, seat: seats[0] });
  return { inner, glass, fix, spots, seats, till: { x: 2.4, z: -1.95 }, cashier: { x: 2.4, z: -3.15 }, steam: [], aisle: [],
    stations: [[-0.85, -1.4, -1], [-0.85, -2.6, -1], [1.25, -1.6, 1], [1.25, -2.6, 1]] };
}

/* ---------- the inflatable dancer at the door: a tube in yellow and black, a face at the top, two arms, flailing ---------- */
function tubeMan() {
  const m = vmat({ roughness: 0.8 }), root = new THREE.Group(), segs = [], N = 6, H = 0.32;   // (~2.5 m, under the sign)
  root.add(new THREE.Mesh(mergeAll([boxAt(0.46, 0.32, 0.46, 0, 0.16, 0, INK), boxAt(0.4, 0.02, 0.4, 0, 0.33, 0, '#3A3F47')]), m));   // the blower
  let parent = root;
  for (let k = 0; k < N; k++) {
    const pivot = new THREE.Group(); pivot.position.y = k ? H : 0.34;
    const col = k === 2 || k === 4 ? INK : TG_YELLOW, parts = [colorize(new THREE.CylinderGeometry(0.15, 0.17, H, 12).translate(0, H / 2, 0), col)];
    if (k === N - 1) {   // the face: eyes, a grin, a tuft of hair
      parts.push(colorize(new THREE.SphereGeometry(0.16, 12, 8).scale(1, 0.8, 1).translate(0, H, 0), TG_YELLOW));
      for (const s of [-1, 1]) { parts.push(colorize(new THREE.SphereGeometry(0.05, 8, 6).translate(s * 0.06, H * 0.62, 0.13), '#FFFFFF')); parts.push(colorize(new THREE.SphereGeometry(0.025, 6, 4).translate(s * 0.06, H * 0.62, 0.17), INK)); }
      parts.push(boxAt(0.12, 0.025, 0.02, 0, H * 0.32, 0.155, '#D32F2F'));
      for (let i = 0; i < 5; i++) parts.push(colorize(new THREE.ConeGeometry(0.03, 0.14, 5).rotateZ((i - 2) * 0.35).translate((i - 2) * 0.04, H + 0.17, 0), INK));
    }
    const mesh = new THREE.Mesh(mergeAll(parts), m); mesh.castShadow = true; pivot.add(mesh); parent.add(pivot); segs.push(pivot); parent = pivot;
  }
  const arms = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(s * 0.14, H * 0.7, 0); p.add(new THREE.Mesh(colorize(new THREE.CylinderGeometry(0.06, 0.07, 0.7, 8).translate(0, -0.35, 0).rotateZ(s * 2.2), TG_YELLOW), m)); segs[4].add(p); return p; });
  root.visible = false;
  return {
    root,
    update(t, on) {
      root.visible = on; if (!on) return;
      const flop = (t % 9) < 1.1 ? Math.sin(((t % 9) / 1.1) * Math.PI) : 0;   // now and then it folds over and springs back up
      segs.forEach((p, k) => { p.rotation.z = Math.sin(t * 4.2 - k * 0.8) * (0.12 + k * 0.025) + (k === 3 ? flop * 1.3 : 0); p.rotation.x = Math.sin(t * 3.1 - k * 0.6) * 0.06; });
      arms.forEach((p, i) => { p.rotation.z = Math.sin(t * 6.5 + i * 2) * 0.9; p.rotation.x = Math.cos(t * 5 + i) * 0.4; });
    },
  };
}

/* ---------- the front: the promotions on the glass, the hours, the band, the till's front, the wall's words, the dancer ---------- */
function front({ n, D, put, faces, decal, built, S, GY }) {
  put(decal(0.62, 0.8, n, RT.posterA).translate(-2.7, FL + 1.45, -0.015), faces);
  put(decal(0.62, 0.8, n, RT.posterB).translate(2.7, FL + 1.45, -0.015), faces);
  put(decal(0.5, 0.075, n, RT.hours).translate(0.82 + 0.34, FL + 1.3, -0.015), faces);
  put(decal(6.4, 0.44, n, RT.band).translate(0, CEIL - 0.34, -D + 0.07), faces);
  put(decal(1.56, 0.4, n, RT.panel).translate(2.4, FL + 0.5, -2.295), faces);
  put(decal(3.6, 0.4, n, RT.wall).translate(-0.8, 1.9, -D + 0.07), faces);
  for (const [tx, z0] of [[-1.75, -0.95], [0.5, -1.0]]) put(decal(0.32, 0.16, n, RT.tag).translate(tx, FL + 0.7, z0 + 0.025), faces);   // a sale tag on each table's end
  const man = tubeMan(); man.root.rotation.y = S.rot;
  const [mx, mz] = S.toW(-3.05, 1.15); man.root.position.set(mx, GY + FL, mz); built.add(man.root);
  return { dancer: man };
}

/* ---------- its people: the cashier and a consultant in yellow, customers trying phones, someone at the window ---------- */
function people(S, c) {
  const { crowd, props, cashier, staff, sit, out, at, face, hand, held, sy, mid, r, LOOK, HAIR, isOpen, wx } = c;
  const all = () => [cashier, staff, ...sit, ...out], uniform = { shirt: TG_YELLOW, pants: '#1E1E1E' };
  crowd.dress(cashier, { ...uniform, hair: '#2B2420' }); crowd.dress(staff, { ...uniform, hair: '#1E1A18' });
  crowd.dress(out[0], { ...LOOK.student(r), hair: '#3A2A20' }); crowd.dress(out[1], { ...LOOK.office(r), hair: '#2B2420' });
  sit.forEach((i, k) => crowd.dress(i, { ...LOOK.genz(r), hair: HAIR[k % 4] }));
  const show = (i, f) => { if (i == null) return; const [x, z] = at(f.x, f.z); crowd.pose(i, { ...f, x, z, y: sy, sit: f.sit != null ? sy + f.sit : undefined, yaw: S.rot + (f.yaw || 0) }); };
  return {
    when: [0, 24], dry: true, at: mid,
    update(t, dt, h) {
      for (const p of held) props.hide(p); held.length = 0;
      const open = isOpen(S.ch, h);
      S.dancer?.update(t, open && wx.rain < 0.05);
      if (!open) { all().forEach((i) => crowd.hide(i)); return; }
      { const [x, z] = at(S.cashier.x, S.cashier.z), take = S.greetT > c.now() || (t % 14) < 1.6;
        crowd.pose(cashier, { x, y: sy, z, yaw: face(0, 1) + Math.sin(t * 0.4) * 0.12, arms: take ? [[0.95, -0.1], [0.95 + Math.sin(t * 8) * 0.15, -0.1]] : [[0.15, 0], [0.15, 0]] }); }
      // the consultant, from table to table, showing a phone
      { const k = Math.floor(t / 9) % S.stations.length, [sx, sz, dir] = S.stations[k], [x, z] = at(sx, sz), talk = (t % 9) > 1.5;
        crowd.pose(staff, { x, y: sy, z, yaw: face(dir, 0), arms: talk ? [[0.9, -0.1], [1.2 + Math.sin(t * 3) * 0.25, -0.15]] : [[0.15, 0], [0.15, 0]] });
        if (talk) hand(staff, 'phone'); }
      // on the stools: trying a phone, most of the day
      const many = h >= 9 && h < 21.5 ? (h >= 17 ? 2 : 1) : 0;
      sit.forEach((i, k) => {
        if (k >= many) { crowd.hide(i); return; }
        const s = S.seats[k], [x, z] = at(s.x, s.z);
        crowd.pose(i, { x, z, sit: sy + s.top, yaw: face(...s.dir), lean: -0.15, arms: [[1.15, -0.25], [1.25 + Math.sin(t * 2 + k) * 0.1, -0.25]] });
        hand(i, 'phone');
      });
      // a customer at the second table; someone outside looking at the promotions in the evening
      if ((t % 70) < 52) { show(out[1], { x: 1.1, z: -1.9, yaw: Math.PI, arms: [[1.0, -0.15], [1.2, -0.2]] }); hand(out[1], 'phone'); } else crowd.hide(out[1]);
      if (wx.rain < 0.05 && h >= 18 && h < 21.5 && (t % 120) < 70) show(out[0], { x: 2.1, z: 0.6, yaw: Math.PI / 2, arms: [[0.2, 0], [0.4, -0.1]] }); else crowd.hide(out[0]);
    },
    off() { all().forEach((i) => crowd.hide(i)); for (const p of held) props.hide(p); held.length = 0; S.dancer?.update(0, false); },
  };
}

/* ---------- far off: the front under the sign as a picture (no room to walk into): the glass and what is behind it.
   Any rect (x, y, w, h): everything is placed in its fractions. dark: closed, the lights off. (The dancer is front()'s.) ---------- */
// someone seen through the glass: the hair, the face, the shirt
function figure(g, cx, top, s, shirt) {
  g.fillStyle = shirt; g.beginPath(); g.roundRect(cx - s * 0.26, top + s * 0.32, s * 0.52, s * 0.68, s * 0.12); g.fill();
  g.fillStyle = '#E8B98F'; g.beginPath(); g.arc(cx, top + s * 0.17, s * 0.16, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1E1A17'; g.beginPath(); g.arc(cx, top + s * 0.13, s * 0.16, Math.PI, 0); g.fill();
}
const FRAMES = [0, 0.167, 0.376, 0.624, 0.833, 1];   // (where the real frames are: ±2.2 m and the door's ±0.82 m of 6.6 m)
function paint(g, x, y, w, h, dark) {
  const X = (f) => x + f * w, Y = (f) => y + f * h;
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  // inside: bright white, the light strips, the yellow band along the back wall with the name, the accessories wall
  g.fillStyle = '#F4F5F7'; g.fillRect(x, y, w, h); g.fillStyle = '#D9DCE1'; g.fillRect(x, Y(0.82), w, h * 0.18);
  g.fillStyle = '#FFFFFF'; for (const f of [0.04, 0.09]) g.fillRect(X(0.05), Y(f), w * 0.9, h * 0.015);
  g.fillStyle = TG_YELLOW; g.fillRect(x, Y(0.14), w, h * 0.1); g.fillStyle = INK; g.fillRect(x, Y(0.235), w, h * 0.008);
  for (const [a, b] of FRAMES.slice(1).map((f, k) => [FRAMES[k], f])) { mark(g, X(a + 0.025), Y(0.19), h * 0.035, INK); name(g, X(a + 0.045), Y(0.19), w * (b - a - 0.06), Math.round(h * 0.07), INK); }   // (one to each pane, clear of the frames)
  const CASES = ['#E53935', '#1E88E5', '#43A047', '#FDD835', '#8E24AA', '#FB8C00', '#212121', '#F06292'];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { g.fillStyle = CASES[(r * 3 + c * 5) % CASES.length]; g.fillRect(X(0.185 + c * 0.032), Y(0.3 + r * 0.09), w * 0.022, h * 0.065); }
  // the staff in yellow, customers trying phones; the two long black tables, the phones standing on them, the price tags
  figure(g, X(0.31), Y(0.38), h * 0.3, TG_YELLOW); figure(g, X(0.5), Y(0.4), h * 0.28, '#4A6FA5');
  figure(g, X(0.69), Y(0.38), h * 0.3, '#E4E0D6'); figure(g, X(0.78), Y(0.36), h * 0.3, TG_YELLOW);
  for (const [a, b] of [[0.26, 0.46], [0.55, 0.75]]) {
    g.fillStyle = INK; g.fillRect(X(a), Y(0.64), w * (b - a), h * 0.2); g.fillStyle = '#FFFFFF'; g.fillRect(X(a), Y(0.62), w * (b - a), h * 0.025);
    for (let k = 0; k < 4; k++) phone(g, X(a + 0.02 + k * (b - a - 0.04) / 4), Y(0.53), h * 0.05, h * 0.09);
    g.fillStyle = TG_YELLOW; g.fillRect(X(a + 0.01), Y(0.68), w * 0.05, h * 0.05);
  }
  // the till at the back on the right: black, the mark in yellow
  g.fillStyle = INK; g.fillRect(X(0.77), Y(0.62), w * 0.21, h * 0.22); mark(g, X(0.81), Y(0.73), h * 0.045, TG_YELLOW);
  if (dark) { g.fillStyle = 'rgba(8,10,14,.72)'; g.fillRect(x, y, w, h); }
  // the glass: a sheen, the black frames and the door in the middle, the kickplate; on it, the black and yellow posters,
  // the hours on the door
  const sh = g.createLinearGradient(x, y, x + w, y + h);
  sh.addColorStop(0, 'rgba(255,255,255,.22)'); sh.addColorStop(0.5, 'rgba(255,255,255,.03)'); sh.addColorStop(1, 'rgba(255,255,255,.16)'); g.fillStyle = sh; g.fillRect(x, y, w, h);
  g.fillStyle = '#26282C'; for (const f of FRAMES) g.fillRect(X(f) - w * 0.006, y, w * 0.012, h);
  g.fillRect(x, Y(0.92), w, h * 0.08); g.fillRect(X(0.376), Y(0.08), w * 0.248, h * 0.015);
  for (const [f, top, big] of [[0.03, 'TRẢ GÓP', '0%'], [0.86, 'THU CŨ', 'ĐỔI MỚI']]) {
    const px = X(f), pw = w * 0.11, py = Y(0.3), ph = h * 0.46;
    g.fillStyle = INK; g.fillRect(px, py, pw, ph);
    g.fillStyle = TG_YELLOW; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.round(ph * 0.1)}px ${FONT}`; g.fillText(top, px + pw / 2, py + ph * 0.12, pw * 0.9);
    g.font = `900 ${Math.round(ph * (big.length > 3 ? 0.12 : 0.22))}px ${FONT}`; g.fillText(big, px + pw / 2, py + ph * 0.32, pw * 0.92);
    phone(g, px + pw * 0.3, py + ph * 0.48, pw * 0.4, ph * 0.42);
  }
  g.fillStyle = TG_YELLOW; g.beginPath(); g.roundRect(X(0.455), Y(0.7), w * 0.09, h * 0.06, h * 0.015); g.fill();
  g.fillStyle = INK; g.font = `800 ${Math.round(h * 0.03)}px ${FONT}`; g.fillText('8:00 – 22:00', X(0.5), Y(0.73), w * 0.085);
  if (dark) { g.fillStyle = 'rgba(8,10,14,.35)'; g.fillRect(x, y, w, h); }
  g.restore();
}

export const TGDD = {
  chain: { name: 'Thế Giới Di Động', short: 'TGDĐ', face: TG_YELLOW, stripes: [TG_YELLOW], accent: '#E0B800', shirt: TG_YELLOW, hours: [8, 22], seats: true, greet: 'Thế Giới Di Động xin chào anh chị!' },
  kerb: [1.15, 2.0, 2.85], draw, fit, front, people, paint,
};
