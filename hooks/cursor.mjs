#!/usr/bin/env node
// Cursor user hook → My Office. Reads Cursor's hook JSON on stdin, reshapes it, and POSTs to /event.
// Always prints {} and exits 0: a stopped office must not block the agent (fail open).
import { mapCursor } from './cursor-map.mjs';

const n = Number(process.argv[2] || process.env.OFFICE_PORT);
const port = Number.isInteger(n) && n > 0 ? n : 4310;

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
try {
  const mapped = mapCursor(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  if (mapped) {
    await fetch(`http://127.0.0.1:${port}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mapped),
      signal: AbortSignal.timeout(2000),
    });
  }
} catch { /* not JSON, or the office is closed: the agent carries on */ }
process.stdout.write('{}\n');
