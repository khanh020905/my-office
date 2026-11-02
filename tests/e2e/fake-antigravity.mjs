// Antigravity IDE's records, written the way it writes them into its state database (server/antigravity-accounts.mjs
// reads them): protobuf, wrapped in base64 entries. For the tests: a sign-in, what the IDE heard of the account (its
// quotas: the Gemini models `left`, the Claude one half), the model picked.
const vint = (n) => { const o = []; do { let b = n % 128; n = Math.floor(n / 128); if (n) b |= 128; o.push(b); } while (n); return Buffer.from(o); };
const fld = (f, v) => (typeof v === 'number' ? Buffer.concat([vint(f * 8), vint(v)]) : Buffer.concat([vint(f * 8 + 2), vint(v.length), v]));
const f32 = (f, x) => { const b = Buffer.alloc(4); b.writeFloatLE(x); return Buffer.concat([vint(f * 8 + 5), b]); };
const msg = (...p) => Buffer.concat(p), s = (x) => Buffer.from(x);
const wrapped = (name, rec) => msg(fld(1, msg(fld(1, s(name)), fld(2, msg(fld(1, s(rec.toString('base64')))))))).toString('base64');
// (n: signed in again, which gives a new refresh token)
export const token = (who, n = 1) => wrapped('oauthTokenInfoSentinelKey', msg(fld(1, s(`ya29.${who}`)), fld(2, s('Bearer')), fld(3, s(`1//refresh-${who}${n > 1 ? `-${n}` : ''}`)), fld(4, msg(fld(1, 1_900_000_000)))));
export const RESET = Math.floor(Date.now() / 1000) + 3 * 86400;
// left 0: written as proto3 writes a zero (left out)
export const status = (who, left = 1) => wrapped('userStatusSentinelKey', msg(fld(3, s(`Name ${who}`)), fld(7, s(`${who}@example.com`)),
  fld(33, msg(...[['Gemini 3.8 Flash (High)', 1318], ['Gemini 3.8 Flash (Medium)', 1319], ['Claude Sonnet 4.6 (Thinking)', 1035]].map(([n, id]) =>
    fld(1, msg(fld(1, s(n)), fld(2, msg(fld(1, id))), fld(15, msg(...((n.startsWith('Gemini') ? left : 0.5) ? [f32(1, n.startsWith('Gemini') ? left : 0.5)] : []), fld(2, msg(fld(1, RESET)))))))))),
  fld(36, msg(fld(1, s('free-tier')), fld(2, s('Antigravity Starter Quota'))))));
export const prefs = (id) => wrapped('last_selected_agent_model_sentinel_key', msg(fld(2, id)));

