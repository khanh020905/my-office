// "Nhiều tài khoản Antigravity": the Google accounts Antigravity IDE signs in with, one at a time. The IDE keeps its
// sign-in and what it last heard of the account (name, plan, each model's quota left and when it resets) in its own
// state database (User/globalStorage/state.vscdb, table ItemTable): antigravityUnifiedStateSync.oauthToken and
// .userStatus, protobuf records wrapped in base64. The office reads them (sqlite3, read-only) every few seconds and
// keeps each account's pair as it last saw it. Using an account = its pair written back while the IDE is closed: the IDE
// keeps that state in memory and writes it out when it quits, so a write while it runs would be lost. So with the IDE
// open, a switch waits until you close it (or, asked to, the office closes it and opens it again: never while a Claude
// session in it is at work). Adding an account: the IDE closed, its sign-in taken out (kept, not signed out: signing out
// may revoke the token), opened again; you sign in, and the office keeps the new account.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile, spawn } from 'node:child_process';

export const KEYS = { token: 'antigravityUnifiedStateSync.oauthToken', status: 'antigravityUnifiedStateSync.userStatus', prefs: 'antigravityUnifiedStateSync.modelPreferences' };
const EMPTY = 0.02;   // a model with this little left: the account is out of it until it resets

/* ---------- a little protobuf: enough to read the IDE's records (no schema: the field numbers the IDE writes) ---------- */
function varint(b, i) { let n = 0, s = 0, c; do { c = b[i++]; n += (c & 0x7f) * 2 ** s; s += 7; } while (c >= 0x80 && i < b.length); return [n, i]; }
/** A message's fields in order: { f, v } (v: a number for a varint, a Buffer for anything else). Throws on a broken one. */
export function pbFields(b) {
  const out = []; let i = 0;
  while (i < b.length) {
    let k; [k, i] = varint(b, i);
    const f = Math.floor(k / 8), w = k & 7;
    if (w === 0) { let n; [n, i] = varint(b, i); out.push({ f, v: n }); }
    else if (w === 1 || w === 5) { const n = w === 1 ? 8 : 4; out.push({ f, v: b.subarray(i, i + n) }); i += n; }
    else if (w === 2) { let n; [n, i] = varint(b, i); out.push({ f, v: b.subarray(i, i + n) }); i += n; }
    else throw new Error('wire type');
    if (i > b.length || !f) throw new Error('truncated');
  }
  return out;
}
const one = (fs_, f) => fs_.find((x) => x.f === f)?.v;
const text = (v) => (Buffer.isBuffer(v) ? v.toString('utf8') : '');
const b64 = (s) => Buffer.from(String(s || ''), 'base64');
/** The IDE's wrapped value: base64 of entries { 1: name, 2: { 1: base64 of the record } } -> name -> record (Buffer). */
export function unwrap(value) {
  const m = new Map();
  try { for (const e of pbFields(b64(value))) { if (e.f !== 1) continue; const x = pbFields(e.v); m.set(text(one(x, 1)), b64(text(one(pbFields(one(x, 2) || Buffer.alloc(0)), 1)))); } } catch { /* not one */ }
  return m;
}
/** The sign-in record: { access, refresh, expires } (null when there is none). */
export function tokenOf(value) {
  const r = unwrap(value).get('oauthTokenInfoSentinelKey'); if (!r?.length) return null;
  try { const x = pbFields(r), exp = one(x, 4); return { access: text(one(x, 1)), refresh: text(one(x, 3)), expires: Buffer.isBuffer(exp) ? (one(pbFields(exp), 1) || 0) * 1000 : 0 }; } catch { return null; }
}
/** What the IDE last heard of the account: { name, email, tier, tierName, models: [{ id, name, left, resetsAt }] }. */
export function statusOf(value) {
  const r = unwrap(value).get('userStatusSentinelKey'); if (!r?.length) return null;
  try {
    const x = pbFields(r), plan = one(x, 36), models = [];
    const p = Buffer.isBuffer(plan) ? pbFields(plan) : [];
    const list = one(x, 33);
    for (const m of Buffer.isBuffer(list) ? pbFields(list).filter((y) => y.f === 1) : []) {
      const y = pbFields(m.v), id = one(y, 2), q = one(y, 15);
      const quota = Buffer.isBuffer(q) ? pbFields(q) : null, reset = quota && one(quota, 2);
      models.push({ id: Buffer.isBuffer(id) ? one(pbFields(id), 1) || 0 : 0, name: text(one(y, 1)),
        // (proto3 leaves a zero out: a quota without its fraction has nothing left)
        left: quota ? (Buffer.isBuffer(one(quota, 1)) ? one(quota, 1).readFloatLE(0) : 0) : null,
        resetsAt: Buffer.isBuffer(reset) ? (one(pbFields(reset), 1) || 0) * 1000 : 0 });
    }
    return { name: text(one(x, 3)), email: text(one(x, 7)), tier: text(one(p, 1)), tierName: text(one(p, 2)), models };
  } catch { return null; }
}
/** The model picked in the agent panel (its id), 0 if unknown. */
export function pickedModel(value) {
  const r = unwrap(value).get('last_selected_agent_model_sentinel_key'); if (!r?.length) return 0;
  try { return pbFields(r).find((y) => typeof y.v === 'number')?.v || 0; } catch { return 0; }
}
// a model's family, the way its quota is shared ("Gemini 3.8 Flash (High)" -> "Gemini 3.8 Flash")
const family = (n) => String(n || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
/** The quota rows the card shows: one per family, the picked model's first; a reading from before a reset says nothing after it. */
export function quotaRows(models, picked = 0, now = Date.now()) {
  const fams = new Map();
  for (const m of models || []) {
    if (m.left === null) continue;
    const k = family(m.name), left = m.resetsAt && m.resetsAt <= now ? 1 : m.left, f = fams.get(k);
    if (!f || left < f.left) fams.set(k, { key: k, label: k, left, resetsAt: m.resetsAt, picked: f?.picked || m.id === picked });
    else if (m.id === picked) f.picked = true;
  }
  return [...fams.values()].sort((a, b) => b.picked - a.picked).map((f) => ({ ...f, pct: Math.round((1 - f.left) * 100) }));
}
/** Until when an account is out of the model in use (the picked one; else its first): 0 = it has room. */
export function outUntil(a, picked = 0, now = Date.now()) {
  const ms = a.models || [], m = ms.find((x) => x.id === picked && x.left !== null) || ms.find((x) => x.left !== null);
  return m && m.left <= EMPTY && m.resetsAt > now ? m.resetsAt : 0;
}

/* ---------- the IDE's database, through the sqlite3 program ---------- */
const sq = (s) => `'${String(s).replace(/'/g, "''")}'`;
export function makeDb(file, sqlite = 'sqlite3') {
  return {
    file,
    async read(keys) {   // -> { key: value }, null when the database can't be read
      return new Promise((resolve) => execFile(sqlite, ['-readonly', '-json', file, `SELECT key, CAST(value AS TEXT) AS value FROM ItemTable WHERE key IN (${keys.map(sq).join(', ')})`],
        { timeout: 10_000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, out) => {
          if (err) { resolve(null); return; }
          try { resolve(Object.fromEntries((out.trim() ? JSON.parse(out) : []).map((r) => [r.key, r.value]))); } catch { resolve(null); }
        }));
    },
    async write(set, drop = []) {   // values to set, keys to take out: one transaction
      const sql = ['BEGIN;', ...Object.entries(set).map(([k, v]) => `INSERT OR REPLACE INTO ItemTable (key, value) VALUES (${sq(k)}, ${sq(v)});`), ...drop.map((k) => `DELETE FROM ItemTable WHERE key = ${sq(k)};`), 'COMMIT;'].join('\n');
      return new Promise((resolve) => {
        let child; try { child = spawn(sqlite, [file], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true }); } catch { resolve(false); return; }
        child.on('error', () => resolve(false)); child.on('exit', (code) => resolve(code === 0));
        child.stdin.on('error', () => {}); child.stdin.end(sql);
      });
    },
  };
}

/**
 * @param {{ dir: string, db: () => ReturnType<typeof makeDb> | null, app: { name: string, running: () => Promise<boolean>, quit?: () => Promise<boolean>, launch?: () => Promise<boolean> },
 *   busyIn?: () => Promise<number>, now?: () => number, log?: (s: string) => void, onChange?: (what?: object) => void }} o
 */
export function createAntigravityAccounts({ dir, db, app, busyIn = async () => 0, now = Date.now, log = () => {}, onChange = () => {} }) {
  const FILE = path.join(dir, 'accounts.json');
  /** list: [{ id, key, email, name, tier, tierName, label, token, status, models, at }]; pending: the account to switch to
   *  once the IDE is closed; restart: the office may close and open the IDE by itself (switching on) */
  let st = { list: [], order: [], auto: false, restart: false, pending: null };
  try { st = { ...st, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* none yet */ }
  const save = () => { try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(st), { mode: 0o600 }); } catch { /* read-only data */ } };
  const find = (id) => st.list.find((a) => a.id === id);
  const ordered = () => [...st.list].sort((x, y) => st.order.indexOf(x.id) - st.order.indexOf(y.id));
  const keyOf = (token) => { const t = tokenOf(token); return t?.refresh ? crypto.createHash('sha256').update(t.refresh).digest('hex').slice(0, 16) : null; };
  // what was read last; fits: the status in the database is the signed-in account's (after a new sign-in it is still the
  // previous account's until the IDE fetches the new one, which changes it)
  let seen = { token: null, status: null, key: null, fits: true }, seatId = null, picked = 0, running = false, note = '', adding = null, busyMove = false, mtime = 0;

  async function scan() {
    const d = db(); if (!d) { note = 'noDb'; return; }
    let m = 0; try { m = fs.statSync(d.file).mtimeMs; } catch { /* gone */ }
    if (m && m === mtime && seen.token !== null) return idle();   // (nothing written since the last reading)
    const v = await d.read([KEYS.token, KEYS.status, KEYS.prefs]);
    mtime = m;
    if (!v) { if (note !== 'noDb') { note = 'noDb'; onChange(); } return; }
    note = '';
    const token = v[KEYS.token] || '', status = v[KEYS.status] || '', key = keyOf(token);
    let changed = token !== seen.token || status !== seen.status;
    // a new sign-in: the status in the database is the previous account's until the IDE fetches the new one's. It is the
    // new one's once it changes and names someone else, or changes a minute later (the same account signed in again)
    const mail = () => statusOf(status)?.email || '';
    if (seen.token !== null && key !== seen.key) { seen.prev = find(seatId)?.email || ''; seen.since = now(); seen.fits = status !== seen.status && mail() !== seen.prev; }
    else if (!seen.fits && status !== seen.status && (mail() !== seen.prev || now() - seen.since > 60e3)) seen.fits = true;
    Object.assign(seen, { token, status, key });
    picked = pickedModel(v[KEYS.prefs]) || picked;
    let a = key && st.list.find((x) => x.key === key);
    if (key && !a) {
      let id = key.slice(0, 10); while (find(id)) id += 'x';
      a = { id, key, email: '', name: '', tier: '', tierName: '', label: '', token: '', status: '', models: [], at: 0 };
      st.list.push(a); st.order.push(id); changed = true;
      log('antigravity: account added (signed in)');
      if (adding) { adding = { ...adding, state: 'done' }; }
    }
    if (a) {
      a.token = token;
      const s = seen.fits && status !== a.status ? statusOf(status) : null;
      if (s) {
        Object.assign(a, { status, email: s.email || a.email, name: s.name || a.name, tier: s.tier, tierName: s.tierName, models: s.models, at: now() });
        // the same account signed in again (a new refresh token each time): one entry, the newest sign-in, its name and place kept
        const twin = a.email && st.list.find((x) => x !== a && x.email === a.email);
        if (twin) { Object.assign(twin, { ...a, id: twin.id, label: twin.label }); st.list = st.list.filter((x) => x !== a); st.order = st.order.filter((x) => x !== a.id); a = twin; changed = true; }
        if (adding?.state === 'done') adding.name = a.email;
      }
    }
    const was = seatId; seatId = a?.id || null;
    if (changed || seatId !== was) { save(); onChange(); }
    await idle();
  }
  // whether the IDE is open; a switch waiting for it to close, or due because the account in use ran out
  async function idle() {
    const was = running; running = await app.running().catch(() => false);
    if (running !== was) onChange();
    if (!running && st.pending && !busyMove) await applyPending();
    else await autoSwitch();
  }

  /** The account's pair written into the database (the IDE closed); a copy of the database kept first. */
  async function write(a) {
    const d = db(); if (!d) return false;
    await fsp.copyFile(d.file, path.join(dir, 'state-before-switch.vscdb')).then(() => fsp.chmod(path.join(dir, 'state-before-switch.vscdb'), 0o600)).catch(() => {});
    const ok = await d.write({ [KEYS.token]: a.token, ...(a.status && { [KEYS.status]: a.status }) }, a.status ? [] : [KEYS.status]);
    if (!ok) return false;
    const from = seatId;
    Object.assign(seen, { token: a.token, status: a.status || '', key: a.key, fits: true });
    seatId = a.id; st.pending = null; save();
    log(`antigravity: ${from || '-'} -> ${a.id}`);
    return { from };
  }
  async function applyPending() {
    const a = find(st.pending); if (!a) { st.pending = null; save(); return; }
    busyMove = true;
    try {
      if (await app.running().catch(() => true)) return;
      await new Promise((r) => setTimeout(r, 1500));   // (the IDE writes its state as it quits: after that)
      if (await app.running().catch(() => true)) return;
      const w = await write(a);
      if (w) onChange({ switched: { from: w.from, to: a.id, why: st.pendingWhy || 'you', when: 'closed' } });
    } finally { busyMove = false; }
  }
  // the IDE closed, then `fn` (writing the database), then opened again; not while a Claude session in it is at work
  async function closeAndOpen(fn) {
    if (!app.quit || !app.launch) return { ok: false, code: 'noRestart' };
    const n = await busyIn().catch(() => 0);
    if (n) return { ok: false, code: 'busy', n };
    busyMove = true;
    try {
      if (!(await app.quit())) return { ok: false, code: 'quitFailed' };
      const r = await fn();
      if (r === false) { await app.launch(); return { ok: false, code: 'writeFailed' }; }
      await app.launch();
      return { ok: true, restarted: true };
    } finally { busyMove = false; running = await app.running().catch(() => false); }
  }

  /** An account into the IDE. With the IDE open: when it closes (`restart`: the office closes and opens it now). */
  async function switchTo(id, { restart = false, why = 'you' } = {}) {
    const a = find(id); if (!a) return { ok: false, code: 'noAccount' };
    if (!a.token) return { ok: false, code: 'noToken' };
    await scan();
    if (id === seatId) { if (st.pending) { st.pending = null; save(); onChange(); } return { ok: true, same: true }; }
    running = await app.running().catch(() => false);
    if (!running) {
      const w = await write(a); if (!w) return { ok: false, code: 'writeFailed' };
      onChange({ switched: { from: w.from, to: id, why } });
      return { ok: true };
    }
    if (!restart) { st.pending = id; st.pendingWhy = why; save(); onChange(); return { ok: true, pending: true }; }
    let from = null;
    const r = await closeAndOpen(async () => { const w = await write(a); if (!w) return false; from = w.from; return true; });
    if (r.ok) onChange({ switched: { from, to: id, why, when: 'restarted' } });
    return r;
  }
  // with switching on: out of the model in use, the next account with room, at once if the IDE is closed, when it
  // closes otherwise (or closed and opened by the office, when allowed and nothing in it is at work)
  let switching = false;
  async function autoSwitch() {
    const a = find(seatId);
    if (!st.auto || !a || switching || busyMove || !outUntil(a, picked, now())) return;
    const next = ordered().find((x) => x.id !== a.id && x.token && !outUntil(x, picked, now()));
    if (!next || st.pending === next.id) return;
    switching = true;
    try {
      const r = await switchTo(next.id, { restart: st.restart, why: 'auto' });
      if (!r.ok && r.code === 'busy') { st.pending = next.id; st.pendingWhy = 'auto'; save(); onChange({ waiting: { to: next.id, n: r.n } }); }
    } finally { switching = false; }
  }

  /** Adding an account: the IDE's sign-in taken out (the current one kept), the IDE opened to sign in again. */
  async function add({ restart = false } = {}) {
    await scan();
    if (note) return { ok: false, code: note };
    running = await app.running().catch(() => false);
    if (running && !restart) return { ok: false, code: 'needsRestart' };
    const clear = async () => { const d = db(); if (!d) return false; Object.assign(seen, { token: '', status: '', key: null, fits: false }); seatId = null; return d.write({}, [KEYS.token, KEYS.status]); };
    adding = { state: 'waiting', name: '' };
    const r = running ? await closeAndOpen(clear) : ((await clear()) && app.launch ? { ok: await app.launch() } : { ok: true });
    if (!r.ok) { adding = null; return r; }
    onChange();
    return { ok: true };
  }
  function addCancel() { adding = null; onChange(); }
  function remove(id) {
    const a = find(id); if (!a) return { ok: false, code: 'noAccount' };
    if (id === seatId) return { ok: false, code: 'inSeat' };
    st.list = st.list.filter((x) => x !== a); st.order = st.order.filter((x) => x !== id); if (st.pending === id) st.pending = null;
    save(); onChange(); log('antigravity: account removed');
    return { ok: true };
  }
  function rename(id, label) { const a = find(id); if (!a) return { ok: false }; a.label = String(label || '').slice(0, 24); save(); onChange(); return { ok: true }; }
  function setAuto(on, restart) { if (on !== undefined) st.auto = !!on; if (restart !== undefined) st.restart = !!restart; save(); onChange(); autoSwitch(); return { ok: true }; }
  function cancelPending() { st.pending = null; save(); onChange(); return { ok: true }; }
  function setOrder(ids) {
    const all = st.list.map((a) => a.id);
    if (!Array.isArray(ids) || ids.length !== all.length || !all.every((x) => ids.includes(x))) return { ok: false };
    st.order = [...ids]; save(); onChange(); return { ok: true };
  }

  function out() {
    const t = now(), m = (find(seatId)?.models || []).find((x) => x.id === picked);
    return {
      note, app: app.name, running, now: seatId, auto: !!st.auto, restart: !!st.restart, canRestart: !!(app.quit && app.launch), pending: st.pending, picked: m ? family(m.name) : '',
      adding: adding && { state: adding.state, name: adding.name || '' },
      list: ordered().map((a) => ({ id: a.id, email: a.email, name: a.name, tier: a.tier, tierName: a.tierName, label: a.label, at: a.at, rows: quotaRows(a.models, picked, t).slice(0, 3), until: outUntil(a, picked, t) })),
    };
  }

  const timers = [];
  function start() {
    scan().catch(() => {});
    timers.push(setInterval(() => { if (!busyMove) scan().catch(() => {}); }, 4000));
    for (const x of timers) x.unref?.();
  }
  function stop() { for (const x of timers) clearInterval(x); }

  return { start, stop, scan, out, switchTo, add, addCancel, remove, rename, setAuto, cancelPending, setOrder, seatNow: () => seatId };
}
