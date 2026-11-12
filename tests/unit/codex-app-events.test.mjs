import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codexToolType, createCodexEventDeduper, normalizeCodexAppHook } from '../../server/codex-app-events.mjs';

test('registers Codex CLI hooks only in this repository', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const config = JSON.parse(fs.readFileSync(path.join(root, '.codex', 'hooks.json'), 'utf8'));
  for (const event of ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'Stop', 'Interrupt']) {
    assert.match(config.hooks[event][0].hooks[0].commandWindows, /send\.mjs.*codex-cli/);
  }
});

test('accepts Codex App session events with stable session and safe activity fields', () => {
  const out = normalizeCodexAppHook({
    hook_event_name: 'UserPromptSubmit', session_id: 'app-session-1', cwd: 'D:/shop', model: 'gpt-test',
    prompt: 'Review this page', transcript_path: 'private', tool_input: { command: 'secret' }, tool_response: 'secret output',
  });
  assert.deepEqual(out, { provider: 'codex-app', event: 'UserPromptSubmit', sessionId: 'app-session-1', turnId: '', cwd: 'D:/shop', model: 'gpt-test', prompt: 'Review this page', tool: '', toolUseId: '', reason: '' });
});

test('keeps tool activity names but excludes inputs and outputs', () => {
  assert.deepEqual(normalizeCodexAppHook({ provider: 'codex-cli', hook_event_name: 'PreToolUse', session_id: 's', turn_id: 'turn-1', tool_name: 'Bash', tool_use_id: 'call-1', tool_input: { command: 'secret' } }), {
    provider: 'codex-cli', event: 'PreToolUse', sessionId: 's', turnId: 'turn-1', cwd: '', model: '', prompt: '', tool: 'Bash', toolUseId: 'call-1', reason: '',
  });
});

test('rejects malformed and unsupported hook payloads', () => {
  assert.equal(normalizeCodexAppHook(null), null);
  assert.equal(normalizeCodexAppHook({ hook_event_name: 'Unknown', session_id: 's' }), null);
  assert.equal(normalizeCodexAppHook({ hook_event_name: 'Stop' }), null);
  assert.equal(normalizeCodexAppHook({ provider: 'unknown', hook_event_name: 'Stop', session_id: 's' }), null);
});

test('classifies only known Codex tool names for activity filters and counters', () => {
  assert.equal(codexToolType('apply_patch'), 'edit');
  assert.equal(codexToolType('Bash'), 'bash');
  assert.equal(codexToolType('mcp__filesystem__read_file'), 'read');
  assert.equal(codexToolType('mcp__filesystem__write_file'), 'edit');
  assert.equal(codexToolType('WebSearch'), 'other');
  assert.equal(codexToolType('mcp__private__tool'), 'other');
  assert.equal(codexToolType(null), 'other');
});

test('deduplicates repeated task and tool notifications by stable event id', () => {
  const seen = createCodexEventDeduper(2);
  assert.equal(seen('session-a', 'tool-1'), false);
  assert.equal(seen('session-a', 'tool-1'), true);
  assert.equal(seen('session-b', 'tool-1'), false);
  assert.equal(seen('session-a', ''), false);
});

test('Bash remains a command; only explicit file tools count as reads or edits', () => {
  assert.equal(codexToolType('Bash'), 'bash');
  assert.equal(codexToolType('apply_patch'), 'edit');
  assert.equal(codexToolType('mcp__filesystem__read_file'), 'read');
});
