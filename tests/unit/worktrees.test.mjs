import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorktreeManager } from '../../server/worktrees.mjs';

const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });

test('real Git worktree is isolated and cleanup refuses uncommitted files', async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'office-worktree-real-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const repo = path.join(temp, 'repo'); await fs.mkdir(repo);
  git(repo, 'init', '-q'); git(repo, 'config', 'user.email', 'test@example.invalid'); git(repo, 'config', 'user.name', 'Test');
  await fs.writeFile(path.join(repo, 'README.md'), 'original\n'); git(repo, 'add', 'README.md'); git(repo, 'commit', '-qm', 'initial');
  const manager = createWorktreeManager({ root: path.join(temp, 'worktrees') });
  const wt = await manager.create(repo, 'test-owner');
  assert.notEqual(wt.worktreePath, repo);
  assert.equal((await fs.readFile(path.join(repo, 'README.md'), 'utf8')), 'original\n');
  await fs.writeFile(path.join(wt.worktreePath, 'new.txt'), 'keep me');
  manager.release(wt.worktreePath, wt.owner);
  assert.equal((await manager.cleanup(wt)).code, 'dirtyWorktree');
  await fs.rm(path.join(wt.worktreePath, 'new.txt'));
  assert.deepEqual(await manager.cleanup(wt), { ok: true });
});

test('copies declared dependency artifacts into a separate worktree and rejects traversal', async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'office-worktree-seed-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const repo = path.join(temp, 'repo'); await fs.mkdir(repo);
  git(repo, 'init', '-q'); git(repo, 'config', 'user.email', 'test@example.invalid'); git(repo, 'config', 'user.name', 'Test');
  await fs.writeFile(path.join(repo, 'README.md'), 'original\n'); git(repo, 'add', 'README.md'); git(repo, 'commit', '-qm', 'initial');
  const manager = createWorktreeManager({ root: path.join(temp, 'worktrees') });
  const source = await manager.create(repo, 'producer');
  await fs.mkdir(path.join(source.workingDirectory, 'src'));
  await fs.writeFile(path.join(source.workingDirectory, 'src', 'api.js'), 'export const message = "hello";\n');
  const target = await manager.create(repo, 'consumer');
  await manager.seed(target.worktreePath, target.workingDirectory, [{ dir: source.workingDirectory, artifacts: ['src/api.js'] }]);
  assert.equal(await fs.readFile(path.join(target.workingDirectory, 'src', 'api.js'), 'utf8'), 'export const message = "hello";\n');
  await assert.rejects(manager.seed(target.worktreePath, target.workingDirectory, [{ dir: source.workingDirectory, artifacts: ['../README.md'] }]), (e) => e.code === 'invalidArtifact');
  assert.equal(await fs.readFile(path.join(repo, 'README.md'), 'utf8'), 'original\n');
  manager.release(source.worktreePath, source.owner); manager.release(target.worktreePath, target.owner);
});

test('refuses a dirty source checkout without touching it', async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'office-worktree-dirty-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  git(temp, 'init', '-q');
  await fs.writeFile(path.join(temp, 'local.txt'), 'user change');
  const manager = createWorktreeManager({ root: path.join(temp, 'worktrees') });
  await assert.rejects(manager.create(temp, 'owner'), (e) => e.code === 'dirtyRepository');
  assert.equal(await fs.readFile(path.join(temp, 'local.txt'), 'utf8'), 'user change');
});
