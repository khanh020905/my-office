// Cursor's hook JSON is not Claude Code's. The mapper is what the office actually stores; the script only posts it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { mapCursor } from '../../hooks/cursor-map.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CLI = path.join(ROOT, 'bin', 'cli.mjs');
const SCRIPT = path.join(ROOT, 'hooks', 'cursor.mjs');
const EVENTS = ['sessionStart', 'sessionEnd', 'beforeSubmitPrompt', 'preToolUse', 'postToolUse', 'postToolUseFailure', 'subagentStart', 'subagentStop', 'stop', 'preCompact'];

const base = { conversation_id: 'conv-1', model: 'gpt-5.6-thinking', model_id: 'gpt-5.6', workspace_roots: ['D:/work/app'], transcript_path: 'D:/work/app/.cursor/transcript.jsonl' };

test('prompt, tools, subagent, stop and session end become office events', () => {
  const prompt = mapCursor({ ...base, hook_event_name: 'beforeSubmitPrompt', prompt: 'refactor the parser' });
  assert.equal(prompt.hook_event_name, 'UserPromptSubmit');
  assert.equal(prompt.session_id, 'conv-1');
  assert.equal(prompt.cwd, 'D:/work/app');
  assert.equal(prompt.prompt, 'refactor the parser');
  assert.equal(prompt.agent, 'cursor');
  assert.equal(prompt.model, 'gpt-5.6');
  assert.equal(prompt.transcript_path, base.transcript_path);

  const shell = mapCursor({ ...base, hook_event_name: 'preToolUse', cwd: 'D:/work/app', tool_name: 'Shell', tool_input: { command: 'npm test', working_directory: 'D:/work/app' } });
  assert.equal(shell.hook_event_name, 'PreToolUse');
  assert.equal(shell.tool_name, 'Bash');
  assert.equal(shell.tool_input.command, 'npm test');
  assert.equal(shell.cwd, 'D:/work/app');

  const edit = mapCursor({ ...base, hook_event_name: 'preToolUse', tool_name: 'StrReplace', tool_input: { path: 'D:/work/app/src/a.js', old_string: 'a', new_string: 'b' } });
  assert.equal(edit.tool_name, 'Edit');
  assert.equal(edit.tool_input.file_path, 'D:/work/app/src/a.js');
  assert.equal(edit.tool_input.old_string, 'a');

  const mcp = mapCursor({ ...base, hook_event_name: 'postToolUse', tool_name: 'MCP:github:search', tool_input: { query: 'hooks' }, tool_output: '{"ok":true}' });
  assert.equal(mcp.hook_event_name, 'PostToolUse');
  assert.equal(mcp.tool_name, 'mcp__github__search');
  assert.deepEqual(mcp.tool_response, { ok: true });

  const fail = mapCursor({ ...base, hook_event_name: 'postToolUseFailure', tool_name: 'Shell', tool_input: { command: 'npm test' }, error_message: 'exit 1', is_interrupt: false });
  assert.equal(fail.hook_event_name, 'PostToolUseFailure');
  assert.equal(fail.tool_name, 'Bash');
  assert.equal(fail.error, 'exit 1');
  assert.equal(fail.is_interrupt, false);

  const sub = mapCursor({ ...base, hook_event_name: 'subagentStart', parent_conversation_id: 'conv-parent', subagent_id: 'sub-9', subagent_type: 'explore', task: 'find the cart', subagent_model: 'claude-sonnet-4-5', model_id: 'claude-opus-4-7' });
  assert.equal(sub.hook_event_name, 'SubagentStart');
  assert.equal(sub.session_id, 'conv-parent');
  assert.equal(sub.agent_id, 'sub-9');
  assert.equal(sub.agent_type, 'explore');
  assert.equal(sub.task, 'find the cart');
  assert.equal(sub.subagent_model, 'claude-sonnet-4-5');
  assert.equal(sub.model, undefined);

  assert.equal(mapCursor({ ...base, hook_event_name: 'stop', status: 'completed' }).hook_event_name, 'Stop');
  const bad = mapCursor({ ...base, hook_event_name: 'stop', status: 'error', error_message: 'boom' });
  assert.equal(bad.hook_event_name, 'StopFailure');
  assert.equal(bad.error, 'boom');

  const end = mapCursor({ ...base, hook_event_name: 'sessionEnd', session_id: 'conv-1', reason: 'user_close' });
  assert.equal(end.hook_event_name, 'SessionEnd');
  assert.equal(end.reason, 'user_close');

  const start = mapCursor({ ...base, hook_event_name: 'sessionStart', session_id: 'conv-1', composer_mode: 'agent' });
  assert.equal(start.hook_event_name, 'SessionStart');
  assert.equal(start.source, 'agent');

  assert.equal(mapCursor({ ...base, hook_event_name: 'preCompact', trigger: 'auto' }).trigger, 'auto');
  assert.equal(mapCursor({ ...base, hook_event_name: 'beforeShellExecution' }), null);
  assert.equal(mapCursor({ hook_event_name: 'stop' }), null);
  assert.equal(mapCursor({ ...base, hook_event_name: 'sessionStart', model: 'default', model_id: '' }).model, undefined);
});

test('the hook script posts the mapped event and prints {}', async () => {
  let body = '';
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { body = Buffer.concat(chunks).toString('utf8'); res.writeHead(200).end('{}'); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try {
    const child = spawn(process.execPath, [SCRIPT, String(port)], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stdin.end(JSON.stringify({ ...base, hook_event_name: 'beforeSubmitPrompt', prompt: 'hello' }));
    const code = await new Promise((resolve) => child.on('close', resolve));
    assert.equal(code, 0);
    assert.equal(out.trim(), '{}');
    assert.equal(JSON.parse(body).hook_event_name, 'UserPromptSubmit');
    assert.equal(JSON.parse(body).prompt, 'hello');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('install merges Cursor hooks once and uninstall leaves the others', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-cursor-'));
  const home = path.join(root, 'home');
  const hooksFile = path.join(home, '.cursor', 'hooks.json');
  const settings = path.join(home, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(hooksFile), { recursive: true });
  fs.mkdirSync(path.dirname(settings), { recursive: true });
  fs.writeFileSync(hooksFile, JSON.stringify({ version: 1, hooks: { beforeShellExecution: [{ command: 'echo keep' }] } }));
  const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, OFFICE_DATA_DIR: path.join(root, 'data'), OFFICE_LANG: 'en', OFFICE_PORT: '4310', OFFICE_MANAGED_DIR: path.join(root, 'managed') };
  const run = (...args) => execFileSync(process.execPath, [CLI, ...args, '--settings', settings, '--no-status'], { env, encoding: 'utf8' });
  try {
    assert.match(run('install', '--no-cursor'), /nothing changed|Added \d+ hook/);
    assert.equal(fs.existsSync(hooksFile) && JSON.parse(fs.readFileSync(hooksFile, 'utf8')).hooks.sessionStart, undefined);
    const out = run('install');
    assert.match(out, /Cursor hook/);
    const cfg = JSON.parse(fs.readFileSync(hooksFile, 'utf8'));
    assert.equal(cfg.hooks.beforeShellExecution[0].command, 'echo keep');
    for (const ev of EVENTS) {
      const ours = cfg.hooks[ev].filter((h) => h.command.includes('hooks/cursor.mjs'));
      assert.equal(ours.length, 1, ev);
      assert.match(ours[0].command, / 4310$/);
      assert.equal(ours[0].timeout, 5);
    }
    run('install');
    const again = JSON.parse(fs.readFileSync(hooksFile, 'utf8'));
    assert.equal(again.hooks.sessionStart.filter((h) => h.command.includes('hooks/cursor.mjs')).length, 1);
    assert.match(run('doctor'), /Cursor hooks are in/);
    const gone = run('uninstall');
    assert.match(gone, /Cursor hook/);
    const after = JSON.parse(fs.readFileSync(hooksFile, 'utf8'));
    assert.equal(after.hooks.beforeShellExecution[0].command, 'echo keep');
    for (const ev of EVENTS) assert.equal(after.hooks[ev], undefined, ev);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
