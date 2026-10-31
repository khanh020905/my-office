// "Việc bỏ quên" (forgotten work): every git worktree, and the main checkout, of the repositories the office knows (the
// folders sessions have worked in, and what Claude Code keeps under .claude/worktrees) that still holds work: files not
// committed, commits not pushed, stashes. Read with git on this computer only when the Mac panel asks, a few calls at a
// time, each with a timeout, the whole look capped in time and kept for 45 s; sizes (du) come one at a time afterwards.
// Removing a worktree goes through `git worktree remove` without --force, and only after the same checks run again: never
// the main checkout, never one with anything not committed or not pushed, never one a session is working in.
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const MAX_REPOS = 30, MAX_PER_REPO = 40, MAX_ITEMS = 60, POOL = 3;

// (GIT_OPTIONAL_LOCKS=0: never take the index lock while Claude is committing in the same folder; LC_ALL=C: git's own
// words, which the parsing below reads, stay English)
function git(args, cwd, timeout = 5000) {
  return new Promise((resolve) => execFile('git', args, { cwd, timeout, maxBuffer: 8 << 20, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' } },
    (err, out, errOut) => resolve(err ? { ok: false, out: String(out || ''), err: String(errOut || err.message || '') } : { ok: true, out: String(out) })));
}
const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
export const idOf = (p) => crypto.createHash('sha1').update(p).digest('hex').slice(0, 12);
// git writes paths with / on Windows too (D:/a/b): this computer's own form, so they compare with the session folders
const ours = (list) => list.map((w) => ({ ...w, path: w.path && path.resolve(w.path) }));
const inside = (child, dir) => !!child && (child === dir || child.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep));

// a lock or prune reason git wrote C-style (in quotes, \n for a new line) when it isn't asked for -z
function unquote(s) {
  if (!/^".*"$/s.test(s)) return s;
  return s.slice(1, -1).replace(/\\([0-7]{3}|.)/g, (m, c) => (c.length === 3 ? String.fromCharCode(parseInt(c, 8)) : ({ n: '\n', t: '\t', r: '\r' })[c] ?? c));
}

/** `git worktree list --porcelain` (with -z or without) -> [{ path, head, branch, bare, detached, locked, lockReason,
    prunable, prunableReason, main }]. The first record is the main worktree (or the bare repository). */
export function parseWorktrees(out) {
  const z = out.includes('\0'), fields = z ? out.split('\0') : out.split(/\r?\n/);
  const list = []; let cur = null;
  for (const f of fields) {
    if (!f) { cur = null; continue; }   // (an empty field ends a record)
    const sp = f.indexOf(' '), key = sp < 0 ? f : f.slice(0, sp), val = sp < 0 ? '' : f.slice(sp + 1);
    if (key === 'worktree') {
      cur = { path: val, head: '', branch: '', bare: false, detached: false, locked: false, lockReason: '', prunable: false, prunableReason: '', main: !list.length };
      list.push(cur); continue;
    }
    if (!cur) continue;
    if (key === 'HEAD') cur.head = val;
    else if (key === 'branch') cur.branch = val.replace(/^refs\/heads\//, '');
    else if (key === 'bare') cur.bare = true;
    else if (key === 'detached') cur.detached = true;
    else if (key === 'locked') { cur.locked = true; cur.lockReason = z ? val : unquote(val); }
    else if (key === 'prunable') { cur.prunable = true; cur.prunableReason = z ? val : unquote(val); }
  }
  return list;
}

/** `git status --porcelain=v1 -z --branch` -> { branch, detached, upstream, ahead, behind, gone, files } (ahead/behind
    are only known with an upstream that still exists). */
export function parseStatus(out) {
  const parts = out.split('\0'), files = [];
  let branch = '', detached = false, upstream = '', ahead = 0, behind = 0, gone = false;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]; if (!p) continue;
    if (p.startsWith('## ')) {
      const m = /^(?:No commits yet on |Initial commit on )?(.*?)(?:\.\.\.(\S+))?(?: \[([^\]]*)\])?$/.exec(p.slice(3)) || [];
      branch = m[1] || ''; upstream = m[2] || '';
      if (/^HEAD \(no branch\)$/.test(branch)) { detached = true; branch = ''; }
      for (const bit of String(m[3] || '').split(',').map((x) => x.trim())) {
        if (bit === 'gone') gone = true;
        else if (/^ahead \d+$/.test(bit)) ahead = Number(bit.slice(6));
        else if (/^behind \d+$/.test(bit)) behind = Number(bit.slice(7));
      }
      continue;
    }
    files.push(p.slice(3));
    if (p[0] === 'R' || p[0] === 'C') i++;   // (a rename's or copy's other name follows as a field of its own)
  }
  return { branch, detached, upstream: gone ? '' : upstream, ahead: upstream && !gone ? ahead : 0, behind, gone, files };
}

/** What "not pushed" is measured against, and the rev-list arguments that count it (null: the header already said it).
    With an upstream: ahead of it. Without one (never pushed, or its remote branch deleted): the commits that are on no
    remote branch at all. In a repository with no remote: the commits the main checkout doesn't have. */
export function aheadPlan(st, { remotes, mainHead, main }) {
  if (st.upstream) return { of: 'upstream', args: null };
  if (remotes > 0) return { of: 'remote', args: ['rev-list', '--count', 'HEAD', '--not', '--remotes'] };
  if (main || !mainHead) return { of: 'main', args: null, zero: true };
  return { of: 'main', args: ['rev-list', '--count', 'HEAD', '--not', mainHead] };
}

/** Whether a worktree may be removed: a linked worktree (never the main checkout or a bare repository) whose folder is
    there, not locked, read just now without trouble, with nothing not committed and nothing not pushed, and no session
    or task working in it. */
export function canRemove(w) {
  return !!w && w.ok === true && !w.main && !w.bare && !w.locked && !w.prunable && !w.inUse && w.dirty === 0 && w.ahead === 0;
}
/** Worth a line in the panel: anything left to do, or a worktree that could go (the main checkout only for its work). */
export const holdsWork = (w) => !!w && (w.dirty > 0 || w.ahead > 0 || (w.main && w.stashes > 0) || !w.ok);

async function pool(jobs, n, until) {
  let i = 0;
  const worker = async () => { while (i < jobs.length && Date.now() < until) { const j = jobs[i++]; await j(); } };
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, worker));
}

/**
 * dirs() -> folders the office has seen sessions in; inUse(path) -> true when a session or task works in that folder.
 * @param {{ dirs: () => string[], inUse?: (p: string) => boolean, home?: string, ttl?: number, budget?: number }} o
 */
export function createStranded({ dirs, inUse = () => false, home = os.homedir(), ttl = 45_000, budget = 12_000 }) {
  let last = { at: 0, items: [], repos: 0, partial: false }, scanning = null;
  const byId = new Map();   // id -> the worktree as read (with its repository: { root, common, remotes, mainHead })
  const sizes = new Map();   // path -> { at, bytes } (du, at most every 15 minutes)
  let sizing = null;
  const tilde = (p) => (p && inside(p, home) ? '~' + p.slice(home.length).split(path.sep).join('/') : p);   // (shown with /, on Windows too)

  // every repository behind the folders: its common git directory, read from inside any of its worktrees
  async function repos() {
    const out = new Map(), seen = new Set();
    const want = [...new Set((dirs() || []).filter((d) => typeof d === 'string' && path.isAbsolute(d)))].slice(0, 80);
    const resolve = async (d) => {
      if (out.size >= MAX_REPOS || seen.has(d) || !fs.existsSync(d)) return; seen.add(d);
      const r = await git(['rev-parse', '--git-common-dir'], d, 3000);
      if (!r.ok) return;
      const common = real(path.resolve(d, r.out.trim()));
      if (!out.has(common)) out.set(common, { common, from: d });
    };
    for (const d of want) await resolve(d);
    // Claude Code's own worktrees (claude --worktree) live in <repo>/.claude/worktrees: one that isn't registered with
    // the repository (a copy, a clone) is a repository of its own
    for (const r of [...out.values()]) {
      const top = path.dirname(r.common), wt = path.join(top, '.claude', 'worktrees');
      let names = []; try { names = (await fsp.readdir(wt, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).slice(0, 30); } catch { continue; }
      for (const n of names) if (fs.existsSync(path.join(wt, n, '.git'))) await resolve(path.join(wt, n));
    }
    return [...out.values()];
  }

  async function readWorktree(w, repo) {
    const item = { id: idOf(w.path), path: w.path, repo: repo.name, branch: w.branch, detached: w.detached, head: w.head.slice(0, 7), main: w.main, bare: w.bare,
      locked: w.locked, lockReason: w.lockReason.slice(0, 120), prunable: w.prunable, dirty: 0, ahead: 0, aheadOf: null, upstream: '', behind: 0,
      stashes: w.main ? repo.stashes : 0, last: 0, ok: false, files: [] };
    const st = await git(['status', '--porcelain=v1', '-z', '--branch', '--untracked-files=normal'], w.path, 8000);
    if (!st.ok) return item;
    const s = parseStatus(st.out);
    Object.assign(item, { dirty: s.files.length, upstream: s.upstream, behind: s.behind, files: s.files.slice(0, 20) });
    if (s.branch && !item.branch) item.branch = s.branch;
    const plan = aheadPlan(s, { remotes: repo.remotes, mainHead: repo.mainHead, main: w.main });
    item.aheadOf = plan.of;
    if (plan.args) {
      const r = await git(plan.args, w.path, 6000);
      if (!r.ok) return item;   // (unknown: not ok, so never removable)
      item.ahead = Number(r.out.trim()) || 0;
    } else item.ahead = plan.zero ? 0 : s.ahead;
    // when it last changed: its last commit, or a file changed since, whichever is newer
    const t = await git(['log', '-1', '--format=%ct'], w.path, 4000);
    let lastMs = t.ok ? Number(t.out.trim()) * 1000 || 0 : 0;
    for (const f of s.files.slice(0, 20)) { try { lastMs = Math.max(lastMs, (await fsp.stat(path.join(w.path, f.replace(/\/$/, '')))).mtimeMs); } catch { /* deleted */ } }
    item.last = Math.round(lastMs);
    item.ok = true;
    return item;
  }

  async function scanNow() {
    const until = Date.now() + budget, items = [], next = new Map(), jobs = [];
    const list = await repos();
    for (const r of list) {
      const wl = await git(['worktree', 'list', '--porcelain', '-z'], r.from, 5000);
      const all = wl.ok ? ours(parseWorktrees(wl.out)) : [];
      if (!all.length) continue;
      const main = all[0], root = main.bare ? r.common : main.path;
      const [rem, stash] = await Promise.all([git(['remote'], root, 3000), main.bare ? null : git(['stash', 'list', '--format=%gd'], root, 3000)]);
      const repo = { name: path.basename(main.bare ? r.common.replace(/\.git$/, '') : main.path), common: r.common, root, mainHead: main.bare ? '' : main.head,
        remotes: rem.ok ? rem.out.split('\n').filter(Boolean).length : 0, stashes: stash?.ok ? stash.out.split('\n').filter(Boolean).length : 0 };
      for (const w of all.slice(0, MAX_PER_REPO)) {
        if (w.bare || w.prunable || !fs.existsSync(w.path)) continue;   // (nothing on disk to look at)
        jobs.push(async () => {
          const item = await readWorktree(w, repo);
          item.inUse = !!inUse(real(w.path)) || !!inUse(w.path);
          next.set(item.id, { ...item, repoRoot: repo.root });
          items.push(item);
        });
      }
    }
    await pool(jobs, POOL, until);
    for (const [id, w] of next) byId.set(id, w);
    for (const id of [...byId.keys()]) if (!next.has(id)) byId.delete(id);
    // what deleting would also take: the files git ignores (node_modules, .env…), named in the confirmation
    for (const it of items) {
      it.removable = canRemove(it);
      it.work = holdsWork(it);
      if (!it.removable || Date.now() > until) continue;
      const ig = await git(['status', '--porcelain=v1', '-z', '--ignored=traditional', '--untracked-files=normal'], it.path, 4000);
      it.ignored = ig.ok ? ig.out.split('\0').filter((x) => x.startsWith('!! ')).map((x) => x.slice(3)) : [];
    }
    const shown = items.filter((it) => it.work || it.removable)
      .sort((a, b) => (b.work - a.work) || (b.last - a.last)).slice(0, MAX_ITEMS);
    last = { at: Date.now(), items: shown, repos: list.length, partial: jobs.length > items.length };
    sizeSoon(shown);
    return last;
  }

  // sizes: du on each shown folder, one at a time, at most 6 s each (a folder that takes longer shows none), after the
  // list is out; a size is kept 15 minutes (nice: the Mac's work comes first)
  function sizeSoon(items) {
    if (sizing || process.platform === 'win32') return;
    const todo = items.filter((it) => !(Date.now() - (sizes.get(it.path)?.at || 0) < 15 * 60e3)).slice(0, 20);
    if (!todo.length) return;
    sizing = (async () => {
      for (const it of todo) {
        const bytes = await new Promise((resolve) => execFile('nice', ['-n', '15', 'du', '-sk', it.path], { timeout: 6000, maxBuffer: 1 << 20 },
          (err, out) => { const kb = Number(String(out || '').split(/\s/)[0]); resolve(!err && Number.isFinite(kb) ? kb * 1024 : null); }));
        sizes.set(it.path, { at: Date.now(), bytes });
        if (sizes.size > 200) sizes.delete(sizes.keys().next().value);   // (the oldest first)
      }
    })().finally(() => { sizing = null; });
  }

  const pub = (it) => ({ id: it.id, repo: it.repo, branch: it.branch, detached: it.detached, head: it.head, main: it.main, dir: tilde(it.path),
    locked: it.locked, lockReason: it.lockReason, dirty: it.dirty, ahead: it.ahead, aheadOf: it.aheadOf, upstream: it.upstream, stashes: it.stashes,
    last: it.last, ok: it.ok, work: it.work, removable: it.removable, inUse: it.inUse, ignored: (it.ignored || []).slice(0, 4), ignoredMore: Math.max(0, (it.ignored || []).length - 4),
    size: sizes.get(it.path)?.bytes ?? null, sizing: !sizes.has(it.path) && process.platform !== 'win32' });

  return {
    /** The list as the panel shows it: a fresh look when the last one is older than ttl (waiting at most `wait` ms for
        it; a slow one finishes in the background and the next ask gets it). */
    async list({ wait = 2500, force = false } = {}) {
      if (force || Date.now() - last.at > ttl) {
        scanning ??= scanNow().catch(() => last).finally(() => { scanning = null; });
        await Promise.race([scanning, new Promise((r) => setTimeout(r, wait).unref?.())]);
      }
      return { ok: true, at: last.at, scanning: !!scanning, partial: last.partial, repos: last.repos, items: last.items.map(pub), sizing: !!sizing };
    },
    /** A folder from the last look ('~/…' or absolute), for giving Claude the rest of its work. */
    dirOf(dir) {
      const want = path.resolve(String(dir || '').replace(/^~(?=$|[\\/])/, home));
      return last.items.find((it) => it.path === want)?.path || null;
    },
    entry: (id) => byId.get(String(id || '')) || null,
    /** Removes a linked worktree after reading it again: { ok, code?, why?, w } */
    async remove(id) {
      const was = byId.get(String(id || ''));
      if (!was) return { ok: false, code: 'gone' };
      const busy = !!inUse(real(was.path)) || !!inUse(was.path);
      if (!canRemove({ ...was, inUse: busy })) return { ok: false, code: busy ? 'inUse' : 'notClean', w: was };
      // again, now: still one of the repository's linked worktrees, not locked, nothing new in it
      const wl = await git(['worktree', 'list', '--porcelain', '-z'], was.repoRoot, 5000), all = wl.ok ? ours(parseWorktrees(wl.out)) : [];
      const w = all.find((x) => x.path === was.path);
      if (!w || w.main) return { ok: false, code: 'gone', w: was };
      const rem = await git(['remote'], was.repoRoot, 3000);
      const repo = { name: was.repo, remotes: rem.ok ? rem.out.split('\n').filter(Boolean).length : 0, mainHead: all[0].bare ? '' : all[0].head, stashes: 0 };
      const now = await readWorktree(w, repo);
      now.inUse = !!inUse(real(w.path)) || !!inUse(w.path);
      if (!canRemove(now)) return { ok: false, code: now.inUse ? 'inUse' : 'notClean', w: was };
      // no --force: git itself refuses a worktree with changes or untracked files, or a locked one
      const r = await git(['worktree', 'remove', w.path], was.repoRoot, 30_000);
      last.at = 0;   // (the next look reads everything again)
      if (!r.ok) return { ok: false, code: 'failed', why: r.err.trim().split('\n').pop().slice(0, 200), w: was };
      byId.delete(was.id); sizes.delete(was.path);
      last.items = last.items.filter((it) => it.id !== was.id);
      return { ok: true, w: was };
    },
  };
}
