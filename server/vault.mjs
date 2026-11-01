// "Kho lịch sử": Claude Code deletes a conversation's transcript after cleanupPeriodDays (30 by default). The office
// keeps the words of each one in data/vault: what you wrote, what Claude answered, its title, folder and times; one
// gzip per conversation (c/<session id>.json.gz) and an index (index.json). Screenshots, tool calls and their output are
// left out, so a month of transcripts (GBs) is a few MB here. Read from every account's projects folder (one that is a
// link to another is read once), again every few hours; a transcript that changed is read again, one that Claude Code
// deleted stays, marked gone. Searched (accents or not) and read in the office; nothing leaves this computer.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const gzip = promisify(zlib.gzip), gunzip = promisify(zlib.gunzip);
const SID = /^[\w-]{8,80}$/;
const MAX_TEXT = 20000, MAX_MSGS = 4000;
// what the editor and Claude Code put around what you typed (and Claude Code's own notes), taken out; a paste's tags too
const WRAPS = /<(system-reminder|ide_opened_file|ide_selection|command-name|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat)>[\s\S]*?<\/\1>/g;
export function cleanPrompt(text) {
  return String(text || '').replace(WRAPS, '').replace(/<\/?pasted_content[^>]*>/g, '').trim();
}
// for search: lower case, without Vietnamese accents ("sửa lỗi" is found by "sua loi")
export const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();

/** One transcript read into its words: { title, cwd, start, end, msgs: [{ r: 'u' | 'c', t, at }] }. */
export async function readTranscript(file) {
  const out = { title: '', cwd: '', start: 0, end: 0, msgs: [] };
  let custom = null, ai = null;
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    // (most lines are tool output: only the ones that can hold words are parsed)
    if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"') && !line.includes('-title"')) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    if (j.type === 'custom-title' && typeof j.customTitle === 'string') { custom = j.customTitle; continue; }
    if (j.type === 'ai-title' && typeof j.aiTitle === 'string') { ai = j.aiTitle; continue; }
    if (j.isSidechain || j.isMeta) continue;
    if (!out.cwd && typeof j.cwd === 'string') out.cwd = j.cwd;
    const at = Date.parse(j.timestamp) || 0, c = j.message?.content;
    let r = '', t = '';
    if (j.type === 'user') { r = 'u'; t = cleanPrompt(typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b?.type === 'text').map((b) => b.text).join('\n') : ''); if (/^\[Request interrupted/.test(t)) t = ''; }
    else if (j.type === 'assistant') { r = 'c'; t = Array.isArray(c) ? c.filter((b) => b?.type === 'text').map((b) => b.text).join('\n').trim() : ''; }
    if (!t) continue;
    if (at) { out.start ||= at; out.end = Math.max(out.end, at); }
    if (out.msgs.length < MAX_MSGS) out.msgs.push({ r, t: t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT)}…` : t, at });
  }
  out.title = (custom ?? ai ?? '').trim();
  return out;
}

/**
 * @param {{ dir: string, claudeDirs: () => string[], now?: () => number, log?: (s: string) => void }} o
 */
export function createVault({ dir, claudeDirs, now = Date.now, log = () => {} }) {
  const IDX = path.join(dir, 'index.json'), CD = path.join(dir, 'c');
  const index = new Map();   // session id -> { sid, title, cwd, start, end, n, first, size, mtime, gone, bytes }
  try { for (const e of JSON.parse(fs.readFileSync(IDX, 'utf8'))) if (SID.test(e?.sid)) index.set(e.sid, e); } catch { /* none yet */ }
  let scanning = null, scannedAt = 0;
  const save = () => fsp.writeFile(`${IDX}.tmp`, JSON.stringify([...index.values()])).then(() => fsp.rename(`${IDX}.tmp`, IDX)).catch(() => {});

  // every account's projects folder, each real folder once
  async function roots() {
    const seen = new Set(), out = [];
    for (const d of claudeDirs()) {
      const p = path.join(d, 'projects'); let real; try { real = await fsp.realpath(p); } catch { continue; }
      if (!seen.has(real)) { seen.add(real); out.push(real); }
    }
    return out;
  }
  async function scanNow() {
    await fsp.mkdir(CD, { recursive: true });
    const seen = new Set(); let kept = 0;
    for (const root of await roots()) {
      let projects = []; try { projects = await fsp.readdir(root, { withFileTypes: true }); } catch { continue; }
      for (const p of projects.filter((x) => x.isDirectory())) {
        let files = []; try { files = (await fsp.readdir(path.join(root, p.name))).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
        for (const f of files) {
          const sid = f.slice(0, -6); if (!SID.test(sid)) continue;
          const file = path.join(root, p.name, f); let st; try { st = await fsp.stat(file); } catch { continue; }
          seen.add(sid);
          const was = index.get(sid);
          if (was && was.size === st.size && was.mtime === Math.round(st.mtimeMs) && !was.gone) continue;
          let rec; try { rec = await readTranscript(file); } catch { continue; }
          if (!rec.msgs.length) continue;
          const body = await gzip(JSON.stringify({ v: 1, sid, ...rec }));
          try { await fsp.writeFile(path.join(CD, `${sid}.json.gz.tmp`), body); await fsp.rename(path.join(CD, `${sid}.json.gz.tmp`), path.join(CD, `${sid}.json.gz`)); } catch { continue; }
          const first = rec.msgs.find((m) => m.r === 'u')?.t || '';
          index.set(sid, { sid, title: rec.title, cwd: rec.cwd, start: rec.start, end: rec.end || Math.round(st.mtimeMs), n: rec.msgs.length, first: first.slice(0, 300), size: st.size, mtime: Math.round(st.mtimeMs), gone: 0, bytes: body.length });
          kept++;
        }
      }
    }
    for (const e of index.values()) if (!seen.has(e.sid) && !e.gone) e.gone = now();   // (Claude Code deleted it: here it stays)
    scannedAt = now();
    await save();
    if (kept) log(`vault: ${kept} conversation(s) kept`);
    return kept;
  }
  const scan = () => (scanning ??= scanNow().finally(() => { scanning = null; }));
  const pub = (e) => ({ sid: e.sid, title: e.title, cwd: e.cwd, start: e.start, end: e.end, n: e.n, first: e.first, gone: e.gone || 0 });
  async function get(sid) {
    if (!SID.test(String(sid)) || !index.has(sid)) return null;
    // (its words, and from the index whether Claude Code has deleted it since)
    try { return { ...JSON.parse(await gunzip(await fsp.readFile(path.join(CD, `${sid}.json.gz`)))), gone: index.get(sid).gone || 0 }; } catch { return null; }
  }
  /** The conversations, newest first; with words, the ones they are in (title, first prompt, folder, then everything said),
   *  each with a few words around where they were found. At most `limit`, and about 3 s of reading. */
  async function search(q = '', { limit = 60 } = {}) {
    const words = fold(q).split(/\s+/).filter(Boolean), list = [...index.values()].sort((a, b) => b.end - a.end);
    if (!words.length) return list.slice(0, limit).map(pub);
    const out = [], until = now() + 3000;
    for (const e of list) {
      if (out.length >= limit) break;
      if (words.every((w) => fold(`${e.title} ${e.first} ${e.cwd}`).includes(w))) { out.push(pub(e)); continue; }
      if (now() > until) continue;
      const rec = await get(e.sid); if (!rec) continue;
      const all = fold(rec.msgs.map((m) => m.t).join('\n'));
      if (!words.every((w) => all.includes(w))) continue;
      const m = rec.msgs.find((x) => fold(x.t).includes(words[0])), i = fold(m.t).indexOf(words[0]);
      out.push({ ...pub(e), snip: `${i > 60 ? '…' : ''}${m.t.slice(Math.max(0, i - 60), i + 140).replace(/\s+/g, ' ')}${i + 140 < m.t.length ? '…' : ''}`, snipBy: m.r });
    }
    return out;
  }
  const stats = () => { let gone = 0, bytes = 0; for (const e of index.values()) { if (e.gone) gone++; bytes += e.bytes || 0; } return { n: index.size, gone, bytes, at: scannedAt }; };
  return { scan, search, get, stats };
}
