// Video QA from the dashboard (spec §9): runs the workspace's own tools/video_qa.py on a project's latest real render.
// The video path never comes from the request: only a project id, resolved through readProjects() to a file inside the
// workspace. Fixed argv, no shell, one run at a time, killed after 30 min. Only the plain read-only QA run is offered:
// --revision (copies files) and --approve (the user's decision) stay on the command line.
import fs from 'node:fs';
import path from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { readProjects } from './projects.mjs';

const MAX_RUN_MS = 30 * 60e3, TAIL = 2000, MAX_FINDINGS = 300;
const inside = (root, f) => { const r = path.relative(root, f); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
const reportDir = (ws, video) => path.join(ws, 'qa_reports', path.basename(video, path.extname(video)));
const keyOf = (id) => String(id).replace(/[^A-Za-z0-9._-]/g, '_');

// video_qa.py rewrites qa_reports/<stem>/ on every run, so each result is copied into the office's own data folder
// (never the user's workspace), one folder per report named after the report's own time: copying twice is a no-op
export function archiveQa(historyDir, ws, id, video) {
  if (!historyDir || !video) return null;
  const src = reportDir(ws, video);
  let st; try { st = fs.statSync(path.join(src, 'findings.json')); } catch { return null; }
  const dest = path.join(historyDir, keyOf(id), String(Math.floor(st.mtimeMs)));
  if (fs.existsSync(dest)) return dest;
  fs.mkdirSync(dest, { recursive: true });
  for (const n of ['findings.json', 'VIDEO_QA_REPORT.md']) { try { fs.copyFileSync(path.join(src, n), path.join(dest, n)); } catch { /* the .md may be missing */ } }
  return dest;
}

// past results, newest first: only the summary numbers from each archived findings.json
export function qaHistory(historyDir, id) {
  if (!historyDir) return [];
  const dir = path.join(historyDir, keyOf(id));
  let names; try { names = fs.readdirSync(dir).filter((n) => /^\d+$/.test(n)); } catch { return []; }
  return names.sort((a, b) => b - a).slice(0, 50).map((n) => {
    let d = null; try { d = JSON.parse(fs.readFileSync(path.join(dir, n, 'findings.json'), 'utf8')); } catch { /* unreadable */ }
    const severities = {};
    for (const x of Array.isArray(d?.findings) ? d.findings : []) { const k = String(x.severity || ''); if (k) severities[k] = (severities[k] || 0) + 1; }
    return { at: Number(n), total: typeof d?.total === 'number' ? d.total : null, recommendation: typeof d?.recommendation === 'string' ? d.recommendation : null, severities };
  });
}

// latest render of a project + its findings list (what the review studio shows); null when the project is unknown
export function projectQa(ws, id, historyDir) {
  const p = readProjects(ws).projects.find((x) => x.id === id);
  if (!p) return null;
  const render = p.artifacts.filter((x) => x.kind === 'render').sort((a, b) => b.at - a.at)[0] || null;
  let findings = [];
  if (render) {
    const f = path.join(reportDir(ws, render.path), 'findings.json');
    try {
      const d = fs.statSync(f).size < 5e6 ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
      findings = (Array.isArray(d?.findings) ? d.findings : []).slice(0, MAX_FINDINGS).map((x) => ({
        t: typeof x.t === 'number' ? x.t : null, tEnd: typeof x.t_end === 'number' ? x.t_end : null, severity: String(x.severity || ''),
        category: String(x.category || ''), issue: String(x.issue || ''), fix: String(x.fix || ''), status: String(x.status || ''), source: String(x.source || '') }));
    } catch { /* no report yet */ }
  }
  return { project: p.id, video: render?.path || null, qa: p.qa, revisions: p.revisions, findings, history: qaHistory(historyDir, p.id) };
}

export function createQaRunner({ historyDir = null, spawn = nodeSpawn, python = process.env.OFFICE_VIDEO_QA_PYTHON || (process.platform === 'win32' ? 'py' : 'python3') } = {}) {
  let run = { state: 'idle' };
  const status = () => ({ ...run });
  function start(ws, id) {
    if (!ws || !fs.existsSync(ws)) return { ok: false, error: 'workspace_not_configured' };
    if (run.state === 'running') return { ok: false, error: 'busy', run: status() };
    const root = path.resolve(ws), script = path.join(root, 'tools', 'video_qa.py');
    if (!fs.existsSync(script)) return { ok: false, error: 'qa_tool_missing' };
    const q = projectQa(root, String(id || ''));
    if (!q) return { ok: false, error: 'unknown_project' };
    if (!q.video) return { ok: false, error: 'no_render' };
    const video = path.resolve(root, q.video);
    if (!inside(root, video) || !fs.statSync(video).isFile()) return { ok: false, error: 'bad_path' };
    // keep the result this run is about to overwrite (e.g. one made on the command line)
    try { archiveQa(historyDir, root, q.project, q.video); } catch { /* history is best effort; the run still goes */ }
    const argv = [...(python === 'py' ? ['-3.14'] : []), script, video];
    let child;
    try { child = spawn(python, argv, { cwd: root, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONUTF8: '1' } }); }
    catch (e) { run = { state: 'failed', project: q.project, error: String(e?.message || e), endedAt: Date.now() }; return { ok: false, error: 'spawn_failed' }; }
    run = { state: 'running', project: q.project, video: q.video, startedAt: Date.now(), tail: '' };
    const me = run, keep = (b) => { me.tail = (me.tail + b).slice(-TAIL); };
    child.stdout?.on('data', keep); child.stderr?.on('data', keep);
    const timer = setTimeout(() => { me.timedOut = true; child.kill(); }, MAX_RUN_MS);
    const end = (code, err) => {
      if (me.state !== 'running') return;
      clearTimeout(timer);
      Object.assign(me, { state: code === 0 && !me.timedOut ? 'done' : 'failed', code, endedAt: Date.now(), ...(err ? { error: String(err) } : {}) });
      if (me.state === 'done') { try { archiveQa(historyDir, root, q.project, q.video); } catch { /* best effort */ } }
    };
    child.on('error', (e) => end(null, e?.message || e));
    child.on('close', (code) => end(code));
    return { ok: true, run: status() };
  }
  return { start, status };
}
