import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPush, encrypt, serviceOk } from '../../server/push.mjs';

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
// what the phone's browser does with it (RFC 8291 / 8188, the receiving side), to check the office's side against
function decrypt(ua, auth, msg) {
  const salt = msg.subarray(0, 16), rs = msg.readUInt32BE(16), idlen = msg[20], asPub = msg.subarray(21, 21 + idlen), body = msg.subarray(21 + idlen);
  assert.equal(rs, 4096); assert.equal(idlen, 65);
  const shared = ua.computeSecret(asPub);
  const ikm = hmac(hmac(auth, shared), Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16), nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(body.subarray(-16));
  const plain = Buffer.concat([d.update(body.subarray(0, -16)), d.final()]);
  assert.equal(plain.at(-1), 2);   // (the last record's delimiter)
  return plain.subarray(0, -1).toString('utf8');
}

test('a push message is what the phone can read back (aes128gcm, keyed from its p256dh and auth)', () => {
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
  const auth = crypto.randomBytes(16), keys = { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') };
  const text = JSON.stringify({ title: 'Website-Ielts', body: 'Xong rồi sếp ơi ✅' });
  assert.equal(decrypt(ua, auth, encrypt(keys, text)), text);
});

test('the office posts only to the browsers\' push services', () => {
  for (const ok of ['https://fcm.googleapis.com/fcm/send/abc', 'https://web.push.apple.com/QG1', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-par02p.notify.windows.com/w/?token=x']) assert.ok(serviceOk(ok), ok);
  for (const no of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://evil.example/push.apple.com', 'https://push.apple.com.evil.example/x', 'not a url']) assert.ok(!serviceOk(no), no);
});

test('subscriptions: kept, checked, and the key pair made once', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-push-'));
  try {
    const a = createPush({ dataDir: dir }), b = createPush({ dataDir: dir });
    assert.equal(a.publicKey, b.publicKey);
    assert.equal(Buffer.from(a.publicKey, 'base64url').length, 65);
    const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
    const sub = { endpoint: 'https://web.push.apple.com/QG1', keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
    assert.equal(a.add({ ...sub, endpoint: 'https://evil.example/x' }), false);
    assert.equal(a.add({ ...sub, keys: { ...sub.keys, auth: 'short' } }), false);
    assert.equal(a.add(sub, 'iPhone'), true);
    assert.equal(createPush({ dataDir: dir }).count(), 1);
    a.remove(sub.endpoint);
    assert.equal(createPush({ dataDir: dir }).count(), 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
