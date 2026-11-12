#!/usr/bin/env node
// Fail open: observing an office must never interrupt a Codex App task.
const chunks = [];
let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length;
  if (size > 256_000) process.exit(0);
  chunks.push(chunk);
}
try {
  const r = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const body = {
    provider: process.argv[2] === 'codex-cli' ? 'codex-cli' : 'codex-app',
    hook_event_name: r.hook_event_name,
    session_id: r.session_id,
    turn_id: r.turn_id,
    cwd: r.cwd,
    model: r.model,
    prompt: r.hook_event_name === 'UserPromptSubmit' ? r.prompt : undefined,
    tool_name: r.tool_name,
    tool_use_id: r.tool_use_id,
    reason: r.hook_event_name === 'SessionEnd' ? r.reason : undefined,
  };
  // shortcut: uses My Office's default port; make this configurable if custom ports are needed.
  await fetch('http://127.0.0.1:4310/codex-app-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(1500),
  });
} catch { /* My Office may be closed; Codex continues normally. */ }
