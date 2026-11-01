// Trực nhật: the pantry's daily chores, a turn each (company floor; the board and the cups at the sink:
// world/props/duty-board.js; the rota itself: src/shared/duty.js). On each working day the board on the pantry wall
// names who washes the cups, takes the rubbish out, waters the plants and wipes the pantry's tables, taking turns among
// the people of the projects here; HR posts the list in the group chat in the morning. The cups pile up at the sink as
// the day goes on (a coffee in the morning, a glass of trà đá at lunch, the afternoon cà phê); whoever has the cups
// washes them after the nap, one by one at the sink. At about five the bag comes out of the pantry's big bin and goes to
// the bin room on the stairs' landing, and the tables are wiped. The plants in the morning. Each does it when resting,
// never in the middle of work (work coming in calls them back at a run, the chore left for later). A chore never got to
// is owed the next morning: someone grumbles in the group chat ("Hôm qua ai trực mà ly chất đống vậy 😤"), the one
// whose turn it was says sorry and does it first thing. The 18:30 cleaner mops the floors and leaves the bin to the
// rota on those days; the cups were never hers. Nothing at the weekend or on a holiday.
// ?duty: every chore due now, and quickly; ?debug: __office.duty.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { PRO, officeNow, pad2, rand, reduceMotion, replay } from '../core/env.js';
import { mat } from '../scene/blocks.js';
import { stairsVisit } from '../world/entrance.js';
import { SINK, drawBoard, setPile } from '../world/props/duty-board.js';
import { spotAt, standBy } from './navigation.js';
import { free, later, plantSpot, plantsToWater, pour } from './errands.js';
import { dn, sessions, workers } from './workers.js';
import { called, resting, resume } from './outings.js';
import { binHooks, staff } from './staff.js';
import { projOf } from './hr.js';
import { napOn } from '../life/nap.js';
import { sfx } from '../audio/sfx.js';
import { chatLife } from '../ui/group-chat.js';
import { queueUi } from '../ui/activity.js';
import { CHORES, OWE_FROM, assign, done, due, fresh, pile, roll, saw, washed } from '../../shared/duty.js';
import { dayKey, dayKind, isWorkday, prevWorkday } from '../../shared/workdays.js';
import { t as tr } from '../../i18n/index.js';

const FORCE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('duty');
const KEY = 'office-duty', TABLES = [[10.4, -4.9], [12.8, -4.9], [10.4, -0.9], [12.8, -0.9]];
let st = fresh(), loaded = false, checkAt = 0, job = null, SINK_SPOT = null;
const minutes = (d = officeNow()) => d.getHours() * 60 + d.getMinutes();
const hm = (m) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
function say(w, key, ms = 4000) { const text = tr(`people.duty.say.${key}`); w.say('idle', text); setTimeout(() => { if (w.lastSay?.text === text) w.hush(); }, ms); }
function load() { loaded = true; try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v?.v === 1) st = { ...fresh(), ...v }; } catch { /* storage blocked */ } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* storage blocked */ } }

/* ---------- who is here, and whose turn ---------- */
const onFloor = (w) => !w.sub && !w.staff && !w.leaving && !w.away && sessions.has(w.id) && !!w.root.parent;
function here() {
  const out = [];
  for (const w of workers.values()) { if (!onFloor(w)) continue; const s = sessions.get(w.id), key = projOf(s); if (key) out.push({ key, name: dn(s) || key, w }); }
  return out;
}
const personOf = (key, list) => list.find((p) => p.key === key)?.w || null;
// free to do it now: resting at the desk (asleep or awake), nothing else on
const ready = (w) => !!w && !w.chore && !w.outing && !w.micro && (resting(w) || (free(w) && w.station === 'desk' && sessions.get(w.id)?.status === 'rest' && !sessions.get(w.id)?.bg?.length));

/* ---------- things in hand: the black bin bag, the blue cloth ---------- */
let bagM, clothM;
function inHand(w, kind) {
  const m = kind === 'bag' ? new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), bagM) : new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.1), clothM);
  if (kind === 'bag') { m.scale.set(0.95, 1.25, 0.95); m.position.set(0, -0.2, 0.04); } else m.position.set(0, -0.06, 0.06);
  m.userData.dynamic = true; w.P.armR.hand.add(m); return m;
}
const drop = (m) => { if (m) { m.removeFromParent(); m.geometry.dispose(); } };

/* ---------- doing a chore ---------- */
const alive = (J) => job === J && J.w.chore?.duty === J.chore && !J.w.leaving;
function start(chore, w, owed) {
  const J = job = { chore, w, owed, stage: 'up', held: null, left: 0 };
  w.chore = { duty: chore, where: { ic: chore === 'plants' ? 'sparkle' : 'coffee', text: tr('people.duty.where', { what: tr(`people.duty.chores.${chore}`) }) } };
  w.station = 'duty'; w.restAt = Infinity; w.hush(); w.anim = 'wake';
  later(reduceMotion ? 0.3 : 1.4, () => {
    if (!alive(J)) return;
    w.anim = 'idle'; say(w, owed ? 'owe' : `${chore}Go`);
    J.stage = 'go';
    ({ cups, trash, plants, table })[chore](J);
  });
  queueUi(); show();
}
// the cups: at the sink, one by one (two at a time when it is a big pile), the water running
function cups(J) {
  const w = J.w;
  w.goTo(SINK_SPOT, () => {
    if (!alive(J)) return;
    w.faceTarget = SINK_SPOT.face; w.anim = 'tidy'; J.stage = 'wash'; J.left = pile(st, minutes()); sfx.play('water');
    const step = () => {
      if (!alive(J)) return;
      if (J.left <= 0) { st = washed(st, minutes()); finish(J, 'cupsDone'); return; }
      J.left = Math.max(0, J.left - (J.left > 10 ? 2 : 1)); setPile(J.left);
      if (J.left % 4 === 0) sfx.play('water');
      later(FORCE || reduceMotion ? 0.35 : 1.1, step);
    };
    later(0.8, step);
  });
}
// the bin: the bag tied and lifted out, a fresh one in, then through the stairs' door to the bin room and back
function trash(J) {
  const w = J.w, { bin } = staff();
  w.goTo(bin.spot, () => {
    if (!alive(J)) return;
    w.faceTarget = bin.spot.face; w.anim = 'tidy';
    later(reduceMotion ? 0.4 : 1.8, () => {
      if (!alive(J)) return;
      J.stage = 'bag'; J.held = inHand(w, 'bag'); w.anim = 'idle'; sfx.play('rustle');
      stairsVisit(w, FORCE ? 2 : rand(5, 8), () => {
        drop(J.held); J.held = null;
        if (alive(J)) finish(J, 'trashDone');
      });
    });
  });
}
// the plants: the thirstiest three, the can from the pantry
function plants(J) {
  const w = J.w, list = plantsToWater(3);
  const next = () => {
    if (!alive(J)) return;
    const i = list.shift(); if (i == null) { finish(J, 'plantsDone'); return; }
    const spot = plantSpot(i, w); if (!spot) { next(); return; }
    w.goTo(spot, () => { if (!alive(J)) return; w.anim = 'globe'; pour(i, w, () => alive(J) && later(0.4, next)); });
  };
  next();
}
// the pantry's four tables, a wipe each with the cloth
function table(J) {
  const w = J.w, list = TABLES.map(([x, z]) => [x, z, standBy(x, z)]).filter((t) => t[2]);
  J.held = inHand(w, 'cloth');
  const next = () => {
    if (!alive(J)) return;
    const t = list.shift(); if (!t) { drop(J.held); J.held = null; finish(J, 'tableDone'); return; }
    w.goTo(t[2], () => {
      if (!alive(J)) return;
      w.faceTarget = Math.atan2(t[0] - w.pos.x, t[1] - w.pos.y); w.anim = 'tidy'; sfx.play('rustle');
      later(FORCE || reduceMotion ? 0.6 : 2.2, next);
    });
  };
  next();
}
// done: ticked on the board, back to the desk and on with whatever is there
function finish(J, line) {
  const w = J.w;
  st = done(st, J.chore, minutes(), J.owed); save();
  job = null; say(w, line, 3500); w.anim = 'idle';
  w.goTo(w.homeSpot(), () => { if (w.chore?.duty === J.chore) w.chore = null; resume(w, false); queueUi(); });
  queueUi(); show();
}
// work came in (or they left, or a replay began): the chore is left for later; the cups not yet washed stay at the sink
function abort(J, why) {
  const w = J.w;
  if (J.chore === 'cups' && J.stage === 'wash') st = washed(st, minutes(), J.left);
  drop(J.held); J.held = null; job = null; save();
  if (w.chore?.duty === J.chore) w.chore = null;
  if (why === 'work' && !w.leaving) { w.hurry = true; say(w, 'called', 3500); w.goTo(w.homeSpot(), () => { w.hurry = false; if (!w.chore) resume(w, false); }); }
  queueUi(); show();
}

/* ---------- the board, the sink, the bin: what they show ---------- */
function show() {
  const d = officeNow(), m = minutes(d), kind = dayKind(d);
  if (!isWorkday(d)) { drawBoard({ date: dateLabel(d), off: kind, rows: [], owe: [] }); setPile(0); return; }
  const rows = Object.keys(st.who).length ? CHORES.map((c) => ({ chore: c, name: st.names[st.who[c]] || '', at: st.done[c] != null ? hm(st.done[c]) : '', busy: job?.chore === c && !job.owed })) : [];
  drawBoard({ date: dateLabel(d), off: '', rows, owe: st.owe.map((o) => ({ chore: o.chore, name: o.name })) });
  setPile(job?.chore === 'cups' && job.stage === 'wash' ? job.left : pile(st, m));
}
const dateLabel = (d) => `${dayKind(d) === 'makeup' ? `${tr('people.duty.board.makeup')} · ` : ''}${tr('people.duty.board.days', null, 'list')[d.getDay()]} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
// the pantry's big bin (people/staff.js): emptied by the rota today; still full from yesterday, spilling over
function binLevel() {
  if (!isWorkday(officeNow())) return null;
  if (job?.chore === 'trash' && job.stage === 'bag') return 0.05;
  if (st.owe.some((o) => o.chore === 'trash')) return 1.25;
  return st.done.trash != null ? 0.05 : null;
}

/** today's rota in a line (the board's tooltip, and a toast when it is tapped) */
export function dutyText() {
  const d = officeNow(), kind = dayKind(d);
  if (!isWorkday(d)) return `${tr(`people.duty.board.${kind}`)}: ${tr('people.duty.board.noDuty')}`;
  if (!Object.keys(st.who).length) return tr('people.duty.board.nobody');
  const list = CHORES.map((c) => `${tr(`people.duty.chores.${c}`)}: ${st.names[st.who[c]] || '—'}${st.done[c] != null ? ' ✓' : ''}`).join(' · ');
  return st.owe.length ? `${list} · ${tr('people.duty.board.owe', { list: st.owe.map((o) => tr(`people.duty.chores.${o.chore}`)).join(', ') })}` : list;
}

/* ---------- each frame (a look every two seconds) ---------- */
export function updateDuty() {
  if (job) {   // under way (looked at every frame): work coming in calls them back at once; gone, a replay: let go
    const w = job.w;
    if (w.leaving || replay.on || !workers.has(w.id)) abort(job, 'gone');
    else if (called(w) && !w.stairs) abort(job, 'work');
  }
  if (!PRO || !SINK_SPOT || state.sim < checkAt) return;
  checkAt = state.sim + 2;
  if (!loaded) load();
  const d = officeNow(), m = minutes(d), today = dayKey(d);
  if (replay.on || !isWorkday(d)) { show(); return; }
  if (st.day !== today) { st = roll(st, today, dayKey(prevWorkday(d))); save(); }
  const list = here();
  if (list.length) {
    const was = st;
    st = saw(assign(st, list), list.map((p) => p.key));
    if (st !== was) save();
    // the list in the group chat, from HR, once a morning
    if (st.told !== today && Object.keys(st.who).length && m >= 480 && m < 600) {
      st.told = today; save();
      chatLife('dutyRoster', { list: CHORES.map((c) => `${tr(`people.duty.chores.${c}`)}: ${st.names[st.who[c]] || '—'}`).join(' · '), every: 12 * 3600e3 });
    }
    // yesterday's undone: someone grumbles about it (not the one who owes it), and the one says sorry
    if (st.owe.length && st.grumbled !== today && m >= OWE_FROM && m < 690) {
      const o = st.owe[0], culprit = personOf(o.who, list), by = list.find((p) => p.key !== o.who) || list[0];
      st.grumbled = today; save();
      chatLife('dutyGrumble', { id: by.w.id, chore: o.chore, who: culprit?.id || '', every: 12 * 3600e3 });
    }
  }
  if (!job && list.length && !napOn) next(list, m);
  show();
}
// the next chore to do: what is owed first (from 8:00), then today's in their windows; whoever it falls to, once free
function next(list, m) {
  for (const o of st.owe) {
    if (m < OWE_FROM && !FORCE) break;
    const w = personOf(o.who, list) || personOf(st.who[o.chore], list);
    if (ready(w)) { start(o.chore, w, true); return; }
  }
  for (const c of CHORES) {
    if (st.done[c] != null || !st.who[c] || (!FORCE && !due(c, m))) continue;
    if (c === 'cups' && pile(st, m) === 0) continue;
    const w = personOf(st.who[c], list);
    if (ready(w)) { start(c, w, false); return; }
  }
}

/* ---------- for tests (?debug): today's rota (on a day off, the last working day's is kept for the next) ---------- */
const debug = {
  state: () => ({ day: st.day, who: st.day === dayKey(officeNow()) ? { ...st.who } : {}, names: { ...st.names }, done: { ...st.done }, owe: st.owe.map((o) => ({ ...o })), pile: pile(st, minutes()), kind: dayKind(officeNow()), job: job && { chore: job.chore, id: job.w.id, stage: job.stage, owed: job.owed, left: job.left }, bin: binLevel() }),
  go: (chore) => { const list = here(), o = st.owe.find((x) => x.chore === chore), w = personOf(o?.who || st.who[chore], list); if (job || !w || w.chore) return false; start(chore, w, !!o); return true; },
  look: () => { checkAt = 0; },
};
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) setTimeout(function hook() { if (!window.__office) { setTimeout(hook, 200); return; } window.__office.duty = debug; }, 0);

export function setup() {
  if (!PRO) return;
  SINK_SPOT = spotAt(SINK.x, -6.72, Math.PI, 'PA4');
  bagM = mat('#1E1F23', { roughness: 0.55 }); clothM = mat('#3F7CC4', { roughness: 0.95 });
  binHooks.level = binLevel;
  binHooks.leave = () => isWorkday(officeNow()) && Object.keys(st.who).length > 0;   // (the cleaner leaves the bin to the rota)
}
