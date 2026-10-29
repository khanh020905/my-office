// The director's rounds (company floor): twice a day out of the corner office and round the desks.
import { state } from '../core/state.js';
import { PRO, nowMs, officeNow, rand, reduceMotion, short } from '../core/env.js';
import { NODES, STATIONS, faceTo } from './navigation.js';
import { PODS } from '../world/desks.js';
import { dn, hash, sessions, workers } from './workers.js';
import { director } from './director.js';
import { later, quip } from './errands.js';
import { busyNow } from './accountant.js';
import { t as tr } from '../../i18n/index.js';

/* About 10:00 and 15:30 (a minute of their own each day) the director leaves the desk and walks round two or three pods,
   stopping in the aisle at each: whoever is resting or dozing within reach sits up with a start and types away for a
   few seconds ("I'm on it!"); someone whose session finished a task in the last ten minutes gets a pat on the shoulder.
   A prompt to hand over or a report coming in always comes first: the round ends there. Never in the nap, the Monday
   stand-up, Friday tea or a break for the plan's limit (people/accountant.js: busyNow). */
const SLOTS = [600, 930], REACH = 2.5, DONE_MS = 10 * 60e3;
let round = null, day = '', slots = [], checkAt = 0;
const minutes = () => { const d = officeNow(); return d.getHours() * 60 + d.getMinutes(); };
const atHome = (D) => D.station === 'home' && !D.job && !D.queue.length && D.phase !== 'walk' && !D.chore && state.sim >= (D.holdUntil || 0);
const present = (w) => !w.sub && w.root.visible && !w.away && !w.street && !w.offstage && !w.leaving && !w.outing;
const near = (D, w) => Math.hypot(w.pos.x - D.pos.x, w.pos.y - D.pos.y) < REACH;
// someone coming to report (a station by the director's desk taken, or on the way there)
function reportIncoming(D) {
  if (STATIONS.director?.some((s) => s.by && s.by !== D)) return true;
  for (const w of workers.values()) if (w.want?.station === 'director') return true;
  return false;
}

// the aisle spots of the pods with the most people at their desks (two or three), in pod order: a loop round the floor
function stops() {
  const list = [];
  PODS.slice(0, 3).forEach(([cx, cz], p) => {
    let best = null;
    for (const k of [`P${p}b0`, `P${p}b1`, `P${p}f0`, `P${p}f1`]) {
      if (!NODES[k]) continue;
      const [x, z] = NODES[k], n = [...workers.values()].filter((w) => present(w) && w.station === 'desk' && Math.hypot(w.pos.x - x, w.pos.y - z) < REACH).length;
      if (!best || n > best.n) best = { n, spot: { x, z, face: faceTo(x, z, cx, cz), node: k } };
    }
    if (best) list.push({ ...best, p });
  });
  const busy = list.filter((s) => s.n > 0);
  return (busy.length >= 2 ? busy : list).slice(0, 3).map((s) => s.spot);
}
export function rounds(force = false) {
  const D = director;
  if (!PRO || !D || round || !atHome(D) || reportIncoming(D) || (!force && busyNow())) return false;
  const list = stops(); if (!list.length) return false;
  round = { stops: list, k: 0, stage: 'walk', until: 0, patted: new Set(), startled: 0, patN: 0 };
  D.chore = { rounds: true }; D.hush(); D.station = 'rounds'; D.paper.visible = false;
  const text = tr('people.rounds.start'); D.say('idle', text); setTimeout(() => { if (D.lastSay?.text === text) D.hush(); }, 3000);
  next();
  return true;
}
function next() {
  const D = director, st = round.stops[round.k];
  if (!st) { finish(); return; }
  round.stage = 'walk';
  D.goTo(st, () => {
    if (!round) return;
    round.stage = 'look'; round.until = state.sim + (reduceMotion ? 1.5 : rand(4.5, 6)); D.faceTarget = st.face; D.anim = 'idle';
    inspect();
  });
}
// one who has just finished a task gets a pat on the shoulder; whoever else is resting at their desk within reach sits up
// and types
const finishedAt = (s) => s.doneAt || (s.status === 'rest' ? s.lastAt : 0);   // (the demo's sessions have no doneAt)
function inspect() {
  const D = director, here = [...workers.values()].filter((w) => present(w) && w.phase !== 'walk' && near(D, w));
  const star = here.find((w) => { const s = sessions.get(w.id), at = s && finishedAt(s); return at && nowMs() - at < DONE_MS && !round.patted.has(w.id) && !w.chore && w.station === 'desk'; });
  let n = 0;
  for (const w of here) if (w !== star && startle(w, n)) n++;
  round.startled += n;
  if (star) {
    round.patted.add(star.id); round.patN++;
    D.faceTarget = Math.atan2(star.pos.x - D.pos.x, star.pos.y - D.pos.y); D.anim = 'globe';
    D.say('idle', tr('people.rounds.pat', { name: short(dn(sessions.get(star.id)), 18) }));
    star.waveUntil = state.sim + 1.4;
    later(reduceMotion ? 0.3 : 1.4, () => { if (round && present(star) && !star.chore) quip(star, tr('people.rounds.thanks'), 'idle'); D.anim = 'idle'; });
  } else if (!n && Math.random() < 0.6) D.say('idle', tr('people.rounds.look'));
}
function startle(w, k) {
  const s = sessions.get(w.id);
  if (!s || s.status !== 'rest' || w.chore || w.after || w.want || w.station !== 'desk' || w.pose !== 'sit' || w.onBreak || w.doze || w.carry) return false;
  if (!['sleep', 'idle', 'read', 'think', 'wake'].includes(w.anim)) return false;
  // up with a start, typing away; back to the nap of their own accord a few seconds later (workers.js: restAt)
  later(reduceMotion ? 0 : k * 0.35, () => {
    if (w.chore || w.after || s.status !== 'rest') return;
    w.hush(); w.anim = 'type'; w.restAt = state.sim + (reduceMotion ? 3 : 8); w.dwellUntil = state.sim; w.startledAt = state.sim;
    quip(w, tr('people.rounds.startle'), 'idle');
  });
  return true;
}
function finish() {
  const D = director;
  round = null; D.chore = null; D.anim = 'idle'; D.hush(); D.goHome();
}
// a prompt or a report: the round ends where he is (director.js takes over from there)
function stop() {
  const D = director;
  round = null; D.chore = null; D.path = []; D.phase = 'idle'; D.onArrive = null; D.station = 'out'; D.hush();
}

// ?debug: __office.rounds() starts one now; __office.round says how it's going
let hooked = false;
function hook() {
  const o = window.__office; if (hooked || !o) return;
  hooked = true; o.rounds = () => rounds(true); Object.defineProperty(o, 'round', { get: () => roundState(), configurable: true });
}
export function updateRounds() {
  const D = director; if (!PRO || !D) return;
  if (!hooked) hook();
  if (round) {
    if (D.queue.length || D.job || (state.sim > checkAt && (checkAt = state.sim + 0.5) && (reportIncoming(D) || busyNow()))) { stop(); return; }
    if (round.stage === 'look' && state.sim > round.until) { round.k++; next(); }
    return;
  }
  if (state.sim < checkAt) return;
  checkAt = state.sim + 5;
  const d = officeNow(), m = minutes(), today = d.toDateString();
  if (day !== today) { day = today; const h = hash(today); slots = SLOTS.map((at, i) => ({ at: at + ((h >>> (i * 8)) % 20), done: false })); }
  for (const s of slots) {
    if (s.done || m < s.at) continue;
    if (m > s.at + 40) { s.done = true; continue; }
    if (rounds()) s.done = true;
    break;
  }
}
export const roundState = () => (round ? { stage: round.stage, k: round.k, stops: round.stops.length, startled: round.startled, patted: round.patN } : null);
export function setup() {}
