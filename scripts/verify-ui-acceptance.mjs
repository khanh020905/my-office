import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const TARGET_URL = 'http://127.0.0.1:4310';
const TARGET_FILENAME = 'live-app-hook-remediation-20261112-v3.txt';
const SHOTS_DIR = path.resolve('docs/screenshots');

async function run() {
  console.log('=== VERIFYING ACTIVITY CENTER LIVE ACCEPTANCE ===');
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.addInitScript(() => {
    localStorage.setItem('office-tips', 'seen');
    localStorage.setItem('office-welcome', 'seen');
  });

  const chunkStatuses = [];
  let sseConnected = false;
  let sseStatus = null;
  const pageErrors = [];

  page.on('response', res => {
    const url = res.url();
    if (url.includes('/_next/static/chunks/')) {
      chunkStatuses.push({ url: url.split('/_next/static/chunks/')[1], status: res.status() });
    }
    if (url.includes('/stream')) {
      sseStatus = res.status();
      sseConnected = true;
    }
  });

  page.on('pageerror', err => {
    console.error('[PAGE ERROR]', err);
    pageErrors.push(err.toString());
  });

  console.log('1. Navigating to', TARGET_URL);
  await page.goto(TARGET_URL, { waitUntil: 'load', timeout: 30000 });

  console.log('2. Waiting for client office state and SSE connection...');
  await page.waitForFunction(() => {
    const st = window.__officeState;
    return !!(st && st.connectedOnce && st.taskAggregator && window.__renderFeed);
  }, { timeout: 20000 });

  console.log('3. Checking client state and aggregator tasks...');
  const stateInfo = await page.evaluate(() => {
    const st = window.__officeState;
    const aggr = st.taskAggregator;
    const active = aggr.getActiveTasks();
    const hist = aggr.getHistoryTasks({ limit: 100 });
    return {
      connectedOnce: st.connectedOnce,
      feedLength: st.feed?.length,
      activeTasksCount: active.length,
      historyTotal: hist.total,
      historyItemsCount: hist.items.length,
      hasTargetInHistory: hist.items.some(t => JSON.stringify(t).includes('live-app-hook-remediation-20261112-v3.txt')),
      targetTaskDetails: hist.items.find(t => JSON.stringify(t).includes('live-app-hook-remediation-20261112-v3.txt'))
    };
  });
  console.log('Client State Info:', JSON.stringify(stateInfo, null, 2));

  console.log('4. Checking chunk HTTP statuses:');
  const failedChunks = chunkStatuses.filter(c => c.status !== 200);
  console.log(`  Total chunks loaded: ${chunkStatuses.length}, failed: ${failedChunks.length}`);
  console.log('  SSE Status:', sseStatus);
  console.log('  Page Errors:', pageErrors.length);

  // Check connection status in UI
  const connPillText = await page.$eval('.conn, #conn, [data-conn]', el => el.textContent).catch(() => 'unknown');
  console.log('  Connection status text in UI:', connPillText);

  // Expand history date groups if needed
  console.log('5. Ensuring history date groups and target timeline are expanded...');
  await page.evaluate((targetFile) => {
    // Expand date buttons
    const dateBtns = document.querySelectorAll('.act-date-btn');
    dateBtns.forEach(b => {
      if (b.getAttribute('aria-expanded') === 'false') b.click();
    });
  }, TARGET_FILENAME);
  await page.waitForTimeout(500);

  // Locate the target task card in history
  const targetCard = page.locator(`.tc-card:has-text("Codex App")`).filter({
    has: page.locator(`[title*="${TARGET_FILENAME}"]`)
  }).first();

  const isTargetCardVisible = await targetCard.isVisible().catch(() => false);
  console.log('  Target Codex App card visible in DOM:', isTargetCardVisible);

  if (isTargetCardVisible) {
    // Expand timeline of target card
    const toggleBtn = targetCard.locator('.tc-btn-toggle');
    if (await toggleBtn.isVisible()) {
      await toggleBtn.dispatchEvent('click');
      await page.waitForTimeout(300);
    }

    // Expand file groups inside timeline
    const fileGroupHeads = targetCard.locator('.tc-tl-group-head');
    const fgCount = await fileGroupHeads.count();
    console.log(`  Target card has ${fgCount} timeline groups. Expanding...`);
    for (let i = 0; i < fgCount; i++) {
      await fileGroupHeads.nth(i).dispatchEvent('click');
      await page.waitForTimeout(100);
    }
  }

  // Check if filename is rendered in the DOM
  const domContainsFilename = await page.evaluate((fname) => {
    const list = document.getElementById('feed-list');
    return list ? list.innerHTML.includes(fname) : false;
  }, TARGET_FILENAME);
  console.log(`6. DOM #feed-list contains "${TARGET_FILENAME}":`, domContainsFilename);

  // Take screenshot 1
  const shot1 = path.join(SHOTS_DIR, 'live-acceptance-recovered-overview.png');
  await page.screenshot({ path: shot1 });
  console.log('  Saved overview screenshot to:', shot1);

  // 7. Test page reload persistence (Phase B Step 9)
  console.log('7. Reloading page to verify persistence...');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => {
    const st = window.__officeState;
    return !!(st && st.connectedOnce && st.taskAggregator && window.__renderFeed);
  }, { timeout: 20000 });

  await page.evaluate(() => {
    const dateBtns = document.querySelectorAll('.act-date-btn');
    dateBtns.forEach(b => {
      if (b.getAttribute('aria-expanded') === 'false') b.click();
    });
  });
  await page.waitForTimeout(500);

  const targetCardReload = page.locator(`.tc-card:has-text("Codex App")`).filter({
    has: page.locator(`[title*="${TARGET_FILENAME}"]`)
  }).first();

  const isCardVisibleReload = await targetCardReload.isVisible().catch(() => false);
  console.log('  Target card visible after reload:', isCardVisibleReload);

  if (isCardVisibleReload) {
    const toggleBtn = targetCardReload.locator('.tc-btn-toggle');
    if (await toggleBtn.isVisible()) {
      await toggleBtn.dispatchEvent('click');
      await page.waitForTimeout(300);
    }
    const fileGroupHeads = targetCardReload.locator('.tc-tl-group-head');
    const fgCount = await fileGroupHeads.count();
    for (let i = 0; i < fgCount; i++) {
      await fileGroupHeads.nth(i).dispatchEvent('click');
      await page.waitForTimeout(100);
    }
  }

  const domContainsFilenameReload = await page.evaluate((fname) => {
    const list = document.getElementById('feed-list');
    return list ? list.innerHTML.includes(fname) : false;
  }, TARGET_FILENAME);
  console.log(`  DOM #feed-list contains "${TARGET_FILENAME}" after reload:`, domContainsFilenameReload);

  const shot2 = path.join(SHOTS_DIR, 'live-acceptance-recovered-reloaded.png');
  await page.screenshot({ path: shot2 });
  console.log('  Saved reload screenshot to:', shot2);

  await browser.close();
  console.log('=== VERIFICATION COMPLETE ===');
}

run().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
