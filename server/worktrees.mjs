import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const defaultGit = async (args, cwd) => String((await exec('git', args, { cwd, timeout: 15_000, windowsHide: true, maxBuffer: 1 << 20 })).stdout).trim();
const inside = (base, target) => target === base || target.startsWith(base + path.sep);

export function createWorktreeManager({ root = path.join(os.tmpdir(), 'my-office-worktrees'), gitRun = defaultGit } = {}) {
  const owners = new Map();
  async function create(dir, owner = crypto.randomUUID(), onAllocate = () => {}) {
    const source = path.resolve(String(dir || ''));
    const repoRoot = path.resolve(await gitRun(['rev-parse', '--show-toplevel'], source));
    if (!fs.statSync(repoRoot).isDirectory()) throw Object.assign(new Error('Repository root is not a directory.'), { code: 'noRepo' });
    const realRoot = await fsp.realpath(repoRoot), realSource = await fsp.realpath(source);
    if (!inside(realRoot, realSource)) throw Object.assign(new Error('Task folder resolves outside its Git repository.'), { code: 'invalidDir' });
    if (await gitRun(['status', '--porcelain'], repoRoot)) throw Object.assign(new Error('Commit or preserve working changes before starting a worktree task.'), { code: 'dirtyRepository' });
    const relative = path.relative(repoRoot, source);
    if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw Object.assign(new Error('Task folder must be inside its Git repository.'), { code: 'invalidDir' });
    const id = crypto.randomUUID(), branch = `myoffice/${id}`;
    const parent = path.join(root, crypto.createHash('sha256').update(repoRoot).digest('hex').slice(0, 12));
    await fsp.mkdir(parent, { recursive: true });
    const worktreePath = path.resolve(parent, id);
    if (owners.has(worktreePath)) throw Object.assign(new Error('Worktree is already owned by an active task.'), { code: 'worktreeBusy' });
    const workingDirectory = path.resolve(worktreePath, relative);
    if (!inside(worktreePath, workingDirectory)) throw Object.assign(new Error('Resolved task folder escaped its worktree.'), { code: 'invalidWorktree' });
    owners.set(worktreePath, owner);
    onAllocate({ repoRoot, worktreePath, workingDirectory, branch, owner });
    try {
      await gitRun(['worktree', 'add', '-b', branch, worktreePath, 'HEAD'], repoRoot);
      const actual = path.resolve(await gitRun(['rev-parse', '--show-toplevel'], worktreePath));
      if (actual !== worktreePath) throw Object.assign(new Error('Git returned a different worktree path.'), { code: 'invalidWorktree' });
      return { repoRoot, worktreePath, workingDirectory, branch, owner };
    } catch (e) { owners.delete(worktreePath); throw e; }
  }
  async function seed(worktreePath, targetDir, inputs = []) {
    const root = await fsp.realpath(worktreePath), target = await fsp.realpath(targetDir);
    if (!inside(root, target)) throw Object.assign(new Error('Task input target is outside its worktree.'), { code: 'invalidWorktree' });
    const copied = new Map();
    for (const input of inputs) {
      const sourceRoot = await fsp.realpath(input.dir);
      for (const relative of input.artifacts || []) {
        const name = String(relative).replace(/\\/g, '/');
        if (!name || path.isAbsolute(name) || /[:\0]/.test(name) || name.split('/').some((part) => !part || part === '.' || part === '..' || part === '.git')) {
          throw Object.assign(new Error(`Invalid task input artifact: ${name}`), { code: 'invalidArtifact' });
        }
        const source = await fsp.realpath(path.resolve(sourceRoot, name));
        if (!inside(sourceRoot, source) || !(await fsp.stat(source)).isFile()) throw Object.assign(new Error(`Task input is missing or unsafe: ${name}`), { code: 'invalidArtifact' });
        const previous = copied.get(name);
        if (previous) {
          if (!(await fsp.readFile(previous)).equals(await fsp.readFile(source))) throw Object.assign(new Error(`Conflicting dependency artifact: ${name}`), { code: 'artifactConflict' });
          continue;
        }
        const destination = path.resolve(target, name);
        if (!inside(target, destination)) throw Object.assign(new Error(`Task input escapes its worktree: ${name}`), { code: 'invalidArtifact' });
        await fsp.mkdir(path.dirname(destination), { recursive: true });
        const parent = await fsp.realpath(path.dirname(destination));
        if (!inside(root, parent)) throw Object.assign(new Error(`Task input target is unsafe: ${name}`), { code: 'invalidArtifact' });
        try {
          const existing = await fsp.lstat(destination);
          if (existing.isSymbolicLink() || !(await fsp.realpath(destination)).startsWith(`${root}${path.sep}`)) throw Object.assign(new Error(`Task input target is unsafe: ${name}`), { code: 'invalidArtifact' });
        } catch (e) { if (e.code !== 'ENOENT') throw e; }
        await fsp.copyFile(source, destination);
        copied.set(name, destination);
      }
    }
  }
  function release(worktreePath, owner) {
    if (owners.get(worktreePath) !== owner) return false;
    owners.delete(worktreePath); return true;
  }
  async function cleanup({ repoRoot, worktreePath }) {
    if (!worktreePath || owners.has(worktreePath)) return { ok: false, code: 'activeOrMissing' };
    const resolved = path.resolve(worktreePath), managed = path.resolve(root);
    if (!inside(managed, resolved) || path.dirname(resolved) === managed) return { ok: false, code: 'outsideManagedRoot' };
    try {
      const dirty = await gitRun(['status', '--porcelain'], worktreePath);
      if (dirty) return { ok: false, code: 'dirtyWorktree' };
      await gitRun(['worktree', 'remove', worktreePath], repoRoot);
      return { ok: true };
    } catch (e) { return { ok: false, code: 'cleanup', error: e.message }; }
  }
  return { create, seed, release, cleanup, owns: (p) => owners.has(p) };
}
