// `install` turns Claude Code's telemetry on for the office only when there is none of yours, and `uninstall` takes out
// exactly what install put in. Run as the real command against settings in a home folder of its own (never ~/.claude).
// (--no-status: the status line's saved copy lives in the repository's data folder, which a test must not touch)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { addOtel, removeOtel, otelOwner, otelEnv, MARK } from '../../server/otel-setup.mjs';

const CLI = path.resolve(import.meta.dirname, '../../bin/cli.mjs');
function home() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-install-'));
  const settings = path.join(root, 'home', '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(settings), { recursive: true });
  const env = { PATH: process.env.PATH, HOME: path.join(root, 'home'), USERPROFILE: path.join(root, 'home'), OFFICE_DATA_DIR: path.join(root, 'data'), OFFICE_LANG: 'en',
    OFFICE_MANAGED_DIR: path.join(root, 'managed'), OFFICE_PORT: '4399' };
  const run = (...args) => execFileSync(process.execPath, [CLI, ...args, '--no-status', '--settings', settings], { env, encoding: 'utf8' });
  const read = () => JSON.parse(fs.readFileSync(settings, 'utf8'));
  const write = (o) => fs.writeFileSync(settings, JSON.stringify(o, null, 2));
  return { root, settings, run, read, write, env, done: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('install adds the telemetry block once, tagged; uninstall takes out exactly that', () => {
  const h = home();
  try {
    h.write({ env: { MY_OWN: 'x' }, model: 'opus' });
    const out = h.run('install');
    assert.match(out, /usage numbers/);
    const s = h.read();
    for (const [k, v] of Object.entries(otelEnv(4399))) assert.equal(s.env[k], v, k);
    assert.equal(s.env.OTEL_EXPORTER_OTLP_ENDPOINT, 'http://127.0.0.1:4399');
    assert.equal(s.env.OTEL_LOG_USER_PROMPTS, undefined, 'prompts stay redacted');
    assert.deepEqual(s.env[MARK].split(',').sort(), Object.keys(otelEnv(4399)).sort());
    assert.equal(s.env.MY_OWN, 'x');
    // a second install changes nothing (not even a backup)
    const backups = () => fs.readdirSync(path.dirname(h.settings)).filter((f) => f.includes('.backup-')).length;
    const before = backups();
    assert.match(h.run('install'), /already there/);
    assert.deepEqual(h.read(), s);
    assert.equal(backups(), before);
    assert.match(execFileSync(process.execPath, [CLI, 'doctor', '--settings', h.settings], { env: h.env, encoding: 'utf8' }), /sends its usage numbers/);
    h.run('uninstall');
    const after = h.read();
    assert.deepEqual(after.env, { MY_OWN: 'x' }, 'only what install added is gone');
    assert.equal(after.model, 'opus');
    assert.deepEqual(after.hooks ?? {}, {}, 'the hooks gone too');
    h.run('uninstall');   // (again: nothing left to take out, nothing broken)
    assert.deepEqual(h.read().env, { MY_OWN: 'x' });
  } finally { h.done(); }
});

test('telemetry of your own is left alone: install shows how to add the office as a second exporter', () => {
  const h = home();
  try {
    const mine = { CLAUDE_CODE_ENABLE_TELEMETRY: '1', OTEL_METRICS_EXPORTER: 'otlp', OTEL_EXPORTER_OTLP_PROTOCOL: 'grpc', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector.example.com:4317' };
    h.write({ env: { ...mine } });
    const out = h.run('install');
    assert.match(out, /second exporter/);
    assert.match(out, /otlphttp\/my-office/);
    assert.match(out, /endpoint: http:\/\/127\.0\.0\.1:4399/);
    assert.deepEqual(h.read().env, mine);
    h.run('uninstall');
    assert.deepEqual(h.read().env, mine);
    // a policy of the organisation's (managed settings) counts as yours too
    h.write({});
    fs.mkdirSync(path.join(h.root, 'managed'), { recursive: true });
    fs.writeFileSync(path.join(h.root, 'managed', 'managed-settings.json'), JSON.stringify({ env: { OTEL_LOGS_EXPORTER: 'otlp' } }));
    h.run('install');
    assert.equal(h.read().env, undefined);
  } finally { h.done(); }
});

test('a value you changed after install is yours: uninstall keeps it; a new port moves the endpoint', () => {
  const h = home();
  try {
    h.run('install');
    const s = h.read();
    s.env.OTEL_LOG_TOOL_DETAILS = '0';
    h.write(s);
    const out = h.run('uninstall');
    assert.match(out, /OTEL_LOG_TOOL_DETAILS/);
    assert.deepEqual(h.read().env, { OTEL_LOG_TOOL_DETAILS: '0' });
    // the pure functions: the endpoint follows the office's port, --no-otel-names leaves the names redacted
    const cfg = {};
    addOtel(cfg, 4310);
    assert.equal(addOtel(cfg, 4311).added, 1);
    assert.equal(cfg.env.OTEL_EXPORTER_OTLP_ENDPOINT, 'http://127.0.0.1:4311');
    const plain = {};
    addOtel(plain, 4310, { names: false });
    assert.equal(plain.env.OTEL_LOG_TOOL_DETAILS, undefined);
    assert.equal(otelOwner({ settings: plain }).state, 'ours');
    assert.equal(otelOwner({ settings: {}, shell: { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://x:4317' } }).state, 'theirs');
    assert.equal(otelOwner({ settings: {}, shell: { CLAUDE_CODE_ENABLE_TELEMETRY: '1' } }).state, 'none', 'what a session passes to its commands');
    assert.deepEqual(removeOtel(plain), { removed: 7, kept: [] });
    assert.deepEqual(plain, {});
  } finally { h.done(); }
});
