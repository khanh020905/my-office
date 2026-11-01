import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { HOME_DIR } from '../../playwright.config';

// "Chặn ghi đè và giành cổng" (server/overlap.mjs): two sessions on one file, and a command that can't have its port.
// The sessions are hook events; what their Claude is told comes back from the synchronous hook (/hook/loop), as Claude
// Code would read it, and what you are told is in the group chat.
const DIR = path.join(HOME_DIR, 'overlap-project'), FILE = path.join(DIR, 'src', 'app.ts');
const HOLD = (Number(process.env.E2E_PORT) || 4399) + 35;   // (a port this test's own little server holds)
let holder = 0;
test.afterAll(() => { if (holder) try { process.kill(holder); } catch { /* gone */ } });

async function session(request: APIRequestContext, sid: string) {
  const base = { session_id: sid, cwd: DIR };
  await request.post('/event', { data: { ...base, hook_event_name: 'SessionStart', source: 'startup' } });
  await request.post('/event', { data: { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'work on the app' } });
  return base;
}
// what the session's Claude is told before a call (empty: nothing)
const told = async (request: APIRequestContext, call: object) => {
  const r = await (await request.post('/hook/loop', { data: { hook_event_name: 'PreToolUse', ...call } })).text();
  return r ? JSON.parse(r).hookSpecificOutput?.additionalContext || '' : '';
};
const said = async (request: APIRequestContext, re: RegExp) => (await (await request.get('/api/chat')).json()).msgs.filter((m: { kind: string, text?: string }) => m.kind === 'sys' && re.test(m.text || '')).length;

test('two sessions on one file: the second is told to read it again first, once; the chat says so', async ({ request }) => {
  const a = await session(request, 'aa-overlap'), b = await session(request, 'bb-overlap');
  // a edits the file
  await request.post('/event', { data: { ...a, hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: FILE, old_string: 'a', new_string: 'b' }, tool_response: {} } });
  // a editing it again: nothing (its own); b about to edit it: told, with a's name
  expect(await told(request, { ...a, tool_name: 'Edit', tool_input: { file_path: FILE } })).toBe('');
  const note = await told(request, { ...b, tool_name: 'Write', tool_input: { file_path: 'src/app.ts' } });   // (a path from its folder: the same file)
  expect(note).toContain('Another session on this computer');
  expect(note).toContain('“overlap-project-aa”');
  expect(note).toContain("don't overwrite that session's changes");
  await expect.poll(() => said(request, /overlap-project-bb is about to edit app\.ts, which overlap-project-aa just edited/), { timeout: 10_000 }).toBe(1);
  // said once: the next edit of b goes on as usual
  expect(await told(request, { ...b, tool_name: 'Edit', tool_input: { file_path: FILE } })).toBe('');
  // another file, or reading this one: nothing
  expect(await told(request, { ...b, tool_name: 'Edit', tool_input: { file_path: path.join(DIR, 'src', 'other.ts') } })).toBe('');
  expect(await told(request, { ...b, tool_name: 'Read', tool_input: { file_path: FILE } })).toBe('');
  for (const x of [a, b]) await request.post('/event', { data: { ...x, hook_event_name: 'SessionEnd', reason: 'other' } });
});

test('a command that cannot have its port: who holds it in the chat, and Claude told not to kill it (once)', async ({ request }) => {
  // a server left running on its own (started from a shell that has gone, as a forgotten dev server is): the office
  // never offers to stop anything of its own process tree, which a child of this test would be
  holder = Number(execFileSync('sh', ['-c', `"${process.execPath}" -e "require('http').createServer((q, r) => r.end('ok')).listen(${HOLD}, '127.0.0.1')" >/dev/null 2>&1 & echo $!`]).toString().trim());
  await expect.poll(async () => { try { return (await fetch(`http://127.0.0.1:${HOLD}/`)).ok; } catch { return false; } }, { timeout: 10_000 }).toBe(true);
  const c = await session(request, 'e2e-overlap-c');
  const run = { ...c, tool_name: 'Bash', tool_input: { command: 'npm run dev' } };
  await request.post('/event', { data: { ...run, hook_event_name: 'PostToolUseFailure', error: `Error: listen EADDRINUSE: address already in use :::${HOLD}\n    at Server.setupListenHandle [as _listen2]` } });
  await expect.poll(() => said(request, new RegExp(`needs port ${HOLD}, but node .+ \\(running .+\\) holds it`)), { timeout: 30_000 }).toBe(1);
  // its next call: told who holds it, and not to stop it; once
  const note = await told(request, { ...c, tool_name: 'Bash', tool_input: { command: 'lsof -i :3000' } });
  expect(note).toMatch(new RegExp(`Port ${HOLD} is held by node .+ \\(running .+\\)`));
  expect(note).toContain("don't stop or kill that process yourself");
  expect(await told(request, { ...c, tool_name: 'Bash', tool_input: { command: 'ls' } })).toBe('');
  // the same clash again: not said twice
  await request.post('/event', { data: { ...run, hook_event_name: 'PostToolUseFailure', error: `Error: listen EADDRINUSE: address already in use :::${HOLD}` } });
  await new Promise((r) => setTimeout(r, 1500));
  expect(await said(request, new RegExp(`needs port ${HOLD}`))).toBe(1);
  await request.post('/event', { data: { ...c, hook_event_name: 'SessionEnd', reason: 'other' } });
});
