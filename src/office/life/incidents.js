// Incidents: repeated failures turn the office red.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { $, nowMs, reduceMotion, short } from '../core/env.js';
import { ACT, bubbleText } from '../ui/event-text.js';
import { scene } from '../scene/renderer.js';
import { printPage } from '../world/props/printer.js';
import { STATIONS } from '../people/navigation.js';
import { dn, dropSub, sessions, spawnSub, subAct, subs, workers } from '../people/workers.js';
import { director } from '../people/director.js';
import { launchRocket } from '../world/room-update.js';
import { addFeed, toast } from '../ui/activity.js';
import { scheduleLog } from '../ui/session-drawer.js';
import { notifyWait } from '../ui/topbar.js';
import { onTurnDone, unseenDone } from './your-turn.js';
import { sfx } from '../audio/sfx.js';
import { applaud } from '../people/gatherings.js';
import { t as tr } from '../../i18n/index.js';
import { shredAction } from '../world/props/shredder.js';
import { onTest } from './tests.js';
import { onCommit, onPush, postAction } from './post.js';
import { chatEvent } from '../ui/group-chat.js';

/* ---------- incidents: three failures in five minutes turn the office red for a while ---------- */
export const fails = [];
const alarm = new THREE.PointLight('#FF2A2A', 0, 18, 1.4);
function startIncident(s) {
  state.incidentUntil = state.sim + 25; $('stage-wrap').classList.add('is-incident'); sfx.play('siren');
  const b = $('incident'); b.textContent = `${tr('incident.banner')}${s ? ` · ${dn(s)}` : ''}`; b.hidden = false;
  for (const w of workers.values()) if (sessions.get(w.id)?.status === 'work') w.push({ ...ACT.fail, type: 'fail', text: tr('incident.bubble') });
}
export function updateIncident(t) {
  const on = state.sim < state.incidentUntil;
  alarm.intensity = on ? (0.5 + 0.5 * Math.sin(t * 9)) * 22 : 0;
  if (!on && !$('incident').hidden) { $('incident').hidden = true; $('stage-wrap').classList.remove('is-incident'); }
}
export function onEvent(e) {
  chatEvent(e);   // (the group chat: ui/group-chat.js)
  if (e.type === 'stop' || e.type === 'commit') printPage();   // every finished turn and every commit prints a page
  if (e.type === 'test' || e.type === 'testok' || e.type === 'testfail') onTest(e);   // the test board's lamps (tests.js)
  if (e.type === 'commit') onCommit(e); if (e.type === 'push') onPush(e);   // a letter in the post box; the postman (post.js)
  if (e.type === 'push' || e.type === 'deploy') applaud(e.sess);
  if (e.type === 'push') { launchRocket(); sfx.play('deploy'); toast(tr('incident.pushed', { name: dn(sessions.get(e.sess)) || e.repo, branch: state.streamer ? 'git' : e.branch || 'git' })); }
  if (e.type === 'cired') { sfx.play('siren'); toast(tr('incident.ciRed', { label: e.label || tr('incident.ciRedDefault'), repo: e.repo }), 6500); }
  if (e.type === 'cigreen') toast(tr('incident.ciGreen', { label: e.label || '', repo: e.repo }));
  { const s0 = sessions.get(e.sess);
    if (e.type === 'stop' && s0) onTurnDone(s0);
    if ((e.type === 'wait' || e.type === 'ask') && !e.agent) sfx.play('perm');
    if ((e.type === 'edit' || e.type === 'write') && !e.agent) sfx.play('key');
    if (e.type === 'deploy') sfx.play('deploy');
    if (e.type === 'fail') { const now = nowMs(); fails.push(now); while (fails.length && now - fails[0] > 300e3) fails.shift(); if (fails.length >= 3 && state.sim >= state.incidentUntil) { fails.length = 0; startIncident(s0); } }
    if (state.selectedId === e.sess) unseenDone.delete(e.sess); }
  if (!e.quiet && e.type !== 'start') addFeed(e);
  const s = sessions.get(e.sess), w = workers.get(e.sess);
  if (state.selectedId === e.sess) scheduleLog();
  if (!w || !s) return;
  if (e.type === 'substart') { spawnSub(w, e.agent, e.label); return; }
  if (e.type === 'substop') { const sw = subs.get(e.agent); if (sw && e.desc) sw.desc = e.desc; dropSub(e.agent); return; }
  if (e.agent) {
    const sw = subs.get(e.agent) || spawnSub(w, e.agent, e.agentType || 'agent');
    if (e.desc) sw.desc = e.desc;
    sw.push(subAct(e));
    if (sw.phase === 'walk' || sw.station === (ACT[e.type]?.station || 'desk')) { sw.say(e.type, bubbleText(e), e.type === 'fail' ? 'fail' : ''); sw.lastSay.e = e; }
    return;
  }
  if (e.type === 'start' || e.type === 'end') return;
  let a = { ...(ACT[e.type] || ACT.other), type: ACT[e.type] ? e.type : 'other', text: bubbleText(e), e };
  if (e.type === 'fail') {   // a second failure within two minutes: frustration, a fist on the desk
    w.fails = (w.fails || []).filter((t) => state.sim - t < 120); w.fails.push(state.sim);
    if (w.fails.length >= 2 && !reduceMotion) { a = { ...a, anim: 'slam', text: tr('incident.againFail', { text: bubbleText(e) }), dwell: 2.2 }; w.slamUntil = state.sim + 2.2; sfx.play('thud'); }
  }
  if (e.type === 'prompt') a.after = () => { state.boardPulse = { id: e.sess, until: state.sim + 2.6 }; state.boardDirty = true; };
  if (director && e.type === 'prompt') director.deliver(e.sess, e.label || '');
  if (director && e.type === 'stop' && director.station === 'home' && STATIONS.director.some((x) => !x.by)) {   // pro plan: report to the director first, then the pantry
    const rest = a, done = s.lastPrompt || e.label || '';
    a = { station: 'director', anim: 'think', type: 'stop', text: !done ? tr('incident.reportNoTask') : state.streamer ? tr('incident.reportHidden') : tr('incident.report', { task: short(done, 40) }), e, dwell: 2.4,
      after: () => { if (!director.ack(w)) w.say('stop', tr('incident.reportLeft')); w.push(rest); } };
  }
  if (e.type === 'deploy') { launchRocket(); toast(tr('incident.deployed', { name: dn(s), label: e.label })); }
  if (e.type === 'wait' || e.type === 'ask') notifyWait(s, e);
  if (e.type === 'commit') a = postAction(w, a) || a;   // (the letter down to the post box, post.js)
  w.push(e.type === 'compact' ? shredAction(w, a) : a);   // (compaction: the stack to the shredder, shredder.js)
}

export function setup() {
  state.incidentUntil = 0;
   alarm.position.set(0, 3.6, 0);
   scene.add(alarm);
}
