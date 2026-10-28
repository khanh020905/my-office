// The director's trophy shelf: all-time totals and the milestones they reach.
// Totals live in data/totals.json and count from the first run on. That first run also tallies the history already in
// Claude Code's transcripts, once, in the background: a regex over the raw lines (no JSON parsing), tool calls counted
// once each by id, a pause between files so the Mac barely notices (~15 s for 7 GB on an M1 Pro).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createT } from '../src/i18n/index.js';

// k: which total; n: the threshold; tier 1–3 = bronze, silver, gold. 'open' is the day the office opened. Names are made
// in pub(), in the office's language at the time they are sent (trophies.<k>).
export const MILESTONES = [
  { id: 'open', k: 'open', n: 1, kind: 'plaque', tier: 3 },
  { id: 'p100', k: 'prompts', n: 100, kind: 'cup', tier: 1 },
  { id: 'p1k', k: 'prompts', n: 1000, kind: 'cup', tier: 2 },
  { id: 'p10k', k: 'prompts', n: 10000, kind: 'cup', tier: 3 },
  { id: 'e1k', k: 'edit', n: 1000, kind: 'cup', tier: 1 },
  { id: 'e10k', k: 'edit', n: 10000, kind: 'cup', tier: 2 },
  { id: 'e100k', k: 'edit', n: 100000, kind: 'cup', tier: 3 },
  { id: 'c1k', k: 'cmd', n: 1000, kind: 'star', tier: 1 },
  { id: 'c10k', k: 'cmd', n: 10000, kind: 'star', tier: 2 },
  { id: 'c100k', k: 'cmd', n: 100000, kind: 'star', tier: 3 },
  { id: 'r1k', k: 'read', n: 1000, kind: 'book', tier: 1 },
  { id: 'r10k', k: 'read', n: 10000, kind: 'book', tier: 2 },
  { id: 'r100k', k: 'read', n: 100000, kind: 'book', tier: 3 },
  { id: 'd1', k: 'deploy', n: 1, kind: 'rocket', tier: 1 },
  { id: 'd10', k: 'deploy', n: 10, kind: 'rocket', tier: 2 },
  { id: 'd100', k: 'deploy', n: 100, kind: 'rocket', tier: 3 },
  { id: 's10', k: 'sessions', n: 10, kind: 'medal', tier: 1 },
  { id: 's100', k: 'sessions', n: 100, kind: 'medal', tier: 2 },
  { id: 's1k', k: 'sessions', n: 1000, kind: 'medal', tier: 3 },
  { id: 'days7', k: 'days', n: 7, kind: 'medal', tier: 1 },
  { id: 'days30', k: 'days', n: 30, kind: 'medal', tier: 2 },
  { id: 'days100', k: 'days', n: 100, kind: 'medal', tier: 3 },
];
const KEYS = ['prompts', 'edit', 'read', 'cmd', 'web', 'deploy', 'sessions', 'days'];
const TOOL_OF = { Read: 'read', NotebookRead: 'read', Grep: 'read', Glob: 'read', Edit: 'edit', MultiEdit: 'edit', Write: 'edit', NotebookEdit: 'edit', Bash: 'cmd', WebSearch: 'web', WebFetch: 'web' };
const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {{ dataDir: string, claudeDir: string, today: () => string, deployRe: RegExp, onChange: (pub: object, earned: string[]) => void,
 *   tr?: (key: string, vars?: object) => string, num?: (n: number) => string }} o  tr / num: the office's language (English if left out)
 */
export function createTrophies({ dataDir, claudeDir, today, deployRe, onChange, tr = createT('en'), num = createT('en').num }) {
  const file = path.join(dataDir, 'totals.json');
  let t;
  try { t = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { t = null; }
  if (!t || typeof t !== 'object') t = { since: Date.now(), live: {}, hist: null, lastDay: '', sids: [], earned: {} };
  for (const k of KEYS) t.live[k] ||= 0;
  t.earned ||= {}; t.sids ||= [];
  let dirty = !fs.existsSync(file), notifyAt = 0;

  const total = (k) => (k === 'open' ? 1 : (t.live[k] || 0) + (t.hist?.[k] || 0));
  const nameOf = (m) => (m.id === 'open' ? tr('trophies.open') : m.id === 'd1' ? tr('trophies.firstDeploy') : tr(`trophies.${m.k}`, { n: num(m.n) }));
  const pub = () => ({ since: t.since, scanned: !!t.hist, totals: Object.fromEntries(KEYS.map((k) => [k, total(k)])), earned: t.earned, defs: MILESTONES.map((m) => ({ ...m, name: nameOf(m) })) });
  function check(quiet = false, send = true) {
    const fresh = [];
    for (const m of MILESTONES) if (!t.earned[m.id] && total(m.k) >= m.n) { t.earned[m.id] = m.id === 'open' ? t.since : Date.now(); fresh.push(m.id); dirty = true; }
    if (send && (fresh.length || Date.now() > notifyAt)) { notifyAt = Date.now() + 15_000; onChange(pub(), quiet ? [] : fresh); }
  }
  function bump(k, n = 1) {
    t.live[k] = (t.live[k] || 0) + n; dirty = true;
    const d = today(); if (t.lastDay !== d) { t.lastDay = d; t.live.days++; }
    check();
  }
  // a session counts once, the first time you give it a task
  function session(sid) {
    if (!sid || t.sids.includes(sid)) return;
    t.sids.push(sid); if (t.sids.length > 2000) t.sids = t.sids.slice(-2000);
    bump('sessions');
  }
  async function scanHistory() {
    if (t.hist) return;
    const root = path.join(claudeDir, 'projects'), files = [];
    async function walk(d) { let list = []; try { list = await fsp.readdir(d, { withFileTypes: true }); } catch { return; } for (const e of list) { const p = path.join(d, e.name); if (e.isDirectory()) await walk(p); else if (e.name.endsWith('.jsonl')) files.push(p); } }
    await walk(root);
    const c = Object.fromEntries(KEYS.map((k) => [k, 0])), ids = new Set(), days = new Set(), seen = [];
    const toolRe = /"type":"tool_use","id":"([^"]*)","name":"(\w+)"(,"input":\{"command":"((?:[^"\\]|\\.){0,400}))?/g;
    const promptKey = '"type":"user","message":{"role":"user","content":"', dayRe = /"timestamp":"(\d{4}-\d{2}-\d{2})T/g;
    for (const f of files) {
      const sub = f.includes(`${path.sep}subagents${path.sep}`);
      let prompts = 0, rest = '';
      await new Promise((res) => {
        const st = fs.createReadStream(f, { encoding: 'utf8', highWaterMark: 1 << 20 });
        st.on('data', (chunk) => {
          let text = rest + chunk; const cut = text.lastIndexOf('\n');
          if (cut < 0) { rest = text.length > 64 << 20 ? '' : text; return; }   // a giant line: skip it rather than hold it
          rest = text.slice(cut + 1); text = text.slice(0, cut + 1);
          for (const m of text.matchAll(toolRe)) {
            const h = fnv(m[1]); if (ids.has(h)) continue; ids.add(h);
            const k = TOOL_OF[m[2]]; if (k) c[k]++;
            if (m[4] && deployRe.test(m[4])) c.deploy++;
          }
          if (!sub) { let i = 0; while ((i = text.indexOf(promptKey, i)) >= 0) { prompts++; i += promptKey.length; } }
          for (const m of text.matchAll(dayRe)) days.add(m[1]);
        });
        st.on('end', res); st.on('error', res);
      });
      if (!sub) { c.prompts += prompts; if (prompts) { c.sessions++; seen.push(path.basename(f, '.jsonl')); } }
      await pause(4);
    }
    c.days = days.size;
    // the transcripts already hold everything counted live so far: start the live counters again from here
    t.hist = c; t.live = Object.fromEntries(KEYS.map((k) => [k, 0])); t.lastDay = today();
    t.sids = [...new Set([...t.sids, ...seen])].slice(-2000); dirty = true;
    check(true);
  }
  setInterval(() => { if (!dirty) return; dirty = false; fsp.writeFile(file, JSON.stringify(t)).catch(() => {}); }, 10_000).unref();
  setTimeout(() => { scanHistory().catch(() => {}); }, 5_000).unref();
  check(true, false);   // the server isn't listening yet
  return { bump, session, pub };
}
