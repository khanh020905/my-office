import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createAntigravityAccounts, makeDb, KEYS, tokenOf, statusOf, pickedModel, quotaRows, outUntil } from '../../server/antigravity-accounts.mjs';

import { token, status, prefs, RESET } from '../e2e/fake-antigravity.mjs';

let sqlite = true;
try { execFileSync('sqlite3', ['-version'], { stdio: 'ignore' }); } catch { sqlite = false; }

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-ag-')), file = path.join(root, 'state.vscdb');
  execFileSync('sqlite3', [file, 'CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);']);
  const db = makeDb(file), ide = { open: false, quits: 0, launches: 0, busy: 0 }, changes = [];
  const ag = createAntigravityAccounts({ dir: path.join(root, 'office'), db: () => db, busyIn: async () => ide.busy, onChange: (w) => changes.push(w || {}),
    app: { name: 'Fake IDE', running: async () => ide.open, quit: async () => { ide.quits++; ide.open = false; return true; }, launch: async () => { ide.launches++; ide.open = true; return true; } } });
  const signIn = (who, left) => db.write({ [KEYS.token]: token(who), [KEYS.status]: status(who, left), [KEYS.prefs]: prefs(1319) });
  const seatWho = async () => tokenOf((await db.read([KEYS.token]))[KEYS.token])?.access.slice(5);
  return { ag, db, ide, changes, signIn, seatWho };
}
const idOf = (ag, who) => ag.out().list.find((a) => a.email === `${who}@example.com`)?.id;

test('the IDE\'s records: the sign-in, the account and its quotas, the model in use', () => {
  const t = tokenOf(token('a'));
  assert.equal(t.refresh, '1//refresh-a'); assert.equal(t.expires, 1_900_000_000_000);
  const st = statusOf(status('a', 0.25));
  assert.deepEqual([st.email, st.name, st.tier, st.tierName], ['a@example.com', 'Name a', 'free-tier', 'Antigravity Starter Quota']);
  assert.deepEqual(st.models.map((m) => [m.id, Math.round(m.left * 100)]), [[1318, 25], [1319, 25], [1035, 50]]);
  assert.equal(statusOf(status('a', 0)).models[0].left, 0);   // (a zero is left out: nothing left)
  assert.equal(pickedModel(prefs(1319)), 1319);
  const rows = quotaRows(statusOf(status('a', 0.25)).models, 1035);
  assert.deepEqual(rows.map((r) => [r.label, r.pct, r.picked]), [['Claude Sonnet 4.6', 50, true], ['Gemini 3.8 Flash', 75, false]]);
  assert.ok(outUntil(statusOf(status('a', 0)), 1319) > Date.now());
  assert.equal(outUntil(statusOf(status('a', 0)), 1035), 0);   // (the Claude model still has half)
  assert.equal(outUntil(statusOf(status('a', 0)), 1319, (RESET + 10) * 1000), 0);   // (after its reset)
  assert.equal(tokenOf('not base64 protobuf'), null);
});

test('accounts as they sign in, a switch with the IDE closed, one waiting for it to close, one closing and reopening it', { skip: !sqlite && 'no sqlite3' }, async () => {
  const { ag, ide, changes, signIn, seatWho } = setup();
  await signIn('a'); await ag.scan();
  const a = idOf(ag, 'a');
  assert.ok(a); assert.equal(ag.out().now, a); assert.equal(ag.out().picked, 'Gemini 3.8 Flash');
  // signing in as B in the IDE: added, with B's own name (the status changed with the sign-in)
  await signIn('b'); await ag.scan();
  const b = idOf(ag, 'b');
  assert.ok(b); assert.equal(ag.out().now, b);
  assert.deepEqual(ag.out().list.map((x) => x.email).sort(), ['a@example.com', 'b@example.com']);
  // the IDE closed: at once
  assert.ok((await ag.switchTo(a)).ok);
  assert.equal(await seatWho(), 'a'); assert.equal(ag.out().now, a);
  // open: when it closes
  ide.open = true;
  const r = await ag.switchTo(b);
  assert.ok(r.pending); assert.equal(ag.out().pending, b);
  await ag.scan(); assert.equal(await seatWho(), 'a');
  ide.open = false; await ag.scan();
  assert.equal(await seatWho(), 'b'); assert.equal(ag.out().pending, null);
  assert.ok(changes.some((w) => w.switched?.to === b && w.switched.when === 'closed'));
  // asked to: closed, written, opened again; never while a Claude session in it is at work
  ide.open = true; ide.busy = 2;
  assert.deepEqual(await ag.switchTo(a, { restart: true }), { ok: false, code: 'busy', n: 2 });
  ide.busy = 0;
  assert.ok((await ag.switchTo(a, { restart: true })).restarted);
  assert.deepEqual([ide.quits, ide.launches, await seatWho()], [1, 1, 'a']);
  assert.equal(ag.remove(a).code, 'inSeat');
  ag.stop();
});

test('switching by itself when the model in use runs out, and adding an account', { skip: !sqlite && 'no sqlite3' }, async () => {
  const { ag, db, ide, signIn, seatWho } = setup();
  await signIn('b'); await ag.scan();
  await signIn('a'); await ag.scan();
  const [a, b] = [idOf(ag, 'a'), idOf(ag, 'b')];
  ag.setAuto(true);
  await signIn('a', 0); await ag.scan();   // (the IDE saved A's quota: Gemini used up)
  assert.ok(ag.out().list.find((x) => x.id === a).until > Date.now());
  assert.equal(await seatWho(), 'b');
  assert.equal(ag.out().now, b);
  // adding: the sign-in taken out (A and B kept), the IDE opened to sign in
  assert.ok((await ag.add()).ok);
  assert.equal(ide.launches, 1);
  assert.deepEqual(await db.read([KEYS.token, KEYS.status]), {});
  assert.equal(ag.out().adding.state, 'waiting');
  await signIn('c'); await ag.scan();
  assert.equal(ag.out().adding.state, 'done'); assert.equal(ag.out().adding.name, 'c@example.com');
  assert.equal(ag.out().list.length, 3);
  // B signed in again (Google gives a new refresh token each time): still one B, in its place, now with the new sign-in
  await db.write({ [KEYS.token]: token('b', 2) }); await ag.scan();   // (the status is still C's for now)
  assert.equal(ag.out().list.length, 4);
  await db.write({ [KEYS.status]: status('b', 0.9) }); await ag.scan();
  assert.deepEqual(ag.out().list.map((x) => x.email), ['b@example.com', 'a@example.com', 'c@example.com']);
  assert.equal(ag.out().now, b);
  ag.stop();
});
