// Video games on the lounge TV (world/props/game-tv.js; people/gaming.js plays them): football, a split-screen racer
// and a rooftop fighter, drawn as pixel art on a small 2D canvas and played by two players: people resting in the
// office, a computer player (game.ai) or you in first person. step() takes both players' sticks and buttons; anything
// worth a cheer or a groan (a goal, a K.O., an overtake…) is left in game.events for the room to react to. No sounds,
// no three.js: just the canvas.
export const TV_W = 384, TV_H = 216;
export const GAMES = ['football', 'racing', 'fighting'];
const TITLES = { football: 'GOAL STARS', racing: 'SAIGON RUSH', fighting: 'ROOFTOP FIGHT' };

/* ---------- shared bits: a seeded dice, a 3 x 5 pixel font, boxes and discs on whole pixels ---------- */
function dice(seed) {
  let s = (seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, p) => a + (b - a) * p;
// each character: five rows of three dots (bits 4 2 1, left to right)
const FONT = {
  A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553', H: '55755', I: '72227', J: '11152',
  K: '55655', L: '44447', M: '57755', N: '65555', O: '75557', P: '65644', Q: '25563', R: '65655', S: '34716', T: '72222',
  U: '55557', V: '55552', W: '55775', X: '55255', Y: '55222', Z: '71247', 0: '75557', 1: '26227', 2: '61247', 3: '61216',
  4: '55711', 5: '74616', 6: '34757', 7: '71222', 8: '75757', 9: '75716', '!': '22202', '.': '00002', ',': '00024',
  ':': '02020', "'": '22000', '/': '11244', '-': '00700', '+': '02720', '?': '61202', '%': '51245', '(': '24442', ')': '21112',
  '>': '42124', '<': '12421', ' ': '00000',
};
// pixel text, sc dots to a pixel; align 'l' | 'c' | 'r'; a dark drop shadow unless shadow is null. Returns the width.
function text(g, s, x, y, col, sc = 1, align = 'l', shadow = '#000') {
  s = String(s).toUpperCase();
  const w = s.length * 4 * sc - sc;
  x = Math.round(align === 'c' ? x - w / 2 : align === 'r' ? x - w : x); y = Math.round(y);
  const put = (c, ox, oy) => {
    g.fillStyle = c;
    for (let i = 0; i < s.length; i++) {
      const f = FONT[s[i]] || FONT['?'], X = ox + i * 4 * sc;
      for (let r = 0; r < 5; r++) {
        const b = f.charCodeAt(r) - 48, Y = oy + r * sc;
        if (!b) continue;
        if (b === 7) g.fillRect(X, Y, 3 * sc, sc);
        else if (b === 6) g.fillRect(X, Y, 2 * sc, sc);
        else if (b === 3) g.fillRect(X + sc, Y, 2 * sc, sc);
        else { if (b & 4) g.fillRect(X, Y, sc, sc); if (b & 2) g.fillRect(X + sc, Y, sc, sc); if (b & 1) g.fillRect(X + 2 * sc, Y, sc, sc); }
      }
    }
  };
  if (shadow) put(shadow, x + Math.max(1, sc >> 1), y + Math.max(1, sc >> 1));
  put(col, x, y);
  return w;
}
// a big word across the middle: a thick dark outline, then the colour
function banner(g, s, y, col, sc, out = '#14101C') {
  const o = Math.max(1, Math.ceil(sc / 2));
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [2, 2]]) text(g, s, TV_W / 2 + dx * o, y + dy * o, out, sc, 'c', null);
  text(g, s, TV_W / 2, y, col, sc, 'c', null);
}
// names as the font can draw them: no accents ("Thay đổi" → "THAY DOI"), cut to n
const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'D').toUpperCase()
  .replace(/[^A-Z0-9 !.:'/\-+?%()]/g, ' ').replace(/\s+/g, ' ').trim();
// too long: whole words up to n where that keeps most of it ("WEBSITE-IELTS" → "WEBSITE"), else cut with a dot
const short = (s, n) => {
  const p = plain(s);
  if (p.length <= n) return p;
  let w = '';
  for (const part of p.split(/(?=[ -])/)) { if ((w + part).length > n) break; w += part; }
  return w.trim().length >= 6 ? w.trim() : `${p.slice(0, n - 1).trim()}.`;
};
function rgb(hex) { let h = String(hex).replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); const n = parseInt(h.slice(0, 6), 16) || 0; return [n >> 16, (n >> 8) & 255, n & 255]; }
const shade = (hex, f) => `rgb(${rgb(hex).map((v) => Math.round(clamp(f < 0 ? v * (1 + f) : v + (255 - v) * f, 0, 255))).join(',')})`;
const box = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
const poly = (g, c, ...p) => { g.fillStyle = c; g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); g.fill(); };
const disc = (g, c, x, y, r) => {
  g.fillStyle = c; x = Math.round(x); y = Math.round(y); r = Math.max(1, Math.round(r));
  for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(r * r - dy * dy)); g.fillRect(x - w, y + dy, w * 2 + 1, 1); }
};
const dim = (g, a) => box(g, `rgba(8,10,16,${a})`, 0, 0, TV_W, TV_H);
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// what every game has: the players' names and colours, the dice, the score, the events, a shake and a flash
function base(kind, o) {
  const names = [0, 1].map((i) => short(o.names?.[i], 12) || `${i + 1}P`);
  const colors = [0, 1].map((i) => o.colors?.[i] || ['#E8742A', '#3F7CC4'][i]);
  const G = { kind, title: TITLES[kind], names, colors, rand: dice(o.seed), over: false, winner: -1, score: [0, 0], time: 0, events: [],
    shake: 0, flash: 0, t: 0, pad: [{}, {}], lead: () => 0 };
  G.emit = (type, who) => G.events.push({ type, who });
  // a button counts once per press: held down, it doesn't repeat
  G.press = (i, c, k) => { const was = G.pad[i][k], now = !!c?.[k]; G.pad[i][k] = now; return now && !was; };
  G.mood = (i) => { const d = G.lead(i); return d > 0 ? 'ahead' : d < 0 ? 'behind' : 'even'; };
  return G;
}
// the step every game shares: a short frame at most, cut into sixtieths for the physics
function stepper(G, sim) {
  return (dt, cs = []) => {
    dt = clamp(Number(dt) || 0, 0, 0.1);
    for (let left = dt; left > 1e-6; left -= 1 / 60) { const h = Math.min(left, 1 / 60); G.t += h; sim(h, cs); }
    G.shake = Math.max(0, G.shake - dt * 18); G.flash = Math.max(0, G.flash - dt * 2.2);
  };
}
// a frame: black under it (for the shake), the picture, then the flash on top
function frame(g, G, paint) {
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#000'; g.fillRect(0, 0, TV_W, TV_H);
  g.save();
  if (G.shake > 0.4) g.translate(Math.round((Math.random() - 0.5) * G.shake), Math.round((Math.random() - 0.5) * G.shake));
  paint();
  g.restore();
  if (G.flash > 0.02) box(g, `rgba(255,255,255,${(G.flash * 0.75).toFixed(2)})`, 0, 0, TV_W, TV_H);
}
// the city behind the racer and the fighter (and the title screens): [x, width, height, lit windows]
const SKYLINE = [], TOWERS = [[], []];
{ const r = dice(11); for (let x = 0; x < 800;) { const w = 12 + Math.floor(r() * 26), h = 8 + Math.floor(r() * 30); SKYLINE.push([x, w, h, Array.from({ length: Math.floor(w * h / 60) }, () => [Math.floor(r() * w), Math.floor(r() * h)])]); x += w + 1 + Math.floor(r() * 5); } }
{ const r = dice(5); for (const L of [0, 1]) for (let x = -60; x < 640;) { const w = 18 + Math.floor(r() * 30), h = (L ? 34 : 56) + Math.floor(r() * (L ? 46 : 70)); TOWERS[L].push([x, w, h, Array.from({ length: Math.floor(w * h / 90) }, () => [1 + Math.floor(r() * (w - 3)), 2 + Math.floor(r() * (h - 5))])]); x += w + 2 + Math.floor(r() * 7); } }

/* ---------- football: three a side, from above ---------- */
const P0 = 12, P1 = 372, T0 = 30, T1 = 206, MID = 118, GOAL = 48, CX = 192;
// where the three stand (keeper, back, forward), as parts of the pitch from their own goal and across it
const FORM = [[0.02, 0.5], [0.26, 0.3], [0.44, 0.68]];
const SKIN = ['#F2C9A0', '#D9A47A', '#B87F5A', '#F5D5B5'], HAIR = ['#2B2118', '#4A3020', '#151515', '#8A5A2B'];
const RING = [];
for (let a = 0; a < 360; a += 2) { const p = [Math.round(Math.cos(a * Math.PI / 180) * 22), Math.round(Math.sin(a * Math.PI / 180) * 22)]; if (!RING.some((q) => q[0] === p[0] && q[1] === p[1])) RING.push(p); }
const CROWD = [];
{ const r = dice(7), C = ['#E8742A', '#3F7CC4', '#F2EDE4', '#E6C547', '#C94F7C', '#7FB3E8', '#9BD08C']; for (let i = 0; i < 300; i++) CROWD.push([Math.floor(r() * 192) * 2, 15 + Math.floor(r() * 6) * 2, C[Math.floor(r() * C.length)]]); }

function football(o) {
  const G = base('football', o), R = G.rand, kit = G.colors;
  const men = [];
  for (const team of [0, 1]) for (let k = 0; k < 3; k++) men.push({ team, k, keeper: !k, x: 0, y: 0, vx: 0, vy: 0, fx: team ? -1 : 1, fy: 0, run: 0, cd: 0, dive: 0, skin: SKIN[Math.floor(R() * 4)], hair: HAIR[Math.floor(R() * 4)] });
  const ball = { x: CX, y: MID, z: 0, vx: 0, vy: 0, vz: 0, owner: null, by: null, spin: 0 };
  const ctl = [null, null], think = [0, 0];
  let phase = 'intro', phaseT = 2.4, slow = 0, scorer = 0, hold = 0, closeAt = 0;
  const own = (t) => (t ? P1 : P0), aim = (t) => (t ? P0 : P1), dir = (t) => (t ? -1 : 1);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const home = (m) => { const [fx, fy] = FORM[m.k]; return [own(m.team) + dir(m.team) * fx * (P1 - P0), T0 + fy * (T1 - T0)]; };
  const nearest = (team, x, y, keepers = false) => {
    let best = null, bd = 1e9;
    for (const m of men) if (m.team === team && (keepers || !m.keeper)) { const d = Math.hypot(m.x - x, m.y - y); if (d < bd) { bd = d; best = m; } }
    return best;
  };
  function kickoff(team) {
    for (const m of men) { const [x, y] = home(m); Object.assign(m, { x, y, vx: 0, vy: 0, cd: 0, dive: 0, fx: dir(m.team), fy: 0 }); }
    const f = men.find((m) => m.team === team && m.k === 2);
    f.x = CX - dir(team) * 6; f.y = MID;
    Object.assign(ball, { x: CX, y: MID, z: 0, vx: 0, vy: 0, vz: 0, owner: f, by: f });
    hold = 0;
  }
  kickoff(R() < 0.5 ? 0 : 1);
  function kick(m, tx, ty, speed, lift) {
    const d = Math.hypot(tx - ball.x, ty - ball.y) || 1;
    Object.assign(ball, { owner: null, by: m, vx: (tx - ball.x) / d * speed, vy: (ty - ball.y) / d * speed, vz: lift, spin: speed / 30 });
    m.cd = 0.3;
  }
  // to the teammate furthest forward with the most room, leading him a little
  function pass(m, long = false) {
    let best = null, bs = -1e9;
    for (const t of men) {
      if (t.team !== m.team || t === m) continue;
      const fwd = (t.x - m.x) * dir(m.team), room = Math.min(...men.filter((e) => e.team !== m.team).map((e) => dist(e, t)));
      const s = fwd * (long ? 1 : 0.5) + Math.min(room, 60) - (t.keeper ? 90 : 0) + R() * 25;
      if (s > bs) { bs = s; best = t; }
    }
    kick(m, best.x + best.vx * 0.4 + dir(m.team) * 6, best.y + best.vy * 0.4, clamp(dist(m, best) * 1.9 + 70, 110, 250), long ? 110 : 25);
  }
  // at goal: wilder from further out, and lifted (over the bar, now and then)
  function shoot(m, skill) {
    const gx = aim(m.team), far = Math.abs(gx - m.x) / 360;
    kick(m, gx + dir(m.team) * 4, MID + (R() - 0.5) * GOAL * (0.75 + far * 2.2 * (1.25 - skill)), 240 + R() * 70, 30 + R() * 150 * far);
    G.flash = Math.max(G.flash, 0.12);
  }
  function goal(team) {
    G.score[team]++; scorer = team; G.emit('goal', team);
    phase = 'goal'; phaseT = 3.6; slow = 1; G.flash = 1; G.shake = 6;
  }
  // where someone without the stick goes: the keeper along his line, the others into shape around the ball
  function target(m) {
    const t = m.team, d = dir(t), [hx, hy] = home(m);
    if (phase === 'goal') return t === scorer ? [aim(t) - d * 14, m.k === 1 ? T0 + 14 : T1 - 14 - m.k * 6, 70] : [hx, hy, 30];
    if (m.keeper) {
      if (ball.owner === m) return [m.x, m.y];
      const lx = own(t) + d * 5;
      let ty = clamp(lerp(MID, ball.y, 0.55), MID - GOAL / 2 + 3, MID + GOAL / 2 - 3), sp = 50;
      if (ball.vx * d < -60 && Math.abs(ball.x - lx) < 110 && !ball.owner) {   // a shot coming: across to where it will cross
        ty = clamp(ball.y + ball.vy * ((lx - ball.x) / ball.vx), MID - GOAL / 2 - 2, MID + GOAL / 2 + 2); sp = 95;
        if (Math.abs(ty - m.y) > 6 && Math.abs(ball.x - lx) < 50) m.dive = 0.35;
      }
      return [lx, ty, sp];
    }
    const has = ball.owner?.team === t;
    let tx = hx + (ball.x - CX) * 0.5 + (has ? d * (m.k === 2 ? 50 : 20) : 0), ty = lerp(hy, ball.y, m.k === 2 ? 0.3 : 0.25);
    if (!has && m.k === 1) {   // the back: between their most dangerous man and our goal
      const foe = men.filter((e) => e.team !== t && !e.keeper).sort((a, b) => Math.abs(a.x - own(t)) - Math.abs(b.x - own(t)))[0];
      tx = lerp(foe.x, own(t), 0.35); ty = lerp(foe.y, MID, 0.3);
    }
    return [clamp(tx, P0 + 8, P1 - 8), clamp(ty, T0 + 8, T1 - 8)];
  }
  const sim = (h, cs) => {
    if (phase === 'end') return;
    if (phase === 'intro') { if ((phaseT -= h) <= 0) { phase = 'play'; G.emit('start', -1); } return; }
    if (phase === 'goal') { phaseT -= h; if (slow > 0) { slow -= h; h *= 0.3; } if (phaseT <= 0) { kickoff(1 - scorer); phase = 'play'; } }
    else if ((G.time += h) >= 90) {
      G.time = 90; phase = 'end'; G.over = true; const [a, b] = G.score;
      G.winner = a === b ? -1 : a > b ? 0 : 1; G.emit('win', G.winner); G.flash = 0.5;
      return;
    }
    const play = phase === 'play', c = [0, 1].map((i) => cs[i] || G.ai(i));
    const pa = [0, 1].map((i) => G.press(i, c[i], 'a')), pb = [0, 1].map((i) => G.press(i, c[i], 'b'));
    // the stick goes to whoever has the ball, else to the one nearest it (not flicking back and forth)
    for (const t of [0, 1]) {
      const has = ball.owner?.team === t && !ball.owner.keeper ? ball.owner : null;
      let n = has || nearest(t, ball.x + ball.vx * 0.25, ball.y + ball.vy * 0.25);
      if (!has && ctl[t] && n !== ctl[t] && dist(ctl[t], ball) < dist(n, ball) + 12) n = ctl[t];
      ctl[t] = n;
    }
    for (const m of men) {
      m.cd = Math.max(0, m.cd - h); m.dive = Math.max(0, m.dive - h);
      let wx = 0, wy = 0;
      const sp = ball.owner === m ? 52 : 60, stick = play && ctl[m.team] === m ? c[m.team] : null;
      if (stick) {
        const sx = clamp(stick.x || 0, -1, 1), sy = clamp(stick.y || 0, -1, 1), l = Math.hypot(sx, sy);
        if (l > 0.15) { wx = sx / Math.max(1, l) * sp; wy = sy / Math.max(1, l) * sp; }
      } else {
        const [tx, ty, s2] = target(m), dx = tx - m.x, dy = ty - m.y, l = Math.hypot(dx, dy);
        if (l > 1.5) { const v = Math.min(s2 ?? sp, l * 4); wx = dx / l * v; wy = dy / l * v; }
      }
      const acc = Math.min(1, h * 9);
      m.vx += (wx - m.vx) * acc; m.vy += (wy - m.vy) * acc;
      m.x = clamp(m.x + m.vx * h, P0 - 6, P1 + 6); m.y = clamp(m.y + m.vy * h, T0 + 1, T1 - 1);
      const v = Math.hypot(m.vx, m.vy);
      if (v > 6) { m.fx = m.vx / v; m.fy = m.vy / v; m.run += h * v / 12; }
    }
    if (ball.owner) {
      const m = ball.owner;
      Object.assign(ball, { x: m.x + m.fx * 5, y: m.y + m.fy * 3 + 1, z: 0, vx: m.vx, vy: m.vy, spin: Math.hypot(m.vx, m.vy) / 25 });
      if (m.keeper) { if ((hold += h) > 1) { hold = 0; pass(m, true); } }   // the keeper holds it a moment, then sends it upfield
      else if (play) { if (pb[m.team]) shoot(m, 0.75); else if (pa[m.team]) pass(m); }
      // taken off his toes by someone close: now and then, or more often when they go in for it
      if (ball.owner === m && play && !m.keeper) for (const e of men) {
        if (e.team === m.team || e.keeper || e.cd > 0 || dist(e, m) > 9) continue;
        const tried = pa[e.team] && ctl[e.team] === e;
        if (R() < (tried ? 0.55 : h * 1.4)) { ball.owner = e; ball.by = e; m.cd = 0.7; e.cd = 0.15; break; }
        if (tried) e.cd = 0.5;
      }
    } else {
      ball.x += ball.vx * h; ball.y += ball.vy * h;
      if (ball.z > 0 || ball.vz > 0) { ball.vz -= 420 * h; ball.z += ball.vz * h; if (ball.z <= 0) { ball.z = 0; ball.vz = ball.vz < -50 ? -ball.vz * 0.4 : 0; } }
      const fr = ball.z > 0 ? 0.1 : 1.25;
      ball.vx *= Math.max(0, 1 - fr * h); ball.vy *= Math.max(0, 1 - fr * h); ball.spin *= 1 - h;
      if (ball.y < T0 + 2 || ball.y > T1 - 2) { ball.y = clamp(ball.y, T0 + 2, T1 - 2); ball.vy *= -0.7; }
      for (const s of [0, 1]) {   // over a goal line: in, off a post, or back off the boards
        const lx = s ? P1 : P0;
        if (s ? ball.x <= lx : ball.x >= lx) continue;
        const mouth = Math.abs(ball.y - MID) < GOAL / 2 - 1 && ball.z < 14;
        if (mouth && play) goal(s ? 0 : 1);
        else if (mouth || (phase === 'goal' && Math.abs(ball.y - MID) < GOAL / 2 + 2)) { const back = lx + (s ? 8 : -8); if (s ? ball.x > back : ball.x < back) { ball.x = back; ball.vx *= -0.15; ball.vy *= 0.5; } }
        else {
          if (play && Math.abs(Math.abs(ball.y - MID) - GOAL / 2) < 5 && G.t > closeAt) { closeAt = G.t + 1.5; G.emit('close', s ? 0 : 1); }
          ball.x = lx + (s ? -1 : 1); ball.vx *= -0.6;
        }
      }
      if (play && ball.z < 8) {
        const fast = Math.hypot(ball.vx, ball.vy);
        for (const m of men) {
          if (m.cd > 0 || dist(m, ball) > (m.keeper ? 10 : 6)) continue;
          if (m.keeper && ball.by && ball.by.team !== m.team && fast > 120) {   // a shot at him: the harder, the likelier it beats him
            m.cd = 0.45;
            if (R() > clamp(0.75 - fast / 900 + (m.dive ? 0.1 : 0), 0.25, 0.8)) continue;
            if (G.t > closeAt) { closeAt = G.t + 1.5; G.emit('close', 1 - m.team); }
            if (fast > 210 && R() < 0.6) { ball.vx *= -0.45; ball.vy = (R() - 0.5) * 180; ball.vz = 60; ball.by = m; G.shake = 2; break; }   // pushed out
            ball.owner = m; ball.by = m; hold = 0; break;
          }
          if (fast > 170 && ball.by && ball.by.team !== m.team && R() < 0.4) { m.cd = 0.2; continue; }   // too quick to take
          ball.owner = m; ball.by = m; if (m.keeper) hold = 0;
          break;
        }
      }
    }
  };
  G.step = stepper(G, sim);
  G.lead = (i) => G.score[i] - G.score[1 - i];
  // a computer player: dribble at goal, round whoever is in the way, shoot when close, pass when pressed; without the
  // ball, run at where it will be (a little late, the worse it plays)
  G.ai = (i, level = 0.7) => {
    const m = ctl[i], c = { x: 0, y: 0, a: false, b: false };
    if (!m || phase !== 'play') return c;
    const d = dir(i), gx = aim(i), wob = (1 - level) * 0.6;
    let tx, ty;
    if (ball.owner === m) {
      tx = gx; ty = MID + Math.sin(G.t * 0.8 + i * 3) * 26;
      const opp = nearest(1 - i, m.x + d * 14, m.y, true), close = opp && dist(opp, m) < 30 && (opp.x - m.x) * d > -4;
      if (close) ty = m.y + (m.y > opp.y ? 34 : -34);
      if (G.t > think[i]) {
        think[i] = G.t + 0.22 + (1 - level) * 0.35 + R() * 0.15;
        const far = Math.abs(gx - m.x);
        if (far < 60 + level * 60 && R() < 0.45 + level * 0.4) c.b = true;
        else if (close && dist(opp, m) < 16 && R() < 0.55) c.a = true;
        else if (far > 180 && R() < 0.12) c.a = true;
        else if (far < 170 && R() < 0.04) c.b = true;   // a hopeful one from distance
      }
    } else {
      const lead = 0.15 + level * 0.25;
      tx = ball.x + ball.vx * lead; ty = ball.y + ball.vy * lead;
      if (ball.owner?.team === i) { tx = m.x + d * 40; ty = lerp(m.y, MID, 0.3); }   // our keeper has it: get forward
      else if (ball.owner && dist(ball.owner, m) < 12 && G.t > think[i]) { think[i] = G.t + 0.3 + (1 - level) * 0.4; c.a = R() < 0.3 + level * 0.4; }
    }
    const dx = tx - m.x + Math.sin(G.t * 5 + i) * wob * 20, dy = ty - m.y + Math.cos(G.t * 4 + i) * wob * 20, l = Math.hypot(dx, dy);
    if (l > 2) { c.x = dx / l; c.y = dy / l; }
    if (level < 0.5 && Math.sin(G.t * 1.3 + i) > 0.85) { c.x *= 0.2; c.y *= 0.2; }   // a moment's dithering
    return c;
  };
  const drawMan = (g, m) => {
    const party = phase === 'goal' && m.team === scorer, hop = party && Math.hypot(m.vx, m.vy) < 12 ? Math.abs(Math.round(Math.sin(G.t * 10 + m.k) * 3)) : 0;
    const x = Math.round(m.x), y = Math.round(m.y), f = Math.hypot(m.vx, m.vy) > 8 ? Math.floor(m.run) % 2 : 0, top = y - hop;
    const shirt = m.keeper ? (m.team ? '#3FCF8E' : '#E6D33F') : kit[m.team];
    box(g, 'rgba(0,0,0,.28)', x - 3, y, 7, 2);
    if (m.dive > 0) {   // the keeper at full stretch
      box(g, shirt, x - 5, y - 6, 11, 4); box(g, m.skin, x + (m.fy > 0 ? 6 : -9), y - 7, 4, 4); box(g, shade(shirt, -0.45), x - 5, y - 3, 5, 2);
      return;
    }
    box(g, m.skin, x - 2 + f, top - 2, 1, 2); box(g, m.skin, x + 1 - f, top - 2, 1, 2);   // legs
    box(g, shade(shirt, -0.45), x - 2, top - 4, 5, 2);                                    // shorts
    box(g, shirt, x - 3, top - 8, 7, 4);                                                  // shirt
    if (party) { box(g, m.skin, x - 4, top - 11, 1, 3); box(g, m.skin, x + 4, top - 11, 1, 3); } else box(g, m.skin, x - 3 + (f ? 0 : 6), top - 7, 1, 2);
    box(g, m.skin, x - 2, top - 12, 5, 4);                                                // head
    box(g, m.hair, x - 2, top - 12, 5, 2); box(g, m.hair, x - 2 + (m.fx < 0 ? 4 : 0), top - 10, 1, 1);
    if (ctl[m.team] === m && phase !== 'end') { const c = shade(kit[m.team], 0.45); box(g, c, x - 2, top - 17, 5, 1); box(g, c, x - 1, top - 16, 3, 1); box(g, c, x, top - 15, 1, 1); }
  };
  const drawBall = (g) => {
    const x = Math.round(ball.x), y = Math.round(ball.y);
    box(g, 'rgba(0,0,0,.3)', x - 1, y + 1, 3, 1);
    box(g, '#FFFFFF', x - 1, y - Math.round(ball.z) - 2, 3, 3);
    box(g, '#1A1A1A', x - 1 + (Math.floor(G.t * ball.spin) % 3), y - Math.round(ball.z) - 1, 1, 1);
  };
  G.draw = (g) => frame(g, G, () => {
    box(g, '#141A24', 0, 13, TV_W, 18);   // the stand: a crowd of dots that bobs, and jumps when someone scores
    const tick = Math.floor(G.t * 5), jump = phase === 'goal';
    for (let i = 0; i < CROWD.length; i++) { const [x, y, c] = CROWD[i]; if ((i * 7 + tick) % 17 === 0) continue; g.fillStyle = c; g.fillRect(x, y - (jump && (i + Math.floor(G.t * 10)) % 2 ? 1 : 0), 2, 2); }
    for (let x = P0 - 12, k = 0; x < P1 + 12; x += 24, k++) box(g, k % 2 ? '#3D9746' : '#46A650', x, T0 - 5, 24, T1 - T0 + 10);   // mown stripes
    g.fillStyle = '#E8F2E4';
    const line = (x, y, w, hh) => g.fillRect(x, y, w, hh), rect = (x, y, w, hh) => { line(x, y, w, 1); line(x, y + hh, w + 1, 1); line(x, y, 1, hh); line(x + w, y, 1, hh); };
    rect(P0, T0, P1 - P0, T1 - T0); line(CX, T0, 1, T1 - T0);
    for (const [dx, dy] of RING) line(CX + dx, MID + dy, 1, 1);
    line(CX - 1, MID - 1, 3, 3);
    rect(P0, MID - 40, 46, 80); rect(P1 - 46, MID - 40, 46, 80); rect(P0, MID - 22, 16, 44); rect(P1 - 16, MID - 22, 16, 44);
    line(P0 + 32, MID, 2, 1); line(P1 - 33, MID, 2, 1);
    for (const s of [0, 1]) {   // the goals: a net past the line, white posts
      const x = s ? P1 + 1 : P0 - 9;
      box(g, 'rgba(240,244,248,.16)', x, MID - GOAL / 2, 9, GOAL);
      g.fillStyle = 'rgba(240,244,248,.4)';
      for (let y = MID - GOAL / 2; y <= MID + GOAL / 2; y += 3) g.fillRect(x, y, 9, 1);
      for (let xx = x + (s ? 2 : 0); xx < x + 9; xx += 3) g.fillRect(xx, MID - GOAL / 2, 1, GOAL);
      box(g, '#FFFFFF', s ? P1 : P0 - 1, MID - GOAL / 2 - 1, 2, 2); box(g, '#FFFFFF', s ? P1 : P0 - 1, MID + GOAL / 2, 2, 2);
    }
    box(g, '#10161E', 0, 208, TV_W, 8);   // the LED boards
    const ad = 'MY OFFICE  +  PHO 24  +  CLAUDE CODE  +  BANH MI  +  ', aw = ad.length * 4, off = Math.floor(G.t * 18) % aw;
    for (let x = -off; x < TV_W; x += aw) text(g, ad, x, 210, '#F2A65A', 1, 'l', null);
    for (const it of [...men, ball].sort((a, b) => a.y - b.y)) if (it === ball) drawBall(g); else drawMan(g, it);
    box(g, '#0B0E14', 0, 0, TV_W, 13);   // the scoreboard and the clock
    for (const s of [0, 1]) { box(g, kit[s], s ? TV_W - 10 : 4, 3, 6, 7); text(g, G.names[s], s ? TV_W - 14 : 14, 4, '#F3EFE6', 1, s ? 'r' : 'l'); }
    text(g, `${G.score[0]}-${G.score[1]}`, CX, 2, '#FFFFFF', 2, 'c');
    box(g, '#0B0E14', CX - 13, 14, 26, 9); text(g, `${Math.min(90, Math.floor(G.time))}'`, CX, 16, '#F7D354', 1, 'c', null);
    if (phase === 'intro') { dim(g, 0.35); banner(g, 'KICK OFF', 70, '#F7D354', 5); text(g, `${G.names[0]} VS ${G.names[1]}`, CX, 110, '#FFFFFF', 2, 'c'); }
    if (phase === 'goal') { banner(g, 'GOAL!', 66 - Math.max(0, phaseT - 3.2) * 300, '#F7D354', 7); text(g, G.names[scorer], CX, 112, shade(kit[scorer], 0.4), 2, 'c'); }
    if (phase === 'end') {
      dim(g, 0.6); banner(g, 'FULL TIME', 44, '#FFFFFF', 4); banner(g, `${G.score[0]} - ${G.score[1]}`, 78, '#F7D354', 6);
      text(g, G.winner < 0 ? 'DRAW' : `${G.names[G.winner]} WINS`, CX, 128, G.winner < 0 ? '#FFFFFF' : shade(kit[G.winner], 0.4), 2, 'c');
    }
  });
  return G;
}

/* ---------- racing: Saigon at sunset, split screen, three laps ---------- */
// the road drawn the old arcade way: segments projected toward the horizon, bends and hills as offsets added up
const SEG = 200, ROADW = 2000, CAMH = 1000, DEPTH = 1 / Math.tan(Math.PI * 50 / 180), DRAW = 60, VMAX = 9000, LAPS = 3, HALF = 106;
const AHEAD = CAMH * DEPTH;   // how far in front of the camera the player's own car sits
const easeIn = (a, b, p) => a + (b - a) * p * p, easeIO = (a, b, p) => a + (b - a) * (0.5 - Math.cos(p * Math.PI) / 2);
// the course: [ease in, hold, ease out, bend (minus: left), hill (plus: up)]
const PLAN = [[20, 40, 20, 0, 0], [30, 60, 30, -3, 20], [20, 40, 20, 0, -15], [25, 40, 25, 4, 0], [20, 30, 20, -2, 30], [30, 50, 30, 0, -25],
  [40, 60, 40, 3, 10], [15, 30, 15, -4, 0], [30, 70, 30, 0, -10], [25, 50, 25, -3, -5], [20, 40, 20, 2, 20], [25, 40, 25, 0, -20]];
const SIGNS = { pho: ['#C8322B', '#FFD447', 'PHO'], office: ['#1C2620', '#E8865F', 'MY OFFICE'], banhmi: ['#F2C14E', '#7A3B12', 'BANH MI'], claude: ['#D97757', '#FFF4EC', 'CLAUDE'] };
const ORD = ['1ST', '2ND', '3RD', '4TH'];
function course(R) {
  const segs = [], lastY = () => (segs.length ? segs[segs.length - 1].y2 : 0);
  const add = (curve, y) => segs.push({ i: segs.length, curve, y1: lastY(), y2: y, sprites: [], q: null });
  const road = (a, b, c, curve, hill) => {
    const y0 = lastY(), y1 = y0 + hill * SEG, n = a + b + c;
    for (let k = 0; k < a; k++) add(easeIn(0, curve, k / a), easeIO(y0, y1, (k + 1) / n));
    for (let k = 0; k < b; k++) add(curve, easeIO(y0, y1, (a + k + 1) / n));
    for (let k = 0; k < c; k++) add(easeIO(curve, 0, k / c), easeIO(y0, y1, (a + b + k + 1) / n));
  };
  for (const p of PLAN) road(...p);
  road(25, 50, 25, 0, -lastY() / SEG);   // back down to where it started
  for (let i = 12; i < segs.length - 4; i += 3 + Math.floor(R() * 4)) segs[i].sprites.push({ kind: R() < 0.65 ? 'palm' : 'tree', x: (R() < 0.5 ? -1 : 1) * (1.3 + R() * 1.4) });
  const kinds = Object.keys(SIGNS);
  for (let i = 40, k = 0; i < segs.length - 30; i += 80 + Math.floor(R() * 50), k++) segs[i].sprites.push({ kind: kinds[k % kinds.length], x: (k % 2 ? 1 : -1) * 1.5 });
  segs[0].sprites.push({ kind: 'gate', x: 0 });
  return segs;
}
// a car from behind; k: pixels per world unit
function carBack(g, x, y, k, col, boost = false, t = 0, steer = 0) {
  const w = 620 * k, h = 300 * k;
  if (w < 3) return;
  const X = x - w / 2, Y = y - h, lean = Math.round(steer * w * 0.04);
  box(g, 'rgba(0,0,0,.35)', X - w * 0.04, y - h * 0.12, w * 1.08, h * 0.16);
  box(g, '#15171C', X + w * 0.02, Y + h * 0.62, w * 0.2, h * 0.38); box(g, '#15171C', X + w * 0.78, Y + h * 0.62, w * 0.2, h * 0.38);   // tyres
  box(g, shade(col, -0.28), X, Y + h * 0.5, w, h * 0.32);
  box(g, col, X + w * 0.02, Y + h * 0.3, w * 0.96, h * 0.26);
  box(g, shade(col, -0.38), X + w * 0.17 + lean, Y, w * 0.66, h * 0.32);   // the cabin, leaning into the bend
  box(g, '#263040', X + w * 0.22 + lean, Y + h * 0.05, w * 0.56, h * 0.2);
  box(g, '#FF4B3E', X + w * 0.04, Y + h * 0.36, w * 0.18, h * 0.11); box(g, '#FF4B3E', X + w * 0.78, Y + h * 0.36, w * 0.18, h * 0.11);
  box(g, '#E9E2D2', X + w * 0.38, Y + h * 0.58, w * 0.24, h * 0.1);   // number plate
  if (boost) {   // nitro: flames out of both pipes
    const f = Math.floor(t * 30) % 2;
    for (const px of [0.24, 0.68]) { box(g, '#FF7A2E', X + w * px, y - h * 0.18, w * 0.08, h * (0.2 + f * 0.12)); box(g, '#FFE66D', X + w * (px + 0.015), y - h * 0.16, w * 0.05, h * (0.1 + f * 0.08)); }
  }
}
// a motorbike from behind: Grab green, Be yellow, a delivery box, a conical hat
function bike(g, x, y, k, kind) {
  const w = 230 * k, h = 520 * k;
  if (h < 3) return;
  const X = x - w / 2, Y = y - h;
  box(g, 'rgba(0,0,0,.3)', X, y - h * 0.04, w, h * 0.06);
  box(g, '#16171B', x - w * 0.12, y - h * 0.34, w * 0.24, h * 0.34);
  box(g, '#E34B3F', x - w * 0.12, y - h * 0.4, w * 0.24, h * 0.05);
  box(g, '#3A3D44', x - w * 0.3, y - h * 0.5, w * 0.6, h * 0.12);
  box(g, { grab: '#00A859', be: '#F6C51B', box: '#2B6CB0', nonla: '#8C6A4E' }[kind], X + w * 0.12, Y + h * 0.26, w * 0.76, h * 0.32);
  if (kind === 'box') box(g, '#E8742A', X + w * 0.04, Y + h * 0.3, w * 0.92, h * 0.26);
  box(g, '#2A2A2E', X + w * 0.2, Y + h * 0.56, w * 0.2, h * 0.14); box(g, '#2A2A2E', X + w * 0.6, Y + h * 0.56, w * 0.2, h * 0.14);
  if (kind === 'nonla') { box(g, '#2A1E16', X + w * 0.3, Y + h * 0.12, w * 0.4, h * 0.16); poly(g, '#E9DCA8', X - w * 0.2, Y + h * 0.18, X + w * 1.2, Y + h * 0.18, x, Y - h * 0.1); }
  else box(g, { grab: '#00A859', be: '#F6C51B', box: '#F2F2F2' }[kind], X + w * 0.24, Y, w * 0.52, h * 0.26);   // a helmet
}
// the roadside: palms, trees, signs, the start gantry; k: pixels per world unit, road: the road's half width in pixels
function deco(g, sp, x, y, k, road) {
  if (sp.kind === 'gate') {
    const hgt = 1500 * k, beam = Math.max(2, 260 * k), L = x - road * 1.1, wd = road * 2.2;
    if (hgt < 4) return;
    box(g, '#2C2F36', L, y - hgt, 90 * k, hgt); box(g, '#2C2F36', L + wd - 90 * k, y - hgt, 90 * k, hgt);
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) box(g, (i + j) % 2 ? '#F4F4F4' : '#1C1C1C', L + i * wd / 16, y - hgt - beam + j * beam / 2, wd / 16 + 1, beam / 2 + 1);
    return;
  }
  if (SIGNS[sp.kind]) {
    const [bg, fg, word] = SIGNS[sp.kind], w = 2100 * k, h = 950 * k, lift = 850 * k;
    if (w < 5) return;
    const X = x - w / 2, Y = y - lift - h;
    box(g, '#34363D', X + w * 0.12, y - lift, 80 * k, lift); box(g, '#34363D', X + w * 0.84, y - lift, 80 * k, lift);
    box(g, shade(bg, -0.45), X - 1, Y - 1, w + 2, h + 2); box(g, bg, X, Y, w, h);
    const sc = Math.floor(Math.min(h / 9, w / (word.length * 4 + 2)));
    if (sc < 1) return;
    const ty = Math.round(Y + (h - 5 * sc) / 2 + (word === 'PHO' ? sc : 0));
    text(g, word, x, ty, fg, sc, 'c', null);
    if (word === 'PHO') {   // the Ở: a horn and a hook above (the little font has no accents)
      const ox = Math.round(x - 5.5 * sc) + 8 * sc;
      box(g, fg, ox + 3 * sc, ty - sc, sc, sc); box(g, fg, ox + sc, ty - 3 * sc, 2 * sc, sc); box(g, fg, ox + 2 * sc, ty - 2 * sc, sc, sc);
    }
    return;
  }
  if (sp.kind === 'palm') {
    const hh = 2400 * k, tw = Math.max(1, 130 * k), lean = (sp.x > 0 ? -1 : 1) * hh * 0.12;
    if (hh < 3) return;
    poly(g, '#7C5B3B', x - tw, y, x + tw, y, x + lean + tw * 0.6, y - hh, x + lean - tw * 0.6, y - hh);
    const fx = x + lean, fy = y - hh, r = 760 * k;
    for (const [ax, ay] of [[-1, 0.35], [1, 0.35], [-0.75, -0.25], [0.75, -0.25], [-0.2, 0.55], [0.25, -0.5]]) {
      poly(g, ay < 0 ? '#3FA05A' : '#2E8A4A', fx, fy - r * 0.08, fx + ax * r, fy + ay * r, fx + ax * r * 0.8, fy + ay * r + r * 0.18, fx, fy + r * 0.1);
    }
    box(g, '#6B4A2A', fx - r * 0.08, fy, r * 0.16, r * 0.12);
    return;
  }
  const hh = 1700 * k;   // a round tree
  if (hh < 3) return;
  box(g, '#6B4A2A', x - 70 * k, y - hh * 0.45, 140 * k, hh * 0.45);
  disc(g, '#3E8C3E', x, y - hh * 0.7, hh * 0.32); disc(g, '#4FA34A', x - hh * 0.08, y - hh * 0.78, hh * 0.18);
}

function racing(o) {
  const G = base('racing', o), R = G.rand, segs = course(R), N = segs.length, LEN = N * SEG;
  const wrap = (d) => ((d % LEN) + LEN) % LEN, segAt = (d) => segs[Math.floor(wrap(d) / SEG) % N];
  // two players on the second row, two computer cars ahead of them on the first
  const cars = [0, 1, 2, 3].map((i) => ({ i, name: i < 2 ? G.names[i] : `CPU ${i - 1}`, col: i < 2 ? G.colors[i] : ['#4FB477', '#B06BD6'][i - 2],
    d: i < 2 ? -SEG * 5 : -SEG * 1.5, x: i % 2 ? 0.45 : -0.45, speed: 0, nitro: 1, lap: -1, done: 0, spin: 0, cd: 0, shake: 0,
    pos: i < 2 ? 3 + i : i - 1, top: i < 2 ? 1 : [0.92, 0.95][i - 2], sky: 0, steer: 0, boost: false, nos: false, passAt: 0 }));
  const bikes = Array.from({ length: 14 }, (_, k) => ({ d: (k + 0.4 + R() * 0.3) * LEN / 14, x: [-0.62, 0.05, 0.6][k % 3] + (R() - 0.5) * 0.15,
    speed: VMAX * (0.26 + R() * 0.1), kind: ['grab', 'nonla', 'box', 'be'][k % 4] }));
  let phase = 'count', phaseT = 3.4, closeSaid = false, podium = [];
  function crash(c, keep, spin) {
    if (c.cd > 0) return;
    c.cd = 1.4; c.speed *= keep; c.spin = spin; c.shake = 6;
    if (c.i < 2) G.emit('crash', c.i);
  }
  function move(c, k, h, lead) {
    c.cd = Math.max(0, c.cd - h); c.shake = Math.max(0, c.shake - h * 14);
    if (c.done) { c.speed = Math.max(0, c.speed - VMAX * 0.35 * h); c.d += c.speed * h; return; }   // over the line: rolling to a stop
    const seg = segAt(c.d), pct = c.speed / VMAX, dx = h * 2.2 * pct;
    c.steer = c.spin > 0 ? 0 : clamp(k.x || 0, -1, 1);
    if (c.spin > 0) { c.spin -= h; c.x += Math.sin(c.spin * 18) * dx * 0.6; }
    c.x += dx * c.steer - dx * pct * seg.curve * 0.25;   // steering, and the bend pushing it out
    c.sky += seg.curve * pct * h * 30;
    c.boost = !!k.b && c.nitro > 0.02 && c.spin <= 0;
    c.nitro = clamp(c.nitro + (c.boost ? -0.4 : 0.05) * h, 0, 1);
    let top = VMAX * c.top * (c.boost ? 1.22 : 1) * (1 + clamp((lead - c.d) / LEN, 0, 0.25) * 0.3);   // a little help for whoever is behind
    if (Math.abs(c.x) > 1.05) top = Math.min(top, VMAX * 0.36);   // on the verge
    if ((k.y || 0) > 0.5) c.speed -= VMAX * 1.1 * h;
    else if (c.speed < top) c.speed += VMAX * (c.boost ? 0.5 : 0.3) * (1.2 - c.speed / top) * h;
    else c.speed -= VMAX * 0.7 * h;
    c.speed = clamp(c.speed, 0, VMAX * 1.3); c.x = clamp(c.x, -2.4, 2.4);
    // off the road into a palm or a sign; on it, into the back of something slower
    if (Math.abs(c.x) > 1.05) for (const s of seg.sprites) if (s.kind !== 'gate' && Math.abs(s.x - c.x) < 0.3) crash(c, 0.2, 0.9);
    for (const b of bikes) { const dz = wrap(b.d - c.d); if (dz < SEG * 0.6 && Math.abs(b.x - c.x) < 0.27 && c.speed > b.speed) { crash(c, 0.35, 0.7); c.x += c.x > b.x ? 0.12 : -0.12; } }
    for (const e of cars) {
      if (e === c || e.done) continue;
      const dz = wrap(e.d - c.d);
      if (dz < SEG * 0.55 && Math.abs(e.x - c.x) < 0.4 && c.speed > e.speed) { c.speed = e.speed * 0.9; c.x += c.x > e.x ? 0.08 : -0.08; if (c.i < 2 && c.cd <= 0) { c.cd = 0.6; c.shake = 2.5; } }
    }
    c.d += c.speed * h;
    const lap = Math.floor(c.d / LEN);
    if (lap > c.lap) {
      c.lap = lap;
      if (lap >= LAPS) { c.done = G.time; if (c.i < 2) { G.emit('lap', c.i); G.flash = 0.4; } }
      else if (lap > 0 && c.i < 2) G.emit('lap', c.i);
    }
  }
  function finish(order) {
    phase = 'end'; G.over = true; podium = order.slice(0, 3);
    G.winner = cars[0].pos < cars[1].pos ? 0 : 1; G.emit('win', G.winner); G.flash = 0.6;
  }
  const sim = (h, cs) => {
    if (phase === 'end') return;
    if (phase === 'count') { if ((phaseT -= h) <= 0) { phase = 'race'; G.emit('start', -1); } return; }
    G.time += h;
    for (const b of bikes) b.d = wrap(b.d + b.speed * h);
    const lead = Math.max(...cars.map((c) => c.d));
    for (const c of cars) move(c, c.i < 2 ? (cs[c.i] || G.ai(c.i)) : G.ai(c.i, c.i === 2 ? 0.55 : 0.7), h, lead);
    const order = [...cars].sort((a, b) => (a.done && b.done ? a.done - b.done : a.done ? -1 : b.done ? 1 : b.d - a.d));
    order.forEach((c, k) => { if (c.i < 2 && k + 1 < c.pos && G.t - c.passAt > 2) { c.passAt = G.t; G.emit('overtake', c.i); } c.pos = k + 1; });
    G.score = [cars[0].pos, cars[1].pos];
    const [a, b] = cars;
    if (!closeSaid && a.lap === LAPS - 1 && b.lap === LAPS - 1 && Math.abs(a.d - b.d) < SEG * 6 && wrap(Math.max(a.d, b.d)) > LEN * 0.85) { closeSaid = true; G.emit('close', a.d > b.d ? 0 : 1); }
    const first = Math.min(a.done || 1e9, b.done || 1e9);
    if ((a.done && b.done) || G.time - first > 15 || G.time > 140) finish(order);   // (the one behind gets 15 s to come home)
  };
  G.step = stepper(G, sim);
  G.lead = (i) => cars[1 - i].pos - cars[i].pos;
  // a computer driver: the inside of the coming bend, round whatever is slower ahead (seen earlier the better it drives),
  // nitro on a straight, a touch of brake when a hard bend is throwing it wide
  G.ai = (i, level = 0.7) => {
    const c = cars[i], ahead = segAt(c.d + SEG * 6), pct = c.speed / VMAX;
    let want = clamp(-ahead.curve * 0.13, -0.5, 0.5), block = null, bd = SEG * (5 + level * 10);
    for (const e of [...bikes, ...cars]) {
      if (e === c || e.done) continue;
      const dz = wrap(e.d - c.d);
      if (dz > 0 && dz < bd && Math.abs(e.x - c.x) < 0.55 && e.speed < c.speed + VMAX * 0.05) { bd = dz; block = e; }
    }
    if (block) want = block.x > 0.15 ? block.x - 0.72 : block.x < -0.15 ? block.x + 0.72 : c.x >= block.x ? block.x + 0.72 : block.x - 0.72;
    want += Math.sin(G.t * 0.6 + i * 2.1) * (1 - level) * 0.4;   // a looser line from a weaker driver
    const x = clamp((want - c.x) * 3 + segAt(c.d).curve * pct * 0.25, -1, 1);
    if (!c.nos && c.nitro > 0.85 && Math.abs(ahead.curve) < 1 && R() < 0.004 + level * 0.01) c.nos = true;
    if (c.nitro < 0.08) c.nos = false;
    const brake = Math.abs(ahead.curve) * pct > 3.2 && Math.abs(c.x) > 0.8 && R() < level;
    return { x, y: brake ? 1 : 0, a: true, b: c.nos };
  };
  // one player's half of the screen: sky, sun, towers, the road, what's on and beside it, their car, their numbers
  function half(g, c, y0) {
    const H = HALF, W = TV_W, cx = W / 2, hor = y0 + H / 2;
    g.save(); g.beginPath(); g.rect(0, y0, W, H); g.clip();
    if (c.shake > 0.3) g.translate(Math.round((Math.random() - 0.5) * c.shake), Math.round((Math.random() - 0.5) * c.shake));
    const sky = g.createLinearGradient(0, y0, 0, hor + 4);
    sky.addColorStop(0, '#2B2257'); sky.addColorStop(0.65, '#D2665E'); sky.addColorStop(1, '#F5B56C');
    g.fillStyle = sky; g.fillRect(-4, y0 - 4, W + 8, H + 8);
    const sx = Math.round(((W * 0.68 - c.sky * 0.08) % (W + 80) + W + 80) % (W + 80) - 40);   // the sun going down, banded
    for (let r = -16; r <= 16; r++) { if (r > 3 && (r & 3) === 0) continue; const w = Math.round(Math.sqrt(256 - r * r)); box(g, '#FFE2A3', sx - w, hor - 14 + r, w * 2, 1); }
    const off = Math.round(c.sky * 0.3);   // the skyline, sliding the other way on the bends
    for (const [bx, bw, bh, win] of SKYLINE) {
      const X = ((bx - off) % 800 + 800) % 800 - 208;
      if (X > W || X + bw < 0) continue;
      box(g, '#3A2B57', X, hor + 3 - bh, bw, bh);
      g.fillStyle = '#F4C26B'; for (const [wx, wy] of win) g.fillRect(X + wx, hor + 3 - bh + wy, 1, 1);
    }
    // the road, near to far, each segment hidden behind the ones before it (hills)
    const cam = wrap(c.d - AHEAD), base = segAt(cam), bp = (cam % SEG) / SEG;
    const ps = segAt(c.d), camY = lerp(ps.y1, ps.y2, (wrap(c.d) % SEG) / SEG) + CAMH, camX = c.x * ROADW;
    let maxy = y0 + H, x = 0, dx = -base.curve * bp;
    const vis = [];
    for (let n = 0; n < DRAW; n++) {
      const s = segs[(base.i + n) % N], z1 = s.i * SEG + (s.i < base.i ? LEN : 0) - cam, z2 = z1 + SEG, x1 = x, x2 = x + dx;
      x += dx; dx += s.curve;
      if (z1 <= DEPTH) continue;
      const k1 = DEPTH / z1, k2 = DEPTH / z2;
      const X1 = cx + k1 * (x1 - camX) * cx, X2 = cx + k2 * (x2 - camX) * cx, Y1 = hor - k1 * (s.y1 - camY) * H / 2, Y2 = hor - k2 * (s.y2 - camY) * H / 2;
      const W1 = k1 * ROADW * cx, W2 = k2 * ROADW * cx;
      s.q = { X1, Y1, W1, X2, Y2, W2, k1, k2, n, road: Y2 < Y1 && Y2 < maxy };   // (road: not facing away, not behind a crest)
      vis.push(s);
      if (s.q.road) maxy = Y2;
    }
    const at = new Map();   // the others on the road, by segment
    for (const e of [...bikes, ...cars]) {   // (not what is beside or behind our car: it would loom over the whole half)
      if (e === c || wrap(e.d - cam) < AHEAD - SEG * 0.3) continue;
      const si = Math.floor(wrap(e.d) / SEG) % N; if (!at.has(si)) at.set(si, []); at.get(si).push(e);
    }
    // far to near, each segment's road then what stands on it (nearer ground covers what a crest hides); each strip on
    // whole pixel rows, at least one, so no seam shows between them
    for (let n = vis.length - 1; n >= 0; n--) {
      const s = vis[n], q = s.q, { X1, W1, X2, W2 } = q, Y1 = Math.round(q.Y1), Y2 = Math.min(Math.round(q.Y2), Y1 - 1);
      if (q.road) {
        const lit = Math.floor(s.i / 3) % 2, rum = lit ? '#ECE4D6' : '#C9483F';
        box(g, lit ? '#5E9E48' : '#548E40', 0, Y2, W, Y1 - Y2);
        poly(g, rum, X1 - W1 * 1.14, Y1, X1 - W1, Y1, X2 - W2, Y2, X2 - W2 * 1.14, Y2);
        poly(g, rum, X1 + W1, Y1, X1 + W1 * 1.14, Y1, X2 + W2 * 1.14, Y2, X2 + W2, Y2);
        poly(g, s.i < 2 ? (lit ? '#F2F2F2' : '#202020') : lit ? '#6C6B72' : '#646369', X1 - W1, Y1, X1 + W1, Y1, X2 + W2, Y2, X2 - W2, Y2);
        if (lit && q.n < 40) for (const l of [-1 / 3, 1 / 3]) poly(g, '#EDE7DA', X1 + W1 * (l - 0.02), Y1, X1 + W1 * (l + 0.02), Y1, X2 + W2 * (l + 0.02), Y2, X2 + W2 * (l - 0.02), Y2);
      }
      for (const sp of s.sprites) deco(g, sp, X1 + q.k1 * sp.x * ROADW * cx, Y1, q.k1 * cx, W1);
      for (const e of at.get(s.i) || []) {
        const f = (wrap(e.d) % SEG) / SEG, k = lerp(q.k1, q.k2, f);
        if (e.kind) bike(g, lerp(X1, X2, f) + k * e.x * ROADW * cx, lerp(Y1, q.Y2, f), k * cx, e.kind); else carBack(g, lerp(X1, X2, f) + k * e.x * ROADW * cx, lerp(Y1, q.Y2, f), k * cx, e.col, e.boost, G.t);
      }
    }
    // our car, bouncing on the verge, spinning after a knock
    const rough = Math.abs(c.x) > 1.05 && c.speed > 500, ty = y0 + H - 3 - (rough ? Math.round(Math.random() * 2) : 0);
    g.save();
    if (c.spin > 0) { g.translate(cx, ty - 8); g.rotate(Math.sin(c.spin * 18) * 0.25); g.translate(-cx, -(ty - 8)); }
    carBack(g, cx + c.steer * 3, ty, 50 / 620, c.col, c.boost, G.t, c.steer);
    g.restore();
    if (rough) for (let k = 0; k < 4; k++) box(g, '#C9B48A', cx - 26 + Math.random() * 52, ty - Math.random() * 6, 2, 2);
    box(g, c.col, 4, y0 + 3, 6, 7); text(g, c.name, 13, y0 + 4, '#FFFFFF');
    text(g, ORD[c.pos - 1], 4, y0 + 13, c.pos === 1 ? '#F7D354' : '#FFFFFF', 2);
    text(g, `LAP ${clamp(c.lap + 1, 1, LAPS)}/${LAPS}`, W - 4, y0 + 4, '#FFFFFF', 1, 'r');
    text(g, clock(c.done || G.time), W - 4, y0 + 12, '#BFD8FF', 1, 'r');
    text(g, String(Math.round(c.speed / VMAX * 240)), W - 24, y0 + H - 14, '#FFFFFF', 2, 'r'); text(g, 'KM/H', W - 4, y0 + H - 10, '#FFFFFF', 1, 'r');
    box(g, 'rgba(0,0,0,.55)', 4, y0 + H - 10, 52, 6); box(g, c.boost ? '#FFD24A' : '#3FC8FF', 5, y0 + H - 9, 50 * c.nitro, 4); text(g, 'NOS', 59, y0 + H - 10, '#3FC8FF');
    if (c.done) { box(g, 'rgba(8,10,16,.45)', 0, y0, W, H); text(g, 'FINISH', cx, y0 + H / 2 - 20, '#FFFFFF', 4, 'c'); text(g, ORD[c.pos - 1], cx, y0 + H / 2 + 4, '#F7D354', 3, 'c'); }
    g.restore();
  }
  function drawPodium(g) {
    const gr = g.createLinearGradient(0, 0, 0, TV_H);
    gr.addColorStop(0, '#231942'); gr.addColorStop(1, '#E07A5F'); g.fillStyle = gr; g.fillRect(0, 0, TV_W, TV_H);
    for (let i = 0; i < 70; i++) box(g, ['#F7D354', '#FF6B6B', '#4FC3F7', '#9BE564'][i % 4], (i * 53 + Math.floor(G.t * (20 + (i % 5) * 8))) % TV_W, (i * 37 + Math.floor(G.t * (30 + (i % 7) * 6))) % TV_H, 2, 2);
    banner(g, 'RESULTS', 10, '#FFFFFF', 4);
    for (const [p, x, hh] of [[1, 96, 40], [0, 192, 60], [2, 288, 26]]) {   // second, first, third
      const c = podium[p];
      if (!c) continue;
      box(g, '#EDE6D8', x - 40, 186 - hh, 80, hh); box(g, '#CFC6B4', x - 40, 186 - hh, 80, 3); text(g, String(p + 1), x, 192 - hh, '#7A6E5A', 3, 'c', null);
      carBack(g, x, 186 - hh, 64 / 620, c.col, false);
      text(g, c.name, x, 186 - hh - 40, '#FFFFFF', 1, 'c');
    }
    box(g, '#0B0E14', 0, 190, TV_W, 26);
    text(g, `${G.names[G.winner]} WINS`, TV_W / 2, 197, '#F7D354', 2, 'c');
  }
  G.draw = (g) => frame(g, G, () => {
    if (phase === 'end') { drawPodium(g); return; }
    half(g, cars[0], 0); half(g, cars[1], TV_H - HALF);
    box(g, '#0A0C10', 0, HALF, TV_W, TV_H - 2 * HALF);
    const n = Math.ceil(phaseT - 0.4);
    if (phase === 'count') banner(g, n > 0 ? String(n) : 'GO!', TV_H / 2 - 15, n > 0 ? '#FFFFFF' : '#7CFC7C', 6);
    else if (G.time < 0.9) banner(g, 'GO!', TV_H / 2 - 15, '#7CFC7C', 6);
  });
  return G;
}

/* ---------- fighting: a rooftop at sunset, best of three rounds ---------- */
const AW = 520, FLOOR = 184, ROUND_T = 40;
// wind-up, the hit, recovery (s); how far it reaches, how hard, how long it stuns, how far it pushes
const MOVES = { punch: { a: 0.06, b: 0.07, c: 0.14, reach: 30, dmg: 4, stun: 0.22, push: 70 }, kick: { a: 0.1, b: 0.08, c: 0.22, reach: 40, dmg: 6, stun: 0.3, push: 120 },
  special: { a: 0.22, b: 0.05, c: 0.33 } };
function fighting(o) {
  const G = base('fighting', o), R = G.rand, col = G.colors;
  const make = (i) => ({ i, x: AW / 2 + (i ? 52 : -52), y: 0, vx: 0, vy: 0, face: i ? -1 : 1, hp: 100, ghost: 100, meter: 0.25, st: 'idle', t: 0, hit: false, stun: 0, wins: 0, low: false });
  const F = [make(0), make(1)], plan = [{}, {}], think = [0, 0];
  let shots = [], sparks = [], phase = 'intro', phaseT = 1.9, round = 1, freeze = 0, koBy = -1;
  G.time = ROUND_T;
  const busy = (f) => ['punch', 'kick', 'special', 'hurt', 'ko', 'win'].includes(f.st);
  const begin = (f, st) => { f.st = st; f.t = 0; f.hit = false; if (f.y <= 0) f.vx = 0; };
  // the stick: walk (slower backing off), up to jump, down to block; a to punch, b to kick (or, standing still with a
  // full bar, the special)
  function control(f, c) {
    const o = F[1 - f.i], pa = G.press(f.i, c, 'a'), pb = G.press(f.i, c, 'b'), up = G.press(f.i, { u: (c?.y || 0) < -0.5 }, 'u');
    if (busy(f)) return;
    if (f.y <= 0) f.face = o.x > f.x ? 1 : -1;
    const air = f.y > 0, mx = clamp(c?.x || 0, -1, 1);
    if (pb) { begin(f, !air && f.meter >= 1 && Math.abs(mx) < 0.3 ? 'special' : 'kick'); return; }
    if (pa && !air) { begin(f, 'punch'); return; }
    if (air) return;
    if (up) { f.st = 'jump'; f.vy = 310; f.y = 0.1; f.vx = mx * 100; return; }
    if ((c?.y || 0) > 0.5) { f.st = 'block'; f.vx = 0; return; }
    f.vx = Math.abs(mx) > 0.2 ? mx * (mx * f.face > 0 ? 96 : 70) : 0;
    f.st = f.vx ? 'walk' : 'idle';
  }
  const spark = (f, blocked) => sparks.push({ x: f.x - f.face * 4, y: 30 + R() * 14, t: 0, blocked });
  function strike(f, m) {
    const o = F[1 - f.i], d = (o.x - f.x) * f.face;
    if (d < 0 || d > m.reach + 8 || Math.abs(o.y - f.y) > 36 || o.st === 'ko') return;
    if (f.st === 'punch' && o.y > 24) return;   // jumped clean over it
    hurt(o, f, m.dmg + (f.y > 0 ? 1 : 0), m.stun, m.push, f.face);
  }
  function hurt(o, by, dmg, stun, push, dir) {
    if (o.st === 'block' && o.y <= 0 && dir === -o.face) { o.hp = Math.max(1, o.hp - 1); o.vx = dir * push * 0.6; spark(o, true); return; }   // blocked: a scratch
    o.hp = Math.max(0, o.hp - dmg); o.st = 'hurt'; o.t = 0; o.stun = stun; o.vx = dir * push;
    if (o.y > 0) o.vy = 140;
    by.meter = Math.min(1, by.meter + 0.1); o.meter = Math.min(1, o.meter + 0.07);
    spark(o, false); G.shake = Math.max(G.shake, dmg >= 6 ? 4 : 2); G.emit('hit', by.i);
    if (!o.low && o.hp > 0 && o.hp < 20) { o.low = true; G.emit('close', by.i); }
    if (o.hp <= 0) ko(by.i);
  }
  function ko(w) {
    const l = F[1 - w];
    l.st = 'ko'; l.t = 0; l.vy = 200; l.y = Math.max(l.y, 0.1); l.vx = F[w].face * 150;
    F[w].wins++; G.score = [F[0].wins, F[1].wins]; G.emit('ko', w); koBy = w;
    phase = 'ko'; phaseT = 3.2; freeze = 0.9; G.flash = 0.9; G.shake = 8; shots = [];
  }
  function timeUp() {   // the clock ran out: the one with more left takes the round
    const w = F[0].hp === F[1].hp ? -1 : F[0].hp > F[1].hp ? 0 : 1;
    if (w >= 0) { F[w].wins++; G.score = [F[0].wins, F[1].wins]; G.emit('ko', w); }
    koBy = w; phase = 'time'; phaseT = 2.6; shots = [];
  }
  function next() {
    if (F.some((f) => f.wins >= 2) || round >= 3) {
      phase = 'end'; G.over = true;
      G.winner = F[0].wins !== F[1].wins ? (F[0].wins > F[1].wins ? 0 : 1) : F[0].hp === F[1].hp ? -1 : F[0].hp > F[1].hp ? 0 : 1;
      if (G.winner >= 0) begin(F[G.winner], 'win');
      G.emit('win', G.winner);
      return;
    }
    round++; phase = 'intro'; phaseT = 1.9; G.time = ROUND_T;
    for (const f of F) Object.assign(f, { x: AW / 2 + (f.i ? 52 : -52), y: 0, vx: 0, vy: 0, face: f.i ? -1 : 1, hp: 100, ghost: 100, st: 'idle', t: 0, stun: 0, low: false });
  }
  function bodies(h) {
    for (const f of F) {
      f.t += h; f.stun = Math.max(0, f.stun - h); f.ghost = Math.max(f.hp, f.ghost - h * 26);
      if (phase === 'fight') f.meter = Math.min(1, f.meter + h * 0.04);
      const m = MOVES[f.st];
      if (m) {
        if (!f.hit && f.t >= m.a) {
          f.hit = true;
          if (f.st === 'special') { f.meter = 0; shots.push({ i: f.i, x: f.x + f.face * 22, y: 30, v: f.face * 210, t: 0 }); } else strike(f, m);
        }
        if (f.t >= m.a + m.b + m.c) f.st = f.y > 0 ? 'jump' : 'idle';
      }
      if (f.st === 'hurt' && f.stun <= 0) f.st = f.y > 0 ? 'jump' : 'idle';
      if (f.y > 0 || f.vy > 0) {
        f.vy -= 950 * h; f.y += f.vy * h;
        if (f.y <= 0) { f.y = 0; f.vy = 0; sparks.push({ x: f.x, y: 2, t: 0, dust: true }); if (f.st === 'jump' || f.st === 'kick') f.st = 'idle'; if (f.st !== 'ko') f.vx = 0; }
      }
      f.x = clamp(f.x + f.vx * h, 20, AW - 20);
      if (f.st === 'hurt' || f.st === 'ko' || f.st === 'block') f.vx *= Math.max(0, 1 - h * 6);
    }
    const [a, b] = F, gap = Math.abs(a.x - b.x);   // nobody walks through the other
    if (gap < 24 && Math.abs(a.y - b.y) < 44 && a.st !== 'ko' && b.st !== 'ko') { const s = a.x <= b.x ? -1 : 1, p = (24 - gap) / 2; a.x = clamp(a.x + s * p, 20, AW - 20); b.x = clamp(b.x - s * p, 20, AW - 20); }
    for (const s of shots) {
      s.x += s.v * h; s.t += h;
      const e = F[1 - s.i];
      if (!s.gone && Math.abs(e.x - s.x) < 14 && e.y < 44 && e.st !== 'ko') { s.gone = true; hurt(e, F[s.i], 10, 0.4, 150, Math.sign(s.v)); }
      if (s.x < -30 || s.x > AW + 30) s.gone = true;
    }
    if (shots.length === 2 && shots[0].i !== shots[1].i && Math.abs(shots[0].x - shots[1].x) < 10) {   // two fireballs meet: both go up
      for (const s of shots) { s.gone = true; sparks.push({ x: s.x, y: s.y, t: 0, blocked: true }); }
      G.flash = 0.4;
    }
    shots = shots.filter((s) => !s.gone);
    for (const s of sparks) s.t += h;
    sparks = sparks.filter((s) => s.t < 0.35);
  }
  const sim = (h, cs) => {
    if (freeze > 0) { freeze -= h; h *= 0.12; }   // the K.O. hangs in the air a moment
    if (phase === 'fight') {
      G.time = Math.max(0, G.time - h);
      for (const f of F) control(f, cs[f.i] || G.ai(f.i));
    } else {
      if (phase !== 'end' && (phaseT -= h) <= 0) { if (phase === 'intro') { phase = 'fight'; G.emit('start', -1); } else next(); }
      if ((phase === 'ko' && phaseT < 2.2 || phase === 'time') && koBy >= 0 && F[koBy].st !== 'win' && F[koBy].y <= 0) begin(F[koBy], 'win');
    }
    bodies(h);
    if (phase === 'fight' && G.time <= 0) timeUp();
  };
  G.step = stepper(G, sim);
  G.lead = (i) => (F[i].wins - F[1 - i].wins) * 1000 + F[i].hp - F[1 - i].hp;
  // a computer fighter: closes in, mixes punches and kicks up close, blocks what it sees coming (sooner the better it is),
  // hops fireballs, throws one from range with a full bar, backs off when nearly out, and now and then just gets it wrong
  G.ai = (i, level = 0.7) => {
    const f = F[i], e = F[1 - i], c = { x: 0, y: 0, a: false, b: false };
    if (phase !== 'fight') return c;
    const d = Math.abs(e.x - f.x), to = Math.sign(e.x - f.x) || 1, p = plan[i];
    if (G.t > think[i]) {
      think[i] = G.t + 0.12 + (1 - level) * 0.3 + R() * 0.12;
      const inc = shots.find((s) => s.i !== i && (f.x - s.x) * Math.sign(s.v) > 0 && Math.abs(f.x - s.x) < 90);
      const threat = (e.st === 'punch' || e.st === 'kick') && e.t < 0.1 && d < 52;
      p.block = (threat && R() < 0.25 + level * 0.6) || (!!inc && R() < level * 0.35);
      p.jump = !!inc && !p.block && R() < 0.5 + level * 0.3;
      p.atk = null;
      if (d < 36 && R() < 0.45 + level * 0.35) p.atk = R() < 0.55 ? 'a' : 'b';
      else if (d > 110 && f.meter >= 1 && R() < 0.6) p.atk = 'special';
      else if (d > 60 && d < 100 && R() < 0.06 + level * 0.06) { p.jump = true; p.atk = 'b'; }   // a jump-in kick
      p.move = d > 34 ? to : d < 20 ? -to : R() < 0.3 ? -to : 0;
      if (f.hp < 25 && f.hp < e.hp && R() < 0.4) p.move = -to;
      if (R() < (1 - level) * 0.25) { p.atk = null; p.move = R() < 0.5 ? -to : to; }   // a lapse
      p.fresh = true;
    }
    if (p.block) { c.y = 1; return c; }
    c.x = p.move;
    if (p.fresh && p.jump) c.y = -1;
    if (p.fresh && !p.jump) { if (p.atk === 'a') c.a = true; else if (p.atk === 'b') c.b = true; else if (p.atk === 'special') { c.b = true; c.x = 0; } }
    if (p.jump && p.atk === 'b' && f.y > 30) c.b = true;   // the kick at the top of the jump
    p.fresh = false;
    return c;
  };
  // a chibi fighter, drawn facing right and mirrored when facing left
  function fighter(g, f, cam) {
    const c = col[f.i], dk = shade(c, -0.45), lt = shade(c, 0.35), skin = f.i ? '#E2AE80' : '#F2CBA2', hair = f.i ? '#1C1C24' : '#3A2416';
    g.save(); g.translate(Math.round(f.x - cam), FLOOR - Math.round(f.y)); if (f.face < 0) g.scale(-1, 1);
    if (f.st === 'ko' && f.y <= 0) {   // flat out
      box(g, dk, -22, -6, 14, 6); box(g, c, -8, -9, 16, 9); disc(g, skin, 14, -7, 7); box(g, hair, 8, -14, 13, 4);
      box(g, '#111', 13, -9, 1, 1); box(g, '#111', 15, -9, 1, 1); box(g, '#111', 14, -8, 1, 1); box(g, '#111', 13, -7, 1, 1); box(g, '#111', 15, -7, 1, 1);
      g.restore(); return;
    }
    const m = MOVES[f.st], ext = m ? (f.t < m.a ? -0.3 : f.t < m.a + m.b ? 1 : Math.max(0, 1 - (f.t - m.a - m.b) / m.c)) : 0;
    const crouch = f.st === 'block' ? 6 : 0, bob = f.st === 'idle' || f.st === 'win' ? Math.round(Math.sin(G.t * 7 + f.i * 2)) : 0;
    const step = f.st === 'walk' ? Math.round(Math.sin(G.t * 14) * 3) : 0, hurt = f.st === 'hurt';
    const lean = hurt ? -3 : f.st === 'punch' || f.st === 'kick' ? Math.round(Math.max(0, ext) * 2) : 0;
    if (f.st === 'kick') {   // legs
      box(g, dk, -7, -16, 6, 16); box(g, '#222228', -8, -3, 8, 3);
      const r = Math.round(6 + Math.max(0, ext) * 22); box(g, dk, 0, -18, r, 6); box(g, skin, r, -18, 4, 6);
    } else if (f.y > 0) { box(g, dk, -7, -15, 6, 9); box(g, dk, 1, -13, 6, 9); box(g, '#222228', -8, -8, 7, 3); box(g, '#222228', 1, -6, 7, 3); }
    else { box(g, dk, -7 + step, -16 + crouch, 6, 16 - crouch); box(g, dk, 1 - step, -16 + crouch, 6, 16 - crouch); box(g, '#222228', -8 + step, -3, 8, 3); box(g, '#222228', 1 - step, -3, 8, 3); }
    const by = -31 + crouch + bob, sx = 5 + lean;   // the body: shirt, a shine, belt and buckle
    box(g, c, -8 + lean, by, 16, 16); box(g, lt, -6 + lean, by + 2, 4, 7); box(g, '#1A1A20', -8 + lean, by + 12, 16, 3); box(g, '#F7D354', -1 + lean, by + 12, 3, 3);
    const back = shade(skin, -0.2);   // arms
    if (f.st === 'punch') { const r = Math.round(4 + Math.max(0, ext) * 18); box(g, skin, sx, by + 3, r, 4); box(g, lt, sx + r, by + 1, 6, 7); box(g, back, -11 + lean, by + 3, 4, 8); }
    else if (f.st === 'special') { box(g, skin, sx, by + 2, 10, 4); box(g, skin, sx, by + 7, 10, 4); if (ext > 0) disc(g, lt, sx + 13, by + 7, 4); }
    else if (f.st === 'block') { box(g, skin, sx - 2, by - 3, 5, 12); box(g, skin, sx + 2, by - 5, 5, 12); }
    else if (f.st === 'win') { box(g, skin, sx - 2, by - 14, 4, 15); box(g, lt, sx - 3, by - 19, 6, 6); box(g, back, -11 + lean, by + 3, 4, 8); }
    else if (hurt) { box(g, skin, sx - 2, by - 6, 4, 9); box(g, back, -12 + lean, by - 4, 4, 9); }
    else { box(g, skin, sx, by + 4, 6, 4); box(g, lt, sx + 5, by, 6, 6); box(g, back, -12 + lean, by + 3, 4, 7); box(g, lt, -13 + lean, by + 8, 5, 5); }   // up on guard
    const hx = 1 + lean, hy = by - 10;   // the head: hair, a headband in the team's colour with its tails flying, eyes on the other one
    disc(g, skin, hx, hy, 9);
    g.fillStyle = hair;
    for (let dy = -9; dy <= -2; dy++) { const w = Math.round(Math.sqrt(81 - dy * dy)); g.fillRect(hx - w, hy + dy, w * 2 + 1 - (dy > -5 ? 7 : 0), 1); }
    box(g, hair, hx - 8, hy - 11, 3, 3); box(g, hair, hx - 3, hy - 12, 3, 3); box(g, hair, hx + 2, hy - 11, 3, 3);
    const fl = Math.round(Math.sin(G.t * 12 + f.i) * 2);
    box(g, c, hx - 9, hy - 4, 19, 3); box(g, c, hx - 14, hy - 4 + fl, 5, 2); box(g, c, hx - 18, hy - 2 + fl, 4, 2);
    if (hurt) { box(g, '#111', hx + 2, hy, 3, 1); box(g, '#111', hx + 6, hy, 3, 1); }
    else { box(g, '#FFFFFF', hx + 2, hy - 1, 3, 4); box(g, '#FFFFFF', hx + 6, hy - 1, 3, 4); box(g, '#111', hx + 4, hy, 1, 2); box(g, '#111', hx + 8, hy, 1, 2); }
    box(g, f.st === 'win' ? '#7A2020' : shade(skin, -0.35), hx + 4, hy + 5, f.st === 'win' ? 4 : 3, f.st === 'win' ? 2 : 1);
    g.restore();
  }
  G.draw = (g) => frame(g, G, () => {
    const cam = clamp((F[0].x + F[1].x) / 2 - TV_W / 2, 0, AW - TV_W);
    const sky = g.createLinearGradient(0, 0, 0, FLOOR);
    sky.addColorStop(0, '#231942'); sky.addColorStop(0.55, '#B8505F'); sky.addColorStop(1, '#F4A259');
    g.fillStyle = sky; g.fillRect(0, 0, TV_W, TV_H);
    const sx = Math.round(250 - cam * 0.08);   // the sun, banded like an old poster
    for (let r = -30; r <= 30; r++) { if (r > 4 && r % 6 < (r - 4) / 8 + 1) continue; const w = Math.round(Math.sqrt(900 - r * r)); box(g, '#FFD08A', sx - w, 118 + r, w * 2, 1); }
    for (const L of [0, 1]) {   // two rows of towers, the far one paler, lit windows
      const par = L ? 0.55 : 0.3, colr = L ? '#2A1E3F' : '#4A3560', bottom = FLOOR - 8;
      for (const [bx, bw, bh, win] of TOWERS[L]) {
        const X = Math.round(bx - cam * par);
        if (X > TV_W || X + bw < 0) continue;
        box(g, colr, X, bottom - bh, bw, bh);
        g.fillStyle = L ? '#F4C26B' : '#C79A7A'; for (const [wx, wy] of win) g.fillRect(X + wx, bottom - bh + wy, 1, 2);
      }
    }
    const nx = Math.round(330 - cam * 0.55);   // a neon PHỞ sign on a near tower, buzzing
    if (Math.floor(G.t * 7) % 23) { box(g, '#2A0F14', nx - 20, 92, 40, 16); text(g, 'PHO', nx, 97, '#FF5A4E', 2, 'c', null); box(g, '#FF5A4E', nx + 11, 95, 2, 2); box(g, '#FF5A4E', nx + 5, 92, 4, 1); }
    const rx = -cam;   // the roof: a parapet with a railing on it, the floor, a water tank, an aerial with its red light
    box(g, '#3B3344', 0, FLOOR - 9, TV_W, 9); box(g, '#4A4254', 0, FLOOR - 9, TV_W, 1);
    box(g, '#2E2836', 0, FLOOR - 19, TV_W, 2);
    for (let x = Math.round(((rx % 14) + 14) % 14); x < TV_W; x += 14) box(g, '#2E2836', x, FLOOR - 19, 2, 10);
    const tx = Math.round(70 - cam);
    box(g, '#3A3440', tx - 14, FLOOR - 34, 3, 24); box(g, '#3A3440', tx + 11, FLOOR - 34, 3, 24);
    box(g, '#9AA3AD', tx - 18, FLOOR - 62, 36, 30); box(g, '#7E8790', tx - 18, FLOOR - 52, 36, 2); box(g, '#7E8790', tx - 18, FLOOR - 42, 36, 2); poly(g, '#7E8790', tx - 18, FLOOR - 62, tx + 18, FLOOR - 62, tx, FLOOR - 72);
    const ax = Math.round(470 - cam);
    box(g, '#3A3440', ax, FLOOR - 96, 2, 86); box(g, '#3A3440', ax - 8, FLOOR - 80, 18, 2);
    if (Math.floor(G.t * 1.5) % 2) box(g, '#FF3B30', ax - 1, FLOOR - 99, 4, 4);
    box(g, '#686270', 0, FLOOR, TV_W, TV_H - FLOOR);
    for (let x = Math.round(((rx % 28) + 28) % 28); x < TV_W; x += 28) box(g, '#5C5664', x, FLOOR, 1, TV_H - FLOOR - 7);
    box(g, '#5C5664', 0, FLOOR + 11, TV_W, 1); box(g, '#4E4856', 0, TV_H - 7, TV_W, 7);
    for (const f of F) { const s = Math.max(6, 13 - f.y / 10); box(g, 'rgba(0,0,0,.3)', f.x - cam - s, FLOOR - 1, s * 2, 3); }
    for (const f of [...F].sort((a, b) => (busy(a) ? 1 : 0) - (busy(b) ? 1 : 0))) fighter(g, f, cam);   // (whoever is attacking in front)
    for (const s of shots) {
      const x = Math.round(s.x - cam), y = FLOOR - s.y, c = shade(col[s.i], 0.3);
      for (let k = 4; k >= 1; k--) { g.globalAlpha = 0.55 - k * 0.11; box(g, c, x - Math.sign(s.v) * k * 6 - 3, y - 3, 6, 6); }
      g.globalAlpha = 1; disc(g, c, x, y, 6 + (Math.floor(G.t * 20) % 2)); disc(g, '#FFFFFF', x, y, 3);
    }
    for (const s of sparks) {
      const x = Math.round(s.x - cam), y = FLOOR - Math.round(s.y), r = Math.round(3 + s.t * 30), a = (1 - s.t / 0.35).toFixed(2);
      if (s.dust) { box(g, `rgba(210,200,190,${a})`, x - r - 2, y - 2, 3, 2); box(g, `rgba(210,200,190,${a})`, x + r, y - 2, 3, 2); continue; }
      const c = s.blocked ? `rgba(150,220,255,${a})` : `rgba(255,236,120,${a})`;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) box(g, c, x + dx * r, y + dy * r, 2, 2);
      if (s.t < 0.08) box(g, '#FFFFFF', x - 3, y - 3, 7, 7);
    }
    for (const f of F) {   // health (emptying toward the middle, a red trail behind), names, rounds won, the special's bar
      const L = !f.i, bw = 150, x0 = L ? 10 : TV_W - 10 - bw, hw = Math.round(bw * f.hp / 100), gw = Math.round(bw * f.ghost / 100);
      box(g, '#0B0B10', x0 - 1, 7, bw + 2, 9); box(g, '#3A1418', x0, 8, bw, 7);
      if (gw) box(g, '#D94040', L ? x0 : x0 + bw - gw, 8, gw, 7);
      if (hw) box(g, f.hp < 25 && Math.floor(G.t * 6) % 2 ? '#FFF27A' : '#F7D354', L ? x0 : x0 + bw - hw, 8, hw, 7);
      text(g, G.names[f.i], L ? x0 : x0 + bw, 19, '#FFFFFF', 1, L ? 'l' : 'r');
      for (let k = 0; k < 2; k++) box(g, k < f.wins ? '#F7D354' : '#33303A', L ? x0 + bw - 6 - k * 8 : x0 + 1 + k * 8, 19, 5, 5);
      const mx = L ? 10 : TV_W - 70, full = f.meter >= 1;
      box(g, '#0B0B10', mx, TV_H - 12, 60, 5); box(g, full ? (Math.floor(G.t * 8) % 2 ? '#7FE3FF' : '#3FB8FF') : '#2F7FD0', mx + 1, TV_H - 11, 58 * f.meter, 3);
      if (full) text(g, 'SUPER', L ? mx + 64 : mx - 4, TV_H - 12, '#7FE3FF', 1, L ? 'l' : 'r');
    }
    box(g, '#0B0B10', TV_W / 2 - 13, 4, 26, 15); text(g, String(Math.ceil(G.time)).padStart(2, '0'), TV_W / 2, 6, G.time < 10 ? '#FF6B5B' : '#FFFFFF', 2, 'c');
    if (phase === 'intro') { if (phaseT > 0.8) banner(g, round === 3 ? 'FINAL ROUND' : `ROUND ${round}`, 70, '#FFFFFF', round === 3 ? 4 : 5); else banner(g, 'FIGHT!', 66, '#F7D354', 7); }
    if (phase === 'ko') banner(g, 'K.O.', 60, '#FF4B3E', 9);
    if (phase === 'time') banner(g, koBy < 0 ? 'DRAW' : 'TIME', 66, '#FFFFFF', 6);
    if (phase === 'end') {
      dim(g, 0.35);
      if (G.winner >= 0 && F[G.winner].hp === 100) banner(g, 'PERFECT', 46, '#7FE3FF', 4);
      const s = G.winner < 0 ? 'DRAW GAME' : `${G.names[G.winner]} WINS`;
      banner(g, s, 78, '#F7D354', s.length > 12 ? 3 : 4);
    }
  });
  return G;
}

/* ---------- the TV on with nobody playing: the game's title screen (no kind: the console's home screen) ---------- */
export function drawIdle(g, t, kind) {
  g.imageSmoothingEnabled = false;
  const home = !GAMES.includes(kind), k = home ? GAMES[Math.floor(t / 5) % GAMES.length] : kind;
  const [top, low] = { football: ['#0F3B22', '#2F7A3A'], racing: ['#2B2257', '#F5B56C'], fighting: ['#231942', '#E07A5F'] }[k];
  const gr = g.createLinearGradient(0, 0, 0, TV_H);
  gr.addColorStop(0, top); gr.addColorStop(1, low); g.fillStyle = gr; g.fillRect(0, 0, TV_W, TV_H);
  if (k === 'football') {   // a pitch rising toward you, a ball bouncing across it
    for (let i = 0; i < 9; i++) box(g, i % 2 ? '#3D9746' : '#46A650', 0, 120 + i * 11, TV_W, 11);
    box(g, '#E8F2E4', 0, 120, TV_W, 1);
    const bx = 192 + Math.sin(t * 0.9) * 130, bz = Math.abs(Math.sin(t * 3.2)) * 46;
    box(g, 'rgba(0,0,0,.3)', bx - 6, 170, 13, 3); disc(g, '#FFFFFF', bx, 162 - bz, 7); box(g, '#1A1A1A', bx - 2, 159 - bz, 4, 4);
  } else if (k === 'racing') {   // the road to the horizon, a car on it
    for (const [bx, bw, bh] of SKYLINE) if (bx < TV_W + 40) box(g, '#3A2B57', bx - 20, 121 - bh, bw, bh);
    box(g, '#548E40', 0, 120, TV_W, 96);
    poly(g, '#6C6B72', 170, 120, 214, 120, 384, 216, 0, 216);
    for (let i = 0; i < 8; i++) { const p = ((i + t * 2.2) % 8) / 8; box(g, '#EDE7DA', 192 - (1 + p * 5) / 2, 120 + p * p * 96, 1 + p * 5, 2 + p * 8); }
    carBack(g, 192 + Math.sin(t * 1.5) * 20, home ? 186 : 208, 70 / 620, '#E8742A', Math.floor(t * 2) % 2 === 0, t);
  } else {   // two fighters facing up on the roof
    for (const [bx, bw, bh] of TOWERS[1]) if (bx < TV_W + 60) box(g, '#2A1E3F', bx + 30, 176 - bh, bw, bh);
    box(g, '#5E5864', 0, 176, TV_W, 40);
    for (const s of [-1, 1]) {
      const x = 192 + s * 44, b = Math.round(Math.sin(t * 6 + s));
      box(g, '#15101E', x - 8, 144 + b, 16, 18); disc(g, '#15101E', x, 133 + b, 9); box(g, '#15101E', x - 7, 162, 6, 14); box(g, '#15101E', x + 1, 162, 6, 14); box(g, '#15101E', x - s * 12 - 3, 147 + b, 6, 5);
    }
    text(g, 'VS', 192, 140, '#F7D354', 3, 'c');
  }
  banner(g, TITLES[k], 40, '#FFFFFF', TITLES[k].length > 11 ? 4 : 5);
  if (Math.floor(t * 1.6) % 2 === 0) text(g, 'PRESS START', TV_W / 2, 84, '#F7D354', 2, 'c');
  if (home) {
    box(g, 'rgba(0,0,0,.35)', 0, 0, TV_W, 12); text(g, 'MY OFFICE ARCADE', 5, 4, '#FFFFFF', 1, 'l', null);
    for (let i = 0; i < GAMES.length; i++) {
      const sel = GAMES[i] === k, x = 192 - 68 + i * 48, y = sel ? 196 : 198;
      box(g, sel ? '#FFFFFF' : 'rgba(0,0,0,.45)', x - 2, y - 2, 44, 18); box(g, ['#46A650', '#D2665E', '#6B4FA0'][i], x, y, 40, 14);
      text(g, ['GOAL', 'RUSH', 'FIGHT'][i], x + 20, y + 5, '#FFFFFF', 1, 'c');
    }
  }
}

/** A new match of `kind` (one of GAMES) between two players: { names, colors, seed }. */
export function createGame(kind, o = {}) {
  const make = { football, racing, fighting }[kind];
  return make ? make(o) : null;
}
