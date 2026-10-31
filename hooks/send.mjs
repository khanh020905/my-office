#!/usr/bin/env node
// A hook for shells without curl (Windows): POSTs the hook's JSON from stdin to the office and prints the reply (the
// approval hooks read it). It never fails the hook: when the office isn't running it just exits.
//   node hooks/send.mjs http://127.0.0.1:4310/event --async      (events: fire and forget, 2 s at most)
//   node hooks/send.mjs http://127.0.0.1:4310/hook/permission    (waits up to 55 s for your answer)
//   node hooks/send.mjs http://127.0.0.1:4310/hook/loop --fast    (every step: the office's answer within 0.3 s, else none)
const [url, ...flags] = process.argv.slice(2), quick = flags.includes('--async'), fast = flags.includes('--fast');
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
try {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: Buffer.concat(chunks), signal: AbortSignal.timeout(quick ? 2000 : fast ? 300 : 55000) });
  if (!quick) { const text = await r.text(); if (r.ok) process.stdout.write(text); }   // (half an answer, or an error page, is no answer)
} catch { /* the office is closed: Claude Code carries on as usual */ }
