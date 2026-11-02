// What eats the plan, summed: the day rollups of server/otel.mjs turned into the panel's numbers (ui/burn.js). Shared
// by the server (/api/burn) and the page (demo mode), so it imports nothing.
//
// A day rollup is { s: { <session id>: { m, e, req, err, pr } } }: m and e are two ledgers of sums, from the cost and
// token counters (m) and from the api_request events (e), each { <key>: [usd, input, output, cache read, cache write,
// requests] } where the key is the six dimensions below joined by tabs.

// The dimensions a sum is kept by, in this order in its key. Every request has one model and one source, so those two
// always add up to the total; the other four only when the request had one (a subagent, a skill, an MCP tool result…).
export const DIMS = ['model', 'source', 'agent', 'skill', 'plugin', 'mcp'];
const DAY_MS = 86400e3;
export const zero = () => [0, 0, 0, 0, 0, 0];
export const addTo = (sum, v) => { for (let i = 0; i < 6; i++) sum[i] += v[i] || 0; return sum; };
/** A session's project: its folder's name, or for a worktree (<repo>/.claude/worktrees/<name>) the repository's. */
export const projectOf = (cwd) => { if (!cwd) return ''; const m = /^(.*?)[\\/]\.claude[\\/]worktrees[\\/]/.exec(cwd); return (m ? m[1] : cwd).split(/[\\/]/).filter(Boolean).pop() || ''; };

/**
 * The sums over some days, per session, model, source and attribution. Each session is read from one ledger: its
 * counters ('m') when it sent any, else its api_request events ('e'), so a request is never counted twice. The total is
 * the sum of the sessions by construction (tests/unit/otel.test.mjs checks it holds, and that the models and the sources
 * add up to it too).
 * @param {Array<[string, object]>} days  [dayKey, { s: { sid: { m, e, req, err, pr } } }]
 * @param {Record<string, object>} sess   sid -> { m: has counters, cwd, l: last seen }
 * @param {{ anonAt?: number, at?: number }} [o]
 */
export function summarize(days, sess, { anonAt = 0, at = Date.now() } = {}) {
  const total = zero(), plain = zero(), S = new Map(), by = Object.fromEntries(DIMS.map((d) => [d, new Map()])), perDay = [], R = new Map();
  let req = 0, err = 0, prompts = 0;
  // counters without a session id (a collector of your own that drops it): events can't be told from them, so they
  // stop counting money and only count requests
  const eventsCount = !anonAt || at - anonAt > 8 * DAY_MS;
  for (const [day, d] of days) {
    const models = {};
    let dayUsd = 0;
    for (const [sid, x] of Object.entries(d?.s || {})) {
      const viaM = !!sess[sid]?.m, led = viaM ? x.m : eventsCount ? x.e : null;
      let s = S.get(sid);
      if (!s) S.set(sid, (s = { sid, sum: zero(), req: 0, err: 0, prompts: 0, via: viaM ? 'm' : 'e', models: new Map() }));
      s.req += x.req || 0; s.err += x.err || 0; s.prompts += x.pr || 0;
      req += x.req || 0; err += x.err || 0; prompts += x.pr || 0;
      for (const [k, v] of Object.entries(led || {})) {
        const names = k.split('\t'), w = v;
        addTo(total, w); addTo(s.sum, w);
        DIMS.forEach((dim, i) => { if (!names[i]) return; const m = by[dim]; m.set(names[i], addTo(m.get(names[i]) || zero(), w)); });
        if (!names[2] && !names[3] && !names[4] && !names[5]) addTo(plain, w);
        if (names[1] === 'main' || names[1] === 'subagent') { const rk = `${names[1]}\t${names[0]}`; R.set(rk, addTo(R.get(rk) || zero(), w)); }
        s.models.set(names[0], (s.models.get(names[0]) || 0) + w[0]);
        models[names[0] || '?'] = (models[names[0] || '?'] || 0) + w[0]; dayUsd += w[0];
      }
    }
    perDay.push({ day, usd: dayUsd, models });
  }
  // the share of what: money while there is any, tokens when the costs are all zero (a provider without prices)
  const tokens = (v) => v[1] + v[2] + v[3] + v[4], money = total[0] > 0, weight = (v) => (money ? v[0] : tokens(v)), all = weight(total) || 1;
  const row = (name, v) => ({ name, usd: v[0], tokens: tokens(v), tok: { in: v[1], out: v[2], cacheRead: v[3], cacheWrite: v[4] }, share: weight(v) / all });
  const list = (m) => [...m].map(([name, v]) => row(name, v)).sort((a, b) => b.share - a.share);
  const sessions = [...S.values()].map((s) => {
    const info = sess[s.sid] || {}, cwd = info.cwd || '';
    return { ...row(s.sid, s.sum), sid: s.sid, cwd, project: projectOf(cwd), req: s.req, err: s.err, prompts: s.prompts, via: s.via, last: info.l || 0,
      models: [...s.models].sort((a, b) => b[1] - a[1]).map(([m]) => m).filter(Boolean).slice(0, 3) };
  }).filter((s) => s.usd > 0 || s.tokens > 0 || s.req || s.err || s.prompts).sort((a, b) => b.share - a.share || b.last - a.last);
  const P = new Map();
  for (const s of sessions) { const k = s.project || ''; const p = P.get(k) || { name: k, cwd: s.cwd, sum: zero(), sessions: 0 }; addTo(p.sum, [s.usd, s.tok.in, s.tok.out, s.tok.cacheRead, s.tok.cacheWrite, 0]); p.sessions++; P.set(k, p); }
  const projects = [...P.values()].map((p) => ({ ...row(p.name, p.sum), cwd: p.cwd, sessions: p.sessions })).sort((a, b) => b.share - a.share);
  // who eats it: the named MCP servers, skills, plugins and subagent types, together (a request may have several, so
  // these shares overlap and don't add up to 100 %; what had none of them, `plain`, is Claude's own work)
  const ranked = ['mcp', 'skill', 'plugin', 'agent'].flatMap((kind) => list(by[kind]).map((r) => ({ kind, ...r }))).sort((a, b) => b.share - a.share);
  // the coordinator and its subagents: what each costs on each model (a subagent on Sonnet next to the session on Opus)
  const roles = [...R].map(([k, v]) => { const [role, model] = k.split('\t'); return { role, model, ...row(model, v) }; }).filter((r) => r.usd > 0 || r.tokens > 0).sort((a, b) => b.share - a.share);
  return { money, total: { ...row('', total), req, err, prompts }, plain: row('', plain), roles, by: Object.fromEntries(DIMS.map((d) => [d, list(by[d])])), ranked, sessions, projects, perDay };
}
