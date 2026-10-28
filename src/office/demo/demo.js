// Demo mode: fictional projects and a fictional Mac.
import { state } from '../core/state.js';
import { $, STATIC, rand, replay } from '../core/env.js';
import { CHAIR_IDLE, chairs } from '../world/desks.js';
import { sessions, subs, workers } from '../people/workers.js';
import { setTrophies } from '../life/trophies.js';
import { addFeed, queueFeed, queueUi, renderFeed } from '../ui/activity.js';
import { closeSession, drM } from '../ui/session-drawer.js';
import { limitWarned, liveWindows, renderLimits, renderMac } from '../ui/mac-drawer.js';
import { DEMO_TODOS, onTodos } from '../ui/whiteboard.js';
import { TOKEN, freeDesk, removeSession, setConn, upsertSession } from '../net/live.js';
import { onEvent } from '../life/incidents.js';
import { onPerm, perms, renderPerms, reportPresence } from '../ui/permissions.js';
import { t as tr } from '../../i18n/index.js';

export let DEMO;
// The fictional projects. Paths, search terms and commands are the same in every language; what people write (prompts,
// a command's description, what needs approval) comes from the demo dictionary, read when the demo starts.
function demoProjects() {
  const d = (k) => tr(`demo.tasks.${k}`);
  return [
    { name: 'shop-api', dir: '~/projects/shop-api', tasks: [
      { prompt: d('cart.prompt'), steps: [['read', 'src/routes/cart.ts'], ['grep', 'paginate'], ['edit', 'src/routes/cart.ts'], ['bash', d('cart.test')], ['edit', 'src/routes/cart.test.ts'], ['bash', d('cart.retest')]], wait: d('cart.wait') },
      { prompt: d('shipping.prompt'), steps: [['grep', 'shippingFee'], ['read', 'src/lib/shipping.ts'], ['edit', 'src/lib/shipping.ts'], ['bash', d('shipping.test')]], deploy: 'v2.4.1' } ] },
    { name: 'landing-page', dir: '~/projects/landing-page', tasks: [
      { prompt: d('hero.prompt'), steps: [['read', 'app/page.tsx'], ['read', 'components/Hero.tsx'], ['edit', 'components/Hero.tsx'], ['write', 'components/HeroArt.tsx'], ['bash', d('hero.build')], ['fetch', 'dribbble.com']], sub: ['general-purpose', d('hero.sub')] },
      { prompt: d('images.prompt'), steps: [['glob', 'public/**/*.png'], ['bash', d('images.webp')], ['edit', 'next.config.ts'], ['bash', d('images.lighthouse')]] } ] },
    { name: 'data-pipeline', dir: '~/projects/data-pipeline', tasks: [
      { prompt: d('orders.prompt'), steps: [['read', 'etl/orders.py'], ['edit', 'etl/orders.py'], ['bash', d('orders.pytest')], ['web', 'pandas drop_duplicates subset']], sub: ['Explore', d('orders.sub')] },
      { prompt: d('schedule.prompt'), steps: [['read', 'airflow/dags/daily.py'], ['edit', 'airflow/dags/daily.py'], ['bash', d('schedule.check')]], wait: d('schedule.wait') } ] },
    { name: 'mobile-app', dir: '~/projects/mobile-app', tasks: [
      { prompt: d('login.prompt'), steps: [['read', 'src/screens/Login.tsx'], ['web', 'expo auth session google'], ['edit', 'src/screens/Login.tsx'], ['bash', d('login.typecheck')]] },
      { prompt: d('keyboard.prompt'), steps: [['grep', 'KeyboardAvoidingView'], ['edit', 'src/components/Form.tsx'], ['bash', d('keyboard.uiTest')]] } ] },
    { name: 'docs-site', dir: '~/projects/docs-site', tasks: [
      { prompt: d('install.prompt'), steps: [['read', 'docs/intro.md'], ['write', 'docs/install.md'], ['bash', d('install.build')]], deploy: 'docs' } ] },
    { name: 'infra', dir: '~/projects/infra', tasks: [
      { prompt: d('staging.prompt'), steps: [['read', 'terraform/staging.tf'], ['edit', 'terraform/staging.tf'], ['bash', 'terraform plan']], wait: d('staging.wait') } ] },
  ];
}
let demoSeq = 0;
export const demoLog = new Map(), demoTimers = [];
function demoEmit(s, type, label = '', extra = {}) {
  const now = Date.now(), e = { id: ++demoSeq, ts: now, sess: s.id, name: s.name, type, label, ...extra };
  if (!extra.agent && !['wait', 'stop', 'substart', 'substop', 'deploy'].includes(type)) s.last = { type, label };
  s.lastAt = now;
  const k = { read: 'read', grep: 'read', glob: 'read', edit: 'edit', write: 'edit', bash: 'cmd', web: 'web', fetch: 'web' }[type];
  if (k && !extra.agent) s.counts[k] = (s.counts[k] || 0) + 1;
  if (s.usage && !extra.agent) { s.usage.ctx = Math.min(190000, s.usage.ctx + 1800 + Math.random() * 2600); s.usage.cost += 0.02 + Math.random() * 0.05; }
  if (type === 'prompt') state.stats.prompts = (state.stats.prompts || 0) + 1;
  if (type === 'read' || type === 'grep' || type === 'glob') state.stats.read = (state.stats.read || 0) + 1;
  if (type === 'edit' || type === 'write') state.stats.edit = (state.stats.edit || 0) + 1;
  if (type === 'bash') state.stats.cmd = (state.stats.cmd || 0) + 1;
  if (type === 'deploy') state.stats.deploy = (state.stats.deploy || 0) + 1;
  const log = demoLog.get(extra.agent || s.id) || []; demoLog.set(extra.agent || s.id, log);
  if (type === 'prompt') log.push({ role: 'user', text: label, ts: now });
  else if (type === 'stop') log.push({ role: 'claude', text: demoReply(demoSeq % REPLY_KEYS.length), ts: now });
  else if (!['wait', 'substart', 'substop'].includes(type)) log.push({ role: 'tool', type, label, ts: now });
  upsertSession({ ...s, subs: s.subs.map((x) => ({ ...x })) });
  onEvent(e);
}
function demoRun(s, task, at = 0) {
  const later = (ms, fn) => demoTimers.push(setTimeout(fn, ms));
  const step = () => rand(1500, 3200);
  let t = at;
  later(t, () => { s.status = 'work'; s.taskStart = Date.now(); s.lastPrompt = task.prompt; demoEmit(s, 'prompt', task.prompt); });
  task.steps.forEach(([type, label], i) => {
    t += step();
    if (task.wait && i === Math.floor(task.steps.length / 2)) {
      later(t, () => { s.status = 'wait'; demoEmit(s, 'wait', task.wait); });
      t += rand(7000, 11000);
      later(t, () => { s.status = 'work'; demoEmit(s, 'bash', task.wait); });
      t += step();
    }
    if (task.sub && i === 1) {
      const id = `demo-sub-${++demoSeq}`, [kind, desc] = task.sub;
      later(t, () => { s.subs.push({ id, type: kind, desc, last: null, startedAt: Date.now(), steps: 0 }); demoEmit(s, 'agent', kind, { desc }); demoEmit(s, 'substart', kind, { agent: id, quiet: false }); });
      for (const [k, l] of [['grep', 'useCart'], ['read', 'src/index.ts'], ['web', desc]]) {
        t += rand(1200, 2200);
        later(t, () => { const x = s.subs.find((y) => y.id === id); if (x) { x.last = { type: k, label: l }; x.steps++; } demoEmit(s, k, l, { agent: id, agentType: kind, quiet: true }); });
      }
      t += rand(1500, 2500);
      later(t, () => { s.subs = s.subs.filter((y) => y.id !== id); demoEmit(s, 'substop', kind, { agent: id }); });
    }
    later(t, () => demoEmit(s, type, label));
  });
  if (task.deploy) { t += step(); later(t, () => demoEmit(s, 'deploy', task.deploy)); }
  if (s.usage && s.usage.ctx > 150000) { t += step(); later(t, () => { demoEmit(s, 'compact', 'auto'); }); t += 4800; later(t, () => { s.usage.ctx = 42000; upsertSession({ ...s }); }); }
  t += step();
  later(t, () => { s.status = 'rest'; s.taskStart = 0; demoEmit(s, 'stop'); });
  return t;
}
function demoLoop(s, p, first) {
  let k = first ? 0 : Math.floor(Math.random() * p.tasks.length);
  // between tasks a short pause, now and then a long break: long enough to nap, fetch the lunch or pop out to the shop
  // (people/outings.js)
  const go = (delay) => { const task = p.tasks[k++ % p.tasks.length]; const end = demoRun(s, task, delay); demoTimers.push(setTimeout(() => go(Math.random() < 0.22 ? rand(70000, 150000) : rand(6000, 16000)), end + 50)); };
  go(first ? rand(300, 2500) : rand(4000, 14000));
}
export function demoMac() {
  const GBb = 1024 ** 3, now = Math.round(Date.now() / 1000), list = [...sessions.values()];
  const claude = list.map((s, i) => ({ pid: 52000 + i, start: now - 3600 * (i + 1), name: s.name, dir: s.dir, busy: s.status !== 'rest', idle: s.status === 'rest' ? Math.round((Date.now() - s.lastAt) / 1000) + 3600 * i : 0, mem: (260 + i * 90) * 1024 ** 2, remote: i === 0 }));
  const owner = list.find((s) => s.desk >= 0 && s.name === 'landing-page') || list.find((s) => s.desk >= 0);
  const dev = { pid: 41001, start: now - 2 * 86400 - 3 * 3600, label: 'next dev', ports: [3000], dir: '~/projects/landing-page', up: 2 * 86400 + 3 * 3600, cpu: 290, mem: 2.3 * GBb,
    owner: owner ? { sid: owner.id, name: owner.name, alive: true } : null };
  const lost = { pid: 41007, start: now - 9 * 3600, label: 'vite', ports: [5173], dir: '~/projects/old-prototype', up: 9 * 3600, cpu: 2, mem: 0.7 * GBb, owner: { sid: 'demo-gone', name: 'old-prototype', alive: false } };
  const M = (k) => tr(`demo.mac.${k}`);
  const tips = [
    { id: 'kill:41001', action: 'kill', target: 41001, start: dev.start, gain: dev.mem, level: 'high', title: M('devTitle'), detail: M('devDetail'), verb: M('stop') },
    { id: 'kill:41007', action: 'kill', target: 41007, start: lost.start, gain: lost.mem, level: 'high', title: M('lostTitle'), detail: M('lostDetail'), verb: M('stop') },
    { id: 'quit:Google Chrome', action: 'quit', target: 'Google Chrome', gain: 4.8 * GBb, level: 'mid', title: M('chromeTitle'), detail: M('chromeDetail'), verb: M('quit') },
    { id: 'clean:claude-tmp', action: 'clean', target: 'claude-tmp', gain: 8.4 * GBb, disk: true, level: 'mid', title: M('tmpTitle'), detail: M('tmpDetail'), verb: M('clean') },
  ];
  return { at: Date.now(), mem: { used: 12.6 * GBb, total: 16 * GBb, pressure: 'warn', swapUsed: 3.1 * GBb, swapTotal: 6 * GBb }, cpu: { percent: 42 + Math.round(Math.random() * 10), cores: 10, load: 4.2 },
    disk: { used: 301 * GBb, total: 460 * GBb, free: 159 * GBb }, tight: true, diskTight: false, devServers: [dev, lost], claude, orphans: [],
    apps: [{ name: 'Google Chrome', mem: 4.8 * GBb, cpu: 31, count: 22, quit: true }, { name: 'Slack', mem: 1.2 * GBb, cpu: 3, count: 6, quit: true }, { name: 'Spotify', mem: 0.6 * GBb, cpu: 2, count: 5, quit: true }, { name: 'Claude Code', mem: 2.1 * GBb, cpu: 14, count: 6, quit: false }],
    tips, cleanups: [{ id: 'claude-tmp', title: M('tmpTitle'), detail: M('tmpCleanup'), size: 8.4 * GBb }, { id: 'next-cache', title: M('nextTitle'), detail: M('nextDetail'), size: 0.7 * GBb }, { id: 'npm-cache', title: M('npmTitle'), detail: M('npmDetail'), size: 0.3 * GBb }], cleanupsAt: Date.now() };
}
// Replies in the demo conversation: what Claude usually writes (lists, code, tables), so the reader can be judged.
// Claude's to-do lists, by project (the second project has none).
function demoChecklist(i) {
  const c = (k) => tr(`demo.checklist.${k}`);
  return [
    [{ text: c('cart.params'), status: 'done' }, { text: c('cart.lastPage'), status: 'doing' }, { text: c('cart.docs'), status: 'todo' }],
    null,
    [{ text: c('schedule.read'), status: 'done' }, { text: c('schedule.move'), status: 'done' }, { text: c('schedule.crontab'), status: 'todo' }, { text: c('schedule.trial'), status: 'todo' }],
  ][i] || null;
}
const REPLY_KEYS = ['cart', 'speed', 'schedule'];
const demoReply = (i) => tr(`demo.replies.${REPLY_KEYS[i]}`);
export function startDemo() {
  $('demo-chip').hidden = false;
  state.todos = DEMO_TODOS.map((t) => ({ ...t })); onTodos();
  state.stats = { prompts: 0, read: 0, edit: 0, cmd: 0, deploy: 0 };
  demoProjects().forEach((p, i) => {
    const s = { usage: { cost: 0.4 + i * 0.9, ctx: i === 0 ? 168000 : 38000 + i * 21000, ctxMax: 200000, model: 'claude-opus-5-5', out: 0 }, id: `demo-${i}`, pid: 52000 + i, name: p.name, dir: p.dir, link: null, desk: i, status: 'rest', lastPrompt: '', taskStart: 0, counts: { read: 0, edit: 0, cmd: 0, web: 0 }, subs: [], doneSubs: [], last: null, lastAt: Date.now() - (i + 1) * 9 * 60e3, todos: demoChecklist(i) || [] };
    upsertSession(s, false);
    demoLoop(s, p, i < 4);
  });
  // the first project was continued from a long session: it opens with Claude's own summary
  const t0 = Date.now() - 50 * 60e3;
  demoLog.set('demo-0', [
    { role: 'summary', ts: t0, text: tr('demo.summary') },
    { role: 'user', ts: t0 + 60e3, text: tr('demo.chat.keepGoing') },
    { role: 'tool', type: 'read', label: 'cart.ts', ts: t0 + 70e3 }, { role: 'tool', type: 'grep', label: 'paginate', ts: t0 + 80e3 },
    { role: 'tool', type: 'edit', label: 'cart.ts', ts: t0 + 90e3 }, { role: 'tool', type: 'bash', label: tr('demo.tasks.cart.test'), ts: t0 + 100e3 },
    { role: 'claude', ts: t0 + 110e3, text: demoReply(0) },
    { role: 'note', ts: t0 + 130e3, text: tr('demo.chat.stopped') },
    { role: 'claude', ts: t0 + 150e3, text: demoReply(1) },
    { role: 'user', ts: t0 + 160e3, text: tr('demo.chat.schedule') },
    { role: 'claude', ts: t0 + 170e3, text: demoReply(2) },
  ]);
  state.connectedOnce = true; setConn(true); queueUi();
  // one scripted incident so the red alarm can be seen: three failing commands in a row
  demoTimers.push(setTimeout(() => { const list = [...sessions.values()]; [0, 1, 2].forEach((k) => setTimeout(() => demoEmit(list[k % list.length], 'fail', tr('demo.incident')), k * 900)); }, 45000));
}
// One handler for the live stream and for replays. `quiet` (fast-forwarding a replay) places people without walking
// and fills the feed without bubbles or animations.
export function applyMsg(d, quiet = false) {
  if (d.k === 'snap' || d.k === 'lang') {   // the office's language changed while this page was open: load it again in the new one
    if (d.lang && d.lang !== document.documentElement.lang && !new URLSearchParams(location.search).has('lang')) { location.reload(); return; }
    if (d.k === 'lang') return;
  }
  if (d.k === 'snap') {
    const ids = new Set(d.sessions.map((s) => s.id));
    for (const id of [...sessions.keys()]) if (!ids.has(id)) (quiet ? dropSessionNow : removeSession)(id);
    for (const s of d.sessions) upsertSession(s, false);
    state.feed = d.feed || []; state.stats = d.stats || {}; renderFeed();
    if ('local' in d) {   // only the live snapshot carries these
      perms.clear(); for (const p of d.perms || []) perms.set(p.id, p); renderPerms(); reportPresence();
      state.isLocal = !!d.local; state.lanUrl = d.lan || null; state.lanBase = d.lanBase || null; state.phonePin = d.pin || null;
      state.todos = d.todos || []; onTodos();
      if (d.trophies) setTrophies(d.trophies);
      state.limits = d.limits || null; state.limitsNote = d.limitsNote || ''; for (const w of liveWindows()) if (w.pct >= 80) limitWarned.add(`${w.key}:${w.resetsAt}:${w.pct >= 95 ? 95 : 80}`); renderLimits();
      $('btn-phone').hidden = !state.isLocal;
      $('btn-bell').hidden = !('Notification' in window) || !window.isSecureContext;
    }
    state.connectedOnce = true; queueUi();
  } else if (d.k === 'sess') { upsertSession(d.s, !quiet); if (d.stats) state.stats = d.stats; }
  else if (d.k === 'gone') (quiet ? dropSessionNow : removeSession)(d.id);
  else if (d.k === 'ev') {
    if (d.stats) state.stats = d.stats; upsertSession(d.s, !quiet);
    if (!quiet) onEvent(d.e); else if (!d.e.quiet && d.e.type !== 'start') addFeed(d.e);
  }
  else if (d.k === 'stats') { state.stats = d.stats; if (d.s) upsertSession(d.s, !quiet); }
  else if (d.k === 'perm') onPerm(d.p);
  else if (d.k === 'permDone') { perms.delete(d.id); renderPerms(); }
  else if (d.k === 'todos') { state.todos = d.todos || []; onTodos(); }
  else if (d.k === 'limits') { state.limits = d.limits || null; state.limitsNote = d.note || ''; renderLimits(); if (!drM.hidden) renderMac(); }
  else if (d.k === 'trophies') setTrophies(d.t, quiet ? [] : d.earned || []);
  else if (d.k === 'vi') relabel(d.from, d.to);
}
// a translation that arrived after its event: swap the words in bubbles, the feed and the session list
function relabel(from, to) {
  if (!from || !to) return;
  for (const w of [...workers.values(), ...subs.values()]) if (w.lastSay?.text?.includes(from) && w.bubbleObj.visible) w.say(w.lastSay.type, w.lastSay.text.replace(from, to), w.lastSay.kind);
  for (const e of state.feed) { if (e.label === from) e.label = to; if (e.desc === from) e.desc = to; }
  for (const s of sessions.values()) for (const o of [s, ...(s.subs || [])]) { if (o.last?.label === from) o.last.label = to; if (o.desc === from) o.desc = to; }
  queueFeed(); queueUi();
}
export let liveES = null;
export function connect() {
  const es = new EventSource(`/stream${TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : ''}`);
  liveES = es;
  es.onopen = () => setConn(true);
  es.onerror = () => setConn(false);
  es.onmessage = (m) => {
    if (replay.on) return;
    let d; try { d = JSON.parse(m.data); } catch { return; }
    applyMsg(d);
  };
}
export function dropSessionNow(id) {
  const s = sessions.get(id); sessions.delete(id); freeDesk(id);
  const w = workers.get(id);
  if (w) { workers.delete(id); for (const [aid, sw] of subs) if (sw.parent === w) { subs.delete(aid); sw.remove(); } w.remove(); }
  if (s && s.desk >= 0) chairs[s.desk].color.set(CHAIR_IDLE);
  if (state.selectedId === id) closeSession();
}

export function setup() {
  /* ---------- demo mode (?demo): fictional projects and a fictional Mac, so the office can be shown or screenshotted
     without any real sessions, paths or commands. Nothing is sent to the server and no action touches the machine. ---------- */
  DEMO = STATIC || new URLSearchParams(location.search).has('demo');
}
