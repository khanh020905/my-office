import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOverlap, fileOf, portInUse, WINDOW } from '../../server/overlap.mjs';

test('the port a command could not have, however the tool words it', () => {
  assert.equal(portInUse('Error: listen EADDRINUSE: address already in use :::3000'), 3000);
  assert.equal(portInUse('Error: listen EADDRINUSE: address already in use 127.0.0.1:5173\n    at Server.setupListenHandle'), 5173);
  assert.equal(portInUse(' ⚠ Port 3000 is in use, trying 3001 instead.'), 3000);
  assert.equal(portInUse('error: Port 8080 is already in use'), 8080);
  assert.equal(portInUse('OSError: [Errno 48] Address already in use'), null);   // (no number in it)
  assert.equal(portInUse('Compiled successfully'), null);
  assert.equal(portInUse(''), null);
});

test('the file a call edits, made absolute from the session folder', () => {
  assert.equal(fileOf({ file_path: '/p/src/a.ts' }), '/p/src/a.ts');
  assert.equal(fileOf({ file_path: 'src/a.ts' }, '/p'), '/p/src/a.ts');
  assert.equal(fileOf({ notebook_path: '/p/n.ipynb' }), '/p/n.ipynb');
  assert.equal(fileOf({ file_path: 'a.ts' }), '');   // (relative, and no folder to read it from)
  assert.equal(fileOf({ command: 'ls' }), '');
});

test('another session about to edit a file: told once, only within the window, never about its own edits', () => {
  let t = 1_000_000;
  const o = createOverlap({ now: () => t });
  o.edited('a', '/p/x.ts');
  assert.equal(o.before('a', '/p/x.ts'), null);   // (its own)
  assert.deepEqual(o.before('b', '/p/x.ts'), { other: 'a', at: 1_000_000 });
  assert.equal(o.before('b', '/p/x.ts'), null);   // (said once)
  assert.equal(o.before('b', '/p/y.ts'), null);   // (another file)
  // b edits it now: a is told about b
  t += 1000; o.edited('b', '/p/x.ts');
  assert.deepEqual(o.before('a', '/p/x.ts'), { other: 'b', at: t });
  // long after: nothing
  o.edited('c', '/p/z.ts'); t += WINDOW + 1;
  assert.equal(o.before('d', '/p/z.ts'), null);
});

test('a word for a session, given once with its next call; a port clash said once per window', () => {
  let t = 0;
  const o = createOverlap({ now: () => t });
  o.note('a', 'port 3000'); o.note('a', 'port 3000'); o.note('a', 'port 5173');
  assert.equal(o.take('a'), 'port 3000\n\nport 5173');
  assert.equal(o.take('a'), '');
  assert.equal(o.portOnce('a', 3000), true);
  assert.equal(o.portOnce('a', 3000), false);
  assert.equal(o.portOnce('b', 3000), true);
  t += WINDOW + 1;
  assert.equal(o.portOnce('a', 3000), true);
});
