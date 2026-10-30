// Payday (the 5th, the 10th or the month's last day: world/backdrops/street-atm.js isPayday). In the morning "Lương về rồi
// anh em ơi 💸" in the company's group chat; over lunch and after work someone resting goes down to the Vietcombank ATM
// across the street to take some out (twice a day at most): down in the lift, over the street, to the end of the line
// along the pavement (longer than on any other day), a step forward each time the one in front is done, into the booth,
// card, keypad, the cash; then back up. Work coming in calls them out of the line at a run. With the city outside only.
// ?payday: today is one; ?debug: __office.payday.
import { state } from '../core/state.js';
import { officeNow, rand, replay } from '../core/env.js';
import { sessions, workers } from './workers.js';
import { called, goDown, goUp, live, mainExit, outside, resume, street, walk } from './outings.js';
import { chatLife } from '../ui/group-chat.js';
import { queueUi } from '../ui/activity.js';
import { t as tr } from '../../i18n/index.js';

let T = null, last = null;   // the trip under way: { kind: 'atm', w, stage: 'go' | 'walk' | 'line' | 'back' | 'up', tok, k }
let toldDay = '', tripDay = '', trips = 0, lookAt = 0;
const free = (w) => { const s = sessions.get(w.id); return !w.sub && !!w.root.parent && !w.leaving && !w.away && !w.homeBound && !w.chore && !w.after && !w.want && !w.outing && !w.nhau && !w.street
  && !w.offstage && w.phase !== 'walk' && !w.liftHold && !w.liftWait && !w.liftRide && !w.inStall && !w.wcBusy && !w.queued && !w.onBreak && s?.status === 'rest' && !s.bg?.length; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const say = (w, key, v) => w.say('idle', tr(key, v));

function go(w, S, Q) {
  const ex = mainExit(S); if (!ex) return false;
  const R = T = { kind: 'atm', w, stage: 'go', ex, dead: false, since: state.sim, k: -1 };
  R.drop = () => drop(R);
  trips++; w.cashDay = officeNow().toDateString();
  w.outing = R; w.chore = { outing: true }; w.station = 'out'; w.restAt = Infinity; w.outAt = state.sim;
  chatLife('atm', { id: w.id, every: 2 * 3600e3 });
  w.hush(); w.anim = 'wake'; w.afterAt = state.sim + 1.6;
  w.after = () => {
    if (!live(R, 'go')) return;
    w.anim = 'idle'; say(w, 'people.atm.say.go');
    goDown(w, R, () => {
      R.stage = 'walk'; outside(w, S, ex);
      const entry = Q.entry();
      walk(w, S, S.route(ex, entry) || [entry], () => {
        if (!live(R, 'walk')) return;
        R.stage = 'line'; R.tok = { use: rand(14, 22), onUse: () => atMachine(R, Q), onDone: () => cashed(R, S) }; Q.join(R.tok);
        if (Q.length() > 3) say(w, 'people.atm.say.long', { n: Q.length() - 1 });
        queueUi();
      });
    });
  };
  queueUi();
  return true;
}
// at the machine: card in, the PIN, the amount
function atMachine(R, Q) { if (!live(R, 'line')) return; const w = R.w, s = Q.spot(0); w.faceTarget = s.face; w.anim = 'tidy'; say(w, 'people.atm.say.use'); }
function cashed(R, S) { if (!live(R, 'line')) return; say(R.w, 'people.atm.say.got'); back(R, S, false); }
// out of the line (cash in hand, or work came in) and back up to the desk
function back(R, S, rushing) {
  const w = R.w, Q = S.atm, from = Q ? Q.entry() : { x: w.pos.x, z: w.pos.y };
  R.stage = 'back'; w.anim = 'idle'; w.ground = S.pavement;
  if (rushing) { w.hurry = true; say(w, 'people.atm.say.recall'); }
  walk(w, S, [from, ...(S.route(from, R.ex) || [])], () => live(R, 'back') && goUp(w, R, () => w.homeSpot(), () => { finish(R); resume(w, false); }));
  queueUi();
}
function finish(R) {
  if (R.dead) return;
  R.dead = true; R.stage = 'gone';
  const w = R.w; w.outing = null; w.chore = null; w.hurry = false;
  queueUi();
}
function drop(R) {
  if (R.dead) return;
  street()?.atm?.leave(R.tok);
  finish(R);
  const w = R.w;
  if (w.leaving) return;
  if (w.street || w.offstage || w.liftRide || w.liftWait) {
    w.street = w.offstage = false; w.liftRide = w.liftWait = null; w.liftHold = false; w.path = []; w.phase = 'idle'; w.onArrive = null; w.after = null;
    const at = w.homeSpot(); w.pos.set(at.x, at.z); w.spot = at; w.face = w.faceTarget = at.face; w.pose = at.sit ? 'sit' : 'stand';
    resume(w, false);
  } else { w.after = null; w.anim = 'idle'; w.restAt = state.sim; }
}
/** for the session list (outings.js whereabouts) */
export function atmNow(R) {
  const k = R.stage === 'line' ? street()?.atm?.indexOf(R.tok) ?? -1 : -1;
  if (R.stage === 'line') return { ic: 'walk', text: tr(k === 0 ? 'people.atm.where.using' : 'people.atm.where.line', { n: Math.max(0, k) }) };
  return { ic: 'walk', text: tr(R.stage === 'back' || R.stage === 'up' ? 'people.atm.where.back' : 'people.atm.where.going') };
}

/* ---------- each frame (from outings.js) ---------- */
export function updatePayday() {
  const S = street(), Q = S?.atm;
  if (T) { step(S, Q); return; }
  if (!Q || replay.on || state.sim < 15 || state.sim < lookAt) return;
  lookAt = state.sim + 20;
  if (!Q.payday()) return;
  const d = officeNow(), day = d.toDateString(), m = d.getHours() * 60 + d.getMinutes();
  // the morning's news in the group chat (once a day: the salary is in)
  if (toldDay !== day && m >= 540 && m < 1260) { toldDay = day; chatLife('payday', { id: pick([...workers.values()].filter((w) => !w.sub && !w.away && !w.offstage && sessions.has(w.id)))?.id, every: 12 * 3600e3 }); return; }
  if (tripDay !== day) { tripDay = day; trips = 0; }
  // 11:45–13:00 and 16:45–18:30, twice a day at most
  if (trips >= 2 || !((m >= 705 && m < 780) || (m >= 1005 && m < 1110)) || Math.random() > 0.35) return;
  const list = [...workers.values()].filter((w) => free(w) && w.cashDay !== day);
  if (list.length) go(pick(list), S, Q);
}
function step(S, Q) {
  const R = T;
  if (!S || !Q || replay.on) { drop(R); last = debug.state(); T = null; return; }
  if (R.dead) { last = debug.state(); T = null; return; }
  if (R.stage !== 'line') return;
  const w = R.w;
  if (called(w)) { Q.leave(R.tok); back(R, S, true); return; }
  // a step forward each time the line moves (into the booth at the front)
  const k = Q.indexOf(R.tok);
  if (k >= 0 && k !== R.k && !R.moving) {
    R.k = k; R.moving = true; R.tok.ready = false;
    const s = Q.spot(k);
    walk(w, S, [{ x: s.x, z: s.z }], () => {
      if (!live(R, 'line')) return;
      R.moving = false; w.faceTarget = s.face; w.anim = 'idle'; w.ground = s.y;
      if (R.k === 0 && Q.indexOf(R.tok) === 0) R.tok.ready = true;
    }, s.face);
  }
}

/* ---------- for tests (?debug): someone to the ATM now, what's going on ---------- */
const debug = {
  go: () => { const S = street(), Q = S?.atm; if (T || !Q) return false; const w = [...workers.values()].find(free); return !!w && go(w, S, Q); },
  state: () => (!T ? last : { stage: T.stage, id: T.w.id, k: T.stage === 'line' ? street()?.atm?.indexOf(T.tok) ?? -1 : -1, trips }),
};
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) setTimeout(function hook() { if (!window.__office) { setTimeout(hook, 200); return; } window.__office.payday = debug; }, 0);
