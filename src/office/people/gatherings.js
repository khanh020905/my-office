// Gatherings round the meeting table: the bell on it calls a quick meeting (everyone free comes, each says what they
// are on, the director wraps up), a new trophy brings a cake (everyone comes and claps), and a deploy gets a round of
// applause from the people sitting nearby.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { chatLife } from '../ui/group-chat.js';
import { PRO, officeNow, rand, reduceMotion, replay, short } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { cyl, mat, put } from '../scene/blocks.js';
import { MEET } from '../world/furniture/meeting.js';
import { confetti } from '../world/room-update.js';
import { allocate } from './navigation.js';
import { dn, sessions, workers } from './workers.js';
import { director } from './director.js';
import { asleep, dist, free, later, line, people } from './errands.js';
import { toast } from '../ui/activity.js';
import { sfx } from '../audio/sfx.js';
import { t as tr } from '../../i18n/index.js';
import { isWorkday } from '../../shared/workdays.js';

export let bellG;
let bellRing = 0, cakeG = null, cakeGrow = 0, flames = [];
let gathering = null;
const TOP = 0.8;   // the meeting table's top, in both rooms

// What someone says when it is their turn at the meeting: what they are on (never the prompt in streamer mode).
function reportOf(w) {
  if (w.sub) return tr('people.meet.sub', { boss: short(dn(sessions.get(w.parent?.id)), 20) });
  const s = sessions.get(w.id);
  if (!s) return line('people.meet.fine');
  if (s.status === 'wait') return tr('people.meet.waiting');
  const task = state.streamer ? '' : short(s.lastPrompt || '', 34);
  if (s.status === 'work') return task ? tr('people.meet.working', { task }) : line('people.meet.busy');
  return task ? tr('people.meet.done', { task }) : line('people.meet.idle');
}

/* One gathering at a time. Everyone free (and anyone napping, who wakes up) walks to a place at the table; the director,
   when free, stands at the end of it. Once the furthest has had time to arrive it starts: a meeting goes round the
   table, a party lights the cake and claps. Everyone keeps their place until the end, then goes back to what they were
   doing. kind: 'meet' | 'party'. o (a party): long (how long it lasts, seconds), host (who runs it and comes too: the HR
   woman, people/hr.js), open (her first words), onStart(g) / onEnd(g). */
function gather(kind, what = '', o = {}) {
  const lead = PRO && director && free(director) ? director : null;
  const spots = 12;
  const who = people().filter((w) => w !== director && (free(w) || asleep(w)))
    .sort((a, b) => dist(a, MEET.x, MEET.z) - dist(b, MEET.x, MEET.z)).slice(0, spots);
  if (!who.length && !lead) { if (kind === 'meet') toast(tr('people.meet.nobody')); return false; }
  const far = Math.max(3, ...who.map((w) => 1.4 + (dist(w, MEET.x, MEET.z) * 1.4) / 2.7));
  const g = gathering = { kind, start: state.sim + Math.min(13, far), end: 0, members: [] };
  g.end = g.start + (kind === 'meet' ? 2 + who.length * 1.8 + 2.4 : o.long || 7);
  const T = kind === 'meet' ? 'meet' : 'party';
  for (const w of who) {
    const spot = allocate('meeting', w); if ('by' in spot) spot.by = w;
    const e = w.errand({ gathering: g, spot, look: [MEET.x, MEET.z], type: T, anim: kind === 'party' ? 'clap' : 'idle', wait: rand(0.3, 1.2), hold: 0.3,
      line: line(`people.${T}.coming`), at: () => line(`people.${T}.bye`) });
    e.until = g.end; g.members.push(w);
  }
  if (lead) {
    const e = lead.errand({ gathering: g, spot: allocate('brief', lead), look: [MEET.x, MEET.z], type: T, anim: 'idle', wait: 0.4, hold: 0.3, at: () => null });
    e.until = g.end;
  }
  if (o.guest) { const spot = allocate('meeting', o.guest); if ('by' in spot) spot.by = o.guest; const e = o.guest.errand({ gathering: g, spot, look: [MEET.x, MEET.z], type: T, anim: 'idle', wait: 0.2, hold: 0.3, at: () => null }); e.until = g.end; }   // (whom it is for: people/farewell.js)
  if (o.host) { const e = o.host.errand({ gathering: g, spot: allocate('brief', o.host), look: [MEET.x, MEET.z], type: T, anim: 'idle', wait: 0.2, hold: 0.3, at: () => null }); e.until = g.end; }
  const host = o.host || lead || who[0];
  const here = (w) => w.chore?.gathering === g;
  later(g.start - state.sim, () => {
    if (gathering !== g) return;
    if (here(host)) host.say(T, kind === 'meet' ? what || line('people.meet.open') : o.open || tr('people.party.open', { what }));
    o.onStart?.(g);
    if (kind === 'party') {
      showCake(true); sfx.play('clap'); if (!reduceMotion) confetti(MEET.x, 2.4, MEET.z);
      g.members.forEach((w, i) => later(0.8 + i * 0.45, () => { if (here(w) && w !== host) w.say('party', line('people.party.cheer')); }));
    } else g.members.forEach((w, i) => later(2 + i * 1.8, () => { if (here(w)) w.say('meet', reportOf(w)); }));
  });
  later(g.end - state.sim - 1.6, () => { if (gathering === g && here(host)) host.say(T, line(`people.${T}.close`)); if (kind === 'party') sfx.play('clap'); });
  later(g.end - state.sim + 1.5, () => { if (gathering === g) gathering = null; if (kind === 'party') showCake(false); o.onEnd?.(g); });
  return g;
}
export function ringBell(opener = '') {
  bellRing = 0.7; sfx.play('bell');
  if (!replay.on && !gathering) return gather('meet', opener);
  return false;
}
/* Monday 9:00 (each Monday, once): the week's stand-up, the bell rung by itself. Everyone at the table says what they
   are on, as at any meeting the bell calls. */
let standupDay = '';
export function mondayStandup(force = false) {
  const d = officeNow(), day = d.toDateString();
  if (!force && (d.getDay() !== 1 || d.getHours() !== 9 || d.getMinutes() > 10 || standupDay === day || !isWorkday(d))) return false;   // (no stand-up on a Monday off)
  standupDay = day;
  if (!ringBell(line('people.meet.monday'))) return false;
  toast(tr('people.meet.mondayToast'), 5000);
  chatLife('standup');
  return true;
}
// just the ring, no meeting (life/quota.js: the plan's limit has reset, back to the desks)
export function dingBell() { bellRing = 0.7; sfx.play('bell'); }
// a new trophy (from life/trophies.js): a cake on the meeting table
// the month's birthdays (people/hr.js): a long party round the cake, run by `host`
export function birthday(o) { return !replay.on && !gathering && gather('party', '', o); }
// a farewell (people/farewell.js): the same, with the one leaving at the table too (o.guest)
export function farewellParty(o) { return !replay.on && !gathering && gather('party', '', o); }
export const gatheringNow = () => gathering;
export function celebrate(what) {
  if (replay.on || gathering) return;
  gather('party', what);
}
// a deploy or a push: the people sitting near the one who did it clap where they are (each person at most every ten minutes)
export function applaud(sess) {
  const w = workers.get(sess);
  if (!w || replay.on || state.sim - (w.cheeredAt ?? -1e9) < 600) return;
  w.cheeredAt = state.sim;
  for (const p of people()) if (p !== w && p !== director && free(p) && dist(p, w.pos.x, w.pos.y) < 5.5) {
    p.errand({ type: 'party', anim: 'clap', wait: rand(0.2, 0.9), hold: 2.2, linger: 0.4, look: [w.pos.x, w.pos.y], line: line('people.party.deploy') });
  }
  if (!reduceMotion) confetti(w.pos.x, 2.6, w.pos.y);
  sfx.play('clap');
}
function showCake(on) { if (!cakeG) return; cakeG.visible = true; cakeGrow = on ? 1 : -1; }
let weekCheckAt = 0;
export function updateGatherings(dt, t) {
  if (t > weekCheckAt) { weekCheckAt = t + 5; if (!replay.on) mondayStandup(); }
  if (bellRing > 0) { bellRing = Math.max(0, bellRing - dt); bellG.rotation.z = Math.sin(bellRing * 40) * bellRing * 0.25; }
  if (cakeG?.visible) {
    const s = THREE.MathUtils.clamp(cakeG.scale.x + cakeGrow * dt * 3, 0.001, 1);
    cakeG.scale.setScalar(s); if (s <= 0.001) cakeG.visible = false;
    for (const [i, f] of flames.entries()) f.scale.set(1, 1 + Math.sin(t * 18 + i * 2) * 0.25, 1);
  }
}

export function setup() {
  // the bell: a brass dome on a dark base, at the near end of the meeting table
  // (a desk bell is tiny from up here: drawn over three times its size, on the camera's side of the table, so it can be
  // found and clicked)
  const bx = PRO ? MEET.x + 1.45 : MEET.x + 0.5, bz = PRO ? MEET.z + 0.38 : MEET.z + 0.45;
  bellG = new THREE.Group(); bellG.position.set(bx, TOP, bz); bellG.scale.setScalar(3.4); scene.add(bellG);
  bellG.userData.dynamic = true;   // its own thing, not part of the table (nor of the meeting room you click for its card)
  const brass = mat('#E8B84A', { metalness: 0.75, roughness: 0.25, emissive: '#9A6A12', emissiveIntensity: 0.6 });   // a warm glint even in a dim room
  put(bellG, cyl(0.055, 0.06, 0.016, mat('#8E2B2B', { roughness: 0.5 }), 20), 0, 0.008, 0);
  put(bellG, new THREE.Mesh(new THREE.SphereGeometry(0.045, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), brass), 0, 0.016, 0).castShadow = true;
  put(bellG, cyl(0.006, 0.006, 0.02, brass, 8), 0, 0.068, 0);
  put(bellG, new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 8), brass), 0, 0.08, 0);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3)); hit.visible = false; hit.position.y = 0.06; bellG.add(hit);   // easier to point at
  // the cake, hidden until a party: a plate, two tiers, cream and three candles
  cakeG = new THREE.Group(); cakeG.position.set(PRO ? MEET.x + 0.6 : MEET.x - 0.3, TOP, PRO ? MEET.z : MEET.z - 0.4); cakeG.visible = false; cakeG.scale.setScalar(0.001);
  cakeG.userData.dynamic = true; scene.add(cakeG);
  put(cakeG, cyl(0.2, 0.2, 0.012, mat('#FFFFFF', { roughness: 0.3 }), 24), 0, 0.006, 0);
  put(cakeG, cyl(0.15, 0.15, 0.1, mat('#F3B6C4', { roughness: 0.7 }), 24), 0, 0.062, 0).castShadow = true;
  put(cakeG, cyl(0.155, 0.155, 0.022, mat('#FFF6EC', { roughness: 0.6 }), 24), 0, 0.12, 0);
  put(cakeG, cyl(0.09, 0.09, 0.06, mat('#F7D9A8', { roughness: 0.7 }), 20), 0, 0.16, 0);
  const flameM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.3, 0.4) });
  flames = [[-0.04, 0.02], [0.04, 0.02], [0, -0.045]].map(([x, z], i) => {
    put(cakeG, cyl(0.007, 0.007, 0.06, mat(['#7EC8E3', '#FFD166', '#C2577A'][i], { roughness: 0.5 }), 6), x, 0.22, z);
    const f = put(cakeG, new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6).scale(1, 1.6, 1), flameM), x, 0.262, z); return f;
  });
}
