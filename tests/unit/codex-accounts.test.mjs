import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCodexAccounts, codexIdentity, codexProgram, codexWindows, outUntil } from '../../server/codex-accounts.mjs';
import { fakeAuth } from '../e2e/fake-codex.mjs';

const FAKE = path.resolve('tests/e2e/fake-codex.mjs');
// a Codex seat (~/.codex) signed in as `email`, the office's folder, and Codex as tests/e2e/fake-codex.mjs
function setup(email = 'a@example.com', more = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-codex-')), seat = path.join(root, 'seat'), fake = path.join(root, 'fake');
  fs.mkdirSync(seat); fs.mkdirSync(fake);
  if (email) fs.writeFileSync(path.join(seat, 'auth.json'), JSON.stringify(fakeAuth(email)));
  process.env.FAKE_CODEX_DIR = fake;
  const changes = [];
  const c = createCodexAccounts({ dir: path.join(root, 'office'), seat: () => seat, bin: () => FAKE, onChange: (w) => changes.push(w || {}), ...more });
  const usage = (mail, u) => fs.writeFileSync(path.join(fake, `${mail}.json`), JSON.stringify(u));
  const seatEmail = () => codexIdentity(JSON.parse(fs.readFileSync(path.join(seat, 'auth.json'), 'utf8')))?.email;
  return { c, root, seat, fake, changes, usage, seatEmail };
}
const idOf = (c, email) => c.out().list.find((a) => a.email === email)?.id;
const until = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };

test('reading an auth.json: who, the plan, the usage windows, out until when', () => {
  const who = codexIdentity(fakeAuth('a@example.com', 'pro'));
  assert.equal(who.email, 'a@example.com'); assert.equal(who.plan, 'pro');
  assert.notEqual(who.key, codexIdentity(fakeAuth('b@example.com')).key);
  assert.equal(codexIdentity({ OPENAI_API_KEY: 'sk-x', tokens: null }), null);
  const now = 1_800_000_000_000, ws = codexWindows({ rateLimits: { primary: { usedPercent: 99, windowDurationMins: 300, resetsAt: now / 1000 + 600 }, secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: now / 1000 + 86400 } } });
  assert.deepEqual(ws.map((w) => [w.key, w.pct]), [['session', 99], ['weekly', 40]]);
  assert.equal(outUntil({ windows: ws }, now), now + 600_000);
  assert.equal(outUntil({ windows: ws }, now + 700_000), 0);   // (after the reset: room again)
  assert.ok(outUntil({ windows: [{ pct: 20, resetsAt: now + 9e6 }], reached: true, at: now }, now) > now);   // (Codex says a limit is reached)
  assert.equal(codexProgram('/Users/x/.antigravity-ide/extensions/openai.chatgpt-26/bin/macos-aarch64/codex -c a=b app-server'), 'Antigravity IDE');
  assert.equal(codexProgram('node /opt/homebrew/bin/codex'), 'terminal');
  assert.equal(codexProgram('/usr/bin/codex-code-mode-host'), '');
});

test('the account in the seat is added by itself, read by Codex, and switched to another with its newest tokens kept', async () => {
  const { c, seat, changes, usage, seatEmail, fake } = setup('a@example.com');
  await c.syncSeat();
  const a = idOf(c, 'a@example.com');
  assert.ok(a); assert.equal(c.out().now, a);
  await c.read(a);
  assert.deepEqual(c.out().list[0].windows.map((w) => Math.round(w.pct)), [10, 5]);
  // a second account, signed in through the office (its own Codex home: the seat stays as it is)
  fs.writeFileSync(path.join(fake, 'next-login'), 'b@example.com');
  const L = c.addStart();
  assert.equal(L.state, 'waiting');
  assert.ok(await until(() => c.out().login?.state === 'done'), 'the sign-in finished');
  const b = idOf(c, 'b@example.com');
  assert.ok(b); assert.equal(seatEmail(), 'a@example.com');
  // Codex refreshed A's tokens in the seat meanwhile: switching keeps that newest copy for A
  fs.writeFileSync(path.join(seat, 'auth.json'), JSON.stringify(fakeAuth('a@example.com', 'plus', 'rt-2')));
  const r = await c.switchTo(b);
  assert.ok(r.ok);
  assert.equal(seatEmail(), 'b@example.com');
  assert.equal(c.out().now, b);
  assert.ok(changes.some((w) => w.switched?.to === b && w.switched.why === 'you'));
  usage('b@example.com', { primary: 30 });
  await c.switchTo(a);
  assert.equal(JSON.parse(fs.readFileSync(path.join(seat, 'auth.json'), 'utf8')).tokens.refresh_token, 'rt-2-a@example.com');
  // the one in use can't be forgotten; another one can, with its copy
  assert.equal((await c.remove(a)).code, 'inSeat');
  assert.ok((await c.remove(b)).ok);
  assert.equal(c.out().list.length, 1);
  c.stop();
});

test('switching by itself: the account in use runs out, the next one with room signs in', async () => {
  const { c, usage, seatEmail, changes } = setup('a@example.com');
  await c.syncSeat();
  const a = idOf(c, 'a@example.com');
  // B, signed in elsewhere earlier and known to the office
  const fake = process.env.FAKE_CODEX_DIR;
  fs.writeFileSync(path.join(fake, 'next-login'), 'b@example.com'); c.addStart();
  assert.ok(await until(() => c.out().login?.state === 'done'));
  const b = idOf(c, 'b@example.com');
  await c.read(b);
  c.setAuto(true);
  usage('a@example.com', { primary: 100 });
  await c.read(a);
  assert.ok(await until(() => seatEmail() === 'b@example.com'), 'the seat moved to B');
  assert.ok(changes.some((w) => w.switched?.why === 'auto' && w.switched.from === a && w.switched.until > Date.now()));
  // B out too, and A still out: it stays where it is
  usage('b@example.com', { reached: true });
  await c.read(b);
  assert.equal(seatEmail(), 'b@example.com');
  c.stop();
});

test('a codex started on the old account: shown as still on it, and its account not read meanwhile', async () => {
  let started = 0;
  const { c, fake } = setup('a@example.com', { procs: async () => (started ? [{ pid: 4242, start: started, args: '/h/.antigravity-ide/extensions/openai.chatgpt-1/bin/x/codex app-server' }] : []) });
  await c.syncSeat();
  const a = idOf(c, 'a@example.com');
  fs.writeFileSync(path.join(fake, 'next-login'), 'b@example.com'); c.addStart();
  assert.ok(await until(() => c.out().login?.state === 'done'));
  const b = idOf(c, 'b@example.com');
  started = Math.floor(Date.now() / 1000) - 60;   // (the editor's panel, open since a minute ago)
  const r = await c.switchTo(b);
  assert.deepEqual(r.older.map((p) => [p.where, p.id]), [['Antigravity IDE', a]]);
  assert.deepEqual(c.out().older, [{ where: 'Antigravity IDE', id: a }]);
  fs.writeFileSync(path.join(fake, 'calls.log'), '');
  await c.read(a);
  assert.ok(!fs.readFileSync(path.join(fake, 'calls.log'), 'utf8').includes('rateLimits'), 'not read while the old panel may refresh it');
  c.stop();
});
