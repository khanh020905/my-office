// What eats the plan ("Ăn gói"): a small OpenTelemetry receiver. Claude Code exports its cost and token counters
// (metrics) and its api_request events (logs) as OTLP/HTTP JSON to /v1/metrics and /v1/logs on this server (loopback
// only: server/index.mjs); they are summed per local day, per session and per attribution (model, query source,
// subagent type, skill, plugin, MCP server) in data/otel/, the last 30 days kept. Only those few attributes are read:
// prompts, commands, tool input and e-mail addresses never reach the disk (series are told apart by a hash).
// Attribute names and their meaning: code.claude.com/docs/en/monitoring-usage (cost and token counters, api_request).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DIMS, addTo, summarize, zero } from '../src/shared/burn.js';

export { DIMS, summarize, projectOf } from '../src/shared/burn.js';

export const COST = 'claude_code.cost.usage', TOKENS = 'claude_code.token.usage';
// (the attribute behind each dimension, in DIMS order: see src/shared/burn.js)
const ATTR = { model: 'model', source: 'query_source', agent: 'agent.name', skill: 'skill.name', plugin: 'plugin.name', mcp: 'mcp_server.name' };
// A sum: [usd, input, output, cache read, cache write, requests]. The token counter's `type` says which slot.
const SLOT = { input: 1, output: 2, cacheRead: 3, cacheCreation: 4 };
const READ = new Set(['session.id', 'type', 'event.name', 'event.timestamp', 'event.sequence', 'cost_usd', 'cost_usd_micros', 'input_tokens',
  'output_tokens', 'cache_read_tokens', 'cache_creation_tokens', 'agent_id', ...Object.values(ATTR)]);
const EVENTS = new Set(['api_request', 'api_error', 'user_prompt']);
// OTLP's AggregationTemporality, as a number (the JSON encoding's rule) or its name (some encoders)
const TEMPORALITY = { 1: 'delta', 2: 'cumulative', AGGREGATION_TEMPORALITY_DELTA: 'delta', AGGREGATION_TEMPORALITY_CUMULATIVE: 'cumulative' };
const DAY_MS = 86400e3;
// caps, so a runaway exporter can't grow memory or the disk: sessions in a day, sums in a session, series remembered
const MAX_DAY_SESSIONS = 500, MAX_SUMS = 150, MAX_SESSIONS = 3000, MAX_SERIES = 20000, MAX_SEEN = 5000;

const arr = (x) => (Array.isArray(x) ? x : []);
const clean = (s) => String(s ?? '').replace(/[\t\n\r\u0000-\u001f]/g, ' ').trim().slice(0, 80);
/** A local calendar day, "2026-10-31" (the Mac's own time zone: "today" is the user's today). */
export const dayKey = (ms) => new Date(ms).toLocaleDateString('sv-SE');

// An attribute's value (OTLP AnyValue); arrays, maps and bytes are never among the attributes read here.
function anyValue(v) {
  if (!v || typeof v !== 'object') return undefined;
  if ('stringValue' in v) return String(v.stringValue ?? '');
  if ('intValue' in v) return Number(v.intValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('boolValue' in v) return !!v.boolValue;
  return undefined;
}
// the attributes the office reads, from the resource's and then the record's own (the record's win)
function pick(...lists) {
  const o = {};
  for (const list of lists) for (const a of arr(list)) if (a && READ.has(a.key)) { const v = anyValue(a.value); if (v !== undefined) o[a.key] = typeof v === 'string' ? clean(v) : v; }
  return o;
}
// A series is its metric, resource and every attribute of the point (two efforts of one model are two series): a hash of
// them all, so nothing they hold (an e-mail address) is kept, and two series are never mixed up.
function seriesOf(name, res, attrs) {
  const flat = (list) => arr(list).map((a) => `${a?.key}=${JSON.stringify(a?.value ?? null)}`).sort().join('\u0001');
  return crypto.createHash('sha1').update(`${name}\u0002${flat(res)}\u0002${flat(attrs)}`).digest('base64url').slice(0, 18);
}
/** OTLP times are nanoseconds since 1970: a decimal string (proto3 JSON's int64), a number, or { low, high }. */
export function nanosToMs(v) {
  if (typeof v === 'string' && /^\d+$/.test(v)) return v.length > 6 ? Number(v.slice(0, -6)) : 0;
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.floor(v / 1e6);
  if (v && typeof v === 'object' && 'low' in v) return Math.floor(((Number(v.high) >>> 0) * 2 ** 32 + (Number(v.low) >>> 0)) / 1e6);
  return 0;
}
const timeId = (v) => (v && typeof v === 'object' ? `${v.high}:${v.low}` : String(v ?? ''));

/** The cost and token data points of an ExportMetricsServiceRequest (other metrics are left alone). */
export function parseMetrics(body) {
  const out = [];
  for (const rm of arr(body?.resourceMetrics)) {
    const res = rm?.resource?.attributes;
    for (const sm of [...arr(rm?.scopeMetrics), ...arr(rm?.instrumentationLibraryMetrics)]) {   // (the second: OTLP before 0.15)
      for (const m of arr(sm?.metrics)) {
        if ((m?.name !== COST && m?.name !== TOKENS) || !m.sum) continue;   // (both are counters, a Sum: never a gauge)
        const temporality = TEMPORALITY[m.sum.aggregationTemporality] || 'delta';   // (unset: Claude Code's default is delta)
        for (const p of arr(m.sum.dataPoints)) {
          const value = Number(p?.asDouble ?? p?.asInt);
          if (!Number.isFinite(value) || value < 0) continue;
          out.push({ name: m.name, temporality, start: timeId(p.startTimeUnixNano), end: nanosToMs(p.timeUnixNano), endId: timeId(p.timeUnixNano),
            value, attrs: pick(res, p.attributes), series: seriesOf(m.name, res, p.attributes) });
        }
      }
    }
  }
  return out;
}
/** The events the office counts (api_request, api_error, user_prompt) of an ExportLogsServiceRequest. */
export function parseLogs(body) {
  const out = [];
  for (const rl of arr(body?.resourceLogs)) {
    const res = rl?.resource?.attributes;
    for (const sl of [...arr(rl?.scopeLogs), ...arr(rl?.instrumentationLibraryLogs)]) {
      for (const r of arr(sl?.logRecords)) {
        const attrs = pick(res, r?.attributes);
        const name = String(attrs['event.name'] || (typeof r?.body?.stringValue === 'string' ? r.body.stringValue : '')).replace(/^claude_code\./, '');
        if (!EVENTS.has(name)) continue;
        const at = Date.parse(String(attrs['event.timestamp'] || '')) || nanosToMs(r.timeUnixNano) || nanosToMs(r.observedTimeUnixNano);
        out.push({ name, at, attrs, id: `${attrs['session.id'] || ''}|${attrs['event.sequence'] ?? ''}|${attrs['event.timestamp'] || timeId(r.timeUnixNano)}|${name}` });
      }
    }
  }
  return out;
}

// The counters' query_source is main / subagent / auxiliary; the api_request event's is finer ("repl_main_thread",
// "compact", a subagent's name): brought to the same three, so a session read from its events sorts the same way.
export function sourceOf(attrs, fromEvent = false) {
  const q = String(attrs.query_source || '');
  if (!fromEvent || ['main', 'subagent', 'auxiliary'].includes(q)) return q || 'main';
  if (attrs['agent.name'] || attrs.agent_id) return 'subagent';
  return /main_thread|^sdk|^main/.test(q) ? 'main' : 'auxiliary';
}
const keyOf = (attrs, fromEvent) => DIMS.map((d) => (d === 'source' ? sourceOf(attrs, fromEvent) : clean(attrs[ATTR[d]]))).join('\t');
/**
 * The receiver's memory: the day sums, the sessions seen, and what tells a new value from one already counted.
 * @param {{ dir: string, keepDays?: number, now?: () => number, cwdOf?: (sid: string) => string, autoSave?: boolean }} o
 */
export function createOtel({ dir, keepDays = 30, now = () => Date.now(), cwdOf = () => '', autoSave = true }) {
  const STATE = path.join(dir, 'state.json'), dayFile = (k) => path.join(dir, `${k}.json`);
  const days = new Map(), dirtyDays = new Set();
  let st = { v: 1, sess: {}, cum: {}, anonAt: 0, lastM: 0, lastL: 0 }, dirty = false;
  const seen = new Map();   // delta series -> the windows already counted (an exporter's retry sends the same one again)
  const seenEvents = new Map();   // event id -> when (the same, for the logs)
  try { const j = JSON.parse(fs.readFileSync(STATE, 'utf8')); if (j?.v === 1) st = { ...st, ...j }; } catch { /* first run */ }
  try {
    const oldest = dayKey(now() - keepDays * DAY_MS);
    for (const f of fs.readdirSync(dir)) {
      const k = f.replace(/\.json$/, '');
      if (!/^\d{4}-\d\d-\d\d$/.test(k) || k < oldest) continue;
      try { days.set(k, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); } catch { /* half written: lost */ }
    }
  } catch { /* no folder yet */ }

  const asked = new Map();   // sid -> when its folder was last asked for (once a minute at most)
  function session(sid, at) {
    let s = st.sess[sid];
    if (!s) {
      const ids = Object.keys(st.sess);
      if (ids.length >= MAX_SESSIONS) delete st.sess[ids.reduce((a, b) => ((st.sess[a].l || 0) <= (st.sess[b].l || 0) ? a : b))];
      s = st.sess[sid] = { f: at, l: at, cwd: '', m: false };
    }
    if (at > s.l) s.l = at;
    if (!s.cwd && sid !== '-' && sid !== '~' && now() - (asked.get(sid) || 0) > 60e3) { asked.set(sid, now()); try { s.cwd = String(cwdOf(sid) || ''); } catch { /* unknown */ } }
    dirty = true;
    return s;
  }
  // a session's record in a day; past the day's cap, the overflow's ('~', still counted, its own ledgers)
  function slot(at, sid) {
    const k = dayKey(at || now());
    let d = days.get(k);
    if (!d) days.set(k, (d = { s: {} }));
    dirtyDays.add(k);
    if (!d.s[sid] && Object.keys(d.s).length >= MAX_DAY_SESSIONS) sid = '~';
    if (sid === '~') session('~', at);
    return { x: (d.s[sid] ||= { m: {}, e: {} }), key: sid };
  }
  function add(led, key, v) {
    if (!led[key] && Object.keys(led).length >= MAX_SUMS) key = key.split('\t').map((x, i) => (i < 2 ? x : '')).join('\t');   // (too many: the model and source kept)
    led[key] = addTo(led[key] || zero(), v);
  }

  // A delta point is what happened in its window: added as it is, once (a window already seen is a retry). A cumulative
  // point is the total since its start time: the increase over the last value of the same series is new; a new start
  // time (the process started again) or a smaller value (a reset) begins again from zero, so the whole value is new.
  function metric(p) {
    let inc = p.value;
    if (p.temporality === 'cumulative') {
      const c = st.cum[p.series];
      if (c && c.s === p.start && p.value >= c.v) inc = p.value - c.v;
      st.cum[p.series] = { s: p.start, v: p.value, t: now() };
    } else {
      const w = `${p.start}-${p.endId}`, s = seen.get(p.series) || [];
      if (s.includes(w)) return 0;
      s.push(w); if (s.length > 16) s.shift();
      seen.delete(p.series); seen.set(p.series, s);   // (the newest last: the oldest go first when full)
      if (seen.size > MAX_SEEN) seen.delete(seen.keys().next().value);
    }
    if (!(inc > 0)) return 0;
    const sid = p.attrs['session.id'] || '-', at = p.end || now(), v = zero();
    if (p.name === COST) v[0] = inc;
    else { const i = SLOT[p.attrs.type]; if (!i) return 0; v[i] = inc; }
    if (sid === '-') st.anonAt = now();
    session(sid, at).m = true;
    const { x, key } = slot(at, sid);
    st.sess[key].m = true;
    add(x.m, keyOf(p.attrs, false), v);
    return 1;
  }
  function event(e) {
    if (seenEvents.has(e.id)) return 0;
    seenEvents.set(e.id, now());
    if (seenEvents.size > MAX_SEEN) seenEvents.delete(seenEvents.keys().next().value);
    const a = e.attrs, sid = a['session.id'] || '-', at = e.at || now();
    session(sid, at);
    const { x } = slot(at, sid);
    if (e.name === 'api_error') { x.err = (x.err || 0) + 1; return 1; }
    if (e.name === 'user_prompt') { x.pr = (x.pr || 0) + 1; return 1; }
    const num = (k) => { const n = Number(a[k]); return Number.isFinite(n) && n > 0 ? n : 0; };
    const usd = a.cost_usd != null ? num('cost_usd') : num('cost_usd_micros') / 1e6;
    x.req = (x.req || 0) + 1;
    add(x.e, keyOf(a, true), [usd, num('input_tokens'), num('output_tokens'), num('cache_read_tokens'), num('cache_creation_tokens'), 1]);
    return 1;
  }
  /** One OTLP/HTTP JSON request: { accepted } (points or events counted). Which kind it is comes from the body. */
  function ingest(body) {
    let accepted = 0;
    if (body?.resourceMetrics) { for (const p of parseMetrics(body)) accepted += metric(p); st.lastM = now(); dirty = true; }
    if (body?.resourceLogs) { for (const e of parseLogs(body)) accepted += event(e); st.lastL = now(); dirty = true; }
    return { accepted };
  }

  function prune() {
    const t = now(), oldest = dayKey(t - keepDays * DAY_MS);
    for (const k of days.keys()) if (k < oldest) { days.delete(k); dirtyDays.delete(k); fsp.rm(dayFile(k), { force: true }).catch(() => {}); }
    for (const [k, c] of Object.entries(st.cum)) if (t - c.t > 10 * DAY_MS) delete st.cum[k];   // (a series that long quiet has ended)
    const cum = Object.keys(st.cum);
    if (cum.length > MAX_SERIES) for (const k of cum.sort((a, b) => st.cum[a].t - st.cum[b].t).slice(0, cum.length - MAX_SERIES)) delete st.cum[k];
    for (const [k, s] of Object.entries(st.sess)) if (t - (s.l || 0) > (keepDays + 1) * DAY_MS) delete st.sess[k];
    for (const [k, at] of seenEvents) if (t - at > 3600e3) seenEvents.delete(k); else break;
  }
  async function save() {
    prune();
    await fsp.mkdir(dir, { recursive: true });
    const write = async (file, obj) => { const tmp = `${file}.tmp`; await fsp.writeFile(tmp, JSON.stringify(obj)); await fsp.rename(tmp, file); };
    for (const k of [...dirtyDays]) { dirtyDays.delete(k); const d = days.get(k); if (d) await write(dayFile(k), d); }
    if (dirty) { dirty = false; await write(STATE, st); }
  }
  // (on the way out, so the last minute isn't lost)
  function saveSync() {
    try {
      fs.mkdirSync(dir, { recursive: true });
      for (const k of dirtyDays) { const d = days.get(k); if (d) fs.writeFileSync(dayFile(k), JSON.stringify(d)); }
      if (dirty) fs.writeFileSync(STATE, JSON.stringify(st));
      dirtyDays.clear(); dirty = false;
    } catch { /* read-only data */ }
  }
  let saving = null;
  const flush = () => (saving ??= save().catch(() => {}).finally(() => { saving = null; }));
  if (autoSave) setInterval(() => { if (dirty || dirtyDays.size) flush(); }, 15_000).unref();

  /** today, or the last 7 days (today one of them) */
  function report(range = 'today', o = {}) {
    const t = now(), n = range === '7d' ? 7 : 1;
    const keys = Array.from({ length: n }, (_, i) => dayKey(t - (n - 1 - i) * DAY_MS)).filter((k, i, a) => a.indexOf(k) === i);
    const r = summarize(keys.map((k) => [k, days.get(k) || { s: {} }]), st.sess, { anonAt: st.anonAt, at: t, ...o });
    return { range: n === 7 ? '7d' : 'today', days: keys, ...r, lastMetricsAt: st.lastM, lastLogsAt: st.lastL };
  }
  /** the cost since a moment (the start of the plan's week), whole days: for "≈ x % of the week's limit" */
  const usdSince = (ms) => summarize([...days].filter(([k]) => k >= dayKey(ms)), st.sess, { anonAt: st.anonAt, at: now() }).total.usd;
  const info = () => ({ lastMetricsAt: st.lastM, lastLogsAt: st.lastL, sessions: Object.keys(st.sess).length, days: days.size });
  return { ingest, report, usdSince, info, flush, saveSync };
}
