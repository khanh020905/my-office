// The activity column and the session list.
import { state } from '../core/state.js';
import { $, el, fmtBytes, fmtClock, hhmm, nowMs } from '../core/env.js';
import { STATUS_LABEL, verb } from './event-text.js';
import { TYPE_ICON, TYPE_TONE, icon } from './icons.js';
import { hoverRing, selRing } from '../interact/rings.js';
import { AGENT_NAME, agentMark, agentOf, colorOf, dn, sessions, workers } from '../people/workers.js';
import { renderLite } from './lite.js';
import { openSession, renderActivity, renderSessionHead, renderSubs, tab, toggleSession } from './session-drawer.js';
import { macSnap } from './mac-drawer.js';
import { queuePlace } from '../interact/place-cards.js';
import { unseenDone } from '../life/your-turn.js';
import { whereabouts } from '../people/outings.js';
import { imageUrl, openImage } from './image-view.js';
import { renderHome } from './phone-home.js';
import { t as tr, num } from '../../i18n/index.js';
import { createTaskAggregator } from '../../shared/task-aggregator.js';

let feedFilter = 'all';
let historyFilter = 'all';
let historyLimit = 15;
const expandedTasks = new Set();
const expandedSubgroups = new Set();
const collapsedDates = new Set();

let query = '';
let toastEl;
let toastTimer;
export function toast(msg, ms = 3400) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms); }
const ATT = new Set(['wait', 'ask', 'fail', 'cired']);
export const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
// Consecutive events from the same session (or subagent) within four minutes share one card; alerts stand alone
// with their actions, so "needs you" never hides inside a group.
const KIND = { cmd: ['bash', 'test', 'testok', 'testfail', 'deploy', 'commit', 'push', 'release', 'cired', 'cigreen'], edit: ['edit', 'write', 'create', 'delete'], read: ['read', 'grep', 'glob', 'skill'], web: ['web', 'fetch', 'mcp'], agent: ['agent', 'substart', 'substop'] };
const typeFilter = new Set();
const kindOk = (e) => !typeFilter.size || [...typeFilter].some((k) => KIND[k].includes(e.type) || KIND[k].includes(e.action));
const taskKindOk = (task) => !typeFilter.size || (task.events && task.events.some(kindOk));

function lineOf(e) {
  const ln = el('span', 'fg-line'), ic = el('span', 'fi-ico');
  if (Array.isArray(e.filePaths) && e.filePaths.length) ln.title = e.filePaths.join('\n');
  ic.append(icon(TYPE_ICON[e.type] || 'sparkle')); if (TYPE_TONE[e.type]) ic.dataset.tone = TYPE_TONE[e.type];
  ln.append(ic, el('span', 'fg-text', cap(verb(e))));
  if (e.img) {   // an image it read, wrote or edited: a thumbnail, a click opens it (image-view.js)
    const th = el('span', 'fg-thumb'), im = el('img'); im.loading = 'lazy'; im.alt = ''; im.src = imageUrl(e.img);
    im.addEventListener('error', () => { th.remove(); ln.classList.remove('has-thumb'); });   // (gone from the disk)
    th.dataset.img = e.img; th.dataset.name = e.label || ''; th.title = tr('activity.image.view'); th.append(im); ln.append(th); ln.classList.add('has-thumb');
  }
  return ln;
}
export function feedRow(e) {
  const li = el('li', 'fr'); if (e.agent) li.dataset.agent = e.agent;
  li.append(lineOf(e), el('time', null, hhmm(e.ts)));
  return li;
}
function formatDateGroup(ts) {
  if (!ts) return tr('activity.date.today');
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return tr('activity.date.today');
  const yest = new Date(now.getTime() - 86400e3);
  if (d.toDateString() === yest.toDateString()) return tr('activity.date.yesterday');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function renderTaskTimeline(task) {
  const tl = el('div', 'tc-timeline');
  const events = task.events || [];
  const items = [];
  let curFileGroup = null;
  let curCmdGroup = null;

  for (const e of events) {
    const isFile = ['edit', 'write', 'create', 'delete', 'read', 'grep', 'glob'].includes(e.type);
    const isCmd = ['bash', 'cmd', 'command'].includes(e.type);

    if (isFile) {
      curCmdGroup = null;
      if (!curFileGroup) {
        curFileGroup = { type: 'file_group', events: [e] };
        items.push(curFileGroup);
      } else {
        curFileGroup.events.push(e);
      }
    } else if (isCmd) {
      curFileGroup = null;
      if (!curCmdGroup) {
        curCmdGroup = { type: 'cmd_group', events: [e] };
        items.push(curCmdGroup);
      } else {
        curCmdGroup.events.push(e);
      }
    } else {
      curFileGroup = null;
      curCmdGroup = null;
      items.push({ type: 'event', event: e });
    }
  }

  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    if (it.type === 'file_group') {
      const gEl = el('div', 'tc-tl-group');
      const gHead = el('div', 'tc-tl-group-head');
      const gKey = `${task.taskId}:fg:${idx}`;
      const isExp = expandedSubgroups.has(gKey);
      const paths = new Map();
      for (const fe of it.events) {
        const pList = Array.isArray(fe.filePaths) && fe.filePaths.length ? fe.filePaths : (fe.file ? [fe.file] : (fe.label ? [fe.label.replace(/^[a-zA-Z]+:\s*/, '')] : []));
        for (const p of pList) if (p && typeof p === 'string') paths.set(p, (paths.get(p) || 0) + 1);
      }
      gHead.append(icon('file'), el('span', null, tr('activity.sections.fileOps', { n: it.events.length })), el('span', null, isExp ? '▾' : '▸'));
      gHead.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (isExp) expandedSubgroups.delete(gKey); else expandedSubgroups.add(gKey);
        renderFeed();
      });
      gEl.append(gHead);

      if (isExp) {
        const subList = el('ul', 'tc-tl-subitems');
        if (paths.size) {
          for (const [p, c] of paths.entries()) {
            const row = el('li', 'tc-tl-subitem');
            row.append(el('span', null, p));
            if (c > 1) row.append(el('span', null, tr('activity.sections.editsCount', { n: c })));
            subList.append(row);
          }
        } else {
          for (const fe of it.events) {
            const sub = el('li', 'tc-tl-subitem');
            sub.append(el('span', null, cap(verb(fe))), el('time', null, hhmm(fe.ts)));
            subList.append(sub);
          }
        }
        gEl.append(subList);
      }
      tl.append(gEl);
    } else if (it.type === 'cmd_group') {
      const gEl = el('div', 'tc-tl-group');
      const gHead = el('div', 'tc-tl-group-head');
      const gKey = `${task.taskId}:cg:${idx}`;
      const isExp = expandedSubgroups.has(gKey);
      gHead.append(icon('terminal'), el('span', null, tr('activity.sections.terminalOps', { n: it.events.length })), el('span', null, isExp ? '▾' : '▸'));
      gHead.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (isExp) expandedSubgroups.delete(gKey); else expandedSubgroups.add(gKey);
        renderFeed();
      });
      gEl.append(gHead);

      if (isExp) {
        const subList = el('ul', 'tc-tl-subitems');
        for (const ce of it.events) {
          const sub = el('li', 'tc-tl-subitem');
          sub.append(el('span', null, ce.command || ce.label || 'command'), el('time', null, hhmm(ce.ts)));
          subList.append(sub);
        }
        gEl.append(subList);
      }
      tl.append(gEl);
    } else {
      const ev = it.event;
      const row = el('div', 'tc-tl-row');
      const ico = el('span', 'tc-tl-ico');
      ico.append(icon(TYPE_ICON[ev.type] || 'sparkle'));
      if (TYPE_TONE[ev.type]) ico.dataset.tone = TYPE_TONE[ev.type];
      const cnt = el('div', 'tc-tl-content');
      cnt.append(el('span', null, cap(verb(ev))));
      if (ev.img) {
        const th = el('span', 'fg-thumb'), im = el('img'); im.loading = 'lazy'; im.src = imageUrl(ev.img);
        th.append(im);
        th.addEventListener('click', (e) => { e.stopPropagation(); openImage(ev.img, ev.label, task.projectId); });
        cnt.append(th);
      }
      row.append(ico, cnt, el('time', 'tc-tl-time', hhmm(ev.ts)));
      tl.append(row);
    }
  }
  return tl;
}

function renderTaskCard(task, isActive = true) {
  const isExp = expandedTasks.has(task.taskId);
  const card = el('li', `tc-card tc-card--${task.status} ${isActive ? 'tc-card--active' : ''}`);
  card.dataset.taskId = task.taskId;
  if (task.conversationId) card.dataset.sess = task.conversationId;

  // Header row
  const head = el('div', 'tc-head');
  const meta = el('div', 'tc-meta-row');

  const provBadge = el('span', 'tc-badge-prov', task.provider === 'claude-code' ? 'Claude' : task.provider === 'codex-app' ? 'Codex App' : task.provider === 'codex-cli' ? 'Codex CLI' : task.provider === 'antigravity' ? 'Antigravity' : task.provider);
  provBadge.dataset.prov = task.provider;

  const stBadge = el('span', 'tc-badge-status', tr(`activity.status.${task.status}`) || task.status);
  stBadge.dataset.status = task.status;

  meta.append(provBadge, stBadge);

  if (task.currentPhase) {
    const phKey = task.currentPhase.toLowerCase();
    const phBadge = el('span', 'tc-badge-phase', tr(`activity.phases.${phKey}`) || task.currentPhase);
    meta.append(phBadge);
  }

  const timeEl = el('time', 'tc-time', ago(task.lastEventAt));
  head.append(meta, timeEl);

  // Title & Project
  const titleEl = el('h4', 'tc-title', task.title || 'Task');
  titleEl.title = task.description || task.title || '';
  const projLabel = el('span', 'tc-proj', task.projectId);

  // Progress representation
  let progEl = null;
  if (task.progress?.mode === 'quantitative') {
    progEl = el('div', 'tc-progress-wrap');
    const bar = el('div', 'tc-progress-bar');
    const fill = el('div', 'tc-progress-fill');
    fill.style.width = `${task.progress.percent}%`;
    bar.append(fill);
    const txt = el('div', 'tc-progress-txt');
    txt.append(el('span', null, task.currentPhase || 'Running'), el('span', null, task.progress.label));
    progEl.append(bar, txt);
  } else if (task.progress?.mode === 'phase') {
    progEl = el('div', 'tc-phase-indicator');
    progEl.append(el('span', 'tc-phase-dot'), el('span', null, task.progress.label));
  } else if (task.progress?.mode === 'activity_only') {
    progEl = el('div', 'tc-activity-only');
    progEl.append(el('span', 'tc-activity-pulse'), el('span', null, task.progress.label));
  }

  // Chips for files and commands
  const chips = el('div', 'tc-chips');
  if (task.filesChanged.length) {
    const fc = el('span', 'tc-chip tc-chip-file');
    fc.append(icon('file'), el('span', null, tr('activity.sections.filesChanged', { n: task.filesChanged.length })));
    fc.title = task.filesChanged.join('\n');
    chips.append(fc);
  }
  if (task.commandsExecuted.length) {
    const cc = el('span', 'tc-chip tc-chip-cmd');
    cc.append(icon('terminal'), el('span', null, tr('activity.sections.commandsRun', { n: task.commandsExecuted.length })));
    cc.title = task.commandsExecuted.join('\n');
    chips.append(cc);
  }

  // Callout for errors or waiting
  let calloutEl = null;
  if (task.error || task.status === 'waiting') {
    calloutEl = el('div', `tc-callout tc-callout--${task.status === 'waiting' ? 'wait' : 'err'}`);
    calloutEl.append(icon('alert'), el('span', null, task.error || tr('activity.doing.wait')));
  }

  // Footer & Timeline toggle
  const footer = el('div', 'tc-footer');
  const evInfo = el('span', 'tc-ev-count', `${task.eventCount} events`);
  const toggleBtn = el('button', 'tc-toggle-tl tc-btn-toggle');
  toggleBtn.type = 'button';
  toggleBtn.setAttribute('aria-expanded', String(isExp));
  toggleBtn.append(el('span', null, tr('activity.sections.timeline')), icon('chevron'));
  toggleBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (isExp) expandedTasks.delete(task.taskId); else expandedTasks.add(task.taskId);
    renderFeed();
  });
  footer.append(evInfo, toggleBtn);

  // Assemble Card
  card.append(head, titleEl);
  if (task.projectId && task.projectId !== 'unknown-project') {
    card.append(projLabel);
  }
  if (progEl) card.append(progEl);
  if (chips.children.length) card.append(chips);
  if (calloutEl) card.append(calloutEl);
  card.append(footer);

  if (isExp) {
    card.append(renderTaskTimeline(task));
  }

  card.addEventListener('click', (ev) => {
    if (ev.target.closest('button') || ev.target.closest('.tc-tl-group') || ev.target.closest('.fg-thumb')) return;
    if (task.conversationId) openSession(task.conversationId);
  });

  return card;
}

export function renderFeed() {
  const list = $('feed-list');
  if (!list) return;
  list.replaceChildren();

  state.taskAggregator ||= createTaskAggregator();
  state.taskAggregator.checkStale(nowMs());

  // === Section B — Active Tasks ===
  let activeTasks = state.taskAggregator.getActiveTasks(nowMs());
  if (feedFilter === 'att') {
    activeTasks = activeTasks.filter((t) => t.status === 'waiting' || t.status === 'failed' || t.status === 'stale');
  }
  if (typeFilter.size > 0) {
    activeTasks = activeTasks.filter(taskKindOk);
  }

  const activeSec = el('div', 'act-section');
  const activeHead = el('div', 'act-section-head');
  const activeTitle = el('h3', 'act-section-title');
  activeTitle.append(icon('sparkle'), el('span', null, tr('activity.sections.activeTasks')));
  const activeBadge = el('span', 'act-badge-count', num(activeTasks.length));
  activeBadge.dataset.count = activeTasks.length;
  activeHead.append(activeTitle, activeBadge);
  activeSec.append(activeHead);

  const activeList = el('ul', 'tc-list');
  if (!activeTasks.length) {
    activeList.append(el('li', 'fi-empty', tr('activity.sections.noActive')));
  } else {
    for (const task of activeTasks) {
      activeList.append(renderTaskCard(task, true));
    }
  }
  activeSec.append(activeList);
  list.append(activeSec);

  // === Section C — Recent History ===
  const historySec = el('div', 'act-section');
  const histHead = el('div', 'act-section-head');
  const histTitle = el('h3', 'act-section-title');
  histTitle.append(icon('timeline'), el('span', null, tr('activity.sections.recentHistory')));

  const histStatus = historyFilter === 'all' ? null : historyFilter;
  let historyResult = state.taskAggregator.getHistoryTasks({
    limit: historyLimit,
    status: histStatus,
    now: nowMs(),
  });
  if (typeFilter.size > 0) {
    historyResult = {
      ...historyResult,
      items: historyResult.items.filter(taskKindOk),
    };
  }

  const histBadge = el('span', 'act-badge-count', num(historyResult.total));
  histBadge.dataset.count = historyResult.total;
  histHead.append(histTitle, histBadge);
  historySec.append(histHead);

  // History Filter Buttons
  const filterRow = el('div', 'act-filters');
  for (const f of ['all', 'succeeded', 'failed']) {
    const fBtn = el('button', 'act-filter-btn', tr(`activity.status.${f}`) || cap(f));
    fBtn.type = 'button';
    fBtn.setAttribute('aria-pressed', String(historyFilter === f));
    fBtn.addEventListener('click', () => { historyFilter = f; renderFeed(); });
    filterRow.append(fBtn);
  }
  historySec.append(filterRow);

  if (!historyResult.items.length) {
    historySec.append(el('div', 'fi-empty', tr('activity.sections.noHistory')));
  } else {
    // Group history tasks by date
    const dateGroups = new Map();
    for (const task of historyResult.items) {
      const dateLabel = formatDateGroup(task.completedAt || task.lastEventAt);
      if (!dateGroups.has(dateLabel)) dateGroups.set(dateLabel, []);
      dateGroups.get(dateLabel).push(task);
    }

    for (const [dateLabel, tasks] of dateGroups.entries()) {
      const dateGrp = el('div', 'act-date-group');
      const isCollapsed = collapsedDates.has(dateLabel);

      const dateBtn = el('button', 'act-date-btn');
      dateBtn.type = 'button';
      dateBtn.setAttribute('aria-expanded', String(!isCollapsed));
      dateBtn.append(el('span', null, `${dateLabel} (${tasks.length})`), icon('chevron'));
      dateBtn.addEventListener('click', () => {
        if (isCollapsed) collapsedDates.delete(dateLabel); else collapsedDates.add(dateLabel);
        renderFeed();
      });
      dateGrp.append(dateBtn);

      if (!isCollapsed) {
        const histList = el('ul', 'tc-list');
        for (const task of tasks) {
          histList.append(renderTaskCard(task, false));
        }
        dateGrp.append(histList);
      }
      historySec.append(dateGrp);
    }

    if (historyResult.hasMore) {
      const moreBtn = el('button', 'act-load-more', tr('activity.sections.loadMore', { n: historyResult.total - historyLimit }));
      moreBtn.type = 'button';
      moreBtn.addEventListener('click', () => {
        historyLimit += 15;
        renderFeed();
      });
      historySec.append(moreBtn);
    }
  }

  list.append(historySec);

  const att = state.feed.filter((e) => ATT.has(e.type) && sessions.has(e.sess) && nowMs() - e.ts < 3600e3).length;
  $('att-count').hidden = !att;
  $('att-count').textContent = att;
}
let feedQueued = false;
export function queueFeed() { if (feedQueued) return; feedQueued = true; requestAnimationFrame(() => { feedQueued = false; renderFeed(); if (state.selectedId && tab === 'act') renderActivity(); }); }
export function addFeed(e) {
  state.feed.push(e);
  if (state.feed.length > 300) state.feed = state.feed.slice(-300);
  state.taskAggregator ||= createTaskAggregator();
  state.taskAggregator.ingest(e);
  queueFeed();
}
export function openFromRow(b) { if (b.dataset.agent) openSession(b.dataset.sess, { tab: 'subs', agent: b.dataset.agent }); else openSession(b.dataset.sess); }
function setFilter(f) { feedFilter = f; $('flt-all').setAttribute('aria-pressed', String(f === 'all')); $('flt-att').setAttribute('aria-pressed', String(f === 'att')); renderFeed(); }
function ago(ts) {
  const s = (nowMs() - (ts || 0)) / 1000;
  if (s < 3600) return tr('time.min', { n: Math.max(1, Math.floor(s / 60)) });
  if (s < 86400) return tr('time.hour', { n: Math.floor(s / 3600) });
  return tr('time.day', { n: Math.floor(s / 86400) });
}
export function doingOf(s) {
  if (s.status === 'wait') return { ic: 'alert', text: tr('activity.doing.wait') };
  if (s.stuck && s.status !== 'rest') return { ic: 'alert', text: tr(`activity.doing.stuck.${s.stuck.kind}`, { label: s.stuck.label.length > 40 ? `${s.stuck.label.slice(0, 39)}…` : s.stuck.label }), stuck: true };
  const where = whereabouts(workers.get(s.id));   // out of the office: at the shop, on the way home…
  if (where) return where;
  if (s.status === 'rest' && s.bg?.length) return { ic: 'terminal', text: `${tr('activity.doing.bg', { desc: s.bg[0].desc })}${s.bg.length > 1 ? ` (+${s.bg.length - 1})` : ''}` };
  if (s.status === 'rest') return { ic: 'zzz', text: nowMs() - (s.lastAt || 0) < 90e3 ? tr('activity.doing.justDone') : tr('activity.doing.resting', { time: ago(s.lastAt) }) };
  if (s.last) return { ic: TYPE_ICON[s.last.type] || 'sparkle', text: cap(verb(s.last)) };
  return { ic: 'sparkle', text: tr('activity.doing.working') };
}
const order = (a, b) => (a.status === 'wait' ? -1 : 0) - (b.status === 'wait' ? -1 : 0) || (a.status === 'rest') - (b.status === 'rest') || (a.desk - b.desk);
let uiQueued = false;
export function queueUi() {
  if (uiQueued) return; uiQueued = true;
  requestAnimationFrame(() => {
    uiQueued = false; renderRail(); renderHud(); queueFeed(); state.boardDirty = true; queuePlace(); renderLite(); renderHome();
    if (state.selectedId) { renderSessionHead(); if (tab === 'subs' && !state.subView) renderSubs(); }
  });
}
// Rows are keyed by session id and updated in place, so keyboard focus and hover survive live updates. Sessions are
// grouped (needs you → working → resting, resting can fold away), each row shows how long the current task has run,
// the session's RAM (from the Mac snapshot, by pid) and a 30-minute activity sparkline.
const railRows = new Map();
let railOrder = '', railFilter = null, restCollapsed = false;
const GROUPS = [['wait'], ['work'], ['rest']];   // labels: activity.group.<key>
let grpEls;
const SVGNS = 'http://www.w3.org/2000/svg';
function sparkEl() {
  const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('viewBox', '0 0 45 14'); svg.setAttribute('class', 'spark'); svg.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 15; i++) { const r = document.createElementNS(SVGNS, 'rect'); r.setAttribute('x', i * 3); r.setAttribute('width', 2); r.setAttribute('y', 13); r.setAttribute('height', 1); r.setAttribute('rx', 0.6); svg.append(r); }
  return svg;
}
function sparkOf(id) { const now = nowMs(), b = new Array(15).fill(0); for (const e of state.feed) { if (e.sess !== id) continue; const k = Math.floor((now - e.ts) / 120e3); if (k >= 0 && k < 15) b[14 - k]++; } return b; }
function setSpark(svg, counts) {
  const max = Math.max(1, ...counts);
  counts.forEach((c, i) => { const h = c ? 2 + Math.round((c / max) * 11) : 1, r = svg.children[i]; r.setAttribute('y', 14 - h); r.setAttribute('height', h); r.classList.toggle('on', c > 0); });
}
const metaTime = (s) => (s.status === 'work' && s.taskStart ? fmtClock((nowMs() - s.taskStart) / 1000) : s.status === 'wait' ? tr('activity.waitingFor', { time: ago(s.lastAt) }) : ago(s.lastAt));
function railRow(s) {
  const li = el('li', 'ri-li');
  const b = el('button', 'ri'); b.type = 'button'; b.dataset.sess = s.id;
  const av = el('span', 'av'), avTxt = el('span', 'av-txt'); av.append(avTxt, el('i', 'av-st')); avTxt.append(agentMark(agentOf(s))); av.title = AGENT_NAME[agentOf(s)];
  const main = el('span', 'ri-main'), top = el('span', 'ri-top'), name = el('span', 'ri-name'), doing = el('span', 'ri-doing');
  const dIco = el('span', 'ri-dico'), dTxt = el('span', 'ri-dtxt'); doing.append(dIco, dTxt);
  top.append(name); main.append(top, doing);
  const meta = el('span', 'ri-meta'), time = el('span', 'ri-time'), ram = el('span', 'ri-ram'), spark = sparkEl();
  meta.append(time, spark, ram);
  const ctx = el('span', 'ri-ctx'), ctxB = el('b'); ctx.append(ctxB);
  b.append(av, main, meta, ctx);
  const subList = el('ul', 'ri-subs'); subList.hidden = true;
  li.append(b, subList);
  const c = el('button', 'chip'); c.type = 'button'; c.dataset.sess = s.id;
  const cd = el('i'), cn = el('span'), cs = el('small');
  c.append(cd, cn, cs);
  return { li, b, av, avTxt, top, name, ctx, ctxB, nameKey: '', dIco, dIcoName: '', dTxt, time, ram, spark, subList, subSig: '', c, cd, cn, cs };
}
function subRow(s, x) {
  const li = el('li');
  const b = el('button', 'ri-sub'); b.type = 'button'; b.dataset.sess = s.id; b.dataset.agent = x.id;
  b.append(icon('sparkle'), el('b', null, `${x.type}${x.desc ? ' · ' + x.desc : ''}`), el('span', null, x.last ? cap(verb(x.last)) : tr('activity.starting')));
  li.append(b);
  return li;
}
function renderRail() {
  const all = [...sessions.values()].sort(order);
  const q = query.trim().toLowerCase();
  const rail = $('rail-list'), chips = $('chips');
  const ram = new Map((macSnap?.claude || []).map((c) => [c.pid, c.mem]));
  const count = { wait: 0, work: 0, rest: 0 };
  for (const [id, r] of railRows) if (!sessions.has(id)) { r.li.remove(); r.c.remove(); railRows.delete(id); }
  for (const s of all) {
    count[s.status] = (count[s.status] || 0) + 1;
    let r = railRows.get(s.id);
    if (!r) { r = railRow(s); railRows.set(s.id, r); }
    const color = colorOf(s), cur = String(s.id === state.selectedId);
    r.b.dataset.status = s.status; r.b.dataset.stuck = s.stuck && s.status !== 'rest' ? '1' : ''; r.b.dataset.done = unseenDone.has(s.id) ? '1' : ''; r.b.setAttribute('aria-current', cur); r.av.style.setProperty('--c', color);
    { const k = agentOf(s); if (r.avTxt.firstChild?.dataset?.agent !== k) { r.avTxt.replaceChildren(agentMark(k)); r.av.title = AGENT_NAME[k]; } }
    const nk = dn(s) + '|' + (s.dir || '') + '|' + (s.origin || '') + (s.link ? '|rc' : '');
    if (r.nameKey !== nk) {
      r.nameKey = nk; r.name.textContent = dn(s); r.top.querySelector('.ri-rc')?.remove(); r.top.querySelector('.ri-proj')?.remove();
      const proj = String(s.dir || '').split('/').filter(Boolean).pop();
      if (proj && proj !== dn(s)) { const pj = el('span', 'ri-proj', proj); pj.title = s.origin ? tr('activity.runsIn', { dir: s.dir, origin: s.origin }) : `${s.dir}`; r.name.after(pj); }
      if (s.link) { const rc = el('span', 'ri-rc'); rc.title = tr('activity.remoteOn'); rc.append(icon('phone')); r.top.append(rc); }
    }
    r.b.title = `${dn(s)}${s.title ? ` (${s.name})` : ''} · ${s.dir || ''}`;
    const d = doingOf(s);
    if (r.dIcoName !== d.ic) { r.dIcoName = d.ic; r.dIco.replaceChildren(icon(d.ic)); }
    if (r.dTxt.textContent !== d.text) r.dTxt.textContent = d.text;
    r.time.textContent = metaTime(s);
    const mem = ram.get(s.pid); r.ram.textContent = mem ? fmtBytes(mem) : ''; r.ram.title = mem ? tr('activity.ramTitle') : '';
    setSpark(r.spark, sparkOf(s.id));
    const u = s.usage, f = u ? Math.min(1, u.ctx / u.ctxMax) : 0;
    r.ctx.hidden = !u; r.ctxB.style.width = `${Math.round(f * 100)}%`; r.ctxB.className = f > 0.85 ? 'hi' : f > 0.6 ? 'mid' : '';
    r.ctx.title = u ? tr('activity.ctxTitle', { used: fmtTok(u.ctx), max: fmtTok(u.ctxMax), cost: fmtUsd(u.cost) }) : '';
    const subsNow = s.subs || [];
    const sig = subsNow.map((x) => `${x.id}:${x.last?.label || ''}:${x.desc}`).join('|');
    if (sig !== r.subSig) { r.subSig = sig; r.subList.replaceChildren(...subsNow.map((x) => subRow(s, x))); }
    r.subList.hidden = !subsNow.length;
    const match = !q || s.name.toLowerCase().includes(q) || String(s.title || '').toLowerCase().includes(q) || String(s.dir || '').toLowerCase().includes(q);
    const folded = s.status === 'rest' && restCollapsed && !q && railFilter !== 'rest';
    r.li.hidden = !match || (railFilter && s.status !== railFilter) || folded;
    r.c.dataset.status = s.status; r.c.setAttribute('aria-current', cur); r.cd.style.background = color;
    if (r.cn.textContent !== dn(s)) r.cn.textContent = dn(s);
    r.cs.textContent = STATUS_LABEL[s.status];
  }
  for (const [k] of GROUPS) { const g = grpEls[k]; g.n.textContent = count[k] || 0; g.li.hidden = !count[k] || (railFilter && railFilter !== k); }
  grpEls.rest.b.setAttribute('aria-expanded', String(!restCollapsed || !!q || railFilter === 'rest'));
  for (const k of ['work', 'wait', 'rest']) { $('st-' + k).textContent = count[k] || 0; }
  document.querySelector('.st[data-st="wait"]').classList.toggle('has', !!count.wait);
  const ord = all.map((s) => s.id + s.status).join();
  if (ord !== railOrder) {
    railOrder = ord;
    for (const [k] of GROUPS) { rail.append(grpEls[k].li); for (const s of all) if (s.status === k) rail.append(railRows.get(s.id).li); }
    for (const s of all) chips.append(railRows.get(s.id).c);
  }
  $('empty').hidden = all.length > 0 || !state.connectedOnce;
  for (const w of workers.values()) w.tagEl.classList.toggle('tag--on', w.id === state.selectedId);
}
function onListClick(ev) {
  const g = ev.target.closest('.grp-btn');
  if (g) { if (g.dataset.g === 'rest') { restCollapsed = !restCollapsed; try { localStorage.setItem('office-rest-folded', restCollapsed ? '1' : '0'); } catch { /* storage blocked */ } renderRail(); } return; }
  const b = ev.target.closest('[data-sess]'); if (!b) return; if (b.dataset.agent) openFromRow(b); else toggleSession(b.dataset.sess);
}
export const fmtTok = (n) => (n >= 1e6 ? `${num(n / 1e6, 1)}M` : `${Math.round(n / 1000)}k`);
export const fmtUsd = (v) => `$${v >= 100 ? Math.round(v) : v.toFixed(2)}`;
const KPIS = [['tasks', 'clipboard'], ['read', 'file'], ['edit', 'pencil'], ['cmd', 'terminal'], ['cost', 'coin']];   // labels: activity.kpi.<key>
const KPI_TYPES = { read: ['read'], edit: ['edit', 'create', 'delete'], cmd: ['bash'] };
export function renderHud() {
  const list = [...sessions.values()];
  state.taskAggregator ||= createTaskAggregator();
  const taskStats = state.taskAggregator.getStats(nowMs());
  const waiting = taskStats.waiting || list.filter((s) => s.status === 'wait').length;
  const subCount = list.reduce((a, s) => a + (s.subs?.length || 0), 0);
  $('active-count').textContent = list.length ? tr('activity.sessions', { n: list.length }) + (subCount ? ` · ${tr('activity.subsRunning', { n: subCount })}` : '') : tr('activity.noSessions');
  $('feed-stats').replaceChildren(...KPIS.map(([k, ic]) => {
    const label = tr(`activity.kpi.${k}`);
    const d = el('div', k === 'cost' ? 'kpi kpi--cost' : 'kpi'), i = el('span', 'kpi-ic'); i.append(icon(ic));
    const hasCost = list.some((s) => s.usage?.model);
    const running = k === 'tasks' ? taskStats.active : list.filter((s) => s.status === 'work' && (KPI_TYPES[k] || []).includes(s.last?.type)).length;
    const value = k === 'cost' ? (hasCost ? fmtUsd(list.reduce((a, s) => a + (s.usage?.model ? s.usage.cost || 0 : 0), 0)) : '—') : num(running);
    if (k !== 'cost') d.classList.toggle('kpi--run', running > 0);
    if (k === 'tasks' && !running && waiting) d.classList.add('kpi--wait');
    const b = el('b', null, value);
    if (k === 'cost' && hasCost) b.prepend(el('small', null, '≈'));
    d.append(i, b, el('span', null, label)); d.title = k === 'cost' ? tr('activity.costTitle') : tr('activity.kpiNow', { label });
    return d;
  }));
  $('bell-dot').hidden = !waiting;
  const yours = waiting + unseenDone.size;
  document.title = yours ? tr('activity.docTitle', { n: yours }) : 'My Office';
}
export function updateMarkers(t) {
  const sel = state.selectedId ? workers.get(state.selectedId) : null;
  selRing.visible = !!sel;
  if (sel) { selRing.position.set(sel.pos.x, 0.03 + sel.gy(), sel.pos.y); selRing.scale.setScalar(1 + Math.sin(t * 4) * 0.06); }
  hoverRing.visible = !!state.hovered && state.hovered !== sel && !!state.hovered.root.parent;
  if (hoverRing.visible) { hoverRing.position.set(state.hovered.pos.x, 0.025 + state.hovered.gy(), state.hovered.pos.y); hoverRing.scale.setScalar(state.hovered.sub ? 0.8 : 1); }
  for (const w of workers.values()) {
    const s = sessions.get(w.id);
    const show = w.root.visible && (!s || s.status !== 'rest' || w.id === state.selectedId || w === state.hovered || w.phase === 'walk');
    if (w.tagObj.visible !== show) w.tagObj.visible = show;
    const wait = s?.status === 'wait';
    if (w.tagEl.classList.contains('tag--wait') !== wait) w.tagEl.classList.toggle('tag--wait', wait);
  }
}

export function setup() {
  /* ---------- UI: activity column, session list, chips ---------- */
  state.stats = {};
  state.feed = [];
  state.taskAggregator = createTaskAggregator();
  if (typeof window !== 'undefined') {
    window.__officeState = state;
    window.__renderFeed = renderFeed;
  }
  state.selectedId = null;
  state.isLocal = false;
  state.hovered = null; state.hoverAt = 0;
  toastEl = $('toast');
  $('type-chips').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-k]'); if (!b) return;
    if (typeFilter.has(b.dataset.k)) typeFilter.delete(b.dataset.k); else typeFilter.add(b.dataset.k);
    b.setAttribute('aria-pressed', String(typeFilter.has(b.dataset.k))); renderFeed();
  });
  $('feed-list').addEventListener('click', (ev) => {
    const im = ev.target.closest('[data-img]');
    if (im) { const b = im.closest('[data-sess]'); openImage(im.dataset.img, im.dataset.name, (b && sessions.get(b.dataset.sess)?.name) || ''); return; }
    const b = ev.target.closest('[data-sess]'); if (b) openFromRow(b);
  });
  $('flt-all').addEventListener('click', () => setFilter('all'));
  $('flt-att').addEventListener('click', () => setFilter('att'));
  try { restCollapsed = localStorage.getItem('office-rest-folded') === '1'; } catch { /* storage blocked */ }
  grpEls = Object.fromEntries(GROUPS.map(([k]) => {
    const li = el('li', 'grp'); li.dataset.g = k;
    const b = el('button', 'grp-btn'); b.type = 'button'; b.dataset.g = k;
    const n = el('b'); b.append(el('span', null, tr(`activity.group.${k}`)), n);
    if (k === 'rest') { const ch = el('span', 'grp-chev'); ch.append(icon('chevron')); b.append(ch); } else b.disabled = true;
    li.append(b); return [k, { li, b, n }];
  }));
  $('rail-list').addEventListener('click', onListClick);
  $('chips').addEventListener('click', onListClick);
  $('sess-search').addEventListener('input', (e) => { query = e.target.value; renderRail(); });
  document.querySelector('.st-row').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-st]'); if (!b) return;
    railFilter = railFilter === b.dataset.st ? null : b.dataset.st;
    for (const x of document.querySelectorAll('.st')) x.setAttribute('aria-pressed', String(x.dataset.st === railFilter));
    renderRail();
  });
  // running timers tick every second without re-rendering the list
  setInterval(() => { for (const [id, r] of railRows) { const s = sessions.get(id); if (s && s.status !== 'rest') r.time.textContent = metaTime(s); } }, 1000);
}
