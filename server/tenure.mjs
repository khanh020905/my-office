// Tenure: each project's working life in the office, kept in data/tenure.json: when a session first and last worked in
// it, on how many different days, how many turns it finished. From it a project that really was at work (on two days or
// more) and has had no session for a while (Settings → More: 14, 30, 60 or 90 days, or never) gets its farewell, once
// (people/farewell.js), and its return is noticed when a session opens in it again; and a project new to the office is
// an intern (people/interns.js) until it has finished 20 turns on two different days or more, when HR makes it
// permanent. Every project the office knew, or Claude Code had worked in, before interns came in is permanent already.
// Nothing about a project changes: this reads, once, on the first run, the dates of Claude Code's transcripts and the
// folder each was in (the projects that were already there; a new one's folder, once), and writes only its own file.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const FAREWELL_DAYS = [14, 30, 60, 90];
export const FAREWELL_DEFAULT = 30;
export const PROMOTE_TURNS = 20, PROMOTE_DAYS = 2;
const DAY = 864e5, MAX = 300, BACK_SHOWN = DAY;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
/** a time as the local calendar day, YYYY-MM-DD */
export const dayOf = (ms) => new Date(ms).toLocaleDateString('sv');
/** worked in on two different days or more: a project that really was here (not a folder opened once) */
export const wasActive = (p) => (p?.days || 0) >= 2;
/** due for a farewell: really was here, quiet for `days` days (0: farewells are off), not said goodbye to yet, and
    nobody at work in it now */
export const farewellDue = (p, days, now, live = false) => !!p && days > 0 && wasActive(p) && !p.farewell && !live && now - (p.last || now) >= days * DAY;
/** still an intern: new to the office since interns came in (not there before, its folder looked at), not made permanent */
export const isIntern = (p) => !!p && !p.pre && !p.official && !!p.checked;
/** ready to be made permanent: 20 finished turns, on two different days or more */
export const promoteDue = (p) => isIntern(p) && (p.turns || 0) >= PROMOTE_TURNS && (p.days || 0) >= PROMOTE_DAYS;
/** Claude Code's folder for a working folder's transcripts (its path with anything but letters, digits and - as -) */
export const transcriptDir = (claudeDir, cwd) => path.join(claudeDir, 'projects', String(cwd).replace(/[^A-Za-z0-9-]/g, '-'));

/** the folder a transcript was written in, from its first lines (each line carries "cwd") */
async function cwdOf(file) {
  let fh; try { fh = await fsp.open(file, 'r'); const buf = Buffer.alloc(64 << 10); const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    const m = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(buf.toString('utf8', 0, bytesRead));
    return m ? JSON.parse(`"${m[1]}"`) : '';
  } catch { return ''; } finally { await fh?.close().catch(() => {}); }
}

/**
 * @param {{ dataDir: string, claudeDir: string, nameOf: (cwd: string) => Promise<string>, now?: () => number,
 *   onChange?: (what: string, name: string) => void }} o  nameOf: a folder's project, as the page names it (its git
 *   repository's folder name, else the folder's own)
 */
export function createTenure({ dataDir, claudeDir, nameOf, now = () => Date.now(), onChange = () => {} }) {
  const file = path.join(dataDir, 'tenure.json');
  let t; try { t = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { t = null; }
  if (!t || typeof t !== 'object' || !t.projects || typeof t.projects !== 'object') t = { v: 1, since: now(), seeded: false, projects: {} };
  let dirty = !fs.existsSync(file);
  // interns came in with this: every project known until now is permanent already (no surprise interns on an update)
  if (!t.interns) { t.interns = now(); for (const p of Object.values(t.projects)) p.pre = true; dirty = true; }
  function save() {
    if (!dirty) return; dirty = false;
    try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(`${file}.tmp`, JSON.stringify(t)); fs.renameSync(`${file}.tmp`, file); } catch { dirty = true; }
  }
  setInterval(save, 10_000).unref();
  // (the 300 projects most lately at work: a list that never grows past what anyone has)
  function cap() {
    const names = Object.keys(t.projects); if (names.length <= MAX) return;
    names.sort((a, b) => (t.projects[b].last || 0) - (t.projects[a].last || 0));
    for (const n of names.slice(MAX)) delete t.projects[n];
  }
  /** a session at work in project `name` (any hook event); turn: it finished a turn (Stop). What changed: 'new', 'back'
      (it had had its farewell), or null */
  function touch(name, { at = now(), turn = false, cwd = '' } = {}) {
    if (!name) return null;
    let p = t.projects[name], change = null;
    if (!p) { p = t.projects[name] = { first: at, last: at, days: 0, lastDay: '', turns: 0 }; change = 'new'; cap(); lookBack(name, cwd); }
    const ready = promoteDue(p);
    if (p.farewell) { p.back = at; p.farewell = 0; change = 'back'; }
    const d = dayOf(at); if (p.lastDay !== d) { p.lastDay = d; p.days = (p.days || 0) + 1; }
    p.last = Math.max(p.last || 0, at); if (turn) p.turns = (p.turns || 0) + 1;
    dirty = true;
    if (!change && !ready && promoteDue(p)) change = 'ready';
    if (change) onChange(change, name);
    return change;
  }
  // a project new to the office: had Claude Code worked in its folder before interns came in? Then it isn't one (its
  // folder's transcripts' dates, read once)
  async function lookBack(name, cwd) {
    await null;   // (after the touch that found it has told its news)
    let old = false;
    if (cwd) {
      const dir = transcriptDir(claudeDir, cwd);
      let files = []; try { files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.jsonl')).slice(0, 400); } catch { /* none */ }
      for (const f of files) {
        let st; try { st = await fsp.stat(path.join(dir, f)); } catch { continue; }
        if (Math.min(st.birthtimeMs > 0 ? st.birthtimeMs : st.mtimeMs, st.mtimeMs) < t.interns) { old = true; break; }
      }
    }
    const p = t.projects[name]; if (!p) return;
    if (old) p.pre = true;
    p.checked = true; dirty = true;
    onChange(old ? 'known' : 'intern', name);
  }
  /** made permanent at HR's desk (the page held it): only an intern that was ready, once */
  function markOfficial(name) {
    const p = t.projects[name];
    if (!promoteDue(p)) return false;
    p.official = now(); dirty = true; save();
    onChange('official', name);
    return true;
  }
  /** its farewell was held (the page says so): only if it was due, once */
  function markFarewell(name, days, live = false) {
    const p = t.projects[name];
    if (!farewellDue(p, days, now(), live)) return false;
    p.farewell = now(); p.back = 0; dirty = true; save();
    onChange('farewell', name);
    return true;
  }
  /** what the page needs: the projects due a farewell, those that had theirs, those back in the last day
      (live: the projects with a session open now) */
  function list(days, live = new Set()) {
    const at = now(), out = [];
    for (const [name, p] of Object.entries(t.projects)) {
      const due = farewellDue(p, days, at, live.has(name)), back = p.back && at - p.back < BACK_SHOWN ? p.back : 0, intern = isIntern(p);
      if (due || p.farewell || back || intern || p.official) out.push({ name, last: p.last, days: p.days, turns: p.turns || 0, due, farewell: p.farewell || 0, back, intern, ready: promoteDue(p), official: p.official || 0 });
    }
    return out.sort((a, b) => b.last - a.last).slice(0, 60);
  }
  /* The first run: the projects that were already there, from the transcripts' folders (a few at a time, pausing between,
     in the background): first and last seen, on how many days (each file's first and last write). Counted as there
     before (pre) only what began before this ledger did. */
  async function seed() {
    if (t.seeded) return;
    const root = path.join(claudeDir, 'projects');
    let dirs = []; try { dirs = (await fsp.readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()); } catch { /* no history */ }
    const found = new Map();   // name -> { first, last, days: Set }
    for (const d of dirs.slice(0, 600)) {
      const dir = path.join(root, d.name);
      let files = []; try { files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
      let first = Infinity, last = 0, newest = '', newestAt = 0; const days = new Set();
      for (const f of files.slice(-400)) {
        let st; try { st = await fsp.stat(path.join(dir, f)); } catch { continue; }
        const born = st.birthtimeMs > 0 ? Math.min(st.birthtimeMs, st.mtimeMs) : st.mtimeMs;
        first = Math.min(first, born); last = Math.max(last, st.mtimeMs); days.add(dayOf(born)); days.add(dayOf(st.mtimeMs));
        if (st.mtimeMs > newestAt) { newestAt = st.mtimeMs; newest = f; }
      }
      if (!newest) continue;
      const cwd = await cwdOf(path.join(dir, newest)), name = cwd ? await nameOf(cwd).catch(() => '') || path.basename(cwd) : '';
      if (!name) continue;
      const f = found.get(name) || { first: Infinity, last: 0, days: new Set() };
      f.first = Math.min(f.first, first); f.last = Math.max(f.last, last); for (const x of days) f.days.add(x);
      found.set(name, f);
      await pause(3);
    }
    for (const [name, f] of found) {
      const p = t.projects[name] || (t.projects[name] = { first: f.first, last: f.last, days: 0, lastDay: '', turns: 0 });
      p.first = Math.min(p.first || Infinity, f.first); p.last = Math.max(p.last || 0, f.last);
      p.days = Math.max(p.days || 0, f.days.size); p.lastDay ||= dayOf(p.last);
      if (f.first < Math.min(t.since, t.interns)) p.pre = true;
      p.checked = true;
    }
    cap(); t.seeded = true; dirty = true; save();
    onChange('seeded', '');
  }
  setTimeout(() => { seed().catch(() => {}); }, 4000).unref();
  return { touch, markFarewell, markOfficial, list, seed, get: (name) => t.projects[name] || null, save, get since() { return t.since; } };
}
