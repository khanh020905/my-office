// Git in the office. For each open session's folder: the repository's branch, how many files are changed and not yet
// committed (that desk gets messier), commits and pushes (the printer prints, the rocket launches), and the latest CI run
// on GitHub (a red beacon in the server room when it fails). Commits and pushes are noticed by watching HEAD and the
// upstream, so they count whether Claude or you made them; a new version tag (or a GitHub release) is a release (the
// office goes to the photo booth across the street). Read with `git` and `gh` on this Mac, only while an office page is
// open; nothing is written. OFFICE_CI=0 stops the GitHub check.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const run = (cmd, args, cwd, timeout = 5000) => new Promise((res) => {
  execFile(cmd, args, { cwd, timeout, maxBuffer: 4 << 20, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }, (err, out) => res(err ? null : String(out)));
});
// gh: GH_PATH, the usual install places, then anywhere on PATH (gh.exe on Windows)
const EXE = process.platform === 'win32' ? 'gh.exe' : 'gh';
const GH = [process.env.GH_PATH, path.join(os.homedir(), '.local/bin/gh'), '/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh',
  ...(process.platform === 'win32' ? [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'GitHub CLI', EXE)] : []),
  ...String(process.env.PATH || '').split(path.delimiter).filter(Boolean).map((d) => path.join(d, EXE))].find((p) => p && fs.existsSync(p)) || null;
const CI_ON = process.env.OFFICE_CI !== '0';

/**
 * @param {{ onRepo: (r: object) => void, onCommit: (r: object, subject: string) => void, onPush: (r: object) => void, onCi: (r: object, was: string|null) => void, onRelease?: (r: object, tag: string) => void }} o
 */
export function createGit({ onRepo, onCommit, onPush, onCi, onRelease = () => {} }) {
  const roots = new Map();   // folder -> its repository root, '' when it is not in one
  const repos = new Map();   // root -> { root, name, branch, dirty, ahead, head, upstream, ci, ciName, ciUrl, born }
  let polling = null, ciPolling = null;

  async function rootOf(cwd) {
    if (!cwd) return '';
    if (!roots.has(cwd)) roots.set(cwd, ((await run('git', ['rev-parse', '--show-toplevel'], cwd)) || '').trim());
    return roots.get(cwd);
  }
  async function read(root) {
    // GIT_OPTIONAL_LOCKS=0: `git status` must not take the index lock while Claude is committing in the same repo
    const [status, head, upstream, ahead, tag] = await Promise.all([
      run('git', ['status', '--porcelain=v1', '--branch', '--untracked-files=normal'], root, 8000),
      run('git', ['rev-parse', 'HEAD'], root),
      run('git', ['rev-parse', '@{u}'], root),
      run('git', ['rev-list', '--count', '@{u}..HEAD'], root),
      run('git', ['for-each-ref', '--sort=-creatordate', '--count=100', '--format=%(refname:short)', 'refs/tags'], root),   // (the newest tags)
    ]);
    if (status == null) return null;
    const lines = status.split('\n').filter(Boolean);
    const branch = (lines[0] || '').replace(/^## /, '').replace(/^No commits yet on /, '').split('...')[0].trim();
    return { branch, dirty: Math.max(0, lines.length - 1), head: (head || '').trim(), upstream: (upstream || '').trim(), ahead: Number(ahead) || 0, tags: tag == null ? null : tag.split('\n').map((x) => x.trim()).filter(Boolean) };
  }
  async function pollNow(cwds) {
    const live = new Set();
    for (const cwd of new Set(cwds)) { const r = await rootOf(cwd); if (r) live.add(r); }
    for (const root of live) {
      const now = await read(root); if (!now) continue;
      const was = repos.get(root), cur = { ...(was || { ci: null, ciName: '', ciUrl: '' }), ...now, root, name: path.basename(root) };
      // its birthday, once: the oldest root commit's date (the office's monthly party, people/hr.js)
      if (cur.born === undefined) cur.born = (((await run('git', ['log', '--max-parents=0', '--reverse', '--format=%as'], root)) || '').trim().split('\n')[0]) || null;
      repos.set(root, cur);
      if (was?.head && now.head && now.head !== was.head) {
        const subject = ((await run('git', ['log', '-1', '--pretty=%s'], root)) || '').trim();
        onCommit(cur, subject);
      }
      if (was && now.upstream && now.upstream !== was.upstream && now.upstream === now.head) onPush(cur);
      // a tag that was not there at the last look (the ones there when the page opened are old news)
      if (was?.tags && now.tags) for (const tag of now.tags.filter((x) => !was.tags.includes(x)).slice(0, 3).reverse()) released(cur, tag);
      if (!was || was.dirty !== cur.dirty || was.branch !== cur.branch || was.ahead !== cur.ahead) onRepo(cur);
    }
    for (const root of [...repos.keys()]) if (!live.has(root)) repos.delete(root);
  }
  async function pollCiNow() {
    if (!CI_ON || !GH) return;
    for (const r of [...repos.values()]) {
      if (!r.branch) continue;
      const out = await run(GH, ['run', 'list', '--limit', '10', '--branch', r.branch, '--json', 'status,conclusion,workflowName,url,event'], r.root, 15000);
      if (out == null) continue;   // not a GitHub repository, offline, or gh not logged in
      // the checks of the code (runs started by a push or a pull request), not a scheduled job that happens to be newer
      let runs; try { runs = JSON.parse(out); } catch { continue; }
      const last = runs.find((x) => x.event === 'push' || x.event === 'pull_request') || runs[0];
      const state = !last ? null : last.status !== 'completed' ? 'running' : last.conclusion === 'success' ? 'green'
        : ['failure', 'timed_out', 'startup_failure'].includes(last.conclusion) ? 'red' : null;
      const was = r.ci;
      Object.assign(r, { ci: state, ciName: last?.workflowName || '', ciUrl: last?.url || '' });
      if (was !== state) { onRepo(r); if (state === 'red' || (was === 'red' && state === 'green')) onCi(r, was); }
      // a release published on GitHub (its tag may not be here yet): the newest one, once it is newer than the last seen
      const rel = await run(GH, ['release', 'list', '--limit', '5', '--json', 'tagName,isDraft'], r.root, 15000);
      let tag = ''; try { tag = JSON.parse(rel || '[]').find((x) => !x.isDraft)?.tagName || ''; } catch { /* not JSON */ }   // (a draft is not out yet)
      if (r.ghRelease !== undefined && tag && tag !== r.ghRelease) released(r, tag);
      if (rel != null) r.ghRelease = tag;
    }
  }
  // each tag once, whichever way it was seen first (the local tag, the GitHub release)
  function released(r, tag) {
    r.released ||= [];
    if (r.released.includes(tag)) return;
    r.released.push(tag); if (r.released.length > 20) r.released.shift();
    onRelease(r, tag);
  }
  return {
    // one poll at a time; a second request while one runs is dropped
    poll: (cwds) => (polling ??= pollNow(cwds).finally(() => { polling = null; })),
    pollCi: () => (ciPolling ??= pollCiNow().finally(() => { ciPolling = null; })),
    repoOf: (cwd) => repos.get(roots.get(cwd)) || null,
    rootOf,
    ghAvailable: !!GH && CI_ON,
  };
}
