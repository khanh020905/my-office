// Turning Claude Code's telemetry on for the office (bin/cli.mjs install): an env block in ~/.claude/settings.json, added
// only when no telemetry is set up already (a collector of your own is never replaced or redirected), and tagged with
// MY_OFFICE_OTEL, the list of keys install put there, so uninstall takes out exactly those.
import fs from 'node:fs';
import path from 'node:path';

export const MARK = 'MY_OFFICE_OTEL';
/**
 * What Claude Code needs to send its counters and events to this office (code.claude.com/docs/en/monitoring-usage):
 * OTLP over HTTP as JSON (the receiver reads JSON only), delta counters, the default intervals (a minute for the
 * counters, 5 s for the events), and prompts left redacted (OTEL_LOG_USER_PROMPTS stays unset). OTEL_LOG_TOOL_DETAILS
 * puts the real names of MCP servers, skills, plugins and subagent types on the counters instead of "custom"; it also
 * adds tool input to the events, which the receiver drops unread and which goes to this computer only.
 */
export function otelEnv(port, { names = true } = {}) {
  return {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_METRICS_EXPORTER: 'otlp',
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
    OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}`,
    OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: 'delta',
    ...(names ? { OTEL_LOG_TOOL_DETAILS: '1' } : {}),
  };
}
// a key that sets up (or turns off) Claude Code's telemetry: yours unless install put it there
const TELEMETRY = /^(OTEL_|CLAUDE_CODE_ENABLE_TELEMETRY$|CLAUDE_CODE_ENHANCED_TELEMETRY_BETA$|BETA_TRACING_ENDPOINT$)/;
// (a shell's own: only the exporter keys count; CLAUDE_CODE_ENABLE_TELEMETRY alone exports nothing, and a session of
// Claude Code passes it on to the commands it runs, `install` among them, while it keeps OTEL_* to itself)
const SHELL = /^OTEL_(METRICS_EXPORTER|LOGS_EXPORTER|TRACES_EXPORTER|EXPORTER_OTLP_)/;
// still the value install wrote (the endpoint: on whichever port the office had then)
const stillOurs = (k, v) => (k === 'OTEL_EXPORTER_OTLP_ENDPOINT' ? /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(String(v)) : String(v) === otelEnv(0)[k]);
export const markedKeys = (env) => String(env?.[MARK] || '').split(',').map((k) => k.trim()).filter((k) => TELEMETRY.test(k));

/** Managed settings (an organisation's policy) on this computer: their env blocks, read only. */
export function managedEnvs(dir = process.env.OFFICE_MANAGED_DIR || (process.platform === 'darwin' ? '/Library/Application Support/ClaudeCode'
  : process.platform === 'win32' ? 'C:\\Program Files\\ClaudeCode' : '/etc/claude-code')) {
  const files = [path.join(dir, 'managed-settings.json')];
  try { for (const f of fs.readdirSync(path.join(dir, 'managed-settings.d')).sort()) if (f.endsWith('.json')) files.push(path.join(dir, 'managed-settings.d', f)); } catch { /* none */ }
  const out = [];
  for (const file of files) { try { const env = JSON.parse(fs.readFileSync(file, 'utf8'))?.env; if (env && typeof env === 'object') out.push({ file, env }); } catch { /* none */ } }
  return out;
}

/**
 * Whose telemetry this is: 'ours' (install's block is there), 'theirs' (keys of your own: in the settings, your shell,
 * or a managed policy) or 'none'. `where`: those keys, as "file: KEY, KEY" for each place.
 * @param {{ settings: object, file?: string, shell?: Record<string, string|undefined>, managed?: Array<{ file: string, env: object }> }} o
 */
export function otelOwner({ settings, file = 'settings.json', shell = {}, managed = [] }) {
  const env = settings?.env && typeof settings.env === 'object' ? settings.env : {}, mine = new Set(markedKeys(env));
  const group = (src, keys) => (keys.length ? [`${src}: ${keys.join(', ')}`] : []);
  const where = [
    ...group(file, Object.keys(env).filter((k) => k !== MARK && TELEMETRY.test(k) && !mine.has(k))),
    ...group('shell', Object.keys(shell).filter((k) => SHELL.test(k) && shell[k])),
    ...managed.flatMap((m) => group(m.file, Object.keys(m.env).filter((k) => TELEMETRY.test(k)))),
  ];
  return { state: where.length ? 'theirs' : mine.size ? 'ours' : 'none', where, mine: [...mine] };
}

/** Adds the block to settings (in place). { added, theirs } — theirs: telemetry of your own, nothing changed. */
export function addOtel(settings, port, { names = true, shell = {}, managed = [], file } = {}) {
  const own = otelOwner({ settings, file, shell, managed });
  if (own.state === 'theirs') return { added: 0, theirs: own.where };
  const env = (settings.env && typeof settings.env === 'object' ? settings.env : (settings.env = {}));
  const mine = new Set(own.mine);
  let added = 0;
  for (const [k, v] of Object.entries(otelEnv(port, { names }))) {
    if (env[k] === v) { mine.add(k); continue; }
    if (k in env && !(mine.has(k) && stillOurs(k, env[k]))) continue;   // (changed by you since: yours now)
    env[k] = v; mine.add(k); added++;
  }
  if (mine.size) env[MARK] = [...mine].join(',');
  return { added, theirs: null };
}

/** Takes the block out (in place): the keys install listed that still hold its values, and the tag. { removed, kept } */
export function removeOtel(settings) {
  const env = settings?.env;
  if (!env || typeof env !== 'object' || !(MARK in env)) return { removed: 0, kept: [] };
  let removed = 0; const kept = [];
  for (const k of markedKeys(env)) {
    if (!(k in env)) continue;
    if (stillOurs(k, env[k])) { delete env[k]; removed++; } else kept.push(k);
  }
  delete env[MARK]; removed++;   // (the tag too: an entry of ours)
  if (!Object.keys(env).length) delete settings.env;
  return { removed, kept };
}

/** For when the telemetry is yours: send a copy to the office from your own OpenTelemetry Collector. */
export const collectorSnippet = (port) => [
  'exporters:',
  '  otlphttp/my-office:',
  `    endpoint: http://127.0.0.1:${port}`,
  '    encoding: json',
  'service:',
  '  pipelines:',
  '    metrics:',
  '      exporters: [<your exporters>, otlphttp/my-office]',
  '    logs:',
  '      exporters: [<your exporters>, otlphttp/my-office]',
].join('\n');
