#!/usr/bin/env node
// The pictures on Settings → Office: one per floor plan, taken from a running office in demo mode, by day, with the
// panels and labels hidden (photo mode's look). Run it after changing what a floor plan looks like.
//
//   npm run dev &                      # or any running office
//   node scripts/make-thumbs.mjs       # → public/assets/thumbs/layout-<plan>.jpg
//   node scripts/make-thumbs.mjs --url http://127.0.0.1:4311 --only hq
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const BASE = arg('url', 'http://127.0.0.1:4310'), ONLY = arg('only', null);
// where each plan's picture looks (the camera's target) and how close
const FRAME = { cozy: [0, 0.3, 0.2, 1.45], pro: [3, 0.3, 0.7, 1.3], hq: [3, 0.3, 9, 1.08] };
const PLANS = ['cozy', 'pro', 'hq'].filter((p) => !ONLY || ONLY.split(',').includes(p));
const OUT = path.join(ROOT, 'public', 'assets', 'thumbs');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
for (const plan of PLANS) {
  const page = await (await browser.newContext({ viewport: { width: 800, height: 400 }, deviceScaleFactor: 1 })).newPage();
  await page.goto(`${BASE}/?demo&debug&layout=${plan}&at=15:00&lang=en&season=none`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForTimeout(10_000);
  await page.evaluate((f) => { document.body.classList.add('is-photo', 'photo-nonames'); window.__office.view(...f); }, FRAME[plan]);
  await page.waitForTimeout(2500);
  const file = path.join(OUT, `layout-${plan}.jpg`);
  await page.locator('#stage').screenshot({ path: file, type: 'jpeg', quality: 80 });
  console.log(`${path.relative(ROOT, file)} · ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  await page.close();
}
await browser.close();
