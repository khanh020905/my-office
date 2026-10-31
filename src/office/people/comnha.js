// Cơm nhà: lunch brought from home, warmed at the pantry's two microwaves at noon (company floor; the corner:
// world/props/microwave.js; who brought some today, and what: src/shared/comnha.js). From 11:45, each at a minute of
// their own, those who brought it get up from their nap with their insulated bag and line up by the microwaves (a
// Monday's line is the long one), their phone out while they wait. At a free one: the door open, the box in, the door
// shut, two or three minutes, the plate turning in the light; "tít tít tít", the box out, steaming, the next one steps
// up. Cá kho or mắm in a box leaves a smell over the corner, and the group chat hears about it; a lid left clipped shut
// pops halfway. Then the lunch eaten at a pantry table or at the desk, and the nap. They are not the ones who fetch the
// GrabFood or go down to the quán cơm (people/outings.js, comtrua.js). Work coming in calls them back (a box already
// heating stays in, and the microwave beeps for it). ?comnha: everyone resting has brought lunch, now, short heats;
// ?debug: __office.micro.
import { state } from '../core/state.js';
import { PRO, officeNow, rand, replay } from '../core/env.js';
import { MW, openOven, runOven, updateOvens } from '../world/props/microwave.js';
import { allocate } from './navigation.js';
import { showMeal } from './breaks.js';
import { later } from './errands.js';
import { lunchHooks, sessions, workers } from './workers.js';
import { called, resting, resume } from './outings.js';
import { chatLife } from '../ui/group-chat.js';
import { queueUi } from '../ui/activity.js';
import { bringsLunch, heatSecs, lunchOf, warmAt, warmWindow } from '../../shared/comnha.js';
import { t as tr } from '../../i18n/index.js';

const FORCE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('comnha');
const members = new Set();   // everyone between getting up and sitting down to eat (m: { w, stage, lunch, secs, oven, spot })
const line = [];             // those waiting, in order (the first goes to the next free microwave)
let WAIT = [], served = 0, chatDay = '', smellDay = '', next = null;
const alive = (m) => m.w.micro === m && !m.w.leaving;
function say(w, key, ms = 4500) { const text = tr(`people.micro.say.${key}`); w.say('idle', text); setTimeout(() => { if (w.lastSay?.text === text) w.hush(); }, ms); }
/** whether this person brought lunch from home today (and so warms it here, rather than the takeaway or the quán) */
export const homeLunch = (w, d = officeNow()) => PRO && !!MW.ovens.length && !!w && !w.sub && !w.staff && bringsLunch(w.id, d, FORCE);

/* ---------- the line ---------- */
function join(w) {
  const waiting = [...members].filter((m) => m.stage === 'up' || m.stage === 'wait').length;   // (those still stretching too)
  if (!MW.ovens.length || w.micro || replay.on || waiting >= WAIT.length) return false;
  const d = officeNow(), m = { w, stage: 'up', lunch: { ...lunchOf(w.id, d), ...(next || {}) }, secs: heatSecs(w.id, d, FORCE), oven: null, spot: null };
  next = null;
  members.add(m); w.micro = m; w.chore = { micro: true }; w.station = 'micro'; w.restAt = Infinity; w.lunchDay = d.toDateString();
  w.hush(); w.anim = 'wake'; w.afterAt = state.sim + 1.4;   // (a stretch first)
  w.after = () => {
    if (!alive(m)) return;
    w.anim = 'idle'; w.carry = 'lunchbag'; say(w, 'go');
    m.stage = 'wait'; line.push(m); lineUp();
    if (line.length >= 3 && chatDay !== w.lunchDay) { chatDay = w.lunchDay; chatLife('micro', { id: line[line.length - 1].w.id, monday: d.getDay() === 1 }); }
  };
  queueUi();
  return true;
}
// everyone to their place in the line: facing the microwaves, phone out
function lineUp() {
  line.forEach((m, k) => {
    const sp = WAIT[Math.min(k, WAIT.length - 1)]; if (m.spot === sp) return;
    m.spot = sp;
    m.w.goTo(sp, () => { if (alive(m) && m.spot === sp) { m.w.faceTarget = sp.face; m.w.anim = 'phone'; } });
  });
  queueUi();
}
// the first in line to a microwave that is free: the door open, the box in, shut, the time set, start
function step(m, O) {
  const w = m.w;
  m.stage = 'step'; m.oven = O; O.by = m; m.spot = MW.spots[O.i];
  w.goTo(m.spot, () => {
    if (!alive(m)) return;
    w.faceTarget = m.spot.face; w.anim = 'tidy'; openOven(O);
    later(1.2, () => {
      if (!alive(m) || m.oven !== O) return;
      O.load(m.lunch.kind); m.stage = 'load';
      later(0.9, () => {
        if (!alive(m) || m.oven !== O) return;
        openOven(O, false);
        later(0.5, () => {
          if (!alive(m) || m.oven !== O) return;
          runOven(O, m.secs, { smelly: m.lunch.smelly, pop: m.lunch.pop }); m.stage = 'heat';
          w.anim = 'phone'; say(w, 'start');
          // cá kho in the box: whoever is next in line says so, and someone in the group chat
          if (m.lunch.smelly) later(Math.min(20, m.secs * 0.3), () => {
            if (!alive(m) || m.stage !== 'heat') return;
            const by = line[0]?.w || [...workers.values()].find((x) => x !== w && sessions.get(x.id)?.status === 'rest' && x.root.visible);
            if (line[0]) say(line[0].w, 'smell');
            if (by && smellDay !== `${w.lunchDay}:${O.i}`) { smellDay = `${w.lunchDay}:${O.i}`; chatLife('microSmell', { id: by.id, who: w.id }); }
          });
          queueUi();
        });
      });
    });
  });
  queueUi();
}
// the lid left clipped: "bụp", and the one standing there knows at once
function popped(O) {
  const m = O.by;
  if (m && alive(m)) { say(m.w, 'pop'); m.w.anim = 'idle'; later(2.5, () => alive(m) && m.stage === 'heat' && (m.w.anim = 'phone')); }
  const other = line[0]?.w || [...workers.values()].find((x) => x !== m?.w && sessions.get(x.id)?.status === 'rest' && x.root.visible);
  if (other) chatLife('microPop', { id: other.id, who: m?.w.id || '' });
}
// "tít tít tít": the door open, the box out (hot), the next one up; nobody there (called away): the box waits in it, and
// it beeps again a little later, then someone takes it to their desk
function done(O) {
  const m = O.by;
  openOven(O);
  if (!m || !alive(m)) {
    O.by = null;
    later(20, () => { if (O.stage === 'done' && !O.by) openOven(O, false); });
    later(45, () => { if (O.stage === 'done' && !O.by) { O.unload(); O.stage = 'idle'; } });
    return;
  }
  const w = m.w;
  m.stage = 'take'; say(w, 'beep'); w.anim = 'tidy';
  later(1.2, () => {
    if (!alive(m)) return;
    O.unload(); O.stage = 'idle'; O.by = null; m.oven = null; served++;
    w.carry = 'homebox'; w.P.homeLid?.material.color.set({ blue: '#2F7FD0', green: '#3FA35B', pink: '#E06B9A', glass: '#2E86C1', inox: '#C9CED6' }[m.lunch.kind] || '#2F7FD0');
    later(0.4, () => openOven(O, false));
    if (line[0]) later(0.6, () => line[0] && say(line[0].w, 'next', 3000));
    sitDown(m);
  });
}
// to a free seat at a pantry table (most of them), or back to the desk, to eat
function sitDown(m) {
  const w = m.w, desk = w.homeSpot();
  const seat = (m.lunch.pantry && allocate('dining', w, true)) || desk;
  m.stage = 'eat'; m.spot = seat;
  say(w, seat === desk ? 'desk' : 'hot', 3500);
  w.goTo(seat, () => {
    if (!alive(m)) return;
    finish(m);
    w.station = seat === desk ? 'desk' : 'dining'; w.carry = null; w.meal = true; w.anim = 'eat';
    showMeal(w, m.lunch.kind);
    w.restAt = state.sim + (FORCE ? rand(40, 70) : rand(900, 1500)); w.dwellUntil = state.sim + 3;
  });
  queueUi();
}
function finish(m) {
  members.delete(m);
  const i = line.indexOf(m); if (i >= 0) { line.splice(i, 1); lineUp(); }
  if (m.oven?.by === m) { const O = m.oven; O.by = null; if (O.stage !== 'run' && O.stage !== 'done') { O.unload(); openOven(O, false); O.stage = 'idle'; } }
  m.oven = null;
  if (m.w.micro === m) { m.w.micro = null; m.w.chore = null; }
  queueUi();
}
// work came in (or they left): out of the line at once, back to the desk; a box already heating stays in the microwave
function release(m) {
  const w = m.w, was = m.stage;
  finish(m);
  if (w.leaving) return;
  w.carry = null; w.hurry = true;
  if (was !== 'eat') say(w, 'called', 3500);
  w.goTo(w.homeSpot(), () => { w.hurry = false; if (!w.micro) resume(w, false); });
}

/* ---------- each frame ---------- */
export function updateMicro(dt) {
  if (!PRO || !MW.ovens.length) return;
  updateOvens(dt, done, popped);
  if (!members.size) return;
  if (replay.on) { for (const m of [...members]) release(m); return; }
  for (const m of [...members]) if (alive(m) && m.stage !== 'eat' && called(m.w)) release(m); else if (!alive(m)) finish(m);
  for (const O of MW.ovens) if (O.stage === 'idle' && !O.by && line.length) { const m = line.shift(); lineUp(); step(m, O); }
}

/* ---------- the session list: where they are ---------- */
export function microNow(w) {
  const m = w?.micro; if (!m) return null;
  const T = (k, v) => tr(`people.micro.where.${k}`, v);
  if (m.stage === 'wait' || m.stage === 'up') { const k = line.indexOf(m); return { ic: 'coffee', text: T('line', { n: Math.max(0, k) }) }; }
  if (m.stage === 'eat') return { ic: 'coffee', text: T('eat') };
  return { ic: 'coffee', text: T('heat') };
}

/* ---------- for tests (?debug): everyone resting in line now, what is going on ---------- */
const debug = {
  go: (n = 6) => { let k = 0; for (const w of workers.values()) if (k < n && resting(w) && join(w)) k++; return k; },
  next: (o) => { next = o; },   // the next one's box: { smelly, pop, pantry }
  state: () => ({
    line: line.map((m) => m.w.id), served,
    ovens: MW.ovens.map((O) => ({ stage: O.stage, by: O.by?.w.id || null, left: Math.ceil(O.left || 0), smell: +O.smell.toFixed(2), popped: O.popped, open: +O.open.toFixed(2), box: O.box.visible })),
    people: [...members].map((m) => ({ id: m.w.id, stage: m.stage, kind: m.lunch.kind })),
    eating: [...workers.values()].filter((w) => w.mealBox && w.anim === 'eat').map((w) => ({ id: w.id, at: w.station })),
    today: [...workers.values()].filter((w) => homeLunch(w)).map((w) => w.id),
  }),
  at: () => MW.at && { x: MW.at.x, z: MW.at.z },
};
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) setTimeout(function hook() { if (!window.__office) { setTimeout(hook, 200); return; } window.__office.micro = debug; }, 0);

export function setup() {
  if (!PRO) return;
  // the line: back from the microwaves along the wall, past the big bin, then along the counter
  WAIT = [[9.55, -5.42, 'PA2'], [9.55, -5.98, 'PA2'], [9.75, -6.45, 'PA2'], [10.35, -6.48, 'PA2'], [10.95, -6.48, 'PA4']].map(([x, z, node], k) => ({ x, z, node, sit: false, face: k < 3 ? 0 : Math.atan2(9.55 - x, -5.42 - z) }));
  // (workers.js asks, from a nap, at lunchtime: { at } when it's lunch from home today, then join())
  lunchHooks.home = (w, d, min) => {
    if (!homeLunch(w, d)) return null;
    return { due: (FORCE || (warmWindow(min) && min >= warmAt(w.id, d))) && !replay.on, join: () => join(w) };
  };
}
