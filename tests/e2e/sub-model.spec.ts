import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { HOME_DIR } from '../../playwright.config';

// A subagent's model (server/index.mjs subModel, read from its transcript): on its name tag in the office, in the 2D
// list under its session, and in the session drawer's list of subagents.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-lite', 'on'); } catch { /* private mode */ } }); });

test('a session on Opus sends out an Explore subagent that runs on Sonnet: "Sonnet" by its name', async ({ page, request }) => {
  test.setTimeout(150_000);
  const sid = 'submodel-a1b2', aid = 'a3f0c9e2b7d14e5f6';
  const transcript = path.join(HOME_DIR, 'submodel', `${sid}.jsonl`), sub = path.join(HOME_DIR, 'submodel', sid, 'subagents', `agent-${aid}.jsonl`);
  fs.mkdirSync(path.dirname(sub), { recursive: true });
  fs.writeFileSync(transcript, `${JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-5-5', role: 'assistant', content: [] } })}\n`);
  fs.writeFileSync(sub, `${JSON.stringify({ type: 'assistant', agentId: aid, message: { model: 'claude-sonnet-5-5', role: 'assistant', content: [{ type: 'text', text: 'Looking.' }] } })}\n`);
  const base = { session_id: sid, cwd: path.join(HOME_DIR, 'submodel'), transcript_path: transcript };
  await request.post('/event', { data: { ...base, hook_event_name: 'SessionStart', source: 'startup' } });
  await request.post('/event', { data: { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'find where the cart is saved' } });
  await request.post('/event', { data: { ...base, hook_event_name: 'SubagentStart', agent_id: aid, agent_type: 'Explore' } });
  await request.post('/event', { data: { ...base, hook_event_name: 'PreToolUse', agent_id: aid, agent_type: 'Explore', tool_name: 'Read', tool_input: { file_path: path.join(HOME_DIR, 'submodel', 'cart.ts') } } });
  await page.goto('/');
  await expect(page.locator('.v2-sub-model', { hasText: 'Sonnet' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.tag-model', { hasText: 'Sonnet' })).toHaveCount(1);
  await request.post('/event', { data: { ...base, hook_event_name: 'SessionEnd', reason: 'other' } });   // (the next test's office has only its own)
});
