// Workers: one character per session or subagent, what they do and where they walk.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { makeChibi, chibiPose, applyChibiPose, wearOuter, wearHat, wearLanyard, disposeRig } from './chibi-rig.js';
import { state } from '../core/state.js';
import { PRO, SEASON, V2, el, fmtAgo, nowMs, officeNow, rand, randInt, reduceMotion, replay, short, tint, wrapAngle } from '../core/env.js';
import { ACT, ANIM_AT, bubbleText, verb } from '../ui/event-text.js';
import { TYPE_ICON, icon } from '../ui/icons.js';
import { scene } from '../scene/renderer.js';
import { canvasTex } from '../scene/blocks.js';
import { inside } from '../world/layout.js';
import { lift, liftArrive, liftDown } from '../world/entrance.js';
import { BAGS, COATS, chairs, deskKit } from '../world/desks.js';
import { CLAUDE_MARK } from '../world/pro/pieces.js';
import { DESK_SPOTS, DOOR_IN, DOOR_OUT, NODES, STATIONS, allocate, faceTo, nearestNode, route } from './navigation.js';
import { COFFEE_Q, hideMeal, joinCoffee, leaveCoffee, showMeal } from './breaks.js';
import { blocked, fp } from '../interact/first-person.js';
import { sfx } from '../audio/sfx.js';
import { t as tr } from '../../i18n/index.js';

/* ---------- workers ---------- */
export const PALETTE = ['#6A8042', '#E8742A', '#3F7CC4', '#8C4FA8', '#D64550', '#2A9D8F', '#C9A227', '#5B6CD8', '#B5651D', '#C2577A', '#3E8E7E', '#7A6FD0'];
const HAIRS = ['#3B2618', '#1E1E24', '#9A4A24', '#E2B04A', '#5A3825', '#2B2B2B', '#C2703D', '#7A4E2D'];
const STYLES = ['bob', 'spiky', 'ponytail', 'bun', 'plain', 'curly'];
const ACCS = ['headphones', 'glasses', 'beanie', 'cap', null, null, null];
// set by outings.js (with the city outside): home(w, gone) takes someone leaving out by the street (true if it does),
// arrive(w) brings someone back the same way
export const streetHooks = {};
// the attendance terminal by the lift (people/hr.js): in(w, then) on the way in from the lift, out(w, then) on the way out,
// newcomer(w) for a session's first walk in; each calls then() when done (straight away when there is nothing to do)
export const clockHooks = {};
// set by people/comnha.js: home(w, d, minute) says whether w brought lunch from home today ({ due, join }), else null
export const lunchHooks = {};
const viaClock = (kind, w, then) => (clockHooks[kind] ? clockHooks[kind](w, then) : then());
export function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export const colorOf = (s) => (s.desk >= 0 ? PALETTE[s.desk] : PALETTE[hash(s.name) % PALETTE.length]);
// What to call a session on screen: the chat's title (your rename, else Claude's), else its short name.
// The short name stays the identity: looks, colours and the timeline are keyed by it.
export const dn = (s) => (s ? s.title || s.name : '');
export const dnOf = (e) => dn(sessions.get(e.sess)) || e.name || tr('common.session');
// Which agent a session runs, shown as its logo in the list (Claude Code today; Codex and Gemini when the server
// reports them). The marks are the brands' own logos as published by Simple Icons (CC0 path data, v15.17.0); the
// trademarks belong to Anthropic, Google and OpenAI.
export const agentOf = (s) => (s?.agent === 'codex' || s?.agent === 'gemini' ? s.agent : 'claude');
export const AGENT_NAME = { claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini' };
let AGENT_SVG;
export function agentMark(kind) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'av-logo'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = AGENT_SVG[kind] || AGENT_SVG.claude; svg.dataset.agent = kind;
  return svg;
}
let zTex;
const zs = [];
function puffZ(w) {
  if (reduceMotion) return;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false }));
  s.position.set(w.pos.x + 0.25, 1.95, w.pos.y + 0.15); s.scale.setScalar(0.22);
  scene.add(s); zs.push({ s, life: 2.2 });
}
export function updateZs(dt) {
  for (let i = zs.length - 1; i >= 0; i--) {
    const z = zs[i]; z.life -= dt;
    z.s.position.y += dt * 0.35; z.s.position.x += Math.sin(z.life * 3) * dt * 0.15;
    z.s.scale.setScalar(0.22 + (2.2 - z.life) * 0.08); z.s.material.opacity = Math.min(1, z.life / 0.8);
    if (z.life <= 0) { scene.remove(z.s); z.s.material.dispose(); zs.splice(i, 1); }
  }
}
function lookOf(s) { const h = hash(s.name); return { shirt: colorOf(s), hair: HAIRS[h % HAIRS.length], style: STYLES[(h >>> 3) % STYLES.length], acc: ACCS[(h >>> 7) % ACCS.length], coat: COATS[(h >>> 11) % COATS.length], bag: BAGS[(h >>> 15) % BAGS.length] }; }
export const workers = new Map();   // session id -> Worker
export const npcs = [];             // people who aren't sessions: the director on the company floor
export const subs = new Map();      // subagent id -> Worker
export const sessions = new Map();  // session id -> latest session object from the server
export let Worker;
export function addWorker(s, walkIn) {
  const w = new Worker({ name: s.name, ...lookOf(s) }, { id: s.id });
  if (s.desk >= 0) chairs[s.desk].color.set(colorOf(s));
  const home = w.homeSpot();
  if (walkIn) {
    w.pos.set(DOOR_OUT.x, DOOR_OUT.z); w.face = w.faceTarget = Math.PI / 2; w.spot = DOOR_OUT;
    w.dress(true); liftArrive(w); clockHooks.newcomer?.(w);
    viaClock('in', w, () => w.goTo(home, () => { w.station = 'desk'; w.anim = 'type'; if (home === DESK_SPOTS[s.desk]) w.unpack(s.desk); else w.dress(false); }));
  } else if (w.lateRest(s)) {   // opened late at night: those who went home are not here
    w.away = true; w.station = 'away'; w.pos.set(DOOR_OUT.x, DOOR_OUT.z); w.spot = DOOR_OUT; w.dress(true); w.hush();
  } else {
    w.pos.set(home.x, home.z); w.spot = home; w.face = w.faceTarget = home.face; w.pose = home.sit ? 'sit' : 'stand'; w.station = 'desk';
    if (s.desk >= 0) deskKit[s.desk] = w;
    if (s.status === 'rest') { w.anim = 'sleep'; w.hush(); }
    else if (s.status === 'wait') { w.anim = 'hand'; w.say('wait', tr('people.needsApproval'), 'wait'); }
    else { w.anim = 'type'; if (s.last) w.say(s.last.type, s.last.label || verb(s.last)); }
  }
  workers.set(s.id, w);
  for (const sub of s.subs || []) spawnSub(w, sub.id, sub.type, !walkIn, sub);
  return w;
}
export function spawnSub(parent, agentId, type, instant = false, info = null) {
  if (!agentId || subs.has(agentId)) return subs.get(agentId);
  const h = hash(agentId);
  const w = new Worker({ name: type || 'agent', shirt: tint(parent.cfg.shirt, 0.3), hair: HAIRS[h % HAIRS.length], style: STYLES[(h >>> 3) % STYLES.length], acc: (h >>> 6) % 3 === 0 ? 'glasses' : null, pants: '#4C566A' }, { sub: true, scale: 0.78, parent, id: agentId });
  subs.set(agentId, w);
  const x = () => info || sessions.get(parent.id)?.subs?.find((y) => y.id === agentId);
  const seated = () => {
    w.station = 'meeting'; w.anim = 'think';
    const i = x();
    if (i?.last) w.say(i.last.type, i.last.label || verb(i.last)); else w.say('agent', i?.desc || type || 'agent');
  };
  if (instant) {   // already working when the page opened: straight to where its last step happens
    const seat = allocate('meeting', w);
    if ('by' in seat) seat.by = w;
    w.pos.set(seat.x, seat.z); w.spot = seat; w.face = w.faceTarget = seat.face; w.pose = seat.sit ? 'sit' : 'stand'; seated();
    const last = x()?.last; if (last && ACT[last.type]) w.push(subAct({ type: last.type, label: last.label }));
    return w;
  }
  // new on the team: in through the door (up in the lift), to the boss for the brief, then off to work
  w.pos.set(DOOR_OUT.x, DOOR_OUT.z); w.face = w.faceTarget = Math.PI / 2; w.spot = DOOR_OUT; liftArrive(w);
  w.goTo(DOOR_IN, () => w.goTo(nearBoss(parent, w), () => {
    w.faceTarget = Math.atan2(parent.pos.x - w.pos.x, parent.pos.y - w.pos.y);
    w.anim = 'idle'; w.say('agent', tr('people.subOnIt', { task: short(x()?.desc || type || tr('people.subagent'), 48) })); w.dwellUntil = state.sim + 1.6;
    if (!parent.leaving && parent.phase !== 'walk') parent.faceTarget = Math.atan2(w.pos.x - parent.pos.x, w.pos.y - parent.pos.y);
    if (!w.want) w.push({ station: 'desk', anim: 'think', type: 'agent', text: x()?.desc || tr('people.subThinking'), dwell: 1.2 });
  }));
  return w;
}
// What a subagent does for one of its steps: the same places as everyone (library, server room, window), its "desk"
// is the meeting table; it stays at least 2.5 s somewhere before moving on, so a burst of steps doesn't make it run.
export function subAct(e) {
  const a = ACT[e.type] || ACT.other;
  return { ...a, type: ACT[e.type] ? e.type : 'other', text: bubbleText(e), e, dwell: Math.max(2.5, a.dwell || 0), kind: e.type === 'fail' ? 'fail' : a.kind };
}
// A free place to stand next to the boss (behind or beside, never inside their desk), clear of other people.
export function nearBoss(boss, me) {
  const f = boss.face, others = [...workers.values(), ...subs.values(), ...leaving, ...npcs].filter((o) => o !== me && o !== boss).map((o) => (o.spot ? [o.spot.x, o.spot.z] : [o.pos.x, o.pos.y]));
  for (const r of [0.95, 1.4, 1.9]) for (const da of [Math.PI, Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 4, -(3 * Math.PI) / 4, Math.PI / 4, -Math.PI / 4, 0]) {
    const a = f + da, x = boss.pos.x + Math.sin(a) * r, z = boss.pos.y + Math.cos(a) * r;
    if (!inside(x, z) || (fp.grid && blocked(x, z, 0.28))) continue;
    if (others.every(([ox, oz]) => Math.hypot(ox - x, oz - z) >= 0.85)) return { x, z, face: Math.atan2(boss.pos.x - x, boss.pos.y - z), node: nearestNode(new V2(x, z)) };
  }
  return allocate('meeting', me);
}
// Workers walking out of the office: no longer in workers/subs, but still animated until they reach the door.
export const leaving = new Set();
export const leavingIds = new Set();
export function dropSub(agentId, report = true) {
  const w = subs.get(agentId); if (!w) return;
  subs.delete(agentId); leaving.add(w);
  const boss = w.parent;
  if (!report || reduceMotion || !boss || workers.get(boss.id) !== boss || boss.leaving || replay.on) { w.leave(); return; }
  const desc = w.desc || '';
  w.want = null; w.hush();
  w.goTo(nearBoss(boss, w), () => {
    w.faceTarget = Math.atan2(boss.pos.x - w.pos.x, boss.pos.y - w.pos.y); w.anim = 'read';   // holds out the report
    w.say('substop', tr('people.subReport', { what: desc ? short(desc, 44) : tr('people.subReportDone') }));
    const prev = boss.lastSay, text = tr('people.bossThanks');
    boss.say('substop', text);
    setTimeout(() => { if (boss.lastSay?.text === text && prev) boss.say(prev.type, prev.text, prev.kind); }, 2200);
    setTimeout(() => w.leave(), 1800);
  });
}

export function setup() {
  AGENT_SVG = {
    claude: `<path fill="#D97757" d="${CLAUDE_MARK}"/>`,
    gemini: '<defs><linearGradient id="gm-g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#4285F4"/><stop offset=".55" stop-color="#9B72CB"/><stop offset="1" stop-color="#D96570"/></linearGradient></defs><path fill="url(#gm-g)" d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"/>',
    codex: '<path fill="#FFFFFF" d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>',
  };
  /* floating "z" for napping chibis */
  zTex = canvasTex(64, 64, (g) => { g.font = '900 46px "Baloo 2", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 7; g.strokeStyle = '#1F2A12'; g.strokeText('z', 32, 34); g.fillStyle = '#FFFFFF'; g.fillText('z', 32, 34); });
  state.sim = 0;
  Worker = class Worker {
    constructor(cfg, opt = {}) {
      this.cfg = cfg; this.sub = !!opt.sub; this.parent = opt.parent || null; this.id = opt.id;
      this.scale = opt.scale || 1;
      const { root, P } = makeChibi({ ...cfg, look: state.LOOK }, this.scale);
      this.root = root; this.P = P;
      if (SEASON === 'noel') wearHat(P);
      root.traverse((o) => { o.userData.worker = this; });
      scene.add(root);
      this.pos = new V2(); this.face = 0; this.faceTarget = 0;
      this.phase = 'idle'; this.anim = 'idle'; this.pose = 'stand';
      this.path = []; this.onArrive = null; this.spot = null; this.station = null;
      this.want = null; this.dwellUntil = 0; this.restAt = Infinity; this.leaving = false; this.lastSay = null;
      this.seed = rand(0, 10); this.blinkAt = rand(1, 4);
      this.tagEl = el('div', 'tag' + (this.sub ? ' tag--sub' : ''));
      this.tagDot = el('i'); this.tagDot.style.background = cfg.shirt;
      this.tagText = document.createTextNode(cfg.name);
      this.tagEl.append(this.tagDot, this.tagText);
      this.tagObj = new CSS2DObject(this.tagEl); this.tagObj.position.set(0, 2.0, 0); root.add(this.tagObj);
      this.zT = rand(0, 1.5);
      const bw = el('div', 'bubble-wrap'); this.bubbleEl = el('div', 'bubble'); bw.append(this.bubbleEl);
      this.bubbleObj = new CSS2DObject(bw); this.bubbleObj.position.set(0, 2.0, 0); this.bubbleObj.visible = false; root.add(this.bubbleObj);
    }
    setName(n) { if (this.tagText.data !== n) this.tagText.data = n; }
    // the height they stand at: the office floor, or down on the street (the pavement, or the road on a crossing)
    gy() { return this.street ? this.ground : 0; }
    // which account the session runs under, when this Mac has more than one (a second login's folder name)
    setAcct(name) {
      if (this.acct === (name || '')) return; this.acct = name || '';
      if (!this.acctEl) { this.acctEl = el('span', 'tag-acct'); this.tagEl.insertBefore(this.acctEl, this.tagText.nextSibling); }
      this.acctEl.hidden = !this.acct; this.acctEl.textContent = this.acct;
    }
    setTeam(n) {
      if (this.team === n) return; this.team = n;
      if (!this.teamEl) { this.teamEl = el('span', 'tag-team'); this.tagEl.append(this.teamEl); }
      this.teamEl.hidden = !n; this.teamEl.textContent = n ? tr('people.team', { n }) : '';
    }
    // stuck in a loop (server/loops.mjs): a red "kẹt" on the name tag, and said out loud once when it starts
    setStuck(st) {
      const on = !!st; if (this.stuck === on) return;
      const was = this.stuck; this.stuck = on;
      if (!this.stuckEl) { this.stuckEl = el('span', 'tag-stuck', tr('people.stuck')); this.tagEl.append(this.stuckEl); }
      this.stuckEl.hidden = !on; this.tagEl.classList.toggle('tag--stuck', on);
      if (on && was === false) this.say('fail', tr('people.stuckSay'), 'fail');
    }
    rebuild() {
      const { root, P } = makeChibi({ ...this.cfg, look: state.LOOK }, this.scale);
      if (SEASON === 'noel') wearHat(P);
      root.position.copy(this.root.position); root.rotation.copy(this.root.rotation);
      root.add(this.tagObj, this.bubbleObj);
      const parent = this.root.parent, was = this.root; if (parent) parent.remove(was);
      this.root = root; this.P = P;
      disposeRig(was);   // (its name tag and bubble moved over above; the rest goes back to the GPU)
      root.traverse((o) => { o.userData.worker = this; });
      if (parent) parent.add(root);
      if (this.dressed) wearOuter(P, true, this.cfg);
      if (this.lanyard) wearLanyard(P, true, this.lanyard);
    }
    // a card on a lanyard round the neck (o: { color, tex }; null: none)
    wearCard(o) { this.lanyard = o || null; wearLanyard(this.P, !!o, o || {}); }
    // coat and backpack on (arriving, going home) or off (at the desk)
    dress(on) { this.dressed = on; wearOuter(this.P, on, this.cfg); }
    // at the desk on arrival: hang the coat on the chair, put the bag down
    unpack(d) {
      if (d < 0 || d == null) { this.dress(false); return; }
      this.anim = 'tidy'; this.hush(); this.afterAt = state.sim + (reduceMotion ? 0.2 : 1.0);
      this.after = () => { this.dress(false); deskKit[d] = this; this.anim = 'type'; };
    }
    say(type, text, kind = '') {
      this.lastSay = { type, text, kind };
      if (kind !== 'rest') this.pokeHushAt = 0;
      const key = `${type}|${text}|${kind}`;
      if (this.sayKey !== key) {
        this.sayKey = key;
        const ic = el('span', 'b-ico'); ic.append(icon(TYPE_ICON[type] || 'sparkle'));
        this.bubbleEl.replaceChildren(ic, el('span', 'b-txt', short(text, this.sub ? 60 : 80)));
        this.bubbleEl.className = 'bubble' + (kind ? ' bubble--' + kind : '') + (this.sub ? ' bubble--sub' : '');
      }
      this.bubbleObj.visible = true;
    }
    hush() { this.bubbleObj.visible = false; }
    homeSpot() { const d = sessions.get(this.id)?.desk ?? -1; return d >= 0 ? DESK_SPOTS[d] : allocate('meeting', this); }
    goTo(spot, cb) {
      if (this.mealBox) hideMeal(this);
      if (this.queued && !COFFEE_Q.includes(spot)) leaveCoffee(this);
      const prev = this.spot;
      const atPrev = prev && Math.hypot(this.pos.x - prev.x, this.pos.y - prev.z) < 0.1;
      if (prev && prev !== spot && prev.by === this) prev.by = null;
      this.spot = spot;
      if ('by' in spot) spot.by = this;
      const target = new V2(spot.x, spot.z);
      if (prev === spot && atPrev) { this.pose = spot.sit ? 'sit' : 'stand'; cb && cb(); return; }
      // spots from wayTo / standBy (navigation.js) come with their way in (via): out of one the same way
      const V = ([x, z]) => new V2(x, z), N = (k) => new V2(NODES[k][0], NODES[k][1]), out = atPrev && prev.via ? prev.via.map(V).reverse() : [];
      if (spot.direct) this.path = [...spot.via.map(V), target];   // worked out from where they are
      else if (atPrev && prev.direct) {                             // back from it: to where they came from, then on
        const o = prev.origin;
        this.path = o === spot || !o ? [...out, target] : [...out, new V2(o.x, o.z), ...route(o.node, spot.node).map(N), target];
      } else if (atPrev && prev.node === spot.node && !prev.via && !spot.via) this.path = [target];
      else this.path = [...out, ...route(atPrev ? prev.node : nearestNode(this.pos), spot.node).map(N), ...(spot.via || []).map(V), target];
      this.pose = 'stand'; this.phase = 'walk'; this.onArrive = cb;
    }
    push(a) { this.want = a; }
    apply(a) {
      this.anim = a.anim; this.phase = 'idle';
      this.say(a.type || 'other', a.text, a.kind || ''); if (a.e) this.lastSay.e = a.e;
      this.dwellUntil = state.sim + (a.dwell ?? 1.4);
      this.restAt = a.rest ? state.sim + a.rest : Infinity;
      if (a.after) a.after();
    }
    tick() {
      if (this.leaving || this.phase === 'walk' || this.after || this.liftWait || this.liftRide || this.homeBound) return;
      if (this.away) {
        const s = sessions.get(this.id), d = officeNow(), m = (d.getHours() - 8) * 60 + d.getMinutes();
        // (offDay: gone home for the day from the quán nhậu, people/nhau.js: back for work, or in the morning)
        if (this.want || (s && (s.status !== 'rest' || s.bg?.length)) || (m >= hash(this.id) % 40 && d.getHours() < 21 && this.offDay !== d.toDateString())) this.comeBack();
        return;
      }
      if (this.inStall || this.wcBusy) { this.wcTick(); return; }
      if (this.carry && !this.keepBox && this.anim !== 'coffee' && this.phase !== 'walk') this.carry = null;   // (the drink finished, or work; a box carried back in (people/farewell.js) is put down at the desk)
      if (this.queued && this.want) leaveCoffee(this);
      const s = sessions.get(this.id);
      if (this.anim === 'sleep' && !this.sub && (this.want || (s && (s.status !== 'rest' || s.bg?.length)))) { this.anim = 'wake'; this.wakeUntil = state.sim + (reduceMotion ? 0.3 : 1.6); this.hush(); return; }
      if (this.anim === 'wake') { if (state.sim < this.wakeUntil) return; this.anim = s?.status === 'work' && !this.want ? ANIM_AT[this.station] || 'type' : 'idle'; }
      if (this.want && (this.want.priority || state.sim >= this.dwellUntil)) {
        const a = this.want; this.want = null;
        if (!a.station || a.station === this.station) { this.apply(a); return; }
        let spot = a.station === 'desk' ? this.homeSpot() : allocate(a.station, this, true);
        if (!spot) { if (a.anim === ANIM_AT[a.station]) a.anim = ANIM_AT.desk; a.station = 'desk'; spot = this.homeSpot(); }   // (that room is full: from their own desk)
        this.goTo(spot, () => { this.station = a.station; this.apply(a); });
        a.go?.(this);   // (on the way: something in hand, say; life/post.js)
        return;
      }
      if (this.sub || !s) return;
      if (this.queued) return;
      if (this.onBreak) return;   // out of Claude (life/quota.js): on a break until the limit resets
      if (this.dailyLife(s) || this.nightOut(s)) return;
      if (this.anim === 'hand' && s.status !== 'wait') { this.anim = ANIM_AT[this.station] || 'idle'; if (this.lastSay) this.say(this.lastSay.type, this.lastSay.text); }
      if (s.status === 'rest' && this.anim !== 'sleep' && state.sim > this.restAt) this.goHomeAndRest();
      if (s.status === 'rest' && this.restAt === Infinity && this.anim !== 'sleep' && this.anim !== 'coffee' && state.sim > this.dwellUntil + 20) this.goHomeAndRest();
    }
    // lunch and the afternoon coffee: from a nap, once a day each, at a slightly different minute for everyone
    dailyLife(s) {
      if (!PRO || s.status !== 'rest' || this.want || this.anim !== 'sleep' || this.phase === 'walk' || replay.on) return false;
      if (state.sim < (this.lifeAt || 0)) return false;
      this.lifeAt = state.sim + 4;
      const d = officeNow(), m = d.getHours() * 60 + d.getMinutes(), day = d.toDateString(), off = hash(this.id) % 18;
      const home = this.lunchDay !== day && lunchHooks.home?.(this, d, m);   // lunch from home: warmed at the microwave (people/comnha.js)
      if (home) return home.due && home.join();
      const order = state.lunchOrder;   // the team's lunch on its way (outings.js): wait for it, up to 12:15
      if (m >= 690 + off && m < 780 && this.lunchDay !== day && !(order?.day === day && !order.here && m < 735)) {
        this.lunchDay = day; this.meal = true;
        const text = tr('people.lunch');
        this.want = { station: 'dining', anim: 'eat', type: 'idle', text, dwell: 3, rest: rand(900, 1500), after: () => showMeal(this) };
        setTimeout(() => { if (this.lastSay?.text === text) this.hush(); }, 7000);
        return true;
      }
      if (m >= 900 + off && m < 945 && this.coffeeDay !== day) { this.coffeeDay = day; return joinCoffee(this); }
      return false;
    }
    // clicked while napping: still under the blanket, a lazy wave and a sleepy line (what it finished, how long it has
    // been resting); a different line each click
    poke() {
      const s = sessions.get(this.id); if (!s) return;
      const done = state.streamer ? '' : short(s.lastPrompt || '', 34), ago = fmtAgo(Math.max(60, (nowMs() - (s.doneAt || s.lastAt || nowMs())) / 1000));
      const P = (key, vars) => tr(`people.poke.${key}`, vars);
      const lines = [
        done ? P('doneNamed', { done }) : P('done'),
        P('resting', { ago }),
        P('boss'),
        P('charging'),
        done ? P('wrappedNamed', { done }) : P('wrapped'),
      ];
      this.pokeN = ((this.pokeN ?? randInt(0, lines.length - 1)) + 1) % lines.length;
      this.say('idle', lines[this.pokeN], 'rest');
      this.waveUntil = state.sim + (reduceMotion ? 0 : 1.3); this.pokeHushAt = state.sim + 4.5;
      sfx.play('pop');
    }
    /* A small errand you set off (a lamp switched off, a page printed, a coffee made): say so, walk to the spot, do the
       thing there (job.at, which may return a line), walk back and carry on as before. Without a spot it happens where
       they are (lifting the cat off the keyboard). Their real work waits until they are back, a few seconds. Asked again
       on the way back, they turn round. */
    errand(job) {
      const b = this.chore?.b || { spot: this.spot, station: this.station, anim: this.anim, say: this.lastSay, shown: this.bubbleObj.visible };
      const e = this.chore = { ...job, b, said: new Set(), stage: 'go' };
      const line = (text) => { if (text) { e.said.add(text); this.say(job.type || 'idle', text); } };
      const look = () => { if (job.look && this.pose !== 'sit') this.faceTarget = faceTo(this.pos.x, this.pos.y, job.look[0], job.look[1]); };
      this.station = 'errand'; this.waveUntil = 0; this.pokeHushAt = 0;
      line(job.line); look();
      this.anim = 'idle';
      const there = () => {
        if (this.chore !== e) return;
        look(); this.anim = job.anim || 'tidy'; job.arrived?.(this);
        // (e.until: a gathering keeps everyone until it ends, and may move that time)
        const finish = () => {
          if (e.until && state.sim < e.until) { this.afterAt = e.until; this.after = finish; return; }
          e.stage = 'done'; line(job.at?.(this)); this.anim = job.anim2 || 'idle'; this.afterAt = state.sim + (reduceMotion ? 0.3 : job.linger ?? 0.9); this.after = () => this.errandBack();
        };
        this.afterAt = state.sim + (reduceMotion ? 0.3 : job.hold ?? 0.8); this.after = finish;
      };
      this.afterAt = state.sim + (reduceMotion ? 0.2 : job.wait ?? 1.0);
      this.after = () => (job.spot ? this.goTo(job.spot, there) : there());
      return e;
    }
    errandBack() {
      const e = this.chore; if (!e) return;
      const b = e.b, done = () => {
        if (this.chore !== e) return;
        this.chore = null; this.station = b.station;
        const s = sessions.get(this.id);
        this.anim = s?.status === 'wait' ? 'hand' : b.anim === 'hand' ? ANIM_AT[b.station] || 'idle' : b.anim === 'sleep' || b.anim === 'wake' ? 'idle' : b.anim;
        if (e.said.has(this.lastSay?.text)) { if (b.say && b.shown) this.say(b.say.type, b.say.text, b.say.kind); else this.hush(); }
        e.done?.(this);
      };
      e.stage = 'back';
      if (!e.spot) { done(); return; }
      // their seat, unless someone sat down in it meanwhile
      const home = b.spot && b.spot.by && b.spot.by !== this ? (b.station === 'desk' ? this.homeSpot() : allocate(b.station, this, true) || this.homeSpot()) : b.spot || this.homeSpot();
      this.goTo(home, done);
    }
    /* First person, E next to someone asleep: they stir, stretch, sit up to see who it is, say something, and doze off
       again. Woken again within two minutes they get crosser; the fourth time they just pretend not to hear. */
    rouse() {
      const s = sessions.get(this.id);
      if (!s || this.sub || this.anim !== 'sleep' || this.phase === 'walk' || this.chore || this.after) return false;
      this.rousedN = state.sim - (this.rousedAt ?? -1e9) < 120 ? (this.rousedN || 0) + 1 : 1; this.rousedAt = state.sim;
      const R = (key, vars) => tr(`people.rouse.${key}`, vars);
      sfx.play('pop');
      if (this.rousedN >= 4) { this.say('idle', R('ignore'), 'rest'); this.pokeHushAt = state.sim + 3.5; return true; }
      const done = state.streamer ? '' : short(s.lastPrompt || '', 34), ago = fmtAgo(Math.max(60, (nowMs() - (s.doneAt || s.lastAt || nowMs())) / 1000));
      const first = [R('hi'), done ? tr('people.poke.doneNamed', { done }) : tr('people.poke.done'), tr('people.poke.resting', { ago }), tr('people.poke.boss'), tr('people.poke.charging')];
      const text = this.rousedN === 1 ? first[randInt(0, first.length - 1)] : R(this.rousedN === 2 ? 'again' : 'last');
      this.errand({ type: 'idle', anim: 'wake', wait: 0, hold: 1.6, anim2: 'idle', linger: 3.2, line: R('stir'),
        at: () => { this.waveUntil = state.sim + 1.3; return text; },
        done: () => {
          if (s.status !== 'rest' || this.want || s.bg?.length) return;   // work came in meanwhile: they are up for it
          this.anim = 'sleep'; this.restAt = Infinity; this.say('idle', R('back'), 'rest'); this.pokeHushAt = state.sim + 2.6;
        } });
      return true;
    }
    // pro plan: now and then, before the nap, a trip to the restroom (into a free stall, door shut, then wash hands)
    visitWc() {
      const stall = STATIONS.wc.find((x) => !x.by); if (!stall) return false;
      this.wcAt = state.sim; this.wcBusy = true; this.hush(); this.restAt = Infinity; this.station = 'wc';
      this.goTo(stall, () => { this.anim = 'idle'; this.inStall = stall; this.wcUntil = state.sim + rand(4, 7); });
      return true;
    }
    wcTick() {
      if (this.inStall) {
        if (state.sim < this.wcUntil && !this.want?.priority) return;
        this.inStall = null; this.anim = 'idle';
        this.goTo(allocate('sink', this), () => { this.anim = 'tidy'; this.station = 'sink'; this.sinkUntil = state.sim + 1.8; });
        return;
      }
      if (this.station === 'sink' && state.sim < this.sinkUntil && !this.want?.priority) return;
      this.wcBusy = false; this.station = 'wc-done';
      if (!this.want) this.goHomeAndRest();
    }
    goHomeAndRest() {
      if (PRO && !this.sub && !this.want && state.sim - (this.wcAt ?? -1e9) > 900 && Math.random() < 0.4 && this.visitWc()) return;
      const nap = () => {
        this.station = 'desk'; this.restAt = Infinity;
        if (this.mealBox) hideMeal(this);   // (lunch eaten at the desk: the box put away)
        const bg = sessions.get(this.id)?.bg;
        if (bg?.length) { this.anim = 'think'; this.say('bash', tr('people.bgWait', { desc: bg[0].desc })); return; }
        this.anim = 'sleep'; this.hush();
      };
      if (this.station === 'desk') nap(); else this.goTo(this.homeSpot(), nap);
    }
    leave(onGone) {
      if (this.leaving) return;
      this.leaving = true; this.hush(); this.want = null; this.after = null; this.chore = null;
      const gone = () => { this.remove(); onGone && onGone(); };
      if (this.outing) this.outing.drop(this);
      if (this.liftHold || this.away || this.street || this.offstage || this.stairs) { this.liftHold = false; gone(); return; }   // still in the lift that brought them (or on the stairs), gone home, or out (they don't come back)
      this.walkOut(gone);
    }
    // packing up at the desk (coat on, bag on the back), then out: the lift (press the button, wait, step in, ride
    // down; the stairs while it is serviced) or the door
    walkOut(gone) {
      const down = () => streetHooks.home?.(this, gone) || gone();   // (and with the city outside, out into the street)
      const out = () => viaClock('out', this, () => this.goTo(DOOR_IN, () => {
        if (!lift) { this.goTo(DOOR_OUT, down); return; }
        liftDown(this, down);
      }));
      const d = deskKit.indexOf(this);
      if (d < 0) { out(); return; }
      const pack = () => {   // back at the desk: coat on, bag on the back
        this.anim = 'tidy'; this.afterAt = state.sim + (reduceMotion ? 0.2 : 1.1);
        this.after = () => { deskKit[d] = null; this.dress(true); this.anim = 'idle'; out(); };
      };
      const spot = DESK_SPOTS[d];
      if (Math.hypot(this.pos.x - spot.x, this.pos.y - spot.z) < 0.15 && this.phase !== 'walk') pack(); else this.goTo(spot, pack);
    }
    /* Late at night, after a long rest: home by the lift, the desk left empty. Back as soon as there is work, or in the
       morning (from 8:00, a few minutes apart). */
    lateRest(s) {   // from 21:00 (each at their own minute, up to 21:25) to 6:00, resting for half an hour or more
      if (this.sub || !s || s.status !== 'rest' || s.bg?.length || replay.on) return false;
      const d = officeNow(), h = d.getHours();
      return (h > 21 || h < 6 || (h === 21 && d.getMinutes() >= hash(this.id) % 25)) && nowMs() - (s.doneAt || s.lastAt || nowMs()) >= 30 * 60e3;
    }
    nightOut(s) {
      if (this.anim !== 'sleep' || this.want || this.chore || !this.lateRest(s)) return false;
      this.goHomeNow();
      return true;
    }
    goHomeNow() {
      this.homeBound = true; this.hush(); this.restAt = Infinity; this.station = 'out';
      this.walkOut(() => { this.homeBound = false; this.away = true; this.station = 'away'; this.hush(); if (this.spot?.by === this) this.spot.by = null; });
    }
    comeBack() {
      this.away = false; this.station = 'arriving';
      if (streetHooks.arrive?.(this)) return;   // (by the street, with the city outside)
      this.pos.set(DOOR_OUT.x, DOOR_OUT.z); this.face = this.faceTarget = Math.PI / 2; this.spot = DOOR_OUT;
      this.dress(true); liftArrive(this);
      const home = this.homeSpot(), d = sessions.get(this.id)?.desk ?? -1;
      viaClock('in', this, () => this.goTo(home, () => { this.station = 'desk'; this.anim = 'type'; if (home === DESK_SPOTS[d]) this.unpack(d); else this.dress(false); }));
    }
    remove() {
      { const k = deskKit.indexOf(this); if (k >= 0) deskKit[k] = null; }
      this.liftHold = false; this.liftWait = this.liftRide = null; this.stairs = null;
      if (this.queued) leaveCoffee(this);
      if (this.mealBox) hideMeal(this);
      if (this.spot && this.spot.by === this) this.spot.by = null;
      scene.remove(this.root);
      this.root.traverse((o) => { if (o.element) o.element.remove(); });
    }
    update(dt, t) {
      if (this.after && state.sim >= this.afterAt) { const f = this.after; this.after = null; f(); }
      if (this.pokeHushAt && state.sim > this.pokeHushAt) { this.pokeHushAt = 0; if (this.lastSay?.kind === 'rest') this.hush(); }
      this.held = false;
      if (this.phase === 'walk' && !this.liftHold) {
        const tgt = this.path[0];
        const dx = tgt.x - this.pos.x, dz = tgt.y - this.pos.y, d = Math.hypot(dx, dz), step = (this.hurry ? 4.2 : this.puffUntil > state.sim ? 1.7 : 2.7) * dt;   // (slower, out of breath: up the stairs, world/entrance.js)
        // out on the street (outings.js): a crossing waits at the kerb for the green man, and is walked at road level
        if (tgt.gate) { if (tgt.gate()) tgt.gate = null; else this.held = true; }
        if (tgt.y0 != null && !this.held) this.ground = tgt.y0;
        if (this.held) this.faceTarget = Math.atan2(dx, dz);
        else if (d <= step) {
          this.pos.copy(tgt); this.path.shift();
          if (!this.path.length) {
            this.phase = 'idle';
            if (this.spot) { this.faceTarget = this.spot.face; this.pose = this.spot.sit ? 'sit' : 'stand'; }
            const cb = this.onArrive; this.onArrive = null; cb && cb();
          }
        } else { this.pos.x += (dx / d) * step; this.pos.y += (dz / d) * step; this.faceTarget = Math.atan2(dx, dz); }
      }
      if (!this.chore) this.tick();
      this.animate(dt, t);
    }
    animate(dt, t) {
      const walking = this.phase === 'walk' && !this.held, stomping = this.anim === 'stomp' && !walking, sit = this.pose === 'sit' && !walking && !stomping;
      this.stompShift = (this.stompShift || 0) + ((stomping && this.station === 'desk' ? 0.36 : 0) - (this.stompShift || 0)) * Math.min(1, dt * 6);
      const idleish = !walking && !['type', 'console', 'read', 'board', 'globe', 'tidy', 'sleep', 'wake'].includes(this.anim);
      this.lookT = (this.lookT ?? 0) - dt;
      if (this.lookT < 0) { this.lookT = rand(1.8, 4.5); this.lookY = rand(-0.55, 0.55); }
      this.blinkAt -= dt; if (this.blinkAt < 0) this.blinkAt = rand(2.5, 5);
      const napping = this.anim === 'sleep' && !walking;
      if (napping && (this.zT -= dt) < 0) { this.zT = 1.4; puffZ(this); }
      const pose = chibiPose(this.P, walking ? 'walk' : this.anim, t + this.seed,
        { sit, scale: this.scale, look: idleish ? this.lookY : 0, wave: !walking && this.waveUntil > t, blink: this.blinkAt < 0.12, carry: this.carry, doze: this.doze });
      const y = applyChibiPose(this.P, pose, dt) * this.scale;
      this.root.position.set(this.pos.x + this.stompShift, y + this.gy(), this.pos.y);
      const hid = (!!this.inStall && !walking) || !!this.away || !!this.offstage || !!this.stairs;   // behind a shut stall door, gone home, inside a shop, the lift or the stairs
      if (this.root.visible === hid) { this.root.visible = !hid; this.root.matrixWorldAutoUpdate = !hid; if (hid) { this.tagObj.visible = false; this.bubbleObj.visible = false; } }   // (out of sight: no matrices to keep up)
      this.face += wrapAngle(this.faceTarget - this.face) * Math.min(1, dt * 10);
      this.root.rotation.y = this.face; this.root.rotation.z = pose.tilt;
    }
  };
}
