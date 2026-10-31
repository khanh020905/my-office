// node tests/fixtures/otel/make.mjs tests/fixtures/otel
// Builds tests/fixtures/otel/*.json: OTLP/HTTP JSON as Claude Code's exporter sends it (opentelemetry-proto's JSON
// encoding: int64 times as decimal strings, enums as numbers), with the attribute names of
// code.claude.com/docs/en/monitoring-usage.
import fs from 'node:fs';
import path from 'node:path';
const OUT = process.argv[2];
const S = (v) => ({ stringValue: v }), I = (v) => ({ intValue: String(v) }), D = (v) => ({ doubleValue: v });
const kv = (o) => Object.entries(o).filter(([, v]) => v !== undefined).map(([key, value]) => ({ key, value: typeof value === 'object' ? value : typeof value === 'number' ? (Number.isInteger(value) ? I(value) : D(value)) : S(String(value)) }));
const ns = (iso) => `${Date.parse(iso)}000000`;
const resource = { attributes: kv({ 'service.name': 'claude-code', 'service.version': '2.1.310', 'os.type': 'darwin', 'os.version': '25.6.0', 'host.arch': 'arm64' }), droppedAttributesCount: 0 };
const scope = { name: 'com.anthropic.claude_code', version: '2.1.310' };
const A = '6f1c2a0e-1b7d-4c55-9a3e-2d8f0b9c1a11', B = '9b2e4d71-3c8a-4f20-8e1d-5a6c7b8d9e22', C = 'c0ffee00-4a4a-4b4b-8c8c-0d0d0e0e0f0f', Dd = 'd15ea5e0-1111-4222-8333-444455556666';
// the standard attributes (OTEL_METRICS_INCLUDE_SESSION_ID / _ACCOUNT_UUID default true; user.email when signed in)
const std = (sid) => ({ 'user.id': '4f1d9e2a7c3b8e6d5a1f0c9b8a7d6e5f4c3b2a1908f7e6d5c4b3a29180f7e6d5', 'session.id': sid, 'organization.id': '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d',
  'user.email': 'dev@example.com', 'user.account_uuid': '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', 'user.account_id': 'user_01BWBeN28example', 'terminal.type': 'iTerm.app' });
// one request's attribution, as the cost and token counters carry it
const R = (sid, model, qs, extra = {}) => ({ ...std(sid), model, query_source: qs, effort: model.includes('haiku') ? undefined : 'high', ...extra });
const reqs = [
  [R(A, 'claude-opus-5-5', 'main'), 0.50, { input: 1200, output: 900, cacheRead: 40000, cacheCreation: 3000 }],
  [R(A, 'claude-opus-5-5', 'main', { 'mcp_server.name': 'github', 'mcp_tool.name': 'create_issue' }), 0.30, { input: 800, output: 400, cacheRead: 30000, cacheCreation: 1000 }],
  [R(A, 'claude-sonnet-5', 'subagent', { 'agent.name': 'Explore' }), 0.15, { input: 2000, output: 600, cacheRead: 9000, cacheCreation: 2500 }],
  [R(A, 'claude-opus-5-5', 'main', { 'skill.name': 'pdf' }), 0.05, { input: 100, output: 80, cacheRead: 3000, cacheCreation: 0 }],
  [R(B, 'claude-haiku-4-5', 'auxiliary'), 0.02, { input: 3000, output: 150, cacheRead: 0, cacheCreation: 0 }],
  [R(B, 'claude-sonnet-5', 'main', { 'skill.name': 'commit', 'plugin.name': 'commit-commands', 'marketplace.name': 'claude-plugins-official' }), 0.10, { input: 500, output: 700, cacheRead: 12000, cacheCreation: 800 }],
];
const sum = (points) => ({ dataPoints: points, aggregationTemporality: 1, isMonotonic: true });
const cumSum = (points) => ({ dataPoints: points, aggregationTemporality: 2, isMonotonic: true });
function costTokens(rows, start, end, wrap = sum) {
  const p = (attrs, v) => ({ attributes: kv(attrs), startTimeUnixNano: ns(start), timeUnixNano: ns(end), asDouble: v });
  return [
    { name: 'claude_code.cost.usage', description: 'Cost of the Claude Code session', unit: 'USD', sum: wrap(rows.map(([a, usd]) => p(a, usd))) },
    { name: 'claude_code.token.usage', description: 'Number of tokens used', unit: 'tokens', sum: wrap(rows.flatMap(([a, , t]) => Object.entries(t).map(([type, n]) => p({ ...a, type }, n)))) },
  ];
}
const metrics = (list) => ({ resourceMetrics: [{ resource, scopeMetrics: [{ scope, metrics: list }] }] });
const write = (f, o) => fs.writeFileSync(path.join(OUT, f), JSON.stringify(o) + '\n');

// 1. delta, the first minute: both sessions, plus the counters the office leaves alone
write('metrics-delta-1.json', metrics([
  { name: 'claude_code.session.count', description: 'Count of CLI sessions started', unit: '', sum: sum([{ attributes: kv({ ...std(A), start_type: 'fresh' }), startTimeUnixNano: ns('2026-10-30T12:00:00Z'), timeUnixNano: ns('2026-10-30T12:01:00Z'), asDouble: 1 }]) },
  ...costTokens(reqs, '2026-10-30T12:00:00Z', '2026-10-30T12:01:00Z'),
  { name: 'claude_code.active_time.total', description: 'Total active time in seconds', unit: 's', sum: sum([{ attributes: kv({ ...std(A), type: 'cli' }), startTimeUnixNano: ns('2026-10-30T12:00:00Z'), timeUnixNano: ns('2026-10-30T12:01:00Z'), asDouble: 42.5 }]) },
  { name: 'claude_code.lines_of_code.count', description: 'Count of lines of code modified', unit: '', sum: sum([{ attributes: kv({ ...std(A), type: 'added', model: 'claude-opus-5-5' }), startTimeUnixNano: ns('2026-10-30T12:00:00Z'), timeUnixNano: ns('2026-10-30T12:01:00Z'), asInt: '120' }]) },
]));
// 2. delta, the next minute: one more request in A
write('metrics-delta-2.json', metrics(costTokens([[R(A, 'claude-opus-5-5', 'main'), 0.25, { input: 300, output: 500, cacheRead: 45000, cacheCreation: 500 }]], '2026-10-30T12:01:00Z', '2026-10-30T12:02:00Z')));

// 3. the events of the same requests (5 s batches), a session C that sends events only, prompts, an error, and
// events the office leaves alone
let seq = 0;
const ev = (name, sid, at, attrs) => ({ timeUnixNano: ns(at), observedTimeUnixNano: ns(at), severityNumber: 9, severityText: 'INFO', body: S(`claude_code.${name}`),
  attributes: kv({ ...std(sid), 'event.name': name, 'event.timestamp': at, 'event.sequence': seq++, 'prompt.id': '0b9c8d7e-6f5a-4b3c-9d2e-1f0a9b8c7d6e', ...attrs }) });
const apiReq = (sid, at, model, qs, usd, t, extra = {}) => ev('api_request', sid, at, { model, cost_usd: usd, cost_usd_micros: Math.round(usd * 1e6), duration_ms: 4200, input_tokens: t.input, output_tokens: t.output,
  cache_read_tokens: t.cacheRead, cache_creation_tokens: t.cacheCreation, cache_creation_5m_tokens: t.cacheCreation, cache_creation_1h_tokens: 0, request_id: `req_011example${seq}`,
  client_request_id: '3e4f5a6b-7c8d-4e9f-8a0b-1c2d3e4f5a6b', speed: 'normal', query_source: qs, ...(model.includes('haiku') ? {} : { effort: 'high' }), ...extra });
const QS = { main: 'repl_main_thread', subagent: 'Explore', auxiliary: 'compact' };
const logs = (records) => ({ resourceLogs: [{ resource, scopeLogs: [{ scope: { name: 'com.anthropic.claude_code.events', version: '2.1.310' }, logRecords: records }] }] });
const attrsOf = (a) => Object.fromEntries(['agent.name', 'skill.name', 'plugin.name', 'marketplace.name', 'mcp_server.name', 'mcp_tool.name'].filter((k) => a[k]).map((k) => [k, a[k]]));
write('logs.json', logs([
  ev('user_prompt', A, '2026-10-30T12:00:01.000Z', { prompt_length: 64, prompt: '<REDACTED>', prompt_text: '<REDACTED>', 'message.uuid': '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d' }),
  ...reqs.map(([a, usd, t], i) => apiReq(a['session.id'], `2026-10-30T12:00:${String(10 + i * 5).padStart(2, '0')}.000Z`, a.model, QS[a.query_source], usd, t,
    { ...attrsOf(a), ...(a.query_source === 'subagent' ? { agent_id: 'a3f2c1b4d5e6f7a80' } : {}) })),
  ev('tool_result', A, '2026-10-30T12:00:20.000Z', { tool_name: 'mcp__github__create_issue', tool_use_id: 'toolu_01example', success: 'true', duration_ms: 812, decision_type: 'accept', decision_source: 'config', tool_input_size_bytes: 210, tool_result_size_bytes: 1400, mcp_server_scope: 'user',
    tool_parameters: '{"mcp_server_name":"github","mcp_tool_name":"create_issue"}' }),
  ev('skill_activated', A, '2026-10-30T12:00:24.000Z', { 'skill.name': 'pdf', invocation_trigger: 'claude-proactive', 'skill.source': 'bundled' }),
  ev('api_error', B, '2026-10-30T12:00:50.000Z', { model: 'claude-sonnet-5', error: 'Overloaded', status_code: 529, duration_ms: 31000, attempt: 11, speed: 'normal', query_source: 'repl_main_thread' }),
  ev('user_prompt', B, '2026-10-30T12:00:30.000Z', { prompt_length: 12, prompt: '<REDACTED>', prompt_text: '<REDACTED>', command_name: 'commit', command_source: 'custom' }),
  ev('user_prompt', C, '2026-10-30T12:00:40.000Z', { prompt_length: 30, prompt: '<REDACTED>', prompt_text: '<REDACTED>' }),
  apiReq(C, '2026-10-30T12:00:45.000Z', 'claude-opus-5-5', 'repl_main_thread', 0.40, { input: 900, output: 1200, cacheRead: 20000, cacheCreation: 4000 }),
]));
// 4–6. cumulative (OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=cumulative): totals since the process started;
// the third is a new process (a new start time) whose total begins again from zero
const D1 = [[R(Dd, 'claude-opus-5-5', 'main'), 0.20, { input: 1000 }]], D2 = [[R(Dd, 'claude-opus-5-5', 'main'), 0.35, { input: 1600 }]], D3 = [[R(Dd, 'claude-opus-5-5', 'main'), 0.05, { input: 300 }]];
write('metrics-cumulative-1.json', metrics(costTokens(D1, '2026-10-30T13:00:00Z', '2026-10-30T13:01:00Z', cumSum)));
write('metrics-cumulative-2.json', metrics(costTokens(D2, '2026-10-30T13:00:00Z', '2026-10-30T13:02:00Z', cumSum)));
write('metrics-cumulative-3.json', metrics(costTokens(D3, '2026-10-30T13:05:00Z', '2026-10-30T13:06:00Z', cumSum)));
