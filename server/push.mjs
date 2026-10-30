// Notifications on your phone, even with the office closed and the phone locked (Web Push), with nothing but node:crypto:
// the message encrypted for that phone (RFC 8291, aes128gcm) and signed for the push service (VAPID, RFC 8292), sent
// to the service the phone's browser gave (Apple's, Google's, Mozilla's, Microsoft's: no other host is posted to).
// The office's key pair is made once and kept in data/vapid.json; the phones that said yes, in data/push.json.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const b64 = (b) => Buffer.from(b).toString('base64url');
const unb64 = (s) => Buffer.from(String(s || ''), 'base64url');
// the push services the browsers use (an endpoint anywhere else is turned down: the office posts only to these)
const SERVICES = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];
export const serviceOk = (endpoint) => { try { const u = new URL(endpoint); return u.protocol === 'https:' && SERVICES.some((r) => r.test(u.hostname)); } catch { return false; } };
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

/** The message for one phone: aes128gcm, one record (RFC 8188), keyed from its p256dh and auth (RFC 8291). */
export function encrypt({ p256dh, auth }, plain, { salt = crypto.randomBytes(16), ecdh = null } = {}) {
  const ua = unb64(p256dh), secret = unb64(auth);
  const as = ecdh || crypto.createECDH('prime256v1'); if (!ecdh) as.generateKeys();
  const asPub = as.getPublicKey(), shared = as.computeSecret(ua);
  const ikm = hmac(hmac(secret, shared), Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([c.update(Buffer.concat([Buffer.from(plain), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21); salt.copy(head, 0); head.writeUInt32BE(4096, 16); head[20] = asPub.length;
  return Buffer.concat([head, asPub, body]);
}

/** { publicKey, count(), has(endpoint), add(sub, ua), remove(endpoint), notify(msg), test(endpoint) } */
export function createPush({ dataDir, subject = 'mailto:my-office@users.noreply.github.com', log = () => {} }) {
  const KEYS = path.join(dataDir, 'vapid.json'), SUBS = path.join(dataDir, 'push.json');
  const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  let keys = read(KEYS);
  if (!keys?.priv?.d) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    keys = { pub: publicKey.export({ format: 'jwk' }), priv: privateKey.export({ format: 'jwk' }) };
    try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(KEYS, JSON.stringify(keys), { mode: 0o600 }); } catch { /* read-only data: a new pair each start */ }
  }
  const pubRaw = Buffer.concat([Buffer.from([4]), unb64(keys.pub.x), unb64(keys.pub.y)]), priv = crypto.createPrivateKey({ key: keys.priv, format: 'jwk' });
  let subs = (read(SUBS) || []).filter((s) => serviceOk(s?.endpoint));
  const save = () => { try { fs.writeFileSync(SUBS, JSON.stringify(subs), { mode: 0o600 }); } catch { /* read-only data */ } };
  // the signed note for the push service: who sends (the office's key), to which service, for 12 hours
  const jwts = new Map();
  function vapid(aud) {
    const hit = jwts.get(aud); if (hit && hit.until > Date.now() + 60e3) return hit.t;
    const exp = Math.floor(Date.now() / 1000) + 12 * 3600, data = `${b64(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))}.${b64(JSON.stringify({ aud, exp, sub: subject }))}`;
    const t = `${data}.${b64(crypto.sign('sha256', Buffer.from(data), { key: priv, dsaEncoding: 'ieee-p1363' }))}`;
    jwts.set(aud, { t, until: exp * 1000 }); return t;
  }
  async function send(sub, msg) {
    try {
      const r = await fetch(sub.endpoint, {
        method: 'POST', signal: AbortSignal.timeout(15_000),
        headers: { TTL: '86400', Urgency: msg.urgent ? 'high' : 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
          Authorization: `vapid t=${vapid(new URL(sub.endpoint).origin)}, k=${b64(pubRaw)}` },
        body: encrypt(sub.keys, JSON.stringify(msg)),
      });
      sub.last = { at: Date.now(), status: r.status };
      if (r.status === 404 || r.status === 410) { subs = subs.filter((s) => s !== sub); log(`push gone ${new URL(sub.endpoint).host}`); }
      else if (r.status >= 300) log(`push ${r.status} ${new URL(sub.endpoint).host} ${(await r.text().catch(() => '')).slice(0, 160)}`);
      save();
      return r.status;
    } catch (err) { sub.last = { at: Date.now(), status: 0 }; log(`push failed ${String(err.message || err).slice(0, 120)}`); return 0; }
  }
  return {
    publicKey: b64(pubRaw),
    count: () => subs.length,
    has: (endpoint) => subs.some((s) => s.endpoint === endpoint),
    /** a phone saying yes: { endpoint, keys: { p256dh, auth } } -> true, or false when it isn't one */
    add(sub, ua = '') {
      const p256dh = String(sub?.keys?.p256dh || ''), auth = String(sub?.keys?.auth || '');
      if (!serviceOk(sub?.endpoint) || unb64(p256dh).length !== 65 || unb64(auth).length !== 16) return false;
      subs = [...subs.filter((s) => s.endpoint !== sub.endpoint), { endpoint: String(sub.endpoint), keys: { p256dh, auth }, ua: String(ua).slice(0, 160), at: Date.now() }].slice(-20);
      save(); return true;
    },
    remove(endpoint) { const n = subs.length; subs = subs.filter((s) => s.endpoint !== endpoint); if (subs.length !== n) save(); },
    /** to every phone: { title, body, tag, url, urgent } */
    notify: (msg) => Promise.all(subs.map((s) => send(s, msg))),
    /** to one phone (or all, no endpoint): the statuses */
    test: (endpoint, msg) => Promise.all(subs.filter((s) => !endpoint || s.endpoint === endpoint).map((s) => send(s, msg))),
  };
}
