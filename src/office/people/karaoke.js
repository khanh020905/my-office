// Karaoke in the box on the dev floor (company floor; the booth: world/props/karaoke.js). Now and then someone who is resting
// (two, sometimes; more often on a Friday evening) goes in, takes a mic off the shelf and sings one of the office's own
// songs (people/karaoke-songs.js): the words run across the screen and fill with colour as they are sung, notes rise
// over the box and its lights pulse with the beat, and at the end the machine gives a score the way Vietnamese karaoke
// machines do, to applause. The tune plays quietly when the office's sounds are on (synthesized here, with the echo
// karaoke machines put on the voice), never when they're off. Work coming in ends it. Click the box to send someone
// in; in first person, E at it takes you in to sing.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { PRO, officeNow, rand, reduceMotion, replay } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { KTV, KTV_H, KTV_W } from '../world/props/karaoke.js';
import { CHORDS, SONGS, tune } from './karaoke-songs.js';
import { napOn } from '../life/nap.js';
import { fp } from '../interact/first-person.js';
import { sessions, workers } from './workers.js';
import { asleep, free, quip } from './errands.js';
import { chatSay } from '../ui/group-chat.js';
import { toast } from '../ui/activity.js';
import { sfx } from '../audio/sfx.js';
import { lang, t as tr } from '../../i18n/index.js';

let K = null;      // a session in the box: { npc, singers: [{ w, e, at }], song, tn, stage: walk | menu | sing | score | leave, t0, score, songs, at, end }
let ME = null;     // first person in the box: { pick, keys }
let nextAt = 0, drawAt = 0, notes = [];
const pick = (key) => { const l = tr(key, null, 'list'); return Array.isArray(l) ? l[Math.floor(Math.random() * l.length)] : l; };
const nameOf = (w) => { const n = sessions.get(w.id)?.name || w.cfg.name || ''; return n.length > 11 ? `${n.slice(0, 10)}…` : n; };
const called = (w) => { const s = sessions.get(w.id); return !s || s.status !== 'rest' || !!s.bg?.length || !!w.want; };
const titleOf = (i) => SONGS[i].title[lang()] || SONGS[i].title.en;
const wordsOf = (i, line) => (lang() === 'vi' ? SONGS[i].vi : SONGS[i].en)[line].split(/\s+/);
// who could sing: resting, nothing else on (not out, not on a break, not carrying anything, not at tea)
function who() {
  return [...workers.values()].filter((w) => { const s = sessions.get(w.id);
    return !w.sub && s?.status === 'rest' && !s.bg?.length && (free(w) || asleep(w)) && !w.onBreak && !w.outing && !w.street && !w.carry && !w.doze && !w.mealBox && !w.shred; });
}
const secs = () => (K?.t0 ? (performance.now() - K.t0) / 1000 : 0);
const beats = () => secs() / SONGS[K.song].beat;

/* ---------- the sound: the tune sung by a soft "ah" with an echo, e-piano chords, a bass, a light kit ---------- */
let AC = null, mix = null, hiss = null;
const unlock = () => { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ } } if (AC?.state === 'suspended') AC.resume(); };
const loud = () => (ME ? 0.13 : 0.045);   // (people singing in there: quietly; you: up)
function stopSong() {
  if (!mix) return;
  const m = mix; mix = null;
  try { m.out.gain.setTargetAtTime(0, AC.currentTime, 0.05); } catch { /* closed */ }
  setTimeout(() => { try { m.out.disconnect(); m.lfo.stop(); } catch { /* gone */ } }, 500);
}
function playSong(i, tn) {
  stopSong();
  if (!AC || AC.state !== 'running' || !sfx.on || replay.on) return;
  const song = SONGS[i], B = song.beat, t0 = AC.currentTime + 0.05, f = (m) => 440 * 2 ** ((m - 69) / 12);
  const out = AC.createGain(); out.gain.value = loud(); out.connect(AC.destination);
  const voice = AC.createGain(), dl = AC.createDelay(1), fb = AC.createGain(), wet = AC.createGain();
  dl.delayTime.value = 0.23; fb.gain.value = 0.3; wet.gain.value = 0.35;
  voice.connect(out); voice.connect(dl); dl.connect(fb).connect(dl); dl.connect(wet).connect(out);
  const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = 5.3; lg.gain.value = 14; lfo.connect(lg); lfo.start();
  const note = (bus, t, d, m, type, v, att, rel, vib) => {
    const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f(m); if (vib) lg.connect(o.detune);
    d = Math.max(d, att + 0.02);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + att); g.gain.setValueAtTime(v, t + d); g.gain.exponentialRampToValueAtTime(0.0001, t + d + rel);
    o.connect(g).connect(bus); o.start(t); o.stop(t + d + rel + 0.05);
  };
  hiss ??= (() => { const b = AC.createBuffer(1, Math.ceil(AC.sampleRate * 0.05), AC.sampleRate), d = b.getChannelData(0); for (let k = 0; k < d.length; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / d.length); return b; })();
  const hat = (t) => { const s = AC.createBufferSource(), hp = AC.createBiquadFilter(), g = AC.createGain(); hp.type = 'highpass'; hp.frequency.value = 6500; g.gain.value = 0.05; s.buffer = hiss; s.connect(hp).connect(g).connect(out); s.start(t); };
  const kick = (t) => { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); o.connect(g).connect(out); o.start(t); o.stop(t + 0.2); };
  for (const n of tn.notes) { const t = t0 + n.t * B, d = n.d * B * 0.92; note(voice, t, d, n.midi, 'triangle', 0.24, 0.03, 0.1, true); note(voice, t, d, n.midi + 12, 'sine', 0.05, 0.03, 0.1, false); }
  const ch = CHORDS[song.mood];
  for (let b = 0; b * 4 < tn.length; b++) {
    const c = ch[b % 4], t = t0 + b * 4 * B;
    for (const s of c) { note(out, t, B * 1.6, song.base + s, 'sine', 0.06, 0.01, 0.4, false); note(out, t + 1.5 * B, B, song.base + s, 'sine', 0.035, 0.01, 0.3, false); }
    for (const k of [0, 2]) note(out, t + k * B, B * 1.4, song.base - 12 + c[0], 'triangle', 0.12, 0.01, 0.15, false);
    for (let k = 0; k < 4; k++) { if (k % 2 === 0) kick(t + k * B); hat(t + k * B + B / 2); }
  }
  mix = { out, lfo };
}

/* ---------- a session ---------- */
function goIn(w, i) {
  const [x, z] = KTV.sing[i];
  const e = w.errand({ type: 'idle', spot: { x, z, face: KTV.face, node: 'BK', via: [KTV.out, KTV.in] }, look: KTV.at(0, -1), anim: 'idle', wait: i ? 2.2 : 0.4, hold: 0.4,
    anim2: 'idle', linger: 0.6, line: pick(i ? 'people.karaoke.join' : 'people.karaoke.invite') });
  e.until = state.sim + 900;
  return { w, e, i };
}
/** A song now (?debug: __office.ktvSing()), else now and then on its own. Returns whether someone went in. */
export function karaoke(force = false) {
  if (K || ME || !KTV || replay.on || reduceMotion) return false;
  const d = officeNow(), h = d.getHours(), friday = d.getDay() === 5 && h >= 16;
  if (!force && (napOn || h < 11 || h >= 22)) return false;
  const list = who(); if (!list.length) return false;
  const two = list.length > 1 && Math.random() < (friday ? 0.6 : 0.35), ws = [list.splice(Math.floor(Math.random() * list.length), 1)[0]];
  if (two) ws.push(list[Math.floor(Math.random() * list.length)]);
  const song = Math.floor(Math.random() * SONGS.length);
  K = { npc: true, singers: ws.map(goIn), song, tn: tune(SONGS[song]), stage: 'walk', t0: 0, score: 0, songs: 0, at: state.sim, end: state.sim + (friday ? 420 : 240), friday };
  chatSay(ws[0].id, pick('people.karaoke.chatGo'));
  return true;
}
function leave() {
  if (!K || K.stage === 'leave') return;
  stopSong();
  K.stage = 'leave'; K.at = state.sim;
  for (const s of K.singers) { s.w.anim = 'idle'; if (s.w.chore === s.e) { s.e.until = state.sim; if (s.w.after) s.w.afterAt = Math.min(s.w.afterAt, state.sim); } }
}
function sing(i) {
  K.song = i; K.tn = tune(SONGS[i]); K.stage = 'sing'; K.t0 = performance.now(); K.at = state.sim;
  playSong(i, K.tn);
}
// the machine's verdict: 78–100, mostly in the nineties (they always are)
function scored() {
  K.stage = 'score'; K.at = state.sim; K.score = Math.round(78 + Math.sqrt(Math.random()) * 22); K.songs++;
  stopSong(); sfx.play('clap'); setTimeout(() => sfx.play('coin'), 400);
  const title = titleOf(K.song);
  if (K.npc) {
    const s = K.singers[0];
    quip(s.w, tr('people.karaoke.score', { n: K.score }), 'idle'); s.w.anim = 'celebrate';
    chatSay(s.w.id, tr('people.karaoke.chatScore', { n: K.score, song: title }), { react: ['❤️', '😆', '👍'], reacts: 3 });
    // and whoever is resting nearby claps
    let n = 0;
    for (const w of workers.values()) {
      if (n >= 2 || K.singers.some((x) => x.w === w) || w.sub || sessions.get(w.id)?.status !== 'rest' || Math.hypot(w.pos.x - KTV.x, w.pos.y - KTV.z) > 5) continue;
      quip(w, pick('people.karaoke.cheer'), 'idle'); n++;
    }
  } else toast(tr('fp.ktv.score', { n: K.score }), 5000);
}

/* ---------- first person: in the box with a mic ---------- */
export function singFp() {
  if (!KTV || !fp?.on || ME) return;
  if (K?.npc) { toast(tr('fp.ktv.busy', { name: nameOf(K.singers[0].w) })); return; }
  ME = { pick: 0, keys: new Set() };
  K = { npc: false, singers: [], song: 0, tn: null, stage: 'menu', t0: 0, score: 0, songs: 0, at: state.sim };
  fp.pos.set(...KTV.at(0, 0.24)); fp.yaw = KTV.face; fp.pitch = 0.1; fp.anim = 'idle';
  document.body.classList.add('is-gaming');
  toast(tr('fp.ktv.in'), 6000); sfx.play('beep');
}
function standUp() {
  if (!ME) return;
  stopSong();
  K = null; ME = null;
  fp.anim = null; fp.pos.set(...KTV.at(0, 0.62 + 0.75)); fp.yaw = KTV.ry;
  document.body.classList.remove('is-gaming');
}
function onKey(e, down) {
  if (!ME || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  if (down && (e.code === 'Escape' || e.code === 'KeyE')) { e.preventDefault(); e.stopPropagation(); standUp(); toast(tr('fp.ktv.out')); return; }
  if (!/^(Key[WASD]|Arrow(Up|Down|Left|Right)|Space|Enter)$/.test(e.code)) return;
  e.preventDefault(); e.stopPropagation();   // (your feet stay put in the box)
  if (!down || K?.stage !== 'menu') return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'ArrowUp' || e.code === 'KeyW') { ME.pick = (ME.pick + SONGS.length - 1) % SONGS.length; sfx.play('click'); }
  if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'ArrowDown' || e.code === 'KeyS') { ME.pick = (ME.pick + 1) % SONGS.length; sfx.play('click'); }
  if (e.code === 'Space' || e.code === 'Enter') { unlock(); sing(ME.pick); fp.anim = 'sing'; }
}

/* ---------- the screen ---------- */
// the scenery behind the words: the song's sky, the sun (the moon and stars on a night song), hills and the sea
function scenery(c, i, t) {
  const W = KTV_W, H = KTV_H, [a, b, d] = SONGS[i].sky, night = parseInt(a.slice(1, 3), 16) < 0x40;
  const g = c.createLinearGradient(0, 0, 0, H * 0.62); g.addColorStop(0, a); g.addColorStop(0.7, b); g.addColorStop(1, d);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  if (night) { c.fillStyle = '#FFFFFF'; for (let k = 0; k < 40; k++) { c.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + k)); c.fillRect((k * 97) % W, (k * 53) % (H * 0.5), 2, 2); } c.globalAlpha = 1; }
  c.fillStyle = night ? '#F4F1DE' : '#FFF4C9'; c.beginPath(); c.arc(W * 0.72, H * (night ? 0.2 : 0.42), night ? 18 : 30, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,255,255,.55)';
  for (let k = 0; k < 3; k++) { const x = ((t * 8 + k * 190) % (W + 160)) - 80, y = 30 + k * 26; c.beginPath(); c.ellipse(x, y, 46, 10, 0, 0, 7); c.ellipse(x + 26, y - 6, 30, 9, 0, 0, 7); c.fill(); }
  for (const [y, col, amp, fr] of [[0.55, night ? '#2A2350' : '#6E8C6A', 22, 0.012], [0.62, night ? '#1B1838' : '#4E6B4F', 14, 0.02]]) {
    c.fillStyle = col; c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) c.lineTo(x, H * y - Math.abs(Math.sin(x * fr + y * 9)) * amp);
    c.lineTo(W, H); c.fill();
  }
  const sea = c.createLinearGradient(0, H * 0.64, 0, H); sea.addColorStop(0, night ? '#20305A' : '#4FA3C7'); sea.addColorStop(1, night ? '#0D142B' : '#1E5F87');
  c.fillStyle = sea; c.fillRect(0, H * 0.64, W, H * 0.36);
  c.fillStyle = 'rgba(255,255,255,.35)';
  for (let k = 0; k < 14; k++) { const y = H * 0.67 + (k % 7) * 12, x = ((k * 71 + t * (12 + k)) % (W + 60)) - 30; c.fillRect(x, y, 22 + (k % 3) * 10, 2); }
}
function txt(c, s, x, y, size, align = 'center', fill = '#FFFFFF', weight = 800) {
  c.font = `${weight} ${size}px "Be Vietnam Pro", system-ui, sans-serif`; c.textAlign = align; c.textBaseline = 'middle';
  c.lineWidth = Math.max(3, size / 5); c.strokeStyle = 'rgba(10,12,30,.85)'; c.lineJoin = 'round'; c.strokeText(s, x, y); c.fillStyle = fill; c.fillText(s, x, y);
}
// one line of the words: white, filling with blue from the left as each word is sung (a count-in of dots before it)
function lyricLine(c, i, li, top, beat) {
  const tn = K.tn, L = tn.lines[li], words = wordsOf(i, li), size = 25, y = top ? KTV_H - 78 : KTV_H - 38;
  c.font = `800 ${size}px "Be Vietnam Pro", system-ui, sans-serif`;
  const space = c.measureText(' ').width, widths = words.map((w) => c.measureText(w).width), total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  let k = Math.min(1, (KTV_W - 40) / total), x = top ? 22 : KTV_W - 22 - total * k;
  if (k < 1) c.font = `800 ${Math.floor(size * k)}px "Be Vietnam Pro", system-ui, sans-serif`;
  // when each word is sung: its own note (Vietnamese), else shared out by length over the line
  const vi = lang() === 'vi', ln = tn.notes.filter((n) => n.line === li), chars = words.reduce((a, w) => a + w.length, 0);
  let acc = 0;
  const lead = L.t - beat;
  if (lead > 0 && lead < 3) { c.fillStyle = '#FFD84D'; for (let d = 0; d < Math.ceil(lead); d++) { c.beginPath(); c.arc(x + 6 + d * 14, y - 22, 4, 0, 7); c.fill(); } }
  words.forEach((w, wi) => {
    const ww = widths[wi] * k;
    let s0, s1;
    if (vi && ln[wi]) { s0 = ln[wi].t; s1 = ln[wi].t + ln[wi].d; } else { s0 = L.t + ((L.end - L.t) * acc) / chars; s1 = L.t + ((L.end - L.t) * (acc + w.length)) / chars; }
    acc += w.length;
    const prog = Math.max(0, Math.min(1, (beat - s0) / (s1 - s0)));
    txt(c, w, x, y, Math.floor(size * k), 'left');
    if (prog > 0) { c.save(); c.beginPath(); c.rect(x - 2, y - size, ww * prog + 2, size * 2); c.clip(); txt(c, w, x, y, Math.floor(size * k), 'left', '#3B9CFF'); c.restore(); }
    x += ww + space * k;
  });
}
function drawSong(c, t) {
  const i = K.song, beat = beats(), tn = K.tn;
  scenery(c, i, t);
  if (beat < 4.2) {   // the title over the intro
    c.fillStyle = 'rgba(8,10,24,.45)'; c.fillRect(0, KTV_H * 0.26, KTV_W, 96);
    txt(c, `♪ ${titleOf(i)} ♪`, KTV_W / 2, KTV_H * 0.26 + 36, 30, 'center', '#FFE27A', 900);
    txt(c, tr('people.karaoke.credit'), KTV_W / 2, KTV_H * 0.26 + 72, 15, 'center', '#FFFFFF', 600);
  }
  // the two lines in view: the one being sung and the next (odd lines on top, even ones below, like the machines)
  let cur = tn.lines.findIndex((L, k) => beat < L.end + 0.6 || k === tn.lines.length - 1);
  if (cur < 0) cur = tn.lines.length - 1;
  for (const li of [cur, cur + 1]) if (li < tn.lines.length) lyricLine(c, i, li, li % 2 === 0, beat);
  // the singer's name in the corner, a progress line along the bottom
  txt(c, K.npc ? K.singers.map((s) => nameOf(s.w)).join(' & ') : tr('fp.tv.you'), 14, 18, 13, 'left', '#FFFFFF', 700);
  c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(0, KTV_H - 4, KTV_W, 4); c.fillStyle = '#FF4FB0'; c.fillRect(0, KTV_H - 4, (KTV_W * Math.min(1, beat / tn.length)), 4);
}
function drawScore(c, t) {
  const k = Math.min(1, (state.sim - K.at) / 1.4), n = Math.round(K.score * k);
  scenery(c, K.song, t); c.fillStyle = 'rgba(10,8,30,.62)'; c.fillRect(0, 0, KTV_W, KTV_H);
  txt(c, tr('people.karaoke.points'), KTV_W / 2, 58, 26, 'center', '#FFFFFF', 800);
  txt(c, String(n), KTV_W / 2, 132, 84, 'center', '#FFD84D', 900);
  const stars = Math.round((K.score - 60) / 8);
  for (let s = 0; s < 5; s++) txt(c, '★', KTV_W / 2 - 80 + s * 40, 196, 30, 'center', s < stars * k ? '#FFD84D' : 'rgba(255,255,255,.3)', 900);
  txt(c, tr(K.score >= 95 ? 'people.karaoke.verdict.top' : K.score >= 88 ? 'people.karaoke.verdict.good' : 'people.karaoke.verdict.ok'), KTV_W / 2, 244, 18, 'center', '#FFFFFF', 700);
}
function drawMenu(c, t) {
  scenery(c, ME.pick, t); c.fillStyle = 'rgba(10,8,30,.55)'; c.fillRect(0, 0, KTV_W, KTV_H);
  txt(c, tr('fp.ktv.pick'), KTV_W / 2, 32, 20, 'center', '#FFFFFF', 800);
  SONGS.forEach((s, k) => {
    const y = 78 + k * 40, on = k === ME.pick;
    if (on) { c.fillStyle = 'rgba(255,79,176,.85)'; c.beginPath(); c.roundRect(60, y - 17, KTV_W - 120, 34, 10); c.fill(); }
    txt(c, `${k + 1}. ${titleOf(k)}`, 80, y, 19, 'left', on ? '#FFFFFF' : '#D9D3F0', on ? 800 : 600);
  });
  txt(c, tr('fp.ktv.keys'), KTV_W / 2, KTV_H - 22, 13, 'center', '#FFE27A', 600);
}
function drawIdle(c, t) {
  const g = c.createLinearGradient(0, 0, KTV_W, KTV_H), h = (t * 20) % 360;
  g.addColorStop(0, `hsl(${h} 70% 28%)`); g.addColorStop(1, `hsl(${(h + 80) % 360} 70% 20%)`);
  c.fillStyle = g; c.fillRect(0, 0, KTV_W, KTV_H);
  txt(c, '♪ KARAOKE ♪', KTV_W / 2, KTV_H * 0.4, 46, 'center', '#FFFFFF', 900);
  txt(c, tr('props.karaoke.idle'), KTV_W / 2, KTV_H * 0.62, 17, 'center', '#FFE27A', 600);
}
function drawScreen() {
  const c = KTV.ctx, t = performance.now() / 1000;
  if (ME && K?.stage === 'menu') drawMenu(c, t);
  else if (K?.stage === 'sing') drawSong(c, t);
  else if (K?.stage === 'score') drawScore(c, t);
  else drawIdle(c, t);
  KTV.tex.needsUpdate = true;
}

/* ---------- notes over the box, its lights, the door ---------- */
function makeNotes() {
  const tex = (ch, col) => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); g.font = '700 54px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = 'rgba(20,10,40,.6)'; g.strokeText(ch, 32, 34); g.fillStyle = col; g.fillText(ch, 32, 34); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
  notes = [['♪', '#FF7AC8'], ['♫', '#FFE27A'], ['♪', '#7AE0FF'], ['♫', '#B98CFF']].map(([ch, col], k) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(ch, col), transparent: true, depthWrite: false })); s.scale.set(0.22, 0.22, 1); s.visible = false; scene.add(s);
    return { s, ph: k / 4 };
  });
}
const _c = new THREE.Color();
function lights(dt, active) {
  const t = performance.now() / 1000, beat = K?.stage === 'sing' ? beats() : t * 1.5, pulse = active ? 0.55 + 0.45 * Math.max(0, Math.cos((beat % 1) * Math.PI * 2)) : 0.35;
  KTV.ledM.color.copy(_c.setHSL((active ? t * 0.12 : t * 0.03) % 1, 0.9, 0.35 + 0.25 * pulse));
  KTV.ceilM.color.copy(_c.setHSL(active ? (0.78 + Math.sin(t * 0.7) * 0.08) % 1 : 0.75, active ? 0.75 : 0.25, active ? 0.45 + 0.2 * pulse : 0.62));
  const on = active && K?.stage === 'sing';
  for (const n of notes) {
    n.s.visible = on && !reduceMotion;
    if (!n.s.visible) continue;
    const u = ((t * 0.45 + n.ph) % 1);
    n.s.position.set(KTV.x + Math.sin((u + n.ph) * 9) * 0.25 + (n.ph - 0.5) * 0.6, 2.35 + u * 0.9, KTV.z + (n.ph - 0.5) * 0.4);
    n.s.material.opacity = Math.min(1, u * 5) * (1 - u);
  }
  // the door: open while someone goes in or out (or you stand at it), shut otherwise
  const near = (x, z) => Math.hypot(x - KTV.out[0], z - KTV.out[1]) < 1.0 || Math.hypot(x - KTV.in[0], z - KTV.in[1]) < 0.6;
  let open = !!(fp?.on && near(fp.pos.x, fp.pos.y));
  for (const w of workers.values()) if (w.phase === 'walk' && near(w.pos.x, w.pos.y)) { open = true; break; }
  KTV.door.rotation.y += ((open ? 1.25 : 0) - KTV.door.rotation.y) * Math.min(1, dt * 5);
  // the mics: off the shelf while someone sings
  const holding = K && (K.stage === 'sing' || K.stage === 'score');
  KTV.mics[0].visible = !(holding && (ME || K.singers[0])); KTV.mics[1].visible = !(holding && K.singers[1]);
}

/* ---------- each frame ---------- */
const arrived = (s) => s.w.chore === s.e && s.e.stage === 'go' && s.w.phase !== 'walk' && Math.hypot(s.w.pos.x - KTV.sing[s.i][0], s.w.pos.y - KTV.sing[s.i][1]) < 0.3;
const gone = (s) => s.w.chore !== s.e || s.w.leaving || !s.w.root.parent;
export function updateKaraoke(dt) {
  if (!KTV) return;
  if (!K && !ME && state.sim > nextAt) {
    const d = officeNow(), friday = d.getDay() === 5 && d.getHours() >= 16;
    nextAt = state.sim + 40; if (Math.random() < (friday ? 0.35 : 0.12) && karaoke()) nextAt = state.sim + rand(700, 1600);
  }
  if (ME && !fp.on) standUp();
  if (K?.npc) {
    if (K.stage === 'leave') { if (K.singers.every(gone)) { K = null; nextAt = state.sim + rand(700, 1600); } }
    else if (K.singers.some(gone) || K.singers.some((s) => called(s.w))) {
      const c = K.singers.find((s) => called(s.w)); if (c) quip(c.w, pick('people.karaoke.called'), 'idle');
      leave();
    } else if (K.stage === 'walk') { if (K.singers.every(arrived)) sing(K.song); else if (state.sim - K.at > 90) leave(); }
    else if (K.stage === 'sing') { for (const s of K.singers) s.w.anim = 'sing'; if (beats() >= K.tn.length) scored(); }
    else if (K.stage === 'score' && state.sim - K.at > 5) {
      if (K.songs < (K.friday ? 3 : 2) && Math.random() < 0.45 && state.sim < K.end) { for (const s of K.singers) s.w.anim = 'idle'; sing((K.song + 1 + Math.floor(Math.random() * (SONGS.length - 1))) % SONGS.length); }
      else leave();
    }
  } else if (K && ME) {
    if (K.stage === 'sing') { fp.anim = 'sing'; if (beats() >= K.tn.length) { scored(); fp.anim = 'idle'; } }
    else if (K.stage === 'score' && state.sim - K.at > 5) { K.stage = 'menu'; ME.pick = (K.song + 1) % SONGS.length; }
  }
  if (mix) mix.out.gain.value = sfx.on && !replay.on ? loud() : 0;
  const active = !!K && K.stage !== 'walk' && K.stage !== 'leave';
  lights(dt, active);
  const now = performance.now();
  if (now < drawAt) return;
  drawAt = now + (active ? 66 : 500);
  drawScreen();
}
// the box clicked (third person): who is singing what, else someone sent in; in first person, go in and sing
export function boothClick() {
  if (fp?.on) { singFp(); return; }
  if (K?.npc) { toast(tr('props.karaoke.singing', { name: K.singers.map((s) => nameOf(s.w)).join(' & '), song: titleOf(K.song) })); return; }
  if (karaoke(true)) toast(tr('props.karaoke.called', { name: K.singers.map((s) => nameOf(s.w)).join(' & ') }), 5000);
  else toast(tr(ME ? 'props.karaoke.you' : 'props.karaoke.nobody'));
}
export const ktvState = () => ({ stage: K?.stage || null, npc: !!K?.npc, song: K ? SONGS[K.song].id : null, singers: K ? K.singers.map((s) => s.w.id) : [], me: !!ME,
  beat: K?.stage === 'sing' ? +beats().toFixed(2) : null, score: K?.score || null, songs: K?.songs || 0, door: +(KTV?.door.rotation.y || 0).toFixed(2), sound: !!mix });

let hooked = false;
export function setup() {
  if (!PRO || !KTV) return;
  makeNotes();
  nextAt = rand(240, 600);
  addEventListener('pointerdown', () => { if (sfx.on) unlock(); }, { passive: true }); addEventListener('keydown', () => { if (sfx.on) unlock(); });
  window.addEventListener('keydown', (e) => onKey(e, true), true);
  window.addEventListener('keyup', (e) => onKey(e, false), true);
  drawScreen();
  if (new URLSearchParams(location.search).has('debug')) {
    const hook = () => { if (hooked) return; if (!window.__office) { setTimeout(hook, 500); return; } hooked = true;
      Object.assign(window.__office, { ktvSing: () => karaoke(true), ktvPlay: singFp, ktvStand: standUp });
      Object.defineProperty(window.__office, 'ktv', { get: ktvState, configurable: true }); };
    setTimeout(hook, 0);
  }
}
