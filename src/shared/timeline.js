// Timeline: turns the office's replay log into spans per session (and per subagent). Shared by the server
// (/api/timeline) and the page (demo mode). Input: replay items [{ t, m }] in time order, where m is what the office
// streamed: 'snap' (all sessions), 'ev' (one event), 'sess' (a session changed), 'stats' (a tool finished), 'gone'.
// A span lasts until the next thing that happens to that row; a tool span ends when the tool finishes (Claude is
// thinking again). "Your turn" spans count at most 30 minutes each toward the waiting total.
// The data carries no words: the page names the kinds (timeline.kind.<kind>) and a subagent row without a name (name '')
// in its own language, so the server can import this file as it is.

export const KINDS = ['think', 'read', 'edit', 'shell', 'web', 'agent', 'wait', 'turn', 'idle'];
const OF_TYPE = { prompt: 'think', plan: 'think', other: 'think', compact: 'think', skill: 'read', read: 'read', grep: 'read', glob: 'read',
  edit: 'edit', write: 'edit', bash: 'shell', web: 'web', fetch: 'web', mcp: 'web', agent: 'agent', wait: 'wait', ask: 'wait',
  stop: 'turn', idle: 'turn', interrupt: 'turn' };
const TOOL = new Set(['read', 'edit', 'shell', 'web', 'agent']);
export const TURN_CAP = 30 * 60e3;

export function buildTimeline(items, from, to) {
  // Rows are keyed by session name: the office gives a session a new id each time it restarts, the name stays.
  const rows = new Map(), nameOf = new Map();
  const keyOf = (sess) => nameOf.get(sess) || sess;
  const row = (sess, agent, name) => {
    if (name && !agent) nameOf.set(sess, name);
    const key = agent ? `${keyOf(sess)}|${agent}` : keyOf(sess);
    let r = rows.get(key);
    if (!r) rows.set(key, (r = { key, sess, agent: agent || null, name: name || (agent ? '' : 'claude'), spans: [], marks: [], cur: null, desk: -1 }));
    else { r.sess = sess; if (name && !agent) r.name = name; }
    return r;
  };
  const close = (r, t) => {
    if (!r.cur) return;
    const s = Math.max(r.cur.s, from), e = Math.min(t, to);
    if (e > s) {
      const last = r.spans.at(-1);
      if (last && last[2] === r.cur.kind && last[1] === s && last[3] === r.cur.label) last[1] = e;   // merge repeats
      else r.spans.push([s, e, r.cur.kind, r.cur.label || '']);
    }
    r.cur = null;
  };
  const open = (r, t, kind, label = '') => { if (r.cur && r.cur.kind === kind && r.cur.label === label) return; close(r, t); r.cur = { kind, s: t, label }; };
  const mark = (r, t, kind, label = '') => { if (t >= from && t <= to) r.marks.push([t, kind, label]); };

  for (const { t, m } of items) {
    if (!m || t > to) continue;
    if (m.k === 'snap') {
      const ids = new Set();
      for (const s of m.sessions || []) {
        ids.add(s.id);
        const r = row(s.id, null, s.name); r.desk = s.desk ?? r.desk; ids.add(r.key); if (s.title) r.title = s.title;
        if (!r.cur) open(r, t, s.status === 'work' ? 'think' : s.status === 'wait' ? 'wait' : s.lastPrompt ? 'turn' : 'idle');
        for (const x of s.subs || []) { const sr = row(s.id, x.id, `${x.type}${x.desc ? ' · ' + x.desc : ''}`); if (!sr.cur) open(sr, t, x.last ? OF_TYPE[x.last.type] || 'think' : 'think'); }
      }
      for (const r of rows.values()) if (r.cur && !ids.has(r.agent ? r.key.slice(0, r.key.lastIndexOf('|')) : r.key)) close(r, t);
    } else if (m.k === 'ev' && m.e) {
      const e = m.e, name = m.s?.name || e.name;
      if (m.s && !e.agent) { const r0 = row(e.sess, null, name); r0.desk = m.s.desk ?? -1; if (m.s.title) r0.title = m.s.title; }
      if (e.type === 'substart') { const sr = row(e.sess, e.agent, e.label || ''); open(sr, t, 'think'); continue; }
      if (e.type === 'substop') { const sr = rows.get(`${keyOf(e.sess)}|${e.agent}`); if (sr) { if (e.desc) sr.name = [e.label || sr.name, e.desc].filter(Boolean).join(' · '); close(sr, t); } continue; }
      if (e.agent) { const sr = row(e.sess, e.agent, e.agentType || ''); if (e.type === 'fail') mark(sr, t, 'fail', e.label); else open(sr, t, OF_TYPE[e.type] || 'think', e.label); continue; }
      const r = row(e.sess, null, name);
      if (e.type === 'start') { if (!r.cur) open(r, t, 'idle'); mark(r, t, 'start'); }
      else if (e.type === 'end') { close(r, t); mark(r, t, 'end'); }
      else if (e.type === 'fail' || e.type === 'deploy') mark(r, t, e.type, e.label);
      else { if (e.type === 'prompt') mark(r, t, 'prompt', e.label); open(r, t, OF_TYPE[e.type] || 'think', e.label); }
    } else if (m.k === 'stats' && m.s) {
      // a tool finished: back to thinking (only the main agent's tools; subagents report their own)
      if (m.s.name) nameOf.set(m.s.id, m.s.name);
      const r = rows.get(m.post && m.post !== 'main' ? `${keyOf(m.s.id)}|${m.post}` : keyOf(m.s.id));
      if (r?.cur && TOOL.has(r.cur.kind)) open(r, t, 'think');
    } else if (m.k === 'sess' && m.s) {
      const r = row(m.s.id, null, m.s.name), st = m.s.status, k = r.cur?.kind;
      if (m.s.title) r.title = m.s.title;
      if (st === 'wait' && k !== 'wait') open(r, t, 'wait');
      else if (st === 'work' && (k === 'wait' || k === 'idle' || k === 'turn' || !k)) open(r, t, 'think');
      else if (st === 'rest' && k && k !== 'turn' && k !== 'idle') open(r, t, 'turn');
    } else if (m.k === 'gone') {
      const k = keyOf(m.id);
      for (const r of rows.values()) if (r.key === k || r.key.startsWith(k + '|')) close(r, t);
    }
  }
  const end = Math.min(to, Date.now());
  for (const r of rows.values()) close(r, end);

  const sum = (r, kinds, cap = Infinity) => r.spans.reduce((a, [s, e, k]) => a + (kinds.includes(k) ? Math.min(e - s, cap) : 0), 0);
  const WORK = ['think', 'read', 'edit', 'shell', 'web', 'agent'];
  const out = [...rows.values()]
    .filter((r) => r.spans.some((x) => x[2] !== 'idle' && x[2] !== 'turn') || r.marks.some((x) => x[1] === 'prompt'))
    .map(({ cur, ...r }) => ({ ...r, totals: { work: sum(r, WORK), wait: sum(r, ['wait']), turn: sum(r, ['turn'], TURN_CAP), prompts: r.marks.filter((x) => x[1] === 'prompt').length } }));
  // sessions first (by first activity), each followed by its subagents
  const first = (r) => r.spans.find((x) => x[2] !== 'idle' && x[2] !== 'turn')?.[0] ?? r.spans[0]?.[0] ?? to;
  const mains = out.filter((r) => !r.agent).sort((a, b) => first(a) - first(b));
  const ordered = [];
  const parent = (x) => x.key.slice(0, x.key.lastIndexOf('|'));
  for (const r of mains) { ordered.push(r); ordered.push(...out.filter((x) => x.agent && parent(x) === r.key).sort((a, b) => first(a) - first(b))); }
  for (const r of out) if (r.agent && !mains.some((x) => x.key === parent(r))) ordered.push(r);
  const totals = { work: 0, wait: 0, turn: 0, prompts: 0 };
  for (const r of ordered) if (!r.agent) for (const k of Object.keys(totals)) totals[k] += r.totals[k];
  return { from, to, rows: ordered, totals };
}
