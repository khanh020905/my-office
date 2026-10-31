import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { steerLine, inboundOf, inboundFrom, steerable, isSocket, deliver } from '../../server/steer.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-steer-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('the line a session\'s inbox takes', () => {
  assert.equal(steerLine('sửa luôn test'), '{"type":"user","message":{"role":"user","content":"sửa luôn test"}}\n');
  assert.equal(steerLine('a\nb "q"').split('\n').length, 2);   // (one line, whatever the note says)
});

test('what the settings say about messages from elsewhere: the strictest found', () => {
  assert.equal(inboundOf([undefined, null]), null);
  assert.equal(inboundOf(['accept']), 'accept');
  assert.equal(inboundOf(['accept', 'hold']), 'hold');
  assert.equal(inboundOf(['hold', 'refuse', 'accept']), 'refuse');
  assert.equal(inboundOf(['yes please']), null);
  const cfg = path.join(dir, 'cfg'), proj = path.join(dir, 'proj');
  fs.mkdirSync(cfg, { recursive: true }); fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(cfg, 'settings.json'), JSON.stringify({ crossSessionInbound: 'accept' }));
  assert.equal(inboundFrom({ configDir: cfg, cwd: proj }), 'accept');
  fs.writeFileSync(path.join(proj, '.claude', 'settings.local.json'), JSON.stringify({ crossSessionInbound: 'refuse' }));
  assert.equal(inboundFrom({ configDir: cfg, cwd: proj }), 'refuse');
  assert.equal(inboundFrom({ configDir: path.join(dir, 'none') }), null);
});

test('whether a note can reach a session now', () => {
  const sock = () => true;
  assert.deepEqual(steerable({ inbox: null }), { ok: false, why: 'noInbox' });
  assert.deepEqual(steerable({ inbox: '/x.sock', isSocket: () => false }), { ok: false, why: 'noInbox' });
  assert.deepEqual(steerable({ inbox: '/x.sock', mode: 'auto', isSocket: sock }), { ok: true });
  assert.deepEqual(steerable({ inbox: '/x.sock', mode: 'default', isSocket: sock }), { ok: true });
  // a session that skips permission prompts holds a message from another session, unless its settings accept them
  assert.deepEqual(steerable({ inbox: '/x.sock', mode: 'bypassPermissions', isSocket: sock }), { ok: false, why: 'bypass' });
  assert.deepEqual(steerable({ inbox: '/x.sock', mode: 'bypassPermissions', inbound: 'accept', isSocket: sock }), { ok: true });
  assert.deepEqual(steerable({ inbox: '/x.sock', inbound: 'hold', isSocket: sock }), { ok: false, why: 'hold' });
  assert.deepEqual(steerable({ inbox: '/x.sock', inbound: 'refuse', isSocket: sock }), { ok: false, why: 'refuse' });
});

test('a note written into an inbox socket, and none where nothing listens', { skip: process.platform === 'win32' }, async () => {
  const p = path.join(dir, 'in.sock'), got = [];
  const srv = net.createServer((c) => { let b = ''; c.on('data', (d) => { b += d; }); c.on('end', () => got.push(b)); });
  await new Promise((r) => srv.listen(p, r));
  assert.equal(isSocket(p), true);
  assert.equal(isSocket(path.join(dir, 'cfg')), false);
  assert.equal(await deliver(p, 'sai file rồi, dừng'), true);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(got.map((x) => JSON.parse(x)), [{ type: 'user', message: { role: 'user', content: 'sai file rồi, dừng' } }]);
  srv.close();
  assert.equal(await deliver(path.join(dir, 'gone.sock'), 'x'), false);
});
