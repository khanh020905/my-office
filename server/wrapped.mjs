// The week in review ("Wrapped"): totals over the last seven days, read from the office's own replay logs (they keep a
// week). How long the agents worked and how long they waited for you, what they did, what it would have cost on the API,
// the busiest project and day, commits and pushes. Computed on request and kept for five minutes.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const WORK = new Set(['think', 'read', 'edit', 'shell', 'web', 'agent']), WAIT = new Set(['wait', 'turn']);
const STAT_KEYS = ['prompts', 'edit', 'read', 'cmd', 'web', 'deploy'];
const dayName = (d) => new Date(`${d}T12:00:00`).getDay();
let cache = null;

async function readDay(file) {
  const items = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  try { for await (const line of rl) { if (!line) continue; try { items.push(JSON.parse(line)); } catch { /* a line still being written */ } } }
  catch { /* the file went away */ }
  finally { rl.close(); }
  return items;
}
// total length of a set of [a, b] intervals, overlaps counted once
function unionMs(list) {
  let total = 0, end = -Infinity;
  for (const [a, b] of list.sort((x, y) => x[0] - y[0])) { if (b <= end) continue; total += b - Math.max(a, end); end = b; }
  return total;
}

/** @param {{ replayDir: string, buildTimeline: Function, days?: number }} o */
export async function weekSummary({ replayDir, buildTimeline, days = 7 }) {
  if (cache && Date.now() - cache.at < 5 * 60e3) return cache.data;
  const files = (await fs.promises.readdir(replayDir).catch(() => [])).filter((n) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).sort().slice(-days);
  const perDay = [], projects = new Map(), costs = new Map(), names = new Set();
  const out = { from: null, to: null, days: files.length, hoursSum: 0, hoursWall: 0, waitHours: 0, stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])), commits: 0, pushes: 0, longestMin: 0 };
  for (const f of files) {
    const day = f.slice(0, 10), from = new Date(`${day}T00:00:00`).getTime(), to = from + 864e5;
    const items = await readDay(path.join(replayDir, f));
    if (!items.length) continue;
    out.from ??= day; out.to = day;
    const dirOf = new Map(), max = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
    for (const { m } of items) {
      const list = m.k === 'snap' ? m.sessions || [] : m.s ? [m.s] : [];
      for (const s of list) { if (s.dir) dirOf.set(s.id, s.dir); if (s.name) names.add(s.name); if (s.usage?.cost) costs.set(s.name || s.id, Math.max(costs.get(s.name || s.id) || 0, s.usage.cost)); }
      if (m.stats) for (const k of STAT_KEYS) max[k] = Math.max(max[k], m.stats[k] || 0);
      if (m.k === 'ev' && m.e?.type === 'commit') out.commits++;
      if (m.k === 'ev' && m.e?.type === 'push') out.pushes++;
    }
    for (const k of STAT_KEYS) out.stats[k] += max[k];
    const tl = buildTimeline(items, from, Math.min(to, Date.now()));
    let sum = 0, wait = 0; const work = [];
    for (const r of tl.rows) {
      if (r.agent) continue;   // a subagent's time is already its session's
      let mine = 0, run = 0, runEnd = 0;
      for (const [a, b, kind] of r.spans) {
        if (WORK.has(kind)) {
          mine += b - a; work.push([a, b]);
          run = a - runEnd < 60e3 ? run + (b - a) : b - a; runEnd = b; out.longestMin = Math.max(out.longestMin, Math.round(run / 60e3));
        } else if (WAIT.has(kind)) wait += Math.min(b - a, 30 * 60e3);
      }
      sum += mine;
      const dir = dirOf.get(r.sess) || r.name, proj = path.basename(String(dir).replace(/^~/, '')) || r.name;
      projects.set(proj, (projects.get(proj) || 0) + mine);
    }
    const wall = unionMs(work);
    out.hoursSum += sum / 36e5; out.hoursWall += wall / 36e5; out.waitHours += wait / 36e5;
    perDay.push({ day, weekday: dayName(day), hours: Math.round((sum / 36e5) * 10) / 10, prompts: max.prompts });
  }
  const top = [...projects].sort((a, b) => b[1] - a[1]);
  const busiest = [...perDay].sort((a, b) => b.hours - a.hours)[0] || null;
  const data = {
    ...out,
    hoursSum: Math.round(out.hoursSum * 10) / 10, hoursWall: Math.round(out.hoursWall * 10) / 10, waitHours: Math.round(out.waitHours * 10) / 10,
    cost: Math.round([...costs.values()].reduce((a, b) => a + b, 0) * 100) / 100,
    sessions: names.size,
    projects: top.slice(0, 5).map(([name, ms]) => ({ name, hours: Math.round((ms / 36e5) * 10) / 10 })),
    busiest, perDay,
  };
  cache = { at: Date.now(), data };
  return data;
}
