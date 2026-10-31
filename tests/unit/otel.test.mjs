// What eats the plan (server/otel.mjs): reading OTLP JSON, counting each request once whatever the temporality, the day
// rollups on disk, and numbers that add up. The fixtures (tests/fixtures/otel, made by make.mjs there) are OTLP/HTTP JSON
// with the attribute names of code.claude.com/docs/en/monitoring-usage; the docs list the names, not a wire sample.
process.env.TZ = 'Asia/Ho_Chi_Minh';   // (the days are local days: one zone for every machine that runs this)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOtel, parseMetrics, parseLogs, nanosToMs, summarize, sourceOf, projectOf, dayKey, DIMS } from '../../server/otel.mjs';

const FIX = path.resolve(import.meta.dirname, '../fixtures/otel');
const fx = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const A = '6f1c2a0e-1b7d-4c55-9a3e-2d8f0b9c1a11', B = '9b2e4d71-3c8a-4f20-8e1d-5a6c7b8d9e22', C = 'c0ffee00-4a4a-4b4b-8c8c-0d0d0e0e0f0f', D = 'd15ea5e0-1111-4222-8333-444455556666';
const CWD = { [A]: '/Users/dev/code/shop-api', [B]: '/Users/dev/code/shop-api/.claude/worktrees/fix-cart', [C]: '/Users/dev/code/landing', [D]: '/Users/dev/code/landing' };
const NOW = Date.parse('2026-10-30T13:30:00Z');
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);
const sumOf = (list, k = 'usd') => list.reduce((a, x) => a + x[k], 0);
function fresh(o = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-otel-'));
  let t = NOW;
  const otel = createOtel({ dir, now: () => t, cwdOf: (sid) => CWD[sid] || '', autoSave: false, ...o });
  return { dir, otel, at: (ms) => { t = ms; }, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
// every way the report can be cut adds up to its total
function reconciles(r) {
  near(sumOf(r.sessions), r.total.usd, 'sessions');
  near(sumOf(r.by.model), r.total.usd, 'models');
  near(sumOf(r.by.source), r.total.usd, 'sources');
  near(sumOf(r.projects), r.total.usd, 'projects');
  near(sumOf(r.perDay), r.total.usd, 'days');
  near(sumOf(r.sessions, 'tokens'), r.total.tokens, 'session tokens');
  if (r.total.usd > 0) near(sumOf(r.sessions, 'share'), 1, 'session shares');
}

test('OTLP JSON: only the cost and token counters, times in ms, the temporality, and no e-mail kept', () => {
  const pts = parseMetrics(fx('metrics-delta-1.json'));
  assert.equal(pts.filter((p) => p.name === 'claude_code.cost.usage').length, 6);
  assert.equal(pts.filter((p) => p.name === 'claude_code.token.usage').length, 24);
  assert.ok(pts.every((p) => p.temporality === 'delta'));
  assert.equal(pts[0].end, Date.parse('2026-10-30T12:01:00Z'));
  assert.ok(pts.every((p) => !JSON.stringify(p).includes('example.com')), 'the e-mail address is never read');
  const gh = pts.find((p) => p.attrs['mcp_server.name'] === 'github' && p.name.endsWith('cost.usage'));
  assert.equal(gh.value, 0.30);
  assert.equal(gh.attrs.model, 'claude-opus-5-5');
  assert.equal(parseMetrics(fx('metrics-cumulative-1.json'))[0].temporality, 'cumulative');
  assert.equal(nanosToMs('1793361600000000000'), 1793361600000);
  assert.equal(nanosToMs(1793361600000000000), 1793361600000);
  assert.equal(nanosToMs({ low: 0, high: 0 }), 0);
  assert.deepEqual(parseMetrics(null), []);
  assert.deepEqual(parseMetrics({ resourceMetrics: 'x' }), []);
});

test('OTLP JSON events: api_request, api_error and user_prompt; prompts never read', () => {
  const evs = parseLogs(fx('logs.json'));
  assert.deepEqual([...new Set(evs.map((e) => e.name))].sort(), ['api_error', 'api_request', 'user_prompt']);
  assert.equal(evs.filter((e) => e.name === 'api_request').length, 7);
  assert.ok(evs.every((e) => !('prompt' in e.attrs) && !('prompt_text' in e.attrs) && !('tool_parameters' in e.attrs)));
  assert.equal(sourceOf({ query_source: 'repl_main_thread' }, true), 'main');
  assert.equal(sourceOf({ query_source: 'Explore', agent_id: 'a3f2' }, true), 'subagent');
  assert.equal(sourceOf({ query_source: 'compact' }, true), 'auxiliary');
  assert.equal(sourceOf({ query_source: 'subagent' }), 'subagent');
});

test('delta counters: each window counted once, a retry is not counted again, the total is the sum of the sessions', () => {
  const { otel, done } = fresh();
  try {
    otel.ingest(fx('metrics-delta-1.json'));
    otel.ingest(fx('metrics-delta-1.json'));   // (the exporter retrying the same request)
    otel.ingest(fx('metrics-delta-2.json'));
    const r = otel.report('today');
    near(r.total.usd, 1.37, 'total');
    near(r.sessions.find((s) => s.sid === A).usd, 1.25, 'session A');
    near(r.sessions.find((s) => s.sid === B).usd, 0.12, 'session B');
    assert.equal(r.total.tok.cacheRead, 40000 + 30000 + 9000 + 3000 + 12000 + 45000);
    reconciles(r);
    const gh = r.ranked.find((x) => x.kind === 'mcp' && x.name === 'github');
    near(gh.share, 0.30 / 1.37, 'github share');
    assert.deepEqual(r.ranked.map((x) => `${x.kind}:${x.name}`), ['mcp:github', 'agent:Explore', 'skill:commit', 'plugin:commit-commands', 'skill:pdf']);
    assert.deepEqual(r.by.model.map((m) => m.name), ['claude-opus-5-5', 'claude-sonnet-5', 'claude-haiku-4-5']);
    // the worktree's session counts for its repository
    assert.deepEqual(r.projects.map((p) => [p.name, p.sessions]), [['shop-api', 2]]);
  } finally { done(); }
});

test('cumulative counters: the increase over the last value, and a new start time counts from zero', () => {
  const { otel, done } = fresh();
  try {
    otel.ingest(fx('metrics-cumulative-1.json'));
    near(otel.report().total.usd, 0.20, 'first value whole');
    otel.ingest(fx('metrics-cumulative-2.json'));
    otel.ingest(fx('metrics-cumulative-2.json'));   // (sent again: nothing new)
    near(otel.report().total.usd, 0.35, 'then only the increase');
    otel.ingest(fx('metrics-cumulative-3.json'));   // (Claude Code started again: a new series start)
    const r = otel.report();
    near(r.total.usd, 0.40, 'restart');
    assert.equal(r.total.tok.in, 1900);
    reconciles(r);
  } finally { done(); }
});

test('counters and events together: a session that sent counters is read from them only, one that sent events only from those', () => {
  const { otel, done } = fresh();
  try {
    otel.ingest(fx('logs.json'));   // (events come every 5 s: before the first counters, they are all there is)
    let r = otel.report();
    near(r.total.usd, 1.12 + 0.40, 'events only');
    assert.equal(r.total.req, 7);
    reconciles(r);
    otel.ingest(fx('metrics-delta-1.json'));
    otel.ingest(fx('metrics-delta-2.json'));
    r = otel.report();
    near(r.total.usd, 1.37 + 0.40, 'A and B from their counters, C from its events, nothing twice');
    assert.equal(r.sessions.find((s) => s.sid === A).via, 'm');
    assert.equal(r.sessions.find((s) => s.sid === C).via, 'e');
    assert.equal(r.total.req, 7, 'requests are still counted from the events');
    assert.equal(r.total.err, 1);
    assert.equal(r.total.prompts, 3);
    assert.equal(r.sessions.find((s) => s.sid === C).project, 'landing');
    reconciles(r);
  } finally { done(); }
});

test('counters without a session id: events stop counting money, so nothing is counted twice', () => {
  const { otel, done } = fresh();
  try {
    const body = fx('metrics-delta-1.json');
    for (const m of body.resourceMetrics[0].scopeMetrics[0].metrics) for (const p of m.sum.dataPoints) p.attributes = p.attributes.filter((a) => a.key !== 'session.id');
    otel.ingest(body);
    otel.ingest(fx('logs.json'));
    const r = otel.report();
    near(r.total.usd, 1.12, 'only the counters');
    reconciles(r);
  } finally { done(); }
});

test('rollups: kept on disk per local day, read back the same, 30 days kept, and the week has one bar a day', () => {
  const { dir, otel, at, done } = fresh();
  try {
    otel.ingest(fx('metrics-delta-1.json'));
    at(Date.parse('2026-11-02T05:00:00Z'));
    otel.ingest(fx('metrics-delta-2.json'));   // (sent late: counted on the day of its own time, the 30th)
    otel.saveSync();
    assert.ok(fs.existsSync(path.join(dir, '2026-10-30.json')));
    const again = createOtel({ dir, now: () => Date.parse('2026-11-02T05:00:00Z'), autoSave: false });
    const r = again.report('7d');
    assert.equal(r.days.length, 7);
    assert.equal(r.days.at(-1), '2026-11-02');
    near(r.total.usd, 1.37, 'read back');
    near(r.perDay.find((d) => d.day === '2026-10-30').usd, 1.37, 'that day');
    assert.equal(again.report('today').total.usd, 0);
    reconciles(r);
    const later = createOtel({ dir, now: () => Date.parse('2026-12-15T05:00:00Z'), autoSave: false });
    assert.equal(later.report('7d').total.usd, 0);
    assert.equal(later.info().days, 0, 'older than 30 days: not loaded');
  } finally { done(); }
});

test('the numbers always reconcile: many sessions, models, attributions and days, both temporalities', () => {
  const { otel, at, done } = fresh();
  try {
    let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const S = Array.from({ length: 30 }, (_, i) => `sess-${String(i).padStart(4, '0')}-aaaa`);
    const cum = new Map();
    let expected = 0;
    for (let min = 0; min < 400; min++) {
      const t0 = NOW - 6 * 86400e3 + min * 21 * 60e3, t1 = t0 + 60e3, temporality = min % 3 ? 1 : 2;
      const pts = [], inBatch = new Set();
      for (let k = 0; k < 6; k++) {
        const attrs = [['session.id', pick(S)], ['model', pick(['claude-opus-5-5', 'claude-sonnet-5', 'claude-haiku-4-5'])], ['query_source', pick(['main', 'subagent', 'auxiliary'])],
          ...(rnd() < 0.3 ? [['mcp_server.name', pick(['github', 'linear', 'custom'])]] : []), ...(rnd() < 0.2 ? [['skill.name', pick(['pdf', 'xlsx'])]] : []),
          ...(rnd() < 0.2 ? [['agent.name', pick(['Explore', 'Plan'])]] : [])].map(([key, v]) => ({ key, value: { stringValue: v } }));
        const id = JSON.stringify(attrs) + temporality, v = Math.round(rnd() * 1e4) / 1e5;
        if (inBatch.has(id)) continue;   // (one point per series in an export, as an SDK sends them)
        inBatch.add(id); expected += v;
        const total = temporality === 2 ? (cum.get(id) || 0) + v : v;
        if (temporality === 2) cum.set(id, total);
        pts.push({ attributes: attrs, startTimeUnixNano: `${(temporality === 2 ? NOW - 7 * 86400e3 : t0)}000000`, timeUnixNano: `${t1}000000`, asDouble: total });
      }
      at(t1);
      otel.ingest({ resourceMetrics: [{ resource: { attributes: [] }, scopeMetrics: [{ metrics: [{ name: 'claude_code.cost.usage', sum: { aggregationTemporality: temporality, dataPoints: pts } }] }] }] });
    }
    at(NOW);
    const r = otel.report('7d');
    assert.ok(r.total.usd > 1 && r.sessions.length === 30);
    assert.ok(Math.abs(r.total.usd - expected) < 1e-6, `every increment once: ${r.total.usd} vs ${expected}`);
    reconciles(r);
    for (const dim of DIMS.slice(2)) assert.ok(sumOf(r.by[dim]) <= r.total.usd + 1e-9, `${dim} is a part of the total`);
  } finally { done(); }
});

test('caps: a flood of attributions folds into the model and source, which still add up', () => {
  const { otel, done } = fresh();
  try {
    const pts = Array.from({ length: 400 }, (_, i) => ({ attributes: [['session.id', A], ['model', i % 2 ? 'claude-opus-5-5' : 'claude-sonnet-5'], ['query_source', 'main'], ['mcp_server.name', `srv-${i}`]]
      .map(([key, v]) => ({ key, value: { stringValue: v } })), startTimeUnixNano: '1', timeUnixNano: `${NOW}000000`, asDouble: 0.01 }));
    otel.ingest({ resourceMetrics: [{ scopeMetrics: [{ metrics: [{ name: 'claude_code.cost.usage', sum: { aggregationTemporality: 1, dataPoints: pts } }] }] }] });
    const r = otel.report();
    near(r.total.usd, 4, 'all counted');
    assert.ok(r.by.mcp.length < 400);
    reconciles(r);
  } finally { done(); }
});

test('summarize alone: shares fall back to tokens when nothing has a price, and dayKey is the local day', () => {
  const r = summarize([['2026-10-30', { s: { x: { m: {}, e: { 'claude-x\tmain\t\t\t\t': [0, 100, 50, 0, 0, 1] } } } }]], {});
  assert.equal(r.money, false);
  assert.equal(r.sessions[0].share, 1);
  assert.equal(dayKey(Date.parse('2026-10-30T18:00:00Z')), '2026-10-31');   // (01:00 in Hồ Chí Minh City)
  assert.equal(projectOf('/a/b/repo/.claude/worktrees/feat-x'), 'repo');
  assert.equal(projectOf(''), '');
});
