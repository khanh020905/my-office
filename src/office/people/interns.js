// Interns made permanent (thực tập sinh lên chính thức). A project new to the office (server/tenure.mjs: not known to
// it, nor to Claude Code, before interns came in) is an intern: its people wear the orange "Thực tập sinh" lanyard and
// a small "Thực tập sinh" plate stands on their desk. Once it has finished 20 turns on two different days or more, HR
// holds the ceremony in office hours: the intern goes to her desk, the "Hợp đồng lao động" laid out, signed, the red
// company stamp ("cộp!"), the director comes over to shake hands while the people nearby clap, back at the desk a name
// plate instead of the intern's, the lanyard off, and in the group chat "Chúc mừng … lên chính thức 🎉" with
// reactions (and someone asking for the milk tea it calls for). In the small office, without HR or a director: a cake
// at the meeting table. ?debug: __office.intern.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { PRO, STATIC, officeNow, reduceMotion, replay } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { canvasTex, fitText, put } from '../scene/blocks.js';
import { DESKS, dLocal } from '../world/desks.js';
import { dn, sessions, workers } from './workers.js';
import { director } from './director.js';
import { hrOnDuty } from './hr.js';
import { applaud, celebrate, gatheringNow } from './gatherings.js';
import { free, later } from './errands.js';
import { napOn } from '../life/nap.js';
import { TOKEN, projOf } from '../net/live.js';
import { setTenure, tenureNow } from './farewell.js';
import { chatLife } from '../ui/group-chat.js';
import { toast } from '../ui/activity.js';
import { sfx } from '../audio/sfx.js';
import { t as tr } from '../../i18n/index.js';

const P = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const DEMO = STATIC || P.has('demo');
const FONT = '"Be Vietnam Pro", system-ui, sans-serif';
const say = (w, key, vars, ms = 4500) => { const text = tr(key, vars); w.say('idle', text); setTimeout(() => { if (w.lastSay?.text === text) w.hush(); }, ms); };
let C = null, last = null, checkAt = 0;
const done = new Set();   // made permanent from this page (until the server's word comes back)

/* ---------- the lanyard and the plates ---------- */
let cardTex = null;
const internCard = () => ({ color: '#F28C28', tex: (cardTex ||= canvasTex(80, 104, (g, w, h) => {
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h); g.fillStyle = '#F28C28'; g.fillRect(0, 0, w, 30);
  g.fillStyle = '#FFFFFF'; g.font = `900 11px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const words = tr('people.intern.card').split(' '), half = Math.ceil(words.length / 2);
  if (words.length > 2) { g.fillText(words.slice(0, half).join(' '), w / 2, 9, w - 6); g.fillText(words.slice(half).join(' '), w / 2, 21, w - 6); } else g.fillText(words.join(' '), w / 2, 15, w - 6);
  g.fillStyle = '#E9DFD3'; g.beginPath(); g.arc(w / 2, 56, 15, 0, Math.PI * 2); g.fill(); g.fillRect(w / 2 - 22, 78, 44, 6); g.fillRect(w / 2 - 15, 89, 30, 5);
})) });
// a plate standing on the desk: the intern's (orange) or, once permanent, their name (dark wood, gold letters)
const plates = [];
function plate(i) {
  if (plates[i]) return plates[i];
  const tex = canvasTex(256, 80, () => {}), m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  const g = new THREE.Group(); g.userData.dynamic = true; g.visible = false; scene.add(g);
  for (const s of [-1, 1]) { const f = put(g, new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.106), m), 0, 0.06, s * 0.024); f.rotation.set(-s * 0.32, s < 0 ? Math.PI : 0, 0); }
  plates[i] = { g, tex, key: '' };
  return plates[i];
}
function drawPlate(p, kind, name) {
  const key = `${kind}|${name}`; if (p.key === key) return;
  p.key = key;
  const g = p.tex.image.getContext('2d'), w = p.tex.image.width, h = p.tex.image.height;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (kind === 'intern') {
    g.fillStyle = '#FFF3E6'; g.fillRect(0, 0, w, h); g.fillStyle = '#F28C28'; g.fillRect(0, 0, 12, h); g.fillRect(w - 12, 0, 12, h);
    g.fillStyle = '#C2410C'; g.font = `900 30px ${FONT}`; const t = tr('people.intern.plate'); fitText(g, t, w - 40); g.fillText(t, w / 2, h / 2 + 2, w - 40);
  } else {
    g.fillStyle = '#3A2A20'; g.fillRect(0, 0, w, h); g.strokeStyle = '#C9A227'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#F2D27A'; g.font = `800 28px ${FONT}`; fitText(g, name, w - 36); g.fillText(name, w / 2, 32, w - 36);
    g.fillStyle = '#E8DCC0'; g.font = `600 17px ${FONT}`; const t = tr('people.intern.official'); fitText(g, t, w - 36); g.fillText(t, w / 2, 58, w - 36);
  }
  p.tex.needsUpdate = true;
}
function placePlate(p, d) { const D = DESKS[d], [x, z] = dLocal(D, 0.38, -0.3); p.g.position.set(x, 0.782, z); p.g.rotation.y = D.ry; p.g.visible = true; }

/* ---------- who wears what, each second ---------- */
const listOf = () => tenureNow().projects;
function sync() {
  const L = listOf(), interns = new Set(), official = new Set();
  for (const p of L) { if (p.intern && !done.has(p.name)) interns.add(p.name); else if (p.official || done.has(p.name)) official.add(p.name); }
  const want = [];   // [desk, kind, name]
  const plated = new Set();
  for (const w of workers.values()) {
    if (w.sub) continue;
    const s = sessions.get(w.id), proj = projOf(s), intern = interns.has(proj) && !(C && C.w === w && C.stage === 'done');
    if (intern && w.lanyard?.color !== '#F28C28') w.wearCard(internCard());
    else if (!intern && w.lanyard?.color === '#F28C28') w.wearCard(null);
    if (s?.desk < 0 || s?.desk == null || w.away) continue;
    if (intern) want.push([s.desk, 'intern', '']);
    else if (official.has(proj) && !plated.has(proj)) { plated.add(proj); want.push([s.desk, 'name', C?.w === w ? C.name : dn(s)]); }
  }
  want.slice(0, 8).forEach(([d, kind, name], i) => { const p = plate(i); drawPlate(p, kind, name); placePlate(p, d); });
  for (let i = Math.min(want.length, 8); i < plates.length; i++) plates[i].g.visible = false;
}

/* ---------- the ceremony ---------- */
let contract = null, contractTex = null;
function drawContract(name, signed, stamped) {
  const g = contractTex.image.getContext('2d'), w = contractTex.image.width, h = contractTex.image.height;
  g.fillStyle = '#FDFCF8'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1E232B'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 13px ${FONT}`; g.fillText(tr('people.intern.nation'), w / 2, 16, w - 20);
  g.font = `900 22px ${FONT}`; const title = tr('people.intern.contract'); fitText(g, title, w - 24); g.fillText(title, w / 2, 46, w - 24);
  g.font = `600 13px ${FONT}`; g.fillText(name, w / 2, 70, w - 30);
  g.fillStyle = '#B9BEC6'; for (let k = 0; k < 7; k++) g.fillRect(24, 88 + k * 12, w - 48 - (k % 3) * 30, 4);
  if (signed) { g.strokeStyle = '#1D4ED8'; g.lineWidth = 2.5; g.beginPath(); for (let i = 0; i <= 16; i++) g.lineTo(w - 120 + i * 6, 196 + Math.sin(i * 1.3) * 8 - i * 0.6); g.stroke(); }
  if (stamped) { g.strokeStyle = 'rgba(205,30,30,.85)'; g.lineWidth = 4; g.beginPath(); g.arc(80, 196, 26, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(80, 196, 18, 0, Math.PI * 2); g.stroke(); g.fillStyle = 'rgba(205,30,30,.85)'; g.font = `900 14px ${FONT}`; g.fillText('★', 80, 197); }
  contractTex.needsUpdate = true;
}
// at the end of HR's desk, facing it (she turns her chair to them); the director comes to stand beside the intern
const VISIT = { x: 5.5, z: 8.22, node: 'R4', sit: false }, BOSS = { x: 6.28, z: 8.32, node: 'R4', sit: false };
function start(name, w) {
  const host = PRO ? hrOnDuty() : null, s = sessions.get(w.id), who = dn(s) || name;
  C = { name: who, project: name, w, stage: 'go' };
  if (!host) {   // the small office: the cake at the meeting table, the plate at the desk
    celebrate(tr('people.intern.party', { name: who }));
    later(reduceMotion ? 3 : 10, () => finish());
    return true;
  }
  const look = [5.45, 7.45];
  const e = w.errand({ type: 'idle', spot: { ...VISIT, face: Math.atan2(look[0] - VISIT.x, look[1] - VISIT.z) }, look, anim: 'idle', wait: 0.4, hold: 0.3, line: tr('people.intern.going'),
    arrived: () => {
      if (C?.w !== w) return;
      C.stage = 'sign'; contract.visible = true; drawContract(who, false, false);
      C.host = host; C.hostFace = host.faceTarget; host.faceTarget = Math.atan2(w.pos.x - host.pos.x, w.pos.y - host.pos.y);   // (she turns to them)
      say(host, 'people.intern.hrSign', { name: who });
      later(1.6, () => { if (C?.w !== w) return; w.anim = 'tidy'; say(w, 'people.intern.signing'); });
      later(4.6, () => { if (C?.w !== w) return; drawContract(who, true, false); w.anim = 'idle'; host.anim = 'tidy'; });
      later(6.2, () => { if (C?.w !== w) return; drawContract(who, true, true); sfx.play('thud'); say(host, 'people.intern.stamp'); host.anim = 'type'; C.stage = 'shake'; boss(w); });
      later(45, () => release(w));   // (whatever happens, back to the desk in the end)
    },
    at: () => null, done: () => { if (C?.w === w) finish(); } });
  e.until = Infinity; C.e = e;   // (they stay until the handshake is done: release())
  toast(tr('people.intern.toast', { name: who }), 6000);
  return true;
}
// done at HR's desk: back to their own
function release(w) { const e = C?.w === w && C.e; if (!e || e.until !== Infinity) return; e.until = state.sim + 1.2; if (w.after) w.afterAt = Math.min(w.afterAt, e.until); }
// the director, when free, walks over and shakes the new hand; the people nearby clap
function boss(w, tries = 0) {
  const d = PRO && director && free(director) ? director : null;
  if (!d) { if (tries < 10 && C?.w === w) later(2, () => boss(w, tries + 1)); else { applaud(w.id); later(3, () => release(w)); } return; }   // (busy: up to twenty seconds more, then the claps alone)
  d.errand({ type: 'idle', spot: { ...BOSS, face: Math.atan2(VISIT.x - BOSS.x, VISIT.z - BOSS.z) }, look: [VISIT.x, VISIT.z], anim: 'shake', wait: 0.3, hold: reduceMotion ? 1 : 3.4, linger: 0.6,
    line: tr('people.intern.bossComing'),
    arrived: () => {
      if (C?.w !== w) return;
      w.faceTarget = Math.atan2(BOSS.x - w.pos.x, BOSS.z - w.pos.y); w.anim = 'shake'; C.stage = 'shake'; C.shook = true;
      say(d, 'people.intern.bossSay'); later(1.4, () => C?.w === w && say(w, 'people.intern.thanks'));
      applaud(w.id);
    },
    at: () => { if (C?.w === w) { w.anim = 'idle'; release(w); } return null; } });
}
// back at the desk: the name plate, the lanyard off, the group chat, the server told
function finish() {
  if (!C || C.stage === 'done') return;
  const { w, project, name } = C;
  C.stage = 'done'; done.add(project); contract.visible = false;
  if (C.host && C.hostFace != null && !C.host.job) C.host.faceTarget = C.hostFace;   // (HR back to her screen)
  w.wearCard(null);
  chatLife('official', { id: w.id, name, every: 60e3 });
  if (!DEMO && state.isLocal) fetch(`/api/tenure${TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'official', name: project }) }).then((r) => r.body?.cancel()).catch(() => {});   // (unread, an answer stays in memory)
  const p = listOf().find((x) => x.name === project); if (p) { p.intern = false; p.ready = false; p.official = Date.now(); }
  sync();
  last = { name: project, who: name, stage: 'done', shook: !!C.shook };
  C = null;
}

/* ---------- each frame (a look every second) ---------- */
export function updateInterns() {
  if (state.sim < checkAt) return;
  checkAt = state.sim + 1;
  if (replay.on) return;
  sync();
  if (C) { if (!workers.has(C.w.id) || C.w.leaving) { contract.visible = false; C = null; } return; }
  const d = officeNow(), m = d.getHours() * 60 + d.getMinutes();
  if (m < 540 || m > 1020 || (m >= 690 && m < 810) || napOn || gatheringNow()) return;   // (office hours, not over lunch or the nap)
  for (const p of listOf()) {
    if (!p.ready || done.has(p.name)) continue;
    // one of its people who has a moment: resting, not out
    const w = [...workers.values()].find((x) => !x.sub && projOf(sessions.get(x.id)) === p.name && sessions.get(x.id)?.status === 'rest' && !sessions.get(x.id)?.bg?.length
      && (free(x) || (x.anim === 'sleep' && x.phase !== 'walk' && !x.chore && !x.after)) && !x.outing && !x.street && !x.micro && !x.mealBox);
    if (w && start(p.name, w)) return;
  }
}

/* ---------- for tests (?debug) ---------- */
const debug = {
  ready: (name) => { const L = tenureNow(); let p = L.projects.find((x) => x.name === name); if (!p) L.projects.push(p = { name }); Object.assign(p, { intern: true, ready: true, turns: 20, days: 2 }); return true; },
  state: () => ({ stage: C?.stage || null, name: C?.name || null, contract: !!contract?.visible, shook: !!C?.shook, last,
    interns: [...workers.values()].filter((w) => w.lanyard?.color === '#F28C28').map((w) => w.id), plates: plates.filter((p) => p.g.visible).map((p) => p.key) }),
};
if (P.has('debug')) setTimeout(function hook() { if (!window.__office) { setTimeout(hook, 200); return; } window.__office.intern = debug; }, 0);

export function setup() {
  // the contract laid on HR's desk, toward her (company floor)
  contractTex = canvasTex(256, 240, () => {});
  contract = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.28).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: contractTex, roughness: 0.9 }));
  contract.position.set(5.45, 0.781, 7.58); contract.rotation.y = Math.PI + 0.12; contract.visible = false; contract.userData.dynamic = true; scene.add(contract);
  // the online demo: one fictional project that is new here, so its lanyard can be seen
  if (DEMO) setTenure({ days: 30, projects: [{ name: 'data-pipeline', intern: true, turns: 7, days: 1, last: Date.now() }] });
}
