import path from 'node:path';
import { test, expect } from '@playwright/test';

const SHOTS_DIR = path.resolve('docs/screenshots');

test.describe('Activity Center Live Acceptance & Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('office-tips', 'seen');
        localStorage.setItem('office-welcome', 'seen');
      } catch { /* ignore */ }
    });
  });

  test('Verify Task-Centric Activity Center and capture required screenshots', async ({ page }) => {
    test.setTimeout(300_000);

    // 1. Open the office page on desktop viewport
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Wait for the activity panel to be attached and initialized
    const feed = page.locator('#feed');
    await expect(feed).toBeVisible({ timeout: 20_000 });
    const feedList = page.locator('#feed-list');
    await expect(feedList).toBeVisible();

    // Wait for office client state to be ready
    await page.waitForFunction(() => {
      const win = window as unknown as { __officeState?: { taskAggregator?: unknown }; __renderFeed?: () => void };
      const st = win.__officeState;
      return !!(st && st.taskAggregator && win.__renderFeed);
    }, { timeout: 20_000 });

    // 2. Inject realistic multi-agent tasks into client aggregator and render
    await page.evaluate(() => {
      const now = Date.now();
      const win = window as unknown as {
        __officeState: {
          taskAggregator: {
            ingest: (evt: Record<string, unknown>) => void;
          };
        };
        __renderFeed?: () => void;
      };
      const agg = win.__officeState.taskAggregator;

      // Task 1: Claude Code (Active, phase-based, 4 files, 2 commands)
      agg.ingest({
        id: 101,
        taskId: 'task-claude-auth',
        sess: 'claude-sess-auth',
        provider: 'claude-code',
        type: 'prompt',
        label: 'Refactor OAuth & Session Management',
        ts: now - 180_000,
      });
      agg.ingest({
        id: 102,
        taskId: 'task-claude-auth',
        sess: 'claude-sess-auth',
        provider: 'claude-code',
        type: 'read',
        label: 'src/auth/jwt.js',
        path: 'src/auth/jwt.js',
        ts: now - 160_000,
      });
      agg.ingest({
        id: 103,
        taskId: 'task-claude-auth',
        sess: 'claude-sess-auth',
        provider: 'claude-code',
        type: 'edit',
        label: 'src/auth/jwt.js',
        path: 'src/auth/jwt.js',
        ts: now - 140_000,
      });
      agg.ingest({
        id: 104,
        taskId: 'task-claude-auth',
        sess: 'claude-sess-auth',
        provider: 'claude-code',
        type: 'edit',
        label: 'src/auth/session.js',
        path: 'src/auth/session.js',
        ts: now - 120_000,
      });
      agg.ingest({
        id: 105,
        taskId: 'task-claude-auth',
        sess: 'claude-sess-auth',
        provider: 'claude-code',
        type: 'bash',
        command: 'npm test -- tests/auth',
        label: 'npm test -- tests/auth',
        ts: now - 100_000,
      });

      // Task 2: Codex App (Active, quantitative progress 3/6 = 50%)
      agg.ingest({
        id: 201,
        taskId: 'task-codex-db',
        sess: 'codex-sess-db',
        turnId: 'turn-db-1',
        provider: 'codex-app',
        type: 'codex_prompt',
        label: 'Database Schema Migration to v2',
        currentStep: 3,
        totalSteps: 6,
        ts: now - 90_000,
      });
      agg.ingest({
        id: 202,
        taskId: 'task-codex-db',
        sess: 'codex-sess-db',
        turnId: 'turn-db-1',
        provider: 'codex-app',
        type: 'edit',
        label: 'migrations/002_add_index.sql',
        path: 'migrations/002_add_index.sql',
        ts: now - 80_000,
      });

      // Task 3: Antigravity Observer (Active, coarse observation, activity-only pulse)
      agg.ingest({
        id: 301,
        taskId: 'task-antigravity-obs',
        sess: 'antigravity:workspace',
        provider: 'antigravity',
        type: 'antigravity_observed',
        label: 'Antigravity observed filesystem modifications in background',
        ts: now - 30_000,
      });

      // Task 4: Succeeded Task in History
      agg.ingest({
        id: 401,
        taskId: 'task-hist-completed',
        sess: 'sess-completed',
        provider: 'codex-cli',
        type: 'bash',
        command: 'git checkout -b feature/cache',
        label: 'Create feature branch',
        ts: now - 3600_000,
      });
      agg.ingest({
        id: 402,
        taskId: 'task-hist-completed',
        sess: 'sess-completed',
        provider: 'codex-cli',
        type: 'stop',
        label: 'Branch created and synced successfully',
        ts: now - 3500_000,
      });

      // Task 5: Failed Task with Actionable Error
      agg.ingest({
        id: 501,
        taskId: 'task-failed-build',
        sess: 'sess-failed',
        provider: 'claude-code',
        type: 'prompt',
        label: 'Production Build and Type Check',
        ts: now - 60_000,
      });
      agg.ingest({
        id: 502,
        taskId: 'task-failed-build',
        sess: 'sess-failed',
        provider: 'claude-code',
        type: 'fail',
        label: 'Build failed: tsc exited with code 1 (3 type errors in server/auth.ts)',
        ts: now - 45_000,
      });

      if (win.__renderFeed) {
        win.__renderFeed();
      }
    });

    console.log('[E2E] Verifying active cards count...');
    const activeCards = feedList.locator('.tc-card--active');
    await expect(activeCards).toHaveCount(3);
    console.log('[E2E] Active cards count verified.');

    // Verify Claude card details
    console.log('[E2E] Verifying Claude card...');
    const claudeCard = page.locator('.tc-card[data-task-id="task-claude-auth"]');
    await expect(claudeCard).toContainText('Refactor OAuth & Session Management');
    await expect(claudeCard).toContainText('Executing');
    await expect(claudeCard.locator('.tc-chip-file')).toContainText('2 files');
    await expect(claudeCard.locator('.tc-chip-cmd')).toContainText('1 command');
    console.log('[E2E] Claude card verified.');

    // Verify Codex quantitative card
    console.log('[E2E] Verifying Codex card...');
    const codexCard = page.locator('.tc-card[data-task-id="task-codex-db"]');
    await expect(codexCard).toContainText('Database Schema Migration');
    await expect(codexCard).toContainText('3/6');
    console.log('[E2E] Codex card verified.');

    // Verify Antigravity coarse card
    console.log('[E2E] Verifying Antigravity card...');
    const agyCard = page.locator('.tc-card[data-task-id="task-antigravity-obs"]');
    await expect(agyCard).toContainText('Antigravity');
    await expect(agyCard.locator('.tc-activity-only')).toBeVisible();
    console.log('[E2E] Antigravity card verified.');

    // Verify Failed task in History
    console.log('[E2E] Verifying Failed card in History...');
    const failedCard = page.locator('.tc-card[data-task-id="task-failed-build"]');
    await expect(failedCard).toBeVisible();
    await expect(failedCard.locator('.tc-callout--err')).toContainText('Build failed: tsc exited with code 1');
    console.log('[E2E] Failed card verified.');

    // Screenshot 1: Overview with multiple active agents
    console.log('[E2E] Capturing Screenshot 1...');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'overview-active-agents.png') });
    console.log('[E2E] Screenshot 1 captured.');

    // 4. Test In-place update: Send a new event to Task 1 and ensure NO duplicate card is created
    console.log('[E2E] Testing in-place update...');
    await page.evaluate(() => {
      const win = window as unknown as {
        __officeState: {
          taskAggregator: {
            ingest: (evt: Record<string, unknown>) => void;
          };
        };
        __renderFeed?: () => void;
      };
      const st = win.__officeState;
      st.taskAggregator.ingest({
        id: 106,
        taskId: 'task-claude-auth',
        sess: 'claude-sess-auth',
        provider: 'claude-code',
        type: 'edit',
        label: 'src/auth/tokens.js',
        path: 'src/auth/tokens.js',
        ts: Date.now(),
      });
      if (win.__renderFeed) {
        win.__renderFeed();
      }
    });

    await expect(feedList.locator('.tc-card--active')).toHaveCount(3);
    await expect(page.locator('.tc-card[data-task-id="task-claude-auth"] .tc-chip-file')).toContainText('3 files');
    console.log('[E2E] In-place update verified.');

    // 5. Expand Claude task timeline
    console.log('[E2E] Expanding timeline...');
    await page.locator('.tc-card[data-task-id="task-claude-auth"] .tc-btn-toggle').dispatchEvent('click');
    const timeline = page.locator('.tc-card[data-task-id="task-claude-auth"] .tc-timeline');
    await expect(timeline).toBeVisible();
    await expect(timeline.locator('.tc-tl-group')).toHaveCount(3);
    console.log('[E2E] Timeline expanded and verified.');

    // Screenshot 2: Expanded task timeline
    console.log('[E2E] Capturing Screenshot 2...');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'expanded-task-timeline.png') });
    console.log('[E2E] Screenshot 2 captured.');

    // 6. Test History Date Collapse / Expand
    console.log('[E2E] Testing history collapse...');
    const dateBtn = page.locator('#feed-list .act-section').nth(1).locator('.act-date-btn').first();
    await expect(dateBtn).toBeVisible();

    // Collapse the date group
    await dateBtn.dispatchEvent('click');
    await expect(page.locator('#feed-list .act-section').nth(1).locator('.tc-list')).toHaveCount(0);
    console.log('[E2E] History collapsed.');

    // Scroll feed down to History section for Screenshot 3
    await page.evaluate(() => {
      const el = document.querySelector('#feed-list');
      if (el) el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(400);

    // Screenshot 3: Collapsed completed history
    console.log('[E2E] Capturing Screenshot 3...');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'collapsed-completed-history.png') });
    console.log('[E2E] Screenshot 3 captured.');

    // Re-expand history for viewing
    console.log('[E2E] Re-expanding history...');
    await page.locator('#feed-list .act-section').nth(1).locator('.act-date-btn').first().dispatchEvent('click');
    await expect(page.locator('#feed-list .act-section').nth(1).locator('.tc-list')).toHaveCount(1);
    console.log('[E2E] History re-expanded.');

    // Scroll failed card into view for Screenshot 4
    await page.evaluate(() => {
      const errCard = document.querySelector('.tc-card--failed');
      if (errCard) errCard.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await page.waitForTimeout(400);

    // Screenshot 4: Failed task state
    console.log('[E2E] Capturing Screenshot 4...');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'failed-task-state.png') });
    console.log('[E2E] Screenshot 4 captured.');

    // 7. Mobile / Narrow viewport verification
    console.log('[E2E] Testing mobile viewport...');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);

    // On mobile phone viewport, tap the Activity tab in the bottom navigation bar
    await page.evaluate(() => {
      const tab = document.querySelector('.ph-tab[data-tab="activity"]') as HTMLElement;
      if (tab) tab.click();
      else {
        const toggle = document.querySelector('#feed-toggle') as HTMLElement;
        if (toggle) toggle.click();
      }
    });
    await page.waitForTimeout(500);
    console.log('[E2E] Mobile feed opened.');

    // Screenshot 5: Mobile / narrow viewport
    console.log('[E2E] Capturing Screenshot 5...');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'mobile-viewport.png') });
    console.log('[E2E] Screenshot 5 captured.');
  });
});
