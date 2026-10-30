// Pictures of the pages Claude changed, for the group chat: when a run from the chat edits a web page running on this
// computer (a dev server), Claude ends its answer with "SCREENSHOT: http://localhost:3000/…" lines (asked to, see
// SHOT_ASK) and the office photographs each at a phone's size. Only this computer's own pages (localhost) are taken.
// With Playwright's Chromium if it is here (it is, with the office's tests), else Google Chrome's own headless mode
// and macOS's sips for the JPEG; neither: no pictures.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SHOT_ASK = 'You are being written to from My Office (the user is on a phone). If your work changed a web page running on this computer (a dev server already running), end your answer with one line per page worth seeing, at most 3, exactly like: SCREENSHOT: http://localhost:3000/the/page . The office photographs them for the phone. Do not start a server for this.';
const LINE = /^\s*SCREENSHOT:\s*(\S+)\s*$/gim;
const local = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(x.hostname) ? x.href : null; } catch { return null; } };
/** The answer without its SCREENSHOT lines, and the pages they name (this computer's only, at most 3). */
export function shotsIn(text) {
  const urls = [...String(text || '').matchAll(LINE)].map((m) => local(m[1])).filter(Boolean);
  return { text: String(text || '').replace(LINE, '').replace(/\n{3,}/g, '\n\n').trim(), urls: [...new Set(urls)].slice(0, 3) };
}
const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
// (never the Mac's keychain: without these, a Chrome started away from your own home folder, as in the tests, asks
// macOS for one and a "Keychain Not Found" window comes up)
const QUIET = ['--use-mock-keychain', '--password-store=basic', '--no-first-run', '--no-default-browser-check'];
const run = (file, args, ms) => new Promise((ok) => execFile(file, args, { timeout: ms }, (err) => ok(!err)));
/** A page at a phone's size, as a JPEG data URL (under the chat's 500 kB), or null. */
export async function shoot(url, { width = 390, height = 844 } = {}) {
  if (!local(url)) return null;
  const jpeg = (buf) => `data:image/jpeg;base64,${buf.toString('base64')}`;
  try {
    const { chromium } = await import('playwright');
    const b = await chromium.launch({ args: QUIET });
    try {
      const p = await b.newPage({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await p.goto(url, { waitUntil: 'load', timeout: 30_000 }).catch(() => {});
      await p.waitForTimeout(1500);
      for (const q of [62, 45, 30]) { const buf = await p.screenshot({ type: 'jpeg', quality: q }); if (buf.length * 1.37 < 480_000) return jpeg(buf); }
      return null;
    } finally { await b.close().catch(() => {}); }
  } catch { /* no Playwright here: Chrome itself */ }
  const chrome = CHROME.find((f) => fs.existsSync(f)); if (!chrome) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-shot-')), png = path.join(dir, 'p.png'), jpg = path.join(dir, 'p.jpg');
  try {
    if (!(await run(chrome, [...QUIET, `--user-data-dir=${path.join(dir, 'profile')}`, '--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${width},${height}`, '--force-device-scale-factor=2', `--screenshot=${png}`, url], 45_000)) || !fs.existsSync(png)) return null;
    if (process.platform === 'darwin' && await run('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '55', png, '--out', jpg], 20_000) && fs.existsSync(jpg)) {
      const buf = fs.readFileSync(jpg); return buf.length * 1.37 < 480_000 ? jpeg(buf) : null;
    }
    return null;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
