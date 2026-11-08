// Production projects read from the video workspace on disk (spec §8.3/8.4). Every state here is file-system state:
// a stage counts as produced only when its artifact exists. A project's Type (A or B) comes only from its own
// config.json "type"; it is never guessed, and the two pipelines keep their own stage lists (spec §5).
import fs from 'node:fs';
import path from 'node:path';

export const PIPELINES = {
  A: ['research', 'validation', 'script', 'storyboard', 'visualization', 'animation', 'voiceover', 'editing', 'qa'],
  B: ['concept', 'script', 'character_bible', 'visual_bible', 'storyboard', 'assets', 'animation', 'voiceover', 'editing', 'qa'],
};
// stage -> artifact kinds that prove it; stages with no file signal (research, validation, concept) stay 'unknown'
const PROOF = { script: ['script'], storyboard: ['storyboard'], visualization: ['sets'], assets: ['sets'], character_bible: ['cast'], visual_bible: ['bible'],
  animation: ['shots'], voiceover: ['voiceover'], editing: ['render'], qa: ['qa'] };
const RENDER_LIVE_MS = 120e3;   // a render log written in the last 2 min, newer than the MP4: a render is running
const MAX_PROJECTS = 200, MAX_JSON = 5e6;

const stat = (f) => { try { const s = fs.lstatSync(f); return s.isSymbolicLink() ? null : s; } catch { return null; } };
const list = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((x) => !x.isSymbolicLink()); } catch { return []; } };
const readJson = (f) => { const s = stat(f); if (!s?.isFile() || s.size > MAX_JSON) return null; try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

function projectDirs(ws) {
  const roots = [path.join(ws, 'PROJECTS'), ...list(ws).filter((d) => d.isDirectory()).map((d) => path.join(ws, d.name, 'projects'))];
  const out = [];
  for (const r of roots) for (const d of list(r)) if (d.isDirectory() && stat(path.join(r, d.name, 'config.json'))?.isFile()) out.push(path.join(r, d.name));
  return out.slice(0, MAX_PROJECTS);
}

function artifactsOf(dir, ws) {
  const a = [], rel = (f) => path.relative(ws, f).split(path.sep).join('/');
  const add = (kind, f) => { const s = stat(f); if (s && (s.isFile() || list(f).length)) a.push({ kind, path: rel(f), at: s.mtimeMs }); };
  add('script', path.join(dir, 'input', 'script.txt'));
  for (const d of list(path.join(dir, 'input'))) if (/^voiceover\.(mp3|wav|m4a|flac)$/i.test(d.name)) add('voiceover', path.join(dir, 'input', d.name));
  add('timestamps', path.join(dir, 'timeline', 'words.json'));
  add('bible', path.join(dir, 'story', 'bible.md'));
  add('storyboard', path.join(dir, 'story', 'shots.json'));
  add('cast', path.join(dir, 'scenes', 'cast.js'));
  add('sets', path.join(dir, 'scenes', 'sets'));
  add('shots', path.join(dir, 'scenes', 'shots'));
  add('preview', path.join(dir, 'build', 'preview.mp4'));
  for (const d of list(path.join(dir, 'out'))) if (d.isFile() && /\.mp4$/i.test(d.name)) add('render', path.join(dir, 'out', d.name));
  return a;
}

function qaOf(ws, stem) {
  const d = path.join(ws, 'qa_reports', stem), f = readJson(path.join(d, 'findings.json')), s = stat(path.join(d, 'findings.json'));
  if (!f || !s) return null;
  const sev = {};
  for (const x of Array.isArray(f.findings) ? f.findings : []) sev[x.severity] = (sev[x.severity] || 0) + 1;
  return { total: typeof f.total === 'number' ? f.total : null, recommendation: typeof f.recommendation === 'string' ? f.recommendation : null,
    severities: sev, report: stat(path.join(d, 'VIDEO_QA_REPORT.md')) ? path.relative(ws, path.join(d, 'VIDEO_QA_REPORT.md')).split(path.sep).join('/') : null, at: s.mtimeMs };
}

export function readProject(dir, ws, now = Date.now()) {
  const cfg = readJson(path.join(dir, 'config.json')) || {};
  const type = cfg.type === 'A' || cfg.type === 'B' ? cfg.type : null;
  const artifacts = artifactsOf(dir, ws);
  const renders = artifacts.filter((x) => x.kind === 'render').sort((x, y) => y.at - x.at);
  const qa = renders[0] ? qaOf(ws, path.basename(renders[0].path, path.extname(renders[0].path))) : null;
  if (qa) artifacts.push({ kind: 'qa', path: qa.report || '', at: qa.at });
  const log = stat(path.join(dir, 'build', 'final_render.log'));
  const render = log && now - log.mtimeMs < RENDER_LIVE_MS && (!renders[0] || log.mtimeMs > renders[0].at) ? 'rendering' : renders[0] ? 'done' : 'none';
  const revs = readJson(path.join(dir, 'out', 'revisions', 'revisions.json'));
  const revisions = (Array.isArray(revs?.revisions) ? revs.revisions : []).map((r) => ({ n: r.n, file: r.file, created: r.created, status: r.status, total: r.total ?? null }));
  const has = new Set(artifacts.map((x) => x.kind));
  const stages = type && PIPELINES[type].map((id) => ({ id, status: !PROOF[id] ? 'unknown' : PROOF[id].some((k) => has.has(k)) ? 'done' : 'missing' }));
  if (stages && render === 'rendering') stages.find((s) => s.id === 'editing').status = 'running';
  const timeline = [...artifacts.map((x) => ({ at: x.at, kind: x.kind, path: x.path })),
    ...revisions.map((r) => ({ at: Date.parse(String(r.created).replace(' ', 'T')) || null, kind: 'revision', n: r.n, status: r.status }))]
    .filter((x) => x.at).sort((x, y) => x.at - y.at);
  return { id: path.relative(ws, dir).split(path.sep).join('/'), title: typeof cfg.title === 'string' ? cfg.title : path.basename(dir), type,
    stages, render, qa, revisions, artifacts, timeline, updatedAt: Math.max(0, ...artifacts.map((x) => x.at)), source: 'file' };
}

// ws: the video workspace root (OFFICE_VIDEO_WORKSPACE). Not set or not a folder: { configured: false }, never sample data.
export function readProjects(ws, now = Date.now()) {
  if (!ws || !stat(ws)?.isDirectory()) return { configured: false, projects: [] };
  const root = path.resolve(ws);
  return { configured: true, projects: projectDirs(root).map((d) => readProject(d, root, now)).sort((a, b) => b.updatedAt - a.updatedAt) };
}
