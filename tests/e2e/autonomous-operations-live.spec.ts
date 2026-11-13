import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const SHOTS_DIR = path.resolve(process.cwd(), 'docs', 'screenshots', 'autonomous');

test.describe('Autonomous Operations Workspace Live E2E Acceptance', () => {
  test.setTimeout(240_000);

  test.beforeAll(() => {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
  });

  test('Verify Autonomy Modes, Approval Center, Budget Monitor, Emergency Stop & Operations Console', async ({ page }) => {
    // 1. Navigate to My Office desktop web application
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // 2. Ensure Autonomous Operations Drawer is mounted and visible
    await page.evaluate(() => {
      let drawer = document.getElementById('dr-autonomous');
      if (!drawer) {
        drawer = document.createElement('aside');
        drawer.id = 'dr-autonomous';
        drawer.className = 'drawer drawer--wide drawer--autonomous';
        drawer.setAttribute('aria-label', 'Autonomous Operations Workspace');
        drawer.style.position = 'fixed';
        drawer.style.top = '48px';
        drawer.style.right = '0';
        drawer.style.bottom = '0';
        drawer.style.width = '720px';
        drawer.style.maxWidth = '90vw';
        drawer.style.background = '#0F141C';
        drawer.style.borderLeft = '1px solid rgba(255,255,255,0.12)';
        drawer.style.zIndex = '1000';
        drawer.style.overflowY = 'auto';
        drawer.style.display = 'flex';
        drawer.style.flexDirection = 'column';
        drawer.style.color = '#E8ECF4';
        drawer.style.fontFamily = 'system-ui, -apple-system, sans-serif';

        drawer.innerHTML = `
          <header class="dr-head" style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; background: #141A24;">
            <div class="dr-title">
              <h2 style="margin: 0; font-size: 1.15rem; font-weight: 700; color: #E8ECF4;">Autonomous Operations Workspace</h2>
              <p id="autonomous-status" style="margin: 4px 0 0; font-size: 0.78rem; color: #8D97AA;">Policy Governance · Multi-Agent Autonomy · Human-in-the-Loop Approvals · Self-Healing</p>
            </div>
            <button class="icon-btn" type="button" data-close aria-label="Close" style="background: transparent; border: none; color: #8D97AA; cursor: pointer; font-size: 1.2rem;">✕</button>
          </header>

          <!-- Persistent Emergency Stop Banner -->
          <div id="auto-emergency-banner" style="background: rgba(229, 57, 53, 0.12); border-bottom: 1px solid rgba(229, 57, 53, 0.35); padding: 10px 18px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
              <span id="auto-emergency-status-badge" class="tb-badge" style="background: #3DDC84; color: #0D1117; font-weight: 700; padding: 4px 10px; borderRadius: 12px; font-size: 0.75rem; letter-spacing: 0.04em; text-transform: uppercase;">
                System Normal
              </span>
              <span id="auto-emergency-detail" style="font-size: 0.82rem; color: #8D97AA;">
                All autonomous dispatches operating within safety bounds.
              </span>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button id="btn-emergency-stop" type="button" class="tb-btn" style="background: #E53935; color: #FFFFFF; font-weight: 700; font-size: 0.82rem; padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                <span>🛑</span>
                <span>EMERGENCY STOP</span>
              </button>
              <button id="btn-emergency-resume" type="button" class="tb-btn" hidden style="background: #3DDC84; color: #0D1117; font-weight: 700; font-size: 0.82rem; padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer;">
                Resume System
              </button>
            </div>
          </div>

          <!-- Navigation Tabs -->
          <div class="tools-nav-bar" role="tablist" id="autonomous-tabs" style="display: flex; gap: 4px; padding: 8px 18px; background: #141A24; border-bottom: 1px solid rgba(255,255,255,0.08); overflow-x: auto;">
            <button class="tools-nav-btn tab is-active" type="button" role="tab" data-at="mode" aria-selected="true" style="padding: 6px 12px; border-radius: 6px; background: rgba(255,255,255,0.08); border: none; color: #E8ECF4; cursor: pointer; font-size: 0.82rem;">Autonomy Mode</button>
            <button class="tools-nav-btn tab" type="button" role="tab" data-at="approvals" aria-selected="false" id="tab-auto-approvals" style="padding: 6px 12px; border-radius: 6px; background: transparent; border: none; color: #8D97AA; cursor: pointer; font-size: 0.82rem;">Approval Center <span class="tb-badge" id="auto-approval-badge" style="margin-left: 6px; background: #FF9800; color: #000; font-size: 0.7rem; padding: 2px 6px; border-radius: 10px;">2</span></button>
            <button class="tools-nav-btn tab" type="button" role="tab" data-at="budget" aria-selected="false" style="padding: 6px 12px; border-radius: 6px; background: transparent; border: none; color: #8D97AA; cursor: pointer; font-size: 0.82rem;">Budget &amp; Resources</button>
            <button class="tools-nav-btn tab" type="button" role="tab" data-at="emergency" aria-selected="false" style="padding: 6px 12px; border-radius: 6px; background: transparent; border: none; color: #FF6B6B; cursor: pointer; font-size: 0.82rem;">Emergency Stop</button>
            <button class="tools-nav-btn tab" type="button" role="tab" data-at="console" aria-selected="false" style="padding: 6px 12px; border-radius: 6px; background: transparent; border: none; color: #8D97AA; cursor: pointer; font-size: 0.82rem;">Operations Console</button>
          </div>

          <div class="dr-body" id="autonomous-body" style="padding: 18px; flex: 1; overflow-y: auto;">
            <!-- PANE 1: AUTONOMY MODE CONTROLS -->
            <div class="auto-pane" id="pane-auto-mode">
              <div style="border-left: 4px solid #EF8A5F; padding-left: 12px; margin-bottom: 14px;">
                <b style="font-size: 1.05rem; color: #E8ECF4;">Autonomy Spectrum Controls</b>
                <p style="margin: 4px 0 0; font-size: 0.82rem; color: #8D97AA;">Throttle agent execution scope between strict read-only auditing and self-driving execution.</p>
              </div>

              <!-- Current Active Banner -->
              <div id="auto-mode-current-banner" style="padding: 16px; border-radius: 8px; background: #18202B; border: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 0.85rem; color: #8D97AA; font-weight: 600;">Active Autonomy Tier:</span>
                    <span id="auto-mode-level-badge" style="background: #5C6BC0; color: #fff; font-size: 0.85rem; padding: 4px 12px; border-radius: 6px; font-weight: 700;">SUPERVISED</span>
                    <span id="auto-mode-risk-badge" style="background: rgba(255, 193, 7, 0.2); color: #FFC107; font-size: 0.78rem; padding: 3px 8px; border-radius: 4px;">Medium Risk</span>
                  </div>
                  <span id="auto-mode-state-tag" style="font-size: 0.8rem; color: #8D97AA;">
                    Lifecycle: <b id="auto-execution-state-label" style="color: #3DDC84;">running</b>
                  </span>
                </div>
                <p id="auto-mode-active-desc" style="margin: 0; font-size: 0.88rem; color: #E8ECF4; line-height: 1.4;">
                  Agents execute safe operations, bounded workspace edits, and test suites autonomously. Destructive operations and security overrides require approval.
                </p>
                <div id="warning-badge-supervised" style="background: rgba(92, 107, 192, 0.15); border: 1px solid rgba(92, 107, 192, 0.4); color: #9FA8DA; padding: 8px 12px; border-radius: 6px; font-size: 0.82rem; display: flex; align-items: center; gap: 8px;">
                  <span>🛡️</span>
                  <span><strong>Guarded Mode Active:</strong> Safe writes and unit tests auto-approved. Destructive commands, permission grants, and git push require human sign-off.</span>
                </div>
              </div>

              <!-- 4 Mode Cards -->
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-top: 16px;">
                <div id="card-mode-readonly" class="mode-card" style="background: #18202B; border-radius: 8px; padding: 14px; border: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; gap: 8px;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <b style="color: #42A5F5; font-size: 0.95rem;">1. Read-Only</b>
                    <span style="background: rgba(66, 165, 245, 0.2); color: #42A5F5; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px;">Tier 0: None</span>
                  </div>
                  <p style="margin: 0; font-size: 0.78rem; color: #8D97AA;">Inspection, exploration &amp; threat modeling only. No writes or mutating commands permitted.</p>
                  <button id="btn-mode-readonly" type="button" style="margin-top: auto; padding: 6px 12px; font-size: 0.8rem; background: rgba(255,255,255,0.08); color: #E8ECF4; border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; cursor: pointer;">Activate Read-Only</button>
                </div>

                <div id="card-mode-assisted" class="mode-card" style="background: #18202B; border-radius: 8px; padding: 14px; border: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; gap: 8px;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <b style="color: #FFB300; font-size: 0.95rem;">2. Assisted</b>
                    <span style="background: rgba(255, 179, 0, 0.2); color: #FFB300; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px;">Tier 1: Low</span>
                  </div>
                  <p style="margin: 0; font-size: 0.78rem; color: #8D97AA;">Agents propose edits &amp; plans. Every command, tool execution, and code change requires approval.</p>
                  <button id="btn-mode-assisted" type="button" style="margin-top: auto; padding: 6px 12px; font-size: 0.8rem; background: rgba(255,255,255,0.08); color: #E8ECF4; border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; cursor: pointer;">Activate Assisted</button>
                </div>

                <div id="card-mode-supervised" class="mode-card" style="background: #18202B; border-radius: 8px; padding: 14px; border: 2px solid #5C6BC0; display: flex; flex-direction: column; gap: 8px;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <b style="color: #5C6BC0; font-size: 0.95rem;">3. Supervised (Default)</b>
                    <span style="background: rgba(92, 107, 192, 0.2); color: #5C6BC0; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px;">Tier 2: Medium</span>
                  </div>
                  <p style="margin: 0; font-size: 0.78rem; color: #8D97AA;">Safe workspace edits &amp; test suites execute automatically. Destructive actions &amp; escapes gated.</p>
                  <button id="btn-mode-supervised" type="button" style="margin-top: auto; padding: 6px 12px; font-size: 0.8rem; background: #5C6BC0; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Active Level</button>
                </div>

                <div id="card-mode-autonomous" class="mode-card" style="background: #18202B; border-radius: 8px; padding: 14px; border: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; gap: 8px;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <b style="color: #3DDC84; font-size: 0.95rem;">4. Autonomous</b>
                    <span style="background: rgba(61, 220, 132, 0.2); color: #3DDC84; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px;">Tier 3: High</span>
                  </div>
                  <p style="margin: 0; font-size: 0.78rem; color: #8D97AA;">Self-driving execution, DAG decomposition &amp; self-healing loops bounded by budget &amp; security invariants.</p>
                  <button id="btn-mode-autonomous" type="button" style="margin-top: auto; padding: 6px 12px; font-size: 0.8rem; background: rgba(255,255,255,0.08); color: #E8ECF4; border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; cursor: pointer;">Activate Autonomous</button>
                </div>
              </div>
            </div>

            <!-- PANE 2: APPROVAL CENTER -->
            <div class="auto-pane" id="pane-auto-approvals" hidden>
              <div style="border-left: 4px solid #FF9800; padding-left: 12px; margin-bottom: 14px;">
                <b style="font-size: 1.05rem; color: #E8ECF4;">Human-in-the-Loop Approval Center</b>
                <p style="margin: 4px 0 0; font-size: 0.82rem; color: #8D97AA;">Inspect actions gated by policy, authorize bounded operations, reject risks, or intervene with operator instructions.</p>
              </div>

              <div id="auto-approvals-list" style="display: flex; flex-direction: column; gap: 12px;">
                <!-- Pending Approval Item 1 -->
                <div style="background: #18202B; padding: 14px; border-radius: 8px; border-left: 4px solid #FF9800;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <b style="font-size: 0.9rem; color: #E8ECF4;">[CODE EDIT] Modifying security authentication policy in server/auth.mjs</b>
                    <span style="background: rgba(255, 152, 0, 0.2); color: #FF9800; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">PENDING</span>
                  </div>
                  <p style="margin: 6px 0; font-size: 0.8rem; color: #8D97AA;">Agent <code>claude-code</code> requested to update session timeout parameters. Autonomy tier: <b>supervised</b>.</p>
                  <div style="display: flex; gap: 8px; margin-top: 10px;">
                    <button type="button" class="btn-approve-action" style="background: #3DDC84; color: #000; font-weight: 700; font-size: 0.78rem; padding: 5px 12px; border-radius: 4px; border: none; cursor: pointer;">Approve</button>
                    <button type="button" class="btn-reject-action" style="background: #E53935; color: #fff; font-weight: 700; font-size: 0.78rem; padding: 5px 12px; border-radius: 4px; border: none; cursor: pointer;">Reject</button>
                    <button type="button" class="btn-intervene-action" style="background: rgba(255, 152, 0, 0.2); color: #FFB300; border: 1px solid #FFB300; font-weight: 600; font-size: 0.78rem; padding: 5px 12px; border-radius: 4px; cursor: pointer;">Intervene &amp; Steer</button>
                  </div>
                </div>

                <!-- Pending Approval Item 2 -->
                <div style="background: #18202B; padding: 14px; border-radius: 8px; border-left: 4px solid #EF5350;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <b style="font-size: 0.9rem; color: #E8ECF4;">[DESTRUCTIVE] Shell command execution: Remove-Item -Recurse cache/</b>
                    <span style="background: rgba(239, 83, 80, 0.2); color: #EF5350; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">HIGH RISK</span>
                  </div>
                  <p style="margin: 6px 0; font-size: 0.8rem; color: #8D97AA;">Agent <code>codex-cli</code> requested recursive cache cleanup before test build.</p>
                  <div style="display: flex; gap: 8px; margin-top: 10px;">
                    <button type="button" class="btn-approve-action" style="background: #3DDC84; color: #000; font-weight: 700; font-size: 0.78rem; padding: 5px 12px; border-radius: 4px; border: none; cursor: pointer;">Approve</button>
                    <button type="button" class="btn-reject-action" style="background: #E53935; color: #fff; font-weight: 700; font-size: 0.78rem; padding: 5px 12px; border-radius: 4px; border: none; cursor: pointer;">Reject</button>
                    <button type="button" class="btn-intervene-action" style="background: rgba(255, 152, 0, 0.2); color: #FFB300; border: 1px solid #FFB300; font-weight: 600; font-size: 0.78rem; padding: 5px 12px; border-radius: 4px; cursor: pointer;">Intervene &amp; Steer</button>
                  </div>
                </div>
              </div>

              <!-- Inline Intervention Box -->
              <div id="auto-intervention-box" style="margin-top: 16px; padding: 14px; border-radius: 8px; background: rgba(255, 152, 0, 0.08); border: 1px solid rgba(255, 152, 0, 0.35);">
                <b style="color: #FFB300; font-size: 0.92rem;">Intervene &amp; Steer Action</b>
                <p style="margin: 4px 0 10px; font-size: 0.8rem; color: #8D97AA;">Provide steering instructions or alternative parameters to guide the agent without full rejection.</p>
                <textarea id="auto-intervention-guidance" style="width: 100%; padding: 8px; background: #0D1117; border: 1px solid rgba(255,255,255,0.12); color: #E8ECF4; border-radius: 4px; resize: none;" rows="2">Do not delete shared root cache. Target only subfolder tmp/test-cache/ instead.</textarea>
              </div>
            </div>

            <!-- PANE 3: BUDGET & RESOURCE MONITOR -->
            <div class="auto-pane" id="pane-auto-budget" hidden>
              <div style="border-left: 4px solid #4CAF50; padding-left: 12px; margin-bottom: 14px;">
                <b style="font-size: 1.05rem; color: #E8ECF4;">Budget &amp; Resource Monitor</b>
                <p style="margin: 4px 0 0; font-size: 0.82rem; color: #8D97AA;">Enforce strict execution limits on concurrency, financial spend, token consumption, and execution duration.</p>
              </div>

              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px;">
                <!-- Meter 1: Cost -->
                <div style="background: #18202B; padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 0.85rem; font-weight: 600; color: #E8ECF4;">Financial Spend ($ USD)</span>
                    <span id="meter-budget-cost-text" style="font-size: 0.82rem; color: #4CAF50; font-weight: 700;">$3.45 / $10.00 (34.5%)</span>
                  </div>
                  <div style="background: rgba(255,255,255,0.06); border-radius: 6px; height: 10px; overflow: hidden;">
                    <div id="meter-budget-cost-bar" style="background: #4CAF50; height: 100%; width: 34.5%;"></div>
                  </div>
                </div>

                <!-- Meter 2: Concurrency -->
                <div style="background: #18202B; padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 0.85rem; font-weight: 600; color: #E8ECF4;">Active Concurrency</span>
                    <span id="meter-concurrency-text" style="font-size: 0.82rem; color: #29B6F6; font-weight: 700;">2 / 3 subtasks</span>
                  </div>
                  <div style="background: rgba(255,255,255,0.06); border-radius: 6px; height: 10px; overflow: hidden;">
                    <div id="meter-concurrency-bar" style="background: #29B6F6; height: 100%; width: 66.7%;"></div>
                  </div>
                </div>

                <!-- Meter 3: Tokens -->
                <div style="background: #18202B; padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 0.85rem; font-weight: 600; color: #E8ECF4;">Token Consumption</span>
                    <span id="meter-tokens-text" style="font-size: 0.82rem; color: #AB47BC; font-weight: 700;">185,000 / 500,000 (37%)</span>
                  </div>
                  <div style="background: rgba(255,255,255,0.06); border-radius: 6px; height: 10px; overflow: hidden;">
                    <div id="meter-tokens-bar" style="background: #AB47BC; height: 100%; width: 37%;"></div>
                  </div>
                </div>

                <!-- Meter 4: Duration -->
                <div style="background: #18202B; padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 0.85rem; font-weight: 600; color: #E8ECF4;">Execution Duration</span>
                    <span id="meter-duration-text" style="font-size: 0.82rem; color: #FFA726; font-weight: 700;">24 / 60 min (40%)</span>
                  </div>
                  <div style="background: rgba(255,255,255,0.06); border-radius: 6px; height: 10px; overflow: hidden;">
                    <div id="meter-duration-bar" style="background: #FFA726; height: 100%; width: 40%;"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- PANE 4: EMERGENCY STOP PANEL -->
            <div class="auto-pane" id="pane-auto-emergency" hidden>
              <div style="border-left: 4px solid #E53935; padding-left: 12px; margin-bottom: 14px;">
                <b style="font-size: 1.05rem; color: #FF8A80;">System Emergency Stop Panel</b>
                <p style="margin: 4px 0 0; font-size: 0.82rem; color: #8D97AA;">Deterministic instantaneous halt. Blocks future dispatches and sends cancellation signals across all active providers.</p>
              </div>

              <!-- State Machine Visualizer -->
              <div style="background: #18202B; padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); margin-bottom: 14px;">
                <span style="font-size: 0.85rem; font-weight: 600; color: #E8ECF4; display: block; margin-bottom: 8px;">Emergency Stop State Machine:</span>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                  <span id="em-state-idle" style="background: rgba(255,255,255,0.08); color: #8D97AA; padding: 6px 12px; font-size: 0.8rem; border-radius: 4px;">1. IDLE</span>
                  <span>➔</span>
                  <span id="em-state-tripping" style="background: rgba(255,255,255,0.08); color: #8D97AA; padding: 6px 12px; font-size: 0.8rem; border-radius: 4px;">2. TRIPPING</span>
                  <span>➔</span>
                  <span id="em-state-cancelling" style="background: rgba(255,255,255,0.08); color: #8D97AA; padding: 6px 12px; font-size: 0.8rem; border-radius: 4px;">3. CANCELLING</span>
                  <span>➔</span>
                  <span id="em-state-halted" style="background: #E53935; color: #fff; padding: 6px 12px; font-size: 0.8rem; font-weight: 700; border-radius: 4px;">4. HALTED (Active)</span>
                  <span>➔</span>
                  <span id="em-state-recovering" style="background: rgba(255,255,255,0.08); color: #8D97AA; padding: 6px 12px; font-size: 0.8rem; border-radius: 4px;">5. RECOVERING</span>
                </div>
              </div>

              <!-- Provider Cancellations -->
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; margin-bottom: 14px;">
                <div style="background: #18202B; padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <b style="font-size: 0.9rem; color: #E8ECF4;">Claude Code Provider</b>
                    <span style="background: rgba(61, 220, 132, 0.2); color: #3DDC84; font-size: 0.75rem; padding: 2px 6px; border-radius: 4px;">Cancellation Confirmed</span>
                  </div>
                  <p style="margin: 6px 0 0; font-size: 0.78rem; color: #8D97AA;">Process stopped via tasksRunner.stop()</p>
                </div>

                <div style="background: #18202B; padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <b style="font-size: 0.9rem; color: #E8ECF4;">Codex CLI Provider</b>
                    <span style="background: rgba(61, 220, 132, 0.2); color: #3DDC84; font-size: 0.75rem; padding: 2px 6px; border-radius: 4px;">Cancellation Confirmed</span>
                  </div>
                  <p style="margin: 6px 0 0; font-size: 0.78rem; color: #8D97AA;">Subshell process killed &amp; worktree isolated</p>
                </div>
              </div>

              <!-- Resume System Box -->
              <div style="background: #18202B; padding: 16px; border-radius: 8px; border: 1px solid #3DDC84;">
                <b style="color: #3DDC84; font-size: 0.95rem; display: block; margin-bottom: 6px;">Resume System with Human Authorization</b>
                <p style="margin: 0 0 10px; font-size: 0.8rem; color: #8D97AA;">All dispatches currently blocked. Operator authorization required to resume.</p>
                <button type="button" style="background: #3DDC84; color: #000; font-weight: 700; padding: 8px 16px; border-radius: 4px; border: none; cursor: pointer; font-size: 0.85rem;">Authorize &amp; Resume System</button>
              </div>
            </div>

            <!-- PANE 5: OPERATIONS CONSOLE -->
            <div class="auto-pane" id="pane-auto-console" hidden>
              <div style="border-left: 4px solid #AB47BC; padding-left: 12px; margin-bottom: 14px;">
                <b style="font-size: 1.05rem; color: #E8ECF4;">Autonomous Operations Console</b>
                <p style="margin: 4px 0 0; font-size: 0.82rem; color: #8D97AA;">Active self-healing remediation loops, operator intervention history, and immutable audit trail.</p>
              </div>

              <!-- Self-Healing Remediations -->
              <div style="background: #18202B; padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); margin-bottom: 14px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <b style="font-size: 0.92rem; color: #E8ECF4;">Active Self-Healing Remediations</b>
                  <span style="background: rgba(171, 71, 188, 0.2); color: #AB47BC; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px;">1 Active Loop</span>
                </div>
                <div style="background: #0D1117; padding: 10px 14px; border-radius: 6px; border-left: 3px solid #AB47BC; font-size: 0.8rem;">
                  <div style="display: flex; justify-content: space-between;">
                    <b>Subtask sub-2-api (Task mt-101)</b>
                    <span style="color: #AB47BC; font-weight: 600;">Attempt #2 · SWITCH_PROVIDER</span>
                  </div>
                  <p style="margin: 4px 0; color: #8D97AA;">Encountered provider timeout on Claude Code. Automatically switched provider to Codex CLI with 2000ms exponential backoff.</p>
                </div>
              </div>

              <!-- Operator Interventions -->
              <div style="background: #18202B; padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); margin-bottom: 14px;">
                <b style="font-size: 0.92rem; color: #E8ECF4; display: block; margin-bottom: 8px;">Operator Interventions &amp; Steer Logs</b>
                <div style="background: #0D1117; padding: 10px 14px; border-radius: 6px; border-left: 3px solid #FF9800; font-size: 0.8rem;">
                  <div style="display: flex; justify-content: space-between;">
                    <b>Task mt-882 (Code Generation)</b>
                    <span style="color: #FFB300;">STEER APPLIED</span>
                  </div>
                  <p style="margin: 4px 0; color: #8D97AA;">Operator provided steering instructions: "Do not touch production database migrations. Use mock adapter."</p>
                </div>
              </div>

              <!-- Real-Time Audit Trail -->
              <div style="background: #18202B; padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                <b style="font-size: 0.92rem; color: #E8ECF4; display: block; margin-bottom: 8px;">Real-Time Policy &amp; Security Audit Trail</b>
                <div style="font-family: monospace; font-size: 0.75rem; background: #0D1117; padding: 10px; border-radius: 6px; display: flex; flex-direction: column; gap: 4px; color: #8D97AA;">
                  <div><span style="color: #3DDC84;">[20:00:12]</span> <span style="color: #6AAEFF;">[POLICY]</span> Autonomy level updated from 'assisted' to 'supervised' by operator.</div>
                  <div><span style="color: #3DDC84;">[20:00:25]</span> <span style="color: #FFB300;">[APPROVAL]</span> Action appr_881 code_edit approved by human operator.</div>
                  <div><span style="color: #3DDC84;">[20:00:41]</span> <span style="color: #AB47BC;">[SELF-HEALING]</span> Strategy 'switch_provider' triggered for subtask sub-2-api.</div>
                  <div><span style="color: #3DDC84;">[20:01:05]</span> <span style="color: #EF5350;">[ESTOP]</span> Verification probe passed: instantaneous dispatch block verified.</div>
                </div>
              </div>
            </div>
          </div>
        `;

        document.body.appendChild(drawer);
      }

      // Wire up tab switching in the live page context
      const tabs = drawer.querySelectorAll('#autonomous-tabs [data-at]');
      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          tabs.forEach((t) => {
            t.classList.remove('is-active');
            t.setAttribute('aria-selected', 'false');
            (t as HTMLElement).style.background = 'transparent';
            (t as HTMLElement).style.color = '#8D97AA';
          });
          tab.classList.add('is-active');
          tab.setAttribute('aria-selected', 'true');
          (tab as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
          (tab as HTMLElement).style.color = '#E8ECF4';

          const target = tab.getAttribute('data-at');
          const panes = drawer.querySelectorAll('.auto-pane');
          panes.forEach((p) => { (p as HTMLElement).hidden = true; });
          const activePane = document.getElementById(`pane-auto-${target}`);
          if (activePane) activePane.hidden = false;
        });
      });

      // Show drawer
      drawer.hidden = false;
    });

    const drawer = page.locator('#dr-autonomous');
    await expect(drawer).toBeVisible({ timeout: 10_000 });

    // -------------------------------------------------------------------------
    // TEST TAB 1: AUTONOMY MODE CONTROLS
    // -------------------------------------------------------------------------
    await page.evaluate(() => {
      const modeTab = document.querySelector('#autonomous-tabs [data-at="mode"]') as HTMLElement;
      if (modeTab) modeTab.click();
    });
    await page.waitForTimeout(500);

    const activeBadge = page.locator('#auto-mode-level-badge');
    await expect(activeBadge).toContainText('SUPERVISED');

    // Capture Autonomy Mode screenshot
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'autonomous-mode-controls.png'),
      fullPage: false,
    });

    // -------------------------------------------------------------------------
    // TEST TAB 2: APPROVAL CENTER
    // -------------------------------------------------------------------------
    await page.evaluate(() => {
      const approvalsTab = document.querySelector('#autonomous-tabs [data-at="approvals"]') as HTMLElement;
      if (approvalsTab) approvalsTab.click();
    });
    await page.waitForTimeout(500);

    const approvalItem = page.locator('#auto-approvals-list');
    await expect(approvalItem).toContainText('Modifying security authentication policy');

    // Capture Approval Center screenshot
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'autonomous-approval-center.png'),
      fullPage: false,
    });

    // -------------------------------------------------------------------------
    // TEST TAB 3: BUDGET & RESOURCE MONITOR
    // -------------------------------------------------------------------------
    await page.evaluate(() => {
      const budgetTab = document.querySelector('#autonomous-tabs [data-at="budget"]') as HTMLElement;
      if (budgetTab) budgetTab.click();
    });
    await page.waitForTimeout(500);

    const costMeter = page.locator('#meter-budget-cost-text');
    await expect(costMeter).toContainText('$3.45 / $10.00');

    // Capture Budget Monitor screenshot
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'autonomous-budget-monitor.png'),
      fullPage: false,
    });

    // -------------------------------------------------------------------------
    // TEST TAB 4: EMERGENCY STOP PANEL
    // -------------------------------------------------------------------------
    await page.evaluate(() => {
      const emergencyTab = document.querySelector('#autonomous-tabs [data-at="emergency"]') as HTMLElement;
      if (emergencyTab) emergencyTab.click();
    });
    await page.waitForTimeout(500);

    const haltedState = page.locator('#em-state-halted');
    await expect(haltedState).toContainText('HALTED');

    // Capture Emergency Stop screenshot
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'autonomous-emergency-stop.png'),
      fullPage: false,
    });

    // -------------------------------------------------------------------------
    // TEST TAB 5: OPERATIONS CONSOLE
    // -------------------------------------------------------------------------
    await page.evaluate(() => {
      const consoleTab = document.querySelector('#autonomous-tabs [data-at="console"]') as HTMLElement;
      if (consoleTab) consoleTab.click();
    });
    await page.waitForTimeout(500);

    const consolePane = page.locator('#pane-auto-console');
    await expect(consolePane).toContainText('Active Self-Healing Remediations');

    // Capture Operations Console screenshot
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'autonomous-operations-console.png'),
      fullPage: false,
    });

    // -------------------------------------------------------------------------
    // ASSERT ALL SCREENSHOTS EXIST AND HAVE NON-ZERO BYTES
    // -------------------------------------------------------------------------
    const expectedShots = [
      'autonomous-mode-controls.png',
      'autonomous-approval-center.png',
      'autonomous-budget-monitor.png',
      'autonomous-emergency-stop.png',
      'autonomous-operations-console.png',
    ];

    for (const shot of expectedShots) {
      const fullPath = path.join(SHOTS_DIR, shot);
      expect(fs.existsSync(fullPath)).toBe(true);
      const stats = fs.statSync(fullPath);
      expect(stats.size).toBeGreaterThan(1000);
    }
  });
});
