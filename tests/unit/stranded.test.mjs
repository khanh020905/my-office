import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseWorktrees, parseStatus, aheadPlan, canRemove, holdsWork, createStranded } from '../../server/stranded.mjs';

// `git worktree list --porcelain -z` as git 2.39 writes it: the main worktree, a branch, a detached HEAD, one locked with a
// reason over two lines, one locked without a reason, and one whose folder is gone
const Z = ['worktree /r', 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', '',
  'worktree /w1', 'HEAD 2222222222222222222222222222222222222222', 'branch refs/heads/feat/a', '',
  'worktree /w2', 'HEAD 3333333333333333333333333333333333333333', 'detached', '',
  'worktree /w3', 'HEAD 4444444444444444444444444444444444444444', 'branch refs/heads/f3', 'locked why\ntwo', '',
  'worktree /w 4', 'HEAD 5555555555555555555555555555555555555555', 'branch refs/heads/f4', 'locked', '',
  'worktree /w5', 'HEAD 6666666666666666666666666666666666666666', 'branch refs/heads/f5', 'prunable gitdir file points to non-existent location', '', ''].join('\0');

test('worktree list: main, branch, detached, locked (with and without a reason), prunable, a space in a path', () => {
  const l = parseWorktrees(Z);
  assert.equal(l.length, 6);
  assert.deepEqual(l.map((w) => w.path), ['/r', '/w1', '/w2', '/w3', '/w 4', '/w5']);
  assert.deepEqual(l.map((w) => w.main), [true, false, false, false, false, false]);
  assert.equal(l[1].branch, 'feat/a');
  assert.equal(l[2].detached, true); assert.equal(l[2].branch, '');
  assert.equal(l[3].locked, true); assert.equal(l[3].lockReason, 'why\ntwo');
  assert.equal(l[4].locked, true); assert.equal(l[4].lockReason, '');
  assert.equal(l[5].prunable, true); assert.match(l[5].prunableReason, /non-existent/);
  assert.equal(l[0].head, '1111111111111111111111111111111111111111');
});

test('worktree list without -z (older git): a quoted lock reason, a bare repository first', () => {
  const l = parseWorktrees('worktree /srv/repo.git\nbare\n\nworktree /w1\nHEAD abc\nbranch refs/heads/x\nlocked "on a \\"usb\\" disk\\nsecond"\n\n');
  assert.equal(l.length, 2);
  assert.equal(l[0].bare, true); assert.equal(l[0].main, true);
  assert.equal(l[1].lockReason, 'on a "usb" disk\nsecond');
});

test('status: the branch line (ahead, behind, gone, none, detached, no commits yet) and renames counted once', () => {
  let s = parseStatus('## main...origin/main [ahead 2, behind 1]\0 M a.js\0?? new/\0R  b2.js\0b.js\0');
  assert.deepEqual([s.branch, s.upstream, s.ahead, s.behind, s.files.length], ['main', 'origin/main', 2, 1, 3]);
  s = parseStatus('## feat...origin/feat [gone]\0');
  assert.deepEqual([s.upstream, s.gone, s.ahead], ['', true, 0]);
  s = parseStatus('## feat\0');
  assert.deepEqual([s.branch, s.upstream, s.ahead, s.files.length], ['feat', '', 0, 0]);
  s = parseStatus('## HEAD (no branch)\0');
  assert.deepEqual([s.branch, s.detached], ['', true]);
  s = parseStatus('## No commits yet on main\0?? x\0');
  assert.deepEqual([s.branch, s.files], ['main', ['x']]);
});

test('what "not pushed" means: ahead of the upstream, else on no remote, else not in the main checkout', () => {
  assert.equal(aheadPlan({ upstream: 'origin/x' }, { remotes: 1 }).of, 'upstream');
  assert.deepEqual(aheadPlan({ upstream: '' }, { remotes: 2 }).args, ['rev-list', '--count', 'HEAD', '--not', '--remotes']);
  assert.deepEqual(aheadPlan({ upstream: '' }, { remotes: 0, mainHead: 'abc', main: false }).args, ['rev-list', '--count', 'HEAD', '--not', 'abc']);
  assert.equal(aheadPlan({ upstream: '' }, { remotes: 0, mainHead: 'abc', main: true }).zero, true);
});

test('the safety rule: only a clean, pushed, linked worktree nobody works in may be deleted', () => {
  const ok = { ok: true, main: false, bare: false, locked: false, prunable: false, inUse: false, dirty: 0, ahead: 0 };
  assert.equal(canRemove(ok), true);
  for (const bad of [{ main: true }, { bare: true }, { locked: true }, { prunable: true }, { inUse: true }, { dirty: 1 }, { ahead: 3 }, { ahead: null }, { ok: false }])
    assert.equal(canRemove({ ...ok, ...bad }), false, JSON.stringify(bad));
  assert.equal(canRemove(null), false);
  assert.equal(holdsWork({ ...ok, dirty: 2 }), true);
  assert.equal(holdsWork({ ...ok, main: true, stashes: 1 }), true);
  assert.equal(holdsWork(ok), false);
});

/* ---------- real repositories: an "origin", a clone with worktrees in every state, and a repository with no remote ---------- */
const G = (cwd, ...args) => execFileSync('git', ['-c', 'user.email=e2e@example.com', '-c', 'user.name=e2e', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, stdio: 'pipe' }).toString();
function setup() {
  const top = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'office-stranded-')));
  const origin = path.join(top, 'origin.git'), repo = path.join(top, 'app'), wt = (n) => path.join(top, n);
  fs.mkdirSync(origin); G(origin, 'init', '-q', '--bare', '-b', 'main');
  G(top, 'clone', '-q', origin, repo);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n'); fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n');
  G(repo, 'add', '.'); G(repo, 'commit', '-q', '-m', 'one'); G(repo, 'push', '-q', '-u', 'origin', 'main');
  // pushed then one more commit: ahead of its upstream
  G(repo, 'worktree', 'add', '-q', wt('w-ahead'), '-b', 'ahead'); G(wt('w-ahead'), 'push', '-q', '-u', 'origin', 'ahead');
  fs.writeFileSync(path.join(wt('w-ahead'), 'b.txt'), 'b\n'); G(wt('w-ahead'), 'add', '.'); G(wt('w-ahead'), 'commit', '-q', '-m', 'two');
  // a new branch never pushed, two commits on no remote
  G(repo, 'worktree', 'add', '-q', wt('w-new'), '-b', 'new');
  for (const n of ['c', 'd']) { fs.writeFileSync(path.join(wt('w-new'), n), n); G(wt('w-new'), 'add', '.'); G(wt('w-new'), 'commit', '-q', '-m', n); }
  // a file not committed
  G(repo, 'worktree', 'add', '-q', wt('w-dirty'), '-b', 'dirty'); G(wt('w-dirty'), 'push', '-q', '-u', 'origin', 'dirty');
  fs.writeFileSync(path.join(wt('w-dirty'), 'notes.md'), 'todo\n');
  // nothing left: pushed, clean (with ignored files that go with it)
  G(repo, 'worktree', 'add', '-q', wt('w-clean'), '-b', 'clean'); G(wt('w-clean'), 'push', '-q', '-u', 'origin', 'clean');
  fs.mkdirSync(path.join(wt('w-clean'), 'node_modules')); fs.writeFileSync(path.join(wt('w-clean'), 'node_modules', 'x.js'), '1');
  // detached on a pushed commit, and detached with a commit of its own
  G(repo, 'worktree', 'add', '-q', '--detach', wt('w-det'));
  G(repo, 'worktree', 'add', '-q', '--detach', wt('w-det2')); fs.writeFileSync(path.join(wt('w-det2'), 'e'), 'e'); G(wt('w-det2'), 'add', '.'); G(wt('w-det2'), 'commit', '-q', '-m', 'e');
  // locked and clean: neither listed nor ever deleted
  G(repo, 'worktree', 'add', '-q', wt('w-locked'), '-b', 'locked'); G(wt('w-locked'), 'push', '-q', '-u', 'origin', 'locked'); G(repo, 'worktree', 'lock', '--reason', 'usb disk', wt('w-locked'));
  // a repository with no remote: a worktree with a commit the main checkout doesn't have
  const solo = path.join(top, 'solo'); fs.mkdirSync(solo); G(solo, 'init', '-q', '-b', 'main'); fs.writeFileSync(path.join(solo, 'x'), 'x'); G(solo, 'add', '.'); G(solo, 'commit', '-q', '-m', 'x');
  G(solo, 'worktree', 'add', '-q', wt('solo-w'), '-b', 'side'); fs.writeFileSync(path.join(wt('solo-w'), 'y'), 'y'); G(wt('solo-w'), 'add', '.'); G(wt('solo-w'), 'commit', '-q', '-m', 'y');
  return { top, repo, solo, wt };
}

test('real repositories: what is listed, what "ahead" counts, and what may be deleted', async () => {
  const { top, repo, solo, wt } = setup();
  try {
    const busy = new Set();
    const st = createStranded({ dirs: () => [wt('w-new'), solo, path.join(top, 'nowhere')], inUse: (p) => busy.has(p), home: top });
    const r = await st.list({ wait: 30_000 });
    const by = Object.fromEntries(r.items.map((it) => [it.dir.replace(/^~\//, ''), it]));
    assert.equal(r.repos, 2);
    assert.ok(!by.app, 'the main checkout, pushed and clean, is not listed');
    assert.deepEqual([by['w-ahead'].ahead, by['w-ahead'].aheadOf, by['w-ahead'].removable], [1, 'upstream', false]);
    assert.deepEqual([by['w-new'].ahead, by['w-new'].aheadOf, by['w-new'].removable], [2, 'remote', false]);
    assert.deepEqual([by['w-dirty'].dirty, by['w-dirty'].removable], [1, false]);
    assert.deepEqual([by['w-clean'].dirty, by['w-clean'].ahead, by['w-clean'].removable, by['w-clean'].work], [0, 0, true, false]);
    assert.deepEqual(by['w-clean'].ignored, ['node_modules/']);
    assert.deepEqual([by['w-det'].detached, by['w-det'].removable], [true, true]);
    assert.deepEqual([by['w-det2'].ahead, by['w-det2'].removable], [1, false]);
    assert.ok(!by['w-locked'], 'a locked worktree with nothing in it is not listed');
    assert.deepEqual([by['solo-w'].ahead, by['solo-w'].aheadOf, by['solo-w'].removable], [1, 'main', false]);
    assert.ok(by['w-ahead'].last > 0);
    assert.equal(st.dirOf('~/w-dirty'), wt('w-dirty'));
    assert.equal(st.dirOf(path.join(top, 'elsewhere')), null);

    // deleting: never one with work in it, never one a session works in, and read again just before
    assert.equal((await st.remove(by['w-dirty'].id)).code, 'notClean');
    assert.ok(fs.existsSync(wt('w-dirty')));
    assert.equal((await st.remove(by['w-new'].id)).code, 'notClean');
    busy.add(wt('w-det'));
    assert.equal((await st.remove(by['w-det'].id)).code, 'inUse');
    assert.ok(fs.existsSync(wt('w-det')));
    fs.writeFileSync(path.join(wt('w-clean'), 'late.txt'), 'written after the list was read\n');
    assert.equal((await st.remove(by['w-clean'].id)).code, 'notClean');
    assert.ok(fs.existsSync(path.join(wt('w-clean'), 'late.txt')));
    fs.rmSync(path.join(wt('w-clean'), 'late.txt'));
    const ok = await st.remove(by['w-clean'].id);
    assert.equal(ok.ok, true);
    assert.ok(!fs.existsSync(wt('w-clean')), 'the folder is gone');
    assert.match(G(repo, 'branch', '--list', 'clean'), /clean/, 'its branch stays');
    assert.equal((await st.remove(by['w-clean'].id)).code, 'gone');
    assert.equal((await st.remove('nope')).code, 'gone');
    const again = await st.list({ wait: 30_000 });
    assert.ok(!again.items.some((it) => it.dir === '~/w-clean'));
  } finally { fs.rmSync(top, { recursive: true, force: true }); }
});
