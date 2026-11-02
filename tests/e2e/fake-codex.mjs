#!/usr/bin/env node
// A stand-in for `codex app-server` (server/codex-accounts.mjs speaks to it): Codex's JSON-RPC over stdin/stdout, the
// account in $CODEX_HOME/auth.json. Usage comes from $FAKE_CODEX_DIR/<email>.json ({ primary, secondary, reached }),
// 10% and 5% otherwise; each call is noted in $FAKE_CODEX_DIR/calls.log as "<CODEX_HOME> <method>". Signing in writes an
// auth.json for $FAKE_CODEX_DIR/next-login (an email; new@example.com when there is none) a moment after it starts.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const HOME = process.env.CODEX_HOME || '', DIR = process.env.FAKE_CODEX_DIR || '';
const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** an auth.json as Codex writes one, for `email` (tests build theirs with it too) */
export function fakeAuth(email, plan = 'plus', refresh = 'rt-1') {
  const jwt = (claims) => `${b64({ alg: 'none' })}.${b64(claims)}.sig`;
  const auth = { chatgpt_plan_type: plan, chatgpt_account_id: `acc-${email}`, chatgpt_user_id: `user-${email}` };
  return { auth_mode: 'chatgpt', OPENAI_API_KEY: null, last_refresh: new Date().toISOString(),
    tokens: { id_token: jwt({ email, name: email.split('@')[0], 'https://api.openai.com/auth': auth }), access_token: jwt({ exp: Math.floor(Date.now() / 1000) + 864000, 'https://api.openai.com/auth': auth }), refresh_token: `${refresh}-${email}`, account_id: `acc-${email}` } };
}
const emailOf = () => { try { const t = JSON.parse(read(path.join(HOME, 'auth.json'))).tokens; return JSON.parse(Buffer.from(t.id_token.split('.')[1], 'base64url')).email; } catch { return ''; } };

if (process.argv[2] === 'app-server') {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    let m; try { m = JSON.parse(line); } catch { return; }
    if (DIR) fs.appendFileSync(path.join(DIR, 'calls.log'), `${HOME} ${m.method}\n`);
    const email = emailOf(), now = Math.floor(Date.now() / 1000);
    if (m.method === 'initialize') out({ id: m.id, result: { userAgent: 'fake-codex', codexHome: HOME } });
    else if (m.method === 'account/read') out({ id: m.id, result: { account: email ? { type: 'chatgpt', email, planType: 'plus' } : null, requiresOpenaiAuth: true } });
    else if (m.method === 'account/rateLimits/read') {
      if (!email) { out({ id: m.id, error: { code: -32600, message: 'codex account authentication required to read rate limits' } }); return; }
      let u = {}; try { u = JSON.parse(read(path.join(DIR, `${email}.json`))); } catch { /* the usual */ }
      const w = (pct, mins) => ({ usedPercent: pct, windowDurationMins: mins, resetsAt: now + mins * 30 });
      out({ id: m.id, result: { ordinaryUsageAllowed: !u.reached, rateLimits: { limitId: 'codex', primary: w(u.primary ?? 10, 300), secondary: w(u.secondary ?? 5, 10080), planType: 'plus', rateLimitReachedType: u.reached ? 'rate_limit_reached' : null } } });
    } else if (m.method === 'account/login/start') {
      out({ id: m.id, result: { type: 'chatgpt', loginId: 'login-1', authUrl: 'https://auth.example.com/oauth/authorize?fake=1' } });
      setTimeout(() => {
        const next = read(path.join(DIR, 'next-login')).trim() || 'new@example.com';
        fs.writeFileSync(path.join(HOME, 'auth.json'), JSON.stringify(fakeAuth(next)));
        out({ method: 'account/login/completed', params: { loginId: 'login-1', success: true, error: null } });
      }, 300);
    } else if (m.method === 'account/login/cancel') out({ id: m.id, result: { status: 'canceled' } });
    else if (m.id !== undefined) out({ id: m.id, error: { code: -32601, message: 'unknown method' } });
  });
}
