// Video games on the lounge TV (company floor). Now and then two people who are resting sit down on the sofa, pick up
// the controllers and play a match (football, racing or fighting: world/props/tv-games.js): the TV shows it, the wall
// behind it glows its colours, they cheer their goals and groan at the other's, and the winner is pleased with
// themselves. Work coming in for either of them ends it. In first person you can play too: E at the TV sits you down on
// the sofa with a controller (a real gamepad works as well), a colleague who is free comes over to take you on, or the
// console does.
import { state } from '../core/state.js';
import { PRO, officeNow, rand, reduceMotion, replay } from '../core/env.js';
import { fpCam } from '../scene/renderer.js';
import { GTV, SCREEN_H, SCREEN_W } from '../world/props/game-tv.js';
import { GAMES, createGame, drawIdle } from '../world/props/tv-games.js';
import { napOn } from '../life/nap.js';
import { fp } from '../interact/first-person.js';
import { STATIONS, faceTo } from './navigation.js';
import { sessions, workers } from './workers.js';
import { asleep, free, quip } from './errands.js';
import { toast } from '../ui/activity.js';
import { sfx } from '../audio/sfx.js';
import { t as tr } from '../../i18n/index.js';

const FPS = 20;            // (the screen is redrawn this often while it is on)
let G = null;              // the match: { kind, game, side: [{ w, name, color, e, seat, ai, skill }], stage, at, over }
let ME = null;             // first person on the sofa: { seat, menu, pick, keys, fov }
let nextAt = 0, drawAt = 0, glowAt = 0;
const pick = (key) => { const l = tr(key, null, 'list'); return Array.isArray(l) ? l[Math.floor(Math.random() * l.length)] : l; };
const nameOf = (w) => { const n = sessions.get(w.id)?.name || w.cfg.name || ''; return n.length > 11 ? `${n.slice(0, 10)}…` : n; };
const seats = () => STATIONS?.coffee?.slice(0, 2) || [];
const look = () => GTV && [GTV.center[0], GTV.center[2]];
const called = (w) => { const s = sessions.get(w.id); return !s || s.status !== 'rest' || !!s.bg?.length || !!w.want; };
// who could play: resting, nothing else on (not out, not on a break, not carrying anything, not at tea)
function who() {
  return [...workers.values()].filter((w) => { const s = sessions.get(w.id);
    return !w.sub && s?.status === 'rest' && !s.bg?.length && (free(w) || asleep(w)) && !w.onBreak && !w.outing && !w.street && !w.carry && !w.doze && !w.mealBox && !w.shred; });
}
// someone walking to a seat and sitting down on it with a controller (until the match's end)
function sitDown(w, seat, line, wait) {
  const e = w.errand({ type: 'idle', spot: seat, look: look(), anim: 'gamepad', wait, hold: 0.4, anim2: 'idle', linger: 0.8, line });
  e.until = state.sim + 600;
  return e;
}
const seated = (s) => !s.w || (s.w.chore === s.e && s.e.stage === 'go' && s.w.phase !== 'walk' && s.w.spot === s.seat && Math.hypot(s.w.pos.x - s.seat.x, s.w.pos.y - s.seat.z) < 0.2);
const gone = (s) => s.w && (s.w.chore !== s.e || s.w.leaving || !s.w.root.parent);

/** A match now (?debug: __office.tvGame('racing')), else now and then on its own. Returns whether one started. */
export function tvMatch(force = false, kind = null) {
  if (G || ME || !GTV || !GAMES.length || replay.on || reduceMotion) return false;
  const h = officeNow().getHours();
  if (!force && (napOn || h < 9 || h >= 22)) return false;
  const [s0, s1] = seats(); if (!s0 || !s1 || s0.by || s1.by) return false;
  const list = who(); if (list.length < 2) return false;
  const a = list.splice(Math.floor(Math.random() * list.length), 1)[0], b = list[Math.floor(Math.random() * list.length)];
  G = { kind: GAMES.includes(kind) ? kind : GAMES[Math.floor(Math.random() * GAMES.length)], game: null, stage: 'sit', at: 0, over: false, npc: true,
    side: [{ w: a, seat: s0 }, { w: b, seat: s1 }].map((s) => ({ ...s, name: nameOf(s.w), color: s.w.cfg.shirt, skill: rand(0.45, 0.85) })) };
  G.side[0].e = sitDown(a, s0, pick('people.tv.invite'), 0.4);
  G.side[1].e = sitDown(b, s1, pick('people.tv.join'), 2.4);
  return true;
}
// the end of it: both put the controllers down (now, or after a moment for the winner's cheer) and go back
function finish(after = 0) {
  if (!G || G.over) return;
  G.over = true;
  for (const s of G.side) if (s.w && s.w.chore === s.e) { s.e.until = state.sim + after; if (s.w.after) s.w.afterAt = Math.min(s.w.afterAt, s.e.until); }
}
function start() {
  const [a, b] = G.side;
  G.game = createGame(G.kind, { names: [a.name, b.name], colors: [a.color, b.color], seed: Math.floor(Math.random() * 1e9) });
  G.stage = 'play'; G.at = state.sim; sfx.play('beep');
}
// what happens in the game, in the room: goals cheered, KOs groaned at, the result
function react(ev) {
  const me = G.side[ev.who], them = G.side[1 - ev.who], npc = (s) => !!s?.w;
  switch (ev.type) {
    case 'goal': sfx.play('clap'); if (npc(me)) cheer(me, pick('people.tv.goal')); if (npc(them) && Math.random() < 0.5) quip(them.w, pick('people.tv.conceded'), 'idle'); break;
    case 'ko': sfx.play('thud'); if (npc(me)) cheer(me, pick('people.tv.ko')); break;
    case 'overtake': if (npc(me) && Math.random() < 0.4) quip(me.w, pick('people.tv.overtake'), 'idle'); break;
    case 'crash': sfx.play('thud'); if (npc(me) && Math.random() < 0.5) quip(me.w, pick('people.tv.crash'), 'idle'); break;
    case 'lap': sfx.play('beep'); break;
    case 'hit': sfx.play('click'); break;
    case 'close': if (npc(me) && Math.random() < 0.5) quip(me.w, pick('people.tv.close'), 'idle'); break;
    case 'win': gameOver(ev.who); break;
    default: break;
  }
}
// a cheer from the sofa: up with the arms for a moment, then back to the game
function cheer(s, line) {
  quip(s.w, line, 'idle');
  if (reduceMotion) return;
  s.w.anim = 'celebrate'; s.cheerUntil = state.sim + 1.4;
}
function gameOver(winner) {
  if (G.stage === 'result') return;
  G.stage = 'result'; G.at = state.sim;
  sfx.play('coin'); setTimeout(() => sfx.play('clap'), 300);
  const won = G.side[winner], lost = G.side[1 - winner];
  if (winner < 0) { for (const s of G.side) if (s.w) quip(s.w, pick('people.tv.draw'), 'idle'); }
  else {
    if (won?.w) { quip(won.w, pick('people.tv.win'), 'idle'); won.w.anim = 'celebrate'; won.cheerUntil = Infinity; }
    if (lost?.w) { quip(lost.w, pick('people.tv.lose'), 'idle'); lost.w.anim = 'think'; lost.cheerUntil = Infinity; }
    if (ME && won && !won.w) toast(tr('fp.tv.youWon'));
    else if (ME && lost && !lost.w) toast(tr('fp.tv.youLost', { name: won.name }));
  }
  if (G.npc) finish(3);
}

/* ---------- first person: on the sofa with a controller ---------- */
const KEYS = { KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', Space: 'a', KeyJ: 'a', Enter: 'a', KeyK: 'b', ShiftLeft: 'b', ShiftRight: 'b', KeyL: 'b' };
export function playFp() {
  if (!GTV || !GAMES.length || !fp?.on || ME) return;
  if (G?.npc) { toast(tr('fp.tv.busy', { a: G.side[0].name, b: G.side[1].name })); return; }
  const free2 = seats().filter((s) => !s.by); if (!free2.length) { toast(tr('fp.tv.noSeat')); return; }
  const seat = free2[0], [tx, tz] = look();
  seat.by = 'you';
  ME = { seat, menu: true, pick: 0, keys: new Set(), tap: new Set(), fov: fpCam.fov, lastPad: {}, mate: null };
  fp.seat = { x: seat.x, z: seat.z, y: 0.55 }; fp.pos.set(seat.x, seat.z); fp.yaw = faceTo(seat.x, seat.z, tx, tz); fp.pitch = -0.2; fp.anim = 'gamepad';
  document.body.classList.add('is-gaming');   // (no 'E: …' label over the screen)
  fpCam.fov = 44; fpCam.updateProjectionMatrix();
  GTV.pads[0].visible = false;
  // a colleague who is free comes over to take you on
  const other = seats().find((s) => !s.by), mate = other && who()[0];
  if (mate) { ME.mate = { w: mate, seat: other, e: sitDown(mate, other, pick('people.tv.joinYou'), 0.6) }; GTV.pads[1].visible = false; }
  toast(tr('fp.tv.sat'), 5200); sfx.play('beep');
}
function standUp() {
  if (!ME) return;
  if (G && !G.npc) { for (const s of G.side) if (s.w && s.w.chore === s.e) { s.e.until = state.sim; if (s.w.after) s.w.afterAt = Math.min(s.w.afterAt, state.sim); } G = null; }
  if (ME.mate && ME.mate.w.chore === ME.mate.e) { ME.mate.e.until = state.sim; if (ME.mate.w.after) ME.mate.w.afterAt = Math.min(ME.mate.w.afterAt, state.sim); }
  if (ME.seat.by === 'you') ME.seat.by = null;
  fpCam.fov = ME.fov; fpCam.updateProjectionMatrix();
  if (fp) { fp.anim = null; fp.seat = null; }
  document.body.classList.remove('is-gaming');
  ME = null;
}
// the controls this frame: the keyboard, or a real gamepad if one is plugged in (its left stick, A / B)
function myControls() {
  const on = (x) => ME.keys.has(x) || ME.tap.has(x);   // (a key tapped between two frames still counts for one)
  const c = { x: (on('r') ? 1 : 0) - (on('l') ? 1 : 0), y: (on('d') ? 1 : 0) - (on('u') ? 1 : 0), a: on('a'), b: on('b') };
  for (const pad of navigator.getGamepads?.() || []) {
    if (!pad?.connected) continue;
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0, btn = (i) => !!pad.buttons[i]?.pressed;
    if (Math.abs(ax) > 0.2) c.x = ax; if (Math.abs(ay) > 0.2) c.y = ay;
    if (btn(14)) c.x = -1; if (btn(15)) c.x = 1; if (btn(12)) c.y = -1; if (btn(13)) c.y = 1;
    c.a ||= btn(0) || btn(7); c.b ||= btn(1) || btn(6); c.start = btn(9); c.back = btn(8);
    break;
  }
  return c;
}
function menuInput(c) {
  const edge = (k, v) => { const was = ME.lastPad[k]; ME.lastPad[k] = v; return v && !was; };
  if (edge('l', c.x < -0.5)) { ME.pick = (ME.pick + GAMES.length - 1) % GAMES.length; sfx.play('click'); }
  if (edge('r', c.x > 0.5)) { ME.pick = (ME.pick + 1) % GAMES.length; sfx.play('click'); }
  if (edge('a', c.a || !!c.start)) {
    const mate = ME.mate && seated(ME.mate) && ME.mate.w.chore === ME.mate.e ? ME.mate : null;
    G = { kind: GAMES[ME.pick], game: null, stage: 'play', at: 0, over: false, npc: false,
      side: [{ w: null, name: tr('fp.tv.you'), color: '#E8742A', seat: ME.seat }, mate ? { ...mate, name: nameOf(mate.w), color: mate.w.cfg.shirt, skill: rand(0.55, 0.8) } : { w: null, name: tr('fp.tv.cpu'), color: '#5B8DEF', ai: true, skill: 0.6 }] };
    start(); ME.menu = false;
  }
}
function onKey(e, down) {
  if (!ME || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  if (down && (e.code === 'Escape' || e.code === 'KeyE')) { e.preventDefault(); e.stopPropagation(); standUp(); toast(tr('fp.tv.up')); return; }
  const k = KEYS[e.code]; if (!k) return;
  e.preventDefault(); e.stopPropagation();
  if (down) { ME.keys.add(k); ME.tap.add(k); } else ME.keys.delete(k);
}

/* ---------- the screen ---------- */
function drawOff() {
  const c = GTV.ctx, g = c.createLinearGradient(0, 0, SCREEN_W, SCREEN_H);
  g.addColorStop(0, '#15171B'); g.addColorStop(0.55, '#0B0C0F'); g.addColorStop(1, '#121418');
  c.fillStyle = g; c.fillRect(0, 0, SCREEN_W, SCREEN_H);
  GTV.tex.needsUpdate = true;
}
// the game menu in first person: the attract screen of the game picked, and how to play under it
function drawMenu(t) {
  const c = GTV.ctx, kind = GAMES[ME.pick]; drawIdle(c, t, kind);
  c.fillStyle = 'rgba(8,10,14,0.8)'; c.fillRect(0, SCREEN_H - 40, SCREEN_W, 40);
  c.fillStyle = '#FFFFFF'; c.font = 'bold 10px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(`◀  ${tr(`fp.tv.game.${kind}`)}  ▶`, SCREEN_W / 2, SCREEN_H - 31);
  c.fillStyle = '#FFD27A'; c.font = '8px monospace';
  c.fillText(tr(`fp.tv.keys.${kind}`), SCREEN_W / 2, SCREEN_H - 19);
  c.fillStyle = '#C9D4E3';
  c.fillText(tr('fp.tv.menuHelp', { who: ME.mate && seated(ME.mate) ? nameOf(ME.mate.w) : tr('fp.tv.cpu') }), SCREEN_W / 2, SCREEN_H - 8);
}
function setOn(on) {
  if (GTV.on === on) return;
  GTV.on = on;
  GTV.led.material.color.set(on ? '#DDE8FF' : '#D63A3A');
  GTV.conLed.material.color.set(on ? '#8EC5FF' : '#FFA24A');
  GTV.sheen.material.opacity = on ? 0.02 : 0.05;
  if (!on) { GTV.glowM.opacity = 0; drawOff(); }
}
// the wall behind the TV takes the picture's colour (averaged from a 4 x 4 copy, twice a second)
let avg = null;
function glowFromScreen() {
  avg ??= Object.assign(document.createElement('canvas'), { width: 4, height: 4 }).getContext('2d', { willReadFrequently: true });
  avg.drawImage(GTV.canvas, 0, 0, 4, 4);
  const d = avg.getImageData(0, 0, 4, 4).data; let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4, m = Math.max(r, g, b) / n || 1, k = Math.min(1, 200 / m);   // (brightened, so dark scenes still glow)
  GTV.glowM.color.setRGB((r / n / 255) * k, (g / n / 255) * k, (b / n / 255) * k);
  GTV.glowM.opacity = 0.55;
}

export function updateGaming(dt) {
  if (!GTV) return;
  // the match's life: the two sit down, it starts, it ends (or work calls one of them away)
  if (!G && !ME && state.sim > nextAt) { nextAt = state.sim + 30; if (Math.random() < 0.18 && tvMatch()) nextAt = state.sim + rand(900, 1800); }
  if (ME && !fp.on) standUp();   // (left first person)
  if (G) {
    const players = G.side.filter((s) => s.w);
    if (G.npc && players.every(gone)) { G = null; nextAt = state.sim + rand(900, 1800); }
    else if (!G.over && G.npc && (players.some(gone) || players.some((s) => called(s.w)))) {
      const c = players.find((s) => called(s.w)); if (c) quip(c.w, pick('people.tv.called'), 'idle');
      finish();
    } else if (G.stage === 'sit' && G.side.every(seated)) { start(); }
  }
  if (ME && ME.mate && gone(ME.mate)) ME.mate = null;
  if (G?.game && G.stage !== 'sit') {
    const playing = G.stage === 'play' && !G.over;
    if (playing) {
      const ctl = G.side.map((s, i) => (s.w || s.ai ? G.game.ai(i, s.skill ?? 0.6) : myControls()));
      for (let t = Math.min(dt, 0.25); t > 0; t -= 0.05) G.game.step(Math.min(t, 0.05), ctl);   // (real time even at a few frames a second)
      for (const ev of G.game.events.splice(0)) react(ev);
      if (G.game.over && G.stage === 'play') gameOver(G.game.winner);
    }
    for (const s of G.side) if (s.w && s.cheerUntil && state.sim > s.cheerUntil && s.w.chore === s.e && !G.over) { s.cheerUntil = 0; s.w.anim = 'gamepad'; }
    // first person: after the result, back to the menu to play again
    if (!G.npc && G.stage === 'result' && state.sim - G.at > 5) { G = null; if (ME) { ME.menu = true; ME.lastPad = { a: true }; } }
  }
  if (ME?.menu) menuInput(myControls());
  ME?.tap.clear();
  // the controllers on the unit: in someone's hands while they play
  const inHands = [G?.npc && G.side[0].w && seated(G.side[0]), G?.npc && G.side[1].w && seated(G.side[1])];
  if (ME) { inHands[0] = true; inHands[1] = !!ME.mate; }
  GTV.pads[0].visible = !inHands[0]; GTV.pads[1].visible = !inHands[1];
  // the screen
  const on = !!ME || (!!G && G.stage !== 'sit') || (!!G && G.side.some((s) => s.w && seated(s)));
  setOn(on);
  if (!on || state.sim < drawAt) return;
  drawAt = state.sim + 1 / FPS;
  if (ME?.menu || !G?.game) { if (ME?.menu) drawMenu(state.sim); else drawIdle(GTV.ctx, state.sim, G?.kind || GAMES[0]); }
  else G.game.draw(GTV.ctx);
  GTV.tex.needsUpdate = true;
  if (state.sim > glowAt) { glowAt = state.sim + 0.5; glowFromScreen(); }
  if (Math.random() < dt * 2) GTV.routerLed.visible = !GTV.routerLed.visible;
}
// the TV clicked (third person): who is playing and the score, else two people who are free called over; in first person,
// sit down and play
export function tvClick() {
  if (fp?.on) { playFp(); return; }
  if (G?.npc) {
    const [a, b] = G.side, sc = G.game?.score;
    toast(sc ? tr('props.gametv.score', { a: a.name, b: b.name, x: sc[0], y: sc[1], game: tr(`fp.tv.game.${G.kind}`) }) : tr('props.gametv.coming', { a: a.name, b: b.name }));
    return;
  }
  if (tvMatch(true)) toast(tr('props.gametv.called', { a: G.side[0].name, b: G.side[1].name, game: tr(`fp.tv.game.${G.kind}`) }), 5000);
  else toast(tr(ME ? 'props.gametv.you' : 'props.gametv.nobody'));
}
export const tvState = () => ({ on: !!GTV?.on, kind: G?.kind || null, stage: G?.stage || (ME?.menu ? 'menu' : null), npc: !!G?.npc, over: !!G?.over,
  score: G?.game?.score?.slice?.() || null, time: G?.game?.time ?? null, players: G ? G.side.map((s) => s.w?.id || s.name) : [], me: !!ME,
  seats: seats().map((s) => (s.by ? (s.by === 'you' ? 'you' : s.by.id || 'taken') : null)), free: who().length, games: GAMES.length });

let hooked = false;
export function setup() {
  if (!PRO || !GTV) return;
  drawOff();
  nextAt = rand(150, 400);
  window.addEventListener('keydown', (e) => onKey(e, true), true);
  window.addEventListener('keyup', (e) => onKey(e, false), true);
  window.addEventListener('blur', () => ME?.keys.clear());
  if (new URLSearchParams(location.search).has('debug')) {
    const hook = () => { if (hooked) return; if (!window.__office) { setTimeout(hook, 500); return; } hooked = true;
      Object.assign(window.__office, { tvGame: (kind) => tvMatch(true, kind), tvPlay: playFp, tvStand: standUp });
      Object.defineProperty(window.__office, 'tv', { get: tvState, configurable: true }); };
    setTimeout(hook, 0);
  }
}
