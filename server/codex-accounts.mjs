// "Nhiều tài khoản Codex": the ChatGPT accounts Codex signs in with, one at a time. Codex keeps its sign-in in
// $CODEX_HOME/auth.json (~/.codex): the seat. Each account the office knows has a copy of its own in <dir>/<id>/, a
// Codex home of its own, so that `codex app-server` (Codex's own protocol, the one the editors' extension speaks) reads
// that account's usage and refreshes its tokens without touching the seat. Using an account = its auth.json into the
// seat, the one there saved back to its copy first (Codex rotates refresh tokens: the newest must be kept). Codex reads
// the seat once, at start: a codex started after that uses the new account; one already running (the editor's panel)
// keeps the old one until it starts again (Reload Window). With switching on, the seat moves to the next account with
// room when the one in it runs out. An account signed in anywhere else (the panel, `codex login`) lands in the seat:
// it is added by itself.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const FULL = 98;   // a window this used: the account is out until it resets
const SEAT_EVERY = 2 * 60e3, SEAT_IDLE_EVERY = 10 * 60e3, OTHER_EVERY = 20 * 60e3, SIGNED_OUT_EVERY = 6 * 3600e3;

/** A JWT's claims (not verified: only to name the account), {} when it isn't one. */
export function jwtClaims(t) {
  try { return JSON.parse(Buffer.from(String(t).split('.')[1], 'base64url').toString('utf8')) || {}; } catch { return {}; }
}
/** The ChatGPT account an auth.json is signed in with: { key, email, name, plan }; null for none (signed out, an API key). */
export function codexIdentity(auth) {
  const t = auth?.tokens; if (!t?.id_token && !t?.access_token) return null;
  const c = jwtClaims(t.id_token), a = c['https://api.openai.com/auth'] || jwtClaims(t.access_token)['https://api.openai.com/auth'] || {};
  const account = t.account_id || a.chatgpt_account_id || '', user = a.chatgpt_user_id || a.user_id || c.sub || '';
  if (!account && !user && !c.email) return null;
  return { key: `${user}|${account}|${c.email || ''}`, email: c.email || '', name: c.name || '', plan: a.chatgpt_plan_type || '' };
}
// (Codex sends seconds; a millisecond time is left as it is)
const ms = (t) => (!t ? 0 : t < 1e12 ? t * 1000 : t);
/** Codex's usage (account/rateLimits/read) as the office's limit rows: the 5-hour window, then the week. */
export function codexWindows(r) {
  const s = r?.rateLimits || {}, out = [];
  for (const [w, guess] of [[s.primary, 'session'], [s.secondary, 'weekly']]) {
    if (!w || typeof w.usedPercent !== 'number') continue;
    const mins = w.windowDurationMins || 0;
    out.push({ key: mins ? (mins <= 24 * 60 ? 'session' : 'weekly') : guess, mins, pct: Math.max(0, Math.min(100, w.usedPercent)), resetsAt: ms(w.resetsAt) });
  }
  return out;
}
/** Until when an account can't be used: a window nearly used up, or Codex saying it has reached a limit; 0 = it has room.
 *  A reading from before a reset says nothing about after it. */
export function outUntil(a, now = Date.now()) {
  let until = 0;
  const live = (a.windows || []).filter((w) => w.resetsAt > now);
  for (const w of live) if (w.pct >= FULL) until = Math.max(until, w.resetsAt);
  if (a.reached && a.at) until = Math.max(until, ...live.map((w) => w.resetsAt), a.at + 15 * 60e3);
  return until > now ? until : 0;
}
// the program a running codex is, from its command line ('' when it is no codex): which editor's extension, or a terminal
const EDITORS = [['.antigravity-ide', 'Antigravity IDE'], ['.antigravity', 'Antigravity'], ['.vscode-insiders', 'VS Code Insiders'], ['.vscode', 'VS Code'], ['.cursor', 'Cursor'], ['.windsurf', 'Windsurf'], ['.kiro', 'Kiro'], ['.trae', 'Trae']];
export function codexProgram(args) {
  const a = String(args || '');
  if (!/(^|[\\/])codex(\.exe)?( |$)/.test(a)) return '';
  const ed = EDITORS.find(([dot]) => a.includes(`${path.sep}${dot}${path.sep}`) || a.includes(`/${dot}/`));
  return ed ? ed[1] : 'terminal';
}

/**
 * @param {{ dir: string, seat: () => string, bin: () => (string | null), procs?: () => Promise<{ pid: number, start: number, args: string }[]>,
 *   openUrl?: (url: string) => void, now?: () => number, log?: (s: string) => void, onChange?: (what?: object) => void }} o
 */
export function createCodexAccounts({ dir, seat, bin, procs = async () => [], openUrl = () => {}, now = Date.now, log = () => {}, onChange = () => {} }) {
  const FILE = path.join(dir, 'accounts.json');
  /** list: [{ id, key, email, name, plan, label, windows, reached, at, note, tried }]; order: ids; tenure: [{ id, from }] which
   *  account sat in the seat since when (a codex started at t uses the one there at t) */
  let st = { list: [], order: [], auto: false, tenure: [] };
  try { st = { ...st, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* none yet */ }
  const save = () => { try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(st), { mode: 0o600 }); } catch { /* read-only data */ } };
  const home = (id) => path.join(dir, id);
  const find = (id) => st.list.find((a) => a.id === id);
  const seatFile = () => path.join(seat(), 'auth.json');
  let seatId = null, seatText = null, seatNote = '', running = [], login = null;
  const mine = new Set();   // (the app-servers the office starts itself: not "a codex at work")

  async function writeSecret(file, text) {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.office-tmp`;
    await fsp.writeFile(tmp, text, { mode: 0o600 });
    await fsp.rename(tmp, file);
  }
  async function keep(id, text) {   // an account's newest sign-in into its own copy
    const f = path.join(home(id), 'auth.json');
    let was = null; try { was = await fsp.readFile(f, 'utf8'); } catch { /* a new account */ }
    if (was !== text) await writeSecret(f, text);
  }
  function addAccount(who) {
    let id = crypto.createHash('sha256').update(who.key).digest('hex').slice(0, 10);
    while (find(id)) id += 'x';
    const a = { id, key: who.key, email: who.email, name: who.name, plan: who.plan, label: '', windows: [], reached: false, at: 0, note: '', tried: 0 };
    st.list.push(a); st.order.push(id);
    log(`codex: account added (${who.email || id})`);
    return a;
  }

  /** What sits in the seat now: an account the office doesn't know yet is added, the newest tokens saved to its copy. */
  async function syncSeat() {
    let text = ''; try { text = await fsp.readFile(seatFile(), 'utf8'); } catch { /* signed out */ }
    if (text === seatText) return;
    seatText = text;
    let auth = null; try { auth = JSON.parse(text); } catch { /* not JSON */ }
    const who = codexIdentity(auth);
    seatNote = !text ? 'signedOut' : !who ? (auth?.OPENAI_API_KEY ? 'apiKey' : 'unknown') : '';
    let a = who && st.list.find((x) => x.key === who.key);
    if (who && !a) a = addAccount(who);
    if (a) { Object.assign(a, { email: who.email || a.email, name: who.name || a.name, plan: who.plan || a.plan }); await keep(a.id, text).catch(() => {}); }
    const was = seatId; seatId = a?.id || null;
    if (seatId !== (st.tenure.at(-1)?.id ?? null)) { st.tenure.push({ id: seatId, from: st.tenure.length ? now() : 0 }); st.tenure = st.tenure.slice(-12); }
    save();
    if (seatId !== was) { onChange(); if (a && !a.at) readSoon(a.id); }
  }
  // the account a codex started at `t` (seconds) signed in with: the one in the seat then
  const accountAt = (t) => { let id = null; for (const x of st.tenure) if (x.from <= t * 1000) id = x.id; return id; };
  async function look() {
    const list = await procs().catch(() => []);
    running = list.filter((p) => !mine.has(p.pid)).map((p) => ({ pid: p.pid, where: codexProgram(p.args), id: accountAt(p.start) })).filter((p) => p.where);
  }

  // Codex's own protocol, on an account's home: initialize, then each call in turn; the program ends after the last answer
  function rpc(home_, calls, timeout = 25_000) {
    const b = bin(); if (!b) return Promise.resolve({ error: 'noCli' });
    return new Promise((resolve) => {
      let child;
      try { child = spawn(/\.m?js$/.test(b) ? process.execPath : b, [...(/\.m?js$/.test(b) ? [b] : []), 'app-server'], { env: { ...process.env, CODEX_HOME: home_ }, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true }); }
      catch { resolve({ error: 'noCli' }); return; }
      mine.add(child.pid);
      const got = [];
      let over = false;
      const done = (r) => { if (over) return; over = true; clearTimeout(timer); try { child.kill(); } catch { /* gone */ } mine.delete(child.pid); resolve(r); };
      const timer = setTimeout(() => done({ error: 'timeout', got }), timeout);
      const send = (o) => { try { child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...o })}\n`); } catch { /* closed */ } };
      let buf = '', next = 0;
      const ask = () => { const [method, params] = calls[next]; send({ id: next + 2, method, params }); };
      child.stdout.on('data', (d) => {
        buf += d; let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          let m; try { m = JSON.parse(line); } catch { continue; }
          if (m.id === 1) { send({ method: 'initialized' }); ask(); continue; }
          if (m.id !== next + 2) continue;
          got.push(m.error ? { error: m.error.message || 'error' } : m.result);
          if (++next >= calls.length) done({ got }); else ask();
        }
      });
      child.on('error', () => done({ error: 'noCli', got }));
      child.on('exit', () => done({ error: got.length < calls.length ? 'exited' : null, got }));
      child.stdin.on('error', () => {});
      send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'my-office', title: 'My Office', version: '1' }, capabilities: null } });
    });
  }

  /** An account's usage, read by Codex itself: from the seat for the one in it, else from its own copy (never while a
   *  codex started on it is still running: that one may be refreshing the same tokens). */
  let queue = Promise.resolve();
  function read(id) { queue = queue.then(() => readNow(id)).catch(() => {}); return queue; }
  async function readNow(id) {
    const a = find(id); if (!a) return;
    a.tried = now();
    const inSeat = id === seatId;
    if (!inSeat && running.some((p) => p.id === id)) return;
    const r = await rpc(inSeat ? seat() : home(id), [['account/read', {}], ['account/rateLimits/read', { excludeResetCreditDetails: true }]]);
    const [acc, lim] = r.got || [];
    if (r.error === 'noCli') a.note = 'noCli';
    else if (acc && !acc.error && !acc.account) a.note = 'signedOut';
    else if (lim && !lim.error) {
      Object.assign(a, { windows: codexWindows(lim), reached: !!lim.rateLimits?.rateLimitReachedType || lim.ordinaryUsageAllowed === false, at: now(), note: '' });
      if (lim.rateLimits?.planType) a.plan = lim.rateLimits.planType;
      if (acc?.account?.email) a.email = acc.account.email;
    } else a.note = /auth/i.test(lim?.error || '') ? 'signedOut' : 'readFailed';
    if (inSeat) await syncSeat();   // (Codex may have refreshed the seat's tokens: their copy follows)
    save(); onChange();
    if (inSeat) autoSwitch();
  }
  const readSoon = (id) => setTimeout(() => read(id), 300).unref?.();

  const ordered = () => [...st.list].sort((x, y) => st.order.indexOf(x.id) - st.order.indexOf(y.id));
  /** An account into the seat (`why`: 'you' or 'auto'). */
  async function switchTo(id, why = 'you') {
    const a = find(id); if (!a) return { ok: false, code: 'noAccount' };
    await syncSeat();
    if (id === seatId) return { ok: true, same: true };
    let text; try { text = await fsp.readFile(path.join(home(id), 'auth.json'), 'utf8'); } catch { return { ok: false, code: 'noCopy' }; }
    try { await writeSecret(seatFile(), text); } catch { return { ok: false, code: 'seatFailed' }; }
    const from = seatId;
    seatText = text; seatId = id; seatNote = '';
    st.tenure.push({ id, from: now() }); st.tenure = st.tenure.slice(-12); save();
    log(`codex: ${from || '-'} -> ${id} (${why})`);
    await look();
    onChange({ switched: { from, to: id, why, until: from ? outUntil(find(from) || {}, now()) : 0 } });
    readSoon(id);
    return { ok: true, older: running.filter((p) => p.id !== id) };
  }
  // with switching on: the seat's account out, the next one in the order with room (none: stay)
  let switching = false;
  async function autoSwitch() {
    const a = find(seatId);
    if (!st.auto || !a || switching || !outUntil(a, now())) return;
    const next = ordered().find((x) => x.id !== a.id && x.note !== 'signedOut' && !outUntil(x, now()));
    if (!next) return;
    switching = true;
    try { await switchTo(next.id, 'auto'); } finally { switching = false; }
  }

  /** Signing a new account in: a Codex home of its own for the sign-in, the login page in the browser, and the account
   *  added when Codex says it is done (one that is known already: its copy renewed, unless it is the one in the seat). */
  function addStart() {
    if (login?.state === 'waiting') return loginOut();
    if (!bin()) { login = { state: 'failed', note: 'noCli' }; return loginOut(); }
    const tmp = path.join(dir, `_login-${now().toString(36)}`);
    fs.mkdirSync(tmp, { recursive: true });
    const b = bin(), js = /\.m?js$/.test(b);
    let child;
    // (the sign-in into a file, whatever Codex's default store: the office moves it into the seat later)
    try { child = spawn(js ? process.execPath : b, [...(js ? [b] : []), 'app-server', '-c', 'cli_auth_credentials_store="file"'], { env: { ...process.env, CODEX_HOME: tmp }, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true }); }
    catch { login = { state: 'failed', note: 'noCli' }; return loginOut(); }
    mine.add(child.pid);
    const L = login = { state: 'waiting', url: '', note: '', name: '', child, tmp };
    const send = (o) => { try { child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...o })}\n`); } catch { /* closed */ } };
    const end = (state, note = '') => {
      if (L.state !== 'waiting') return;
      Object.assign(L, { state, note }); clearTimeout(L.timer);
      try { child.kill(); } catch { /* gone */ }
      mine.delete(child.pid);
      setTimeout(() => fsp.rm(tmp, { recursive: true, force: true }).catch(() => {}), 1500).unref?.();
      onChange();
    };
    L.timer = setTimeout(() => end('failed', 'timeout'), 15 * 60e3); L.timer.unref?.();
    let buf = '';
    child.stdout.on('data', async (d) => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.id === 1) { send({ method: 'initialized' }); send({ id: 2, method: 'account/login/start', params: { type: 'chatgpt' } }); }
        else if (m.id === 2) {
          if (m.error || !m.result?.authUrl) { end('failed', m.error?.message || ''); continue; }
          L.url = m.result.authUrl; L.loginId = m.result.loginId; openUrl(L.url); onChange();
        } else if (m.method === 'account/login/completed') {
          if (!m.params?.success) { end('failed', m.params?.error || ''); continue; }
          const r = await saveLogin(tmp);
          L.name = r.name || ''; end(r.ok ? 'done' : 'failed', r.ok ? '' : r.code);
        }
      }
    });
    child.on('error', () => end('failed', 'noCli'));
    child.on('exit', () => end('failed', 'exited'));
    child.stdin.on('error', () => {});
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'my-office', title: 'My Office', version: '1' }, capabilities: null } });
    return loginOut();
  }
  async function saveLogin(tmp) {
    let text = ''; try { text = await fsp.readFile(path.join(tmp, 'auth.json'), 'utf8'); } catch { return { ok: false, code: 'noAuth' }; }
    let auth = null; try { auth = JSON.parse(text); } catch { /* not JSON */ }
    const who = codexIdentity(auth); if (!who) return { ok: false, code: 'noAuth' };
    let a = st.list.find((x) => x.key === who.key);
    if (a && a.id === seatId) return { ok: true, name: who.email, known: true };   // (the seat's own sign-in stays the one in use)
    if (!a) a = addAccount(who);
    Object.assign(a, { email: who.email, name: who.name, plan: who.plan || a.plan, note: '' });
    await keep(a.id, text);
    save(); readSoon(a.id);
    return { ok: true, name: who.email };
  }
  function addCancel() {
    if (login?.state !== 'waiting') return;
    if (login.loginId) { try { login.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'account/login/cancel', params: { loginId: login.loginId } })}\n`); } catch { /* closed */ } }
    const L = login; setTimeout(() => { if (L.state === 'waiting') { L.state = 'cancelled'; try { L.child.kill(); } catch { /* gone */ } mine.delete(L.child.pid); fsp.rm(L.tmp, { recursive: true, force: true }).catch(() => {}); onChange(); } }, 300);
  }
  const loginOut = () => (login ? { state: login.state, url: login.url || '', note: login.note || '', name: login.name || '' } : null);

  async function remove(id) {
    const a = find(id); if (!a) return { ok: false, code: 'noAccount' };
    if (id === seatId) return { ok: false, code: 'inSeat' };
    st.list = st.list.filter((x) => x !== a); st.order = st.order.filter((x) => x !== id); save();
    await fsp.rm(home(id), { recursive: true, force: true }).catch(() => {});
    log(`codex: account removed (${a.email || id})`);
    onChange();
    return { ok: true };
  }
  function rename(id, label) { const a = find(id); if (!a) return { ok: false }; a.label = String(label || '').slice(0, 24); save(); onChange(); return { ok: true }; }
  function setAuto(on) { st.auto = !!on; save(); onChange(); if (st.auto) autoSwitch(); return { ok: true }; }
  function setOrder(ids) {
    const all = st.list.map((a) => a.id);
    if (!Array.isArray(ids) || ids.length !== all.length || !all.every((x) => ids.includes(x))) return { ok: false };
    st.order = [...ids]; save(); onChange(); return { ok: true };
  }

  /** What the plan card shows. */
  function out() {
    const t = now();
    return {
      cli: !!bin(), seat: seatNote, now: seatId, auto: !!st.auto, login: loginOut(),
      list: ordered().map((a) => ({ id: a.id, email: a.email, name: a.name, plan: a.plan, label: a.label, at: a.at, note: a.note, windows: (a.windows || []).filter((w) => w.resetsAt > t), until: outUntil(a, t) })),
      // a codex started on another account than the one in the seat: still on that one until it starts again
      older: running.filter((p) => p.id !== seatId).map((p) => ({ where: p.where, id: p.id })),
    };
  }

  // every 10 s the seat; once a minute what is running and whose usage is due (the seat's often while a codex runs)
  async function tick() {
    await syncSeat(); await look();
    const t = now(), busy = running.length > 0;
    for (const a of ordered()) {
      const every = a.note === 'signedOut' ? SIGNED_OUT_EVERY : a.id === seatId ? (busy ? SEAT_EVERY : SEAT_IDLE_EVERY) : OTHER_EVERY;
      if (t - (a.tried || 0) >= every) read(a.id);
    }
  }
  const timers = [];
  function start() {
    syncSeat().then(tick).catch(() => {});
    timers.push(setInterval(() => syncSeat().catch(() => {}), 10_000), setInterval(() => tick().catch(() => {}), 60_000));
    for (const x of timers) x.unref?.();
  }
  function stop() { for (const x of timers) clearInterval(x); if (login?.state === 'waiting') addCancel(); }

  return { start, stop, out, switchTo, read, addStart, addCancel, remove, rename, setAuto, setOrder, syncSeat, tick, autoSwitch, seatNow: () => seatId };
}
