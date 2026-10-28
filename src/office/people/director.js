// The director: brings each prompt to its desk, receives reports.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { PRO, rand, reduceMotion, short } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { mat } from '../scene/blocks.js';
import { DESKS, dLocal } from '../world/desks.js';
import { DESK_SPOTS, faceTo } from './navigation.js';
import { Worker, dn, nearBoss, npcs, sessions, workers } from './workers.js';
import { sfx } from '../audio/sfx.js';
import { t as tr } from '../../i18n/index.js';

/* ---------- the director (pro plan) ----------
   You, in the corner office. Each prompt you send, the director carries to that session's person, wherever they are,
   and hands it over; when a session finishes its turn, its person comes to the director's desk to report. */
const DIR_HOME = { x: -5.4, z: -6.75, face: 0, node: 'DRs', sit: true };
const paperGeo = new THREE.BoxGeometry(0.17, 0.012, 0.23);
let paperDocM;
export const flights = [];   // papers in the air, director -> person
let Director;
function flyPaper(from, to) {
  if (reduceMotion) return;
  const m = new THREE.Mesh(paperGeo, paperDocM); m.userData.dynamic = true; scene.add(m);
  from.paper.getWorldPosition(m.position);
  flights.push({ m, a: m.position.clone(), to, t: 0 });
}
// a task left on an empty desk: a sheet of paper until its person sits down there (or a minute passes)
const deskNotes = new Map();
function dropNote(d, sess) {
  if (d == null || d < 0) return;
  deskNotes.get(d)?.m.removeFromParent();
  const m = new THREE.Mesh(paperGeo, paperDocM); m.userData.dynamic = true;
  const [nx, nz] = dLocal(DESKS[d], -0.1, -0.12); m.position.set(nx, 0.785, nz); m.rotation.y = DESKS[d].ry + rand(-0.4, 0.4); scene.add(m);
  deskNotes.set(d, { m, sess, until: state.sim + 60 });
}
export function updateFlights(dt) {
  for (const [d, n] of deskNotes) {
    const w = workers.get(n.sess);
    if (state.sim > n.until || !w || (w.station === 'desk' && w.phase !== 'walk' && w.pose === 'sit')) { n.m.removeFromParent(); deskNotes.delete(d); }
  }
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i]; f.t = Math.min(1, f.t + dt / 0.55);
    const bx = f.to.pos.x, bz = f.to.pos.y, by = f.to.pose === 'sit' ? 0.95 : 1.15;
    f.m.position.set(f.a.x + (bx - f.a.x) * f.t, f.a.y + (by - f.a.y) * f.t + Math.sin(f.t * Math.PI) * 0.35, f.a.z + (bz - f.a.z) * f.t);
    f.m.rotation.y = f.t * 6;
    if (f.t >= 1) { scene.remove(f.m); flights.splice(i, 1); }
  }
}
export let director;

export function setup() {
  paperDocM = mat('#FBFBF7', { roughness: 0.9 });
  Director = class Director extends Worker {
    constructor() {
      super({ name: tr('people.director'), shirt: '#2B3A55', hair: '#3A3A40', style: 'plain', acc: 'glasses', outfit: 'suit', pants: '#262B35', shoes: '#1B1B1E' }, { id: '__director' });
      this.tagEl.classList.add('tag--boss'); this.tagDot.style.background = '#E2B04A';
      this.queue = []; this.job = null; this.given = 0; this.reports = 0; this.nextIdle = 0;
      this.pos.set(DIR_HOME.x, DIR_HOME.z); this.spot = DIR_HOME; this.pose = 'sit'; this.station = 'home'; this.anim = 'type';
      this.attachPaper();
    }
    attachPaper() { this.paper = new THREE.Mesh(paperGeo, paperDocM); this.paper.position.set(0, -0.06, 0.07); this.paper.rotation.x = 0.3; this.paper.visible = !!this.job; this.P.armR.hand.add(this.paper); }
    rebuild() { super.rebuild(); this.attachPaper(); }
    deliver(sess, text) {
      const q = this.queue.find((j) => j.sess === sess);
      if (q) q.text = text; else if (this.job?.sess === sess && this.job.stage === 'going') this.job.text = text; else this.queue.push({ sess, text, at: state.sim });
    }
    // where to take it: beside the person's desk, in the aisle behind the chair; someone without a desk, where they are
    target(j) {
      const d = sessions.get(j.sess)?.desk ?? -1;
      if (d >= 0) { const ds = DESK_SPOTS[d], x = ds.x - 0.55, z = ds.z - 0.8; return { x, z, face: faceTo(x, z, ds.x, ds.z), node: ds.node, desk: d }; }
      const w = workers.get(j.sess), sp = nearBoss(w, this); sp.face = Math.atan2(w.pos.x - sp.x, w.pos.y - sp.z); return sp;
    }
    start(j) {
      const w = workers.get(j.sess);
      if (!w || w.leaving || state.sim - j.at > 90) return;
      this.job = { ...j, stage: 'going' }; this.paper.visible = true; this.hush(); this.station = 'out';
      this.job.to = this.target(j);
      this.goTo(this.job.to, () => this.arrive());
    }
    arrive() {
      const j = this.job; if (!j) return;
      const w = workers.get(j.sess);
      if (!w || w.leaving) { this.job = null; this.paper.visible = false; return; }
      const near = w.phase !== 'walk' && !w.wcBusy && Math.hypot(w.pos.x - this.pos.x, w.pos.y - this.pos.y) < 1.7;
      j.stage = 'hand'; j.w = w; j.drop = !near && j.to.desk != null;
      const who = short(dn(sessions.get(j.sess)), 22), what = state.streamer ? tr('people.newTask') : short(j.text, 44);
      if (near) {   // hand it over
        this.faceTarget = Math.atan2(w.pos.x - this.pos.x, w.pos.y - this.pos.y); this.anim = 'globe'; j.until = state.sim + (reduceMotion ? 1.2 : 1.9);
        this.say('prompt', tr('people.handOver', { what }));
        if (w.pose !== 'sit') w.faceTarget = Math.atan2(this.pos.x - w.pos.x, this.pos.y - w.pos.y);
      } else {      // not at the desk: leave it there
        this.faceTarget = j.to.face; this.anim = 'tidy'; j.until = state.sim + 1.3;
        this.say('prompt', j.drop ? tr('people.leaveOnDesk', { who }) : tr('people.handOver', { what }));
      }
      sfx.play('pop');
    }
    update(dt, t) { super.update(dt, t); }
    tick() {
      if (this.phase === 'walk') return;
      const j = this.job;
      if (j?.stage === 'hand') {
        if (state.sim < j.until) return;
        if (j.drop) dropNote(j.to.desk, j.sess); else flyPaper(this, j.w);
        this.given++; this.paper.visible = false; this.job = null; this.hush(); this.anim = 'idle';
        return;
      }
      if (!j && this.queue.length && state.sim >= (this.holdUntil || 0)) { this.start(this.queue.shift()); return; }
      if (!j && this.station !== 'home' && this.station !== 'going-home') { this.goHome(); return; }
      if (this.station === 'home' && state.sim > this.nextIdle) {   // at the desk: works, reads a report, thinks
        const busy = [...sessions.values()].some((s) => s.status === 'work');
        this.anim = busy ? (Math.random() < 0.65 ? 'type' : 'think') : (Math.random() < 0.5 ? 'read' : 'type');
        this.nextIdle = state.sim + rand(6, 11);
      }
    }
    goHome() { this.station = 'going-home'; this.goTo(DIR_HOME, () => { this.station = 'home'; this.anim = 'type'; this.nextIdle = state.sim + rand(4, 8); }); }
    // a person reports a finished turn at the desk
    ack() {
      this.reports++;
      if (this.station !== 'home' || this.phase === 'walk') return false;
      this.anim = 'idle'; this.waveUntil = state.sim + 1.4; this.nextIdle = this.holdUntil = state.sim + 2.6;
      const text = tr('people.directorThanks'); this.say('substop', text);
      setTimeout(() => { if (this.lastSay?.text === text) this.hush(); }, 2400);
      return true;
    }
    reset() { for (const n of deskNotes.values()) n.m.removeFromParent(); deskNotes.clear(); this.queue = []; this.job = null; this.chore = null; this.after = null; this.paper.visible = false; this.hush(); this.path = []; this.phase = 'idle'; this.pos.set(DIR_HOME.x, DIR_HOME.z); this.spot = DIR_HOME; this.face = this.faceTarget = 0; this.pose = 'sit'; this.station = 'home'; this.anim = 'type'; }
  };
  director = PRO ? new Director() : null;
  if (director) npcs.push(director);
}
