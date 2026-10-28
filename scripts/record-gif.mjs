#!/usr/bin/env node
// Records the demo office as an animated GIF for the README (docs/media/demo.gif).
//
//   npm run build && npm start &              # or `npm run dev`, any running office will do
//   node scripts/record-gif.mjs               # 20 s of the company floor, 12 frames a second
//   node scripts/record-gif.mjs --seconds 12 --width 800 --viewport 1440 --url 'http://127.0.0.1:4310/?demo&layout=cozy'
//
// Run it on a machine with a real GPU: in a VM or CI the browser falls back to software WebGL and the office drops to
// a few frames a second. Frames come from Chrome's screencast (one per repaint), are resampled to an even rate, then
// written with one shared 255-colour palette; a pixel that did not change since the last frame is left transparent,
// which keeps a 20-second GIF to a few megabytes.
import { chromium } from '@playwright/test';
import gifenc from 'gifenc';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const URL_ = arg('url', 'http://127.0.0.1:4310/?demo&layout=pro&lang=en');
const SECONDS = Number(arg('seconds', 20)), FPS = Number(arg('fps', 12));
// the page is laid out at --viewport wide (16:10) and the GIF scaled down to --width, so the office is not cramped
const VIEW = Number(arg('viewport', 1280)), WIDTH = Number(arg('width', 960));
const even = (n) => Math.round(n / 2) * 2, VIEW_H = even((VIEW * 10) / 16), HEIGHT = even((WIDTH * 10) / 16);
const WARMUP = Number(arg('warmup', 12));   // seconds for the office to load and the demo to get going
const OUT = path.resolve(arg('out', 'docs/media/demo.gif'));
const { GIFEncoder, quantize, applyPalette } = gifenc;   // a CommonJS package

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const page = await (await browser.newContext({ viewport: { width: VIEW, height: VIEW_H }, deviceScaleFactor: 1 })).newPage();
console.log(`Opening ${URL_} at ${VIEW}×${VIEW_H}, recording at ${WIDTH}×${HEIGHT}…`);
await page.goto(URL_, { waitUntil: 'load', timeout: 120_000 });
await page.waitForTimeout(WARMUP * 1000);

const frames = [];   // { at: seconds, png: Buffer }
const cdp = await page.context().newCDPSession(page);
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  frames.push({ at: metadata.timestamp, png: Buffer.from(data, 'base64') });
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'png', maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1 });
console.log(`Recording ${SECONDS} s…`);
await page.waitForTimeout(SECONDS * 1000);
await cdp.send('Page.stopScreencast');
await browser.close();
if (frames.length < 2) { console.error('No frames came through: is the page showing anything?'); process.exit(1); }

// an even frame rate: for each tick, the newest frame painted by then
const t0 = frames[0].at, picks = [];
for (let k = 0, i = 0; k < SECONDS * FPS; k++) {
  const at = t0 + k / FPS;
  while (i + 1 < frames.length && frames[i + 1].at <= at) i++;
  picks.push(frames[i]);
}
console.log(`${frames.length} frames painted (${(frames.length / SECONDS).toFixed(1)} a second), writing ${picks.length}…`);
const decode = (f) => { const p = PNG.sync.read(f.png); return { w: p.width, h: p.height, rgba: new Uint8Array(p.data.buffer, p.data.byteOffset, p.data.length) }; };

// one palette for the whole GIF, from every 10th frame, so colours don't shimmer between frames; index 255 = "unchanged"
const sample = picks.filter((_, k) => k % 10 === 0).map(decode), { w, h } = sample[0];
const all = new Uint8Array(sample.length * w * h * 4);
sample.forEach((s, k) => all.set(s.rgba, k * w * h * 4));
const palette = quantize(all, 255);
const SAME = palette.length;
palette.push([0, 0, 0]);

const gif = GIFEncoder();
let prev = null;
for (const [k, f] of picks.entries()) {
  const { rgba } = decode(f), index = applyPalette(rgba, palette.slice(0, SAME));
  if (prev) for (let p = 0; p < index.length; p++) { if (index[p] === prev[p]) index[p] = SAME; else prev[p] = index[p]; }
  else prev = index.slice();
  gif.writeFrame(index, w, h, { palette: k === 0 ? palette : undefined, delay: Math.round(1000 / FPS), transparent: k > 0, transparentIndex: SAME, dispose: 1 });
}
gif.finish();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, gif.bytes());
console.log(`Wrote ${path.relative(process.cwd(), OUT)} · ${(fs.statSync(OUT).size / 1024 ** 2).toFixed(1)} MB`);
