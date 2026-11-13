// Client controller for My Office Autonomous Operations Workspace (Phase 4).
// Coordinates Autonomy Mode Spectrum, Approval Center, Budget & Resource Monitor,
// Instantaneous Emergency Stop, and Autonomous Operations Console.

import { TOKEN } from '../net/live.js';

let drawer = null;
let currentTab = 'mode';
let cachedStatus = null;
let cachedApprovals = [];
let cachedAuditTrail = [];
let approvalsFilter = 'pending';
let auditFilter = 'all';
let pollingTimer = null;

const q = () => (TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : '');

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTime(ts) {
  if (!ts) return 'N/A';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return String(ts);
  }
}

async function apiRequest(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({ ok: false, error: 'Invalid JSON response' }));
  return { ok: res.ok && data.ok !== false, status: res.status, data };
}

export const setup = setupAutonomousView;

export function setupAutonomousView() {
  const btn = document.getElementById('btn-autonomous-workspace');
  drawer = document.getElementById('dr-autonomous');
  if (!drawer) return;

  if (btn) {
    btn.addEventListener('click', () => {
      const isHidden = drawer.hidden;
      drawer.hidden = !isHidden;
      btn.setAttribute('aria-pressed', String(!isHidden));
      if (!drawer.hidden) {
        loadTab(currentTab);
        startPolling();
      } else {
        stopPolling();
      }
    });
  }

  const closeBtn = drawer.querySelector('[data-close]');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      drawer.hidden = true;
      if (btn) btn.setAttribute('aria-pressed', 'false');
      stopPolling();
    });
  }

  // Navigation Tabs switching
  const tabs = drawer.querySelectorAll('#autonomous-tabs [data-at]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-at');
      switchTab(target);
    });
  });

  // Autonomy Level Toggles
  const modeCards = drawer.querySelectorAll('[data-mode], [data-level]');
  modeCards.forEach((elem) => {
    elem.addEventListener('click', (e) => {
      const level = elem.getAttribute('data-level') || elem.getAttribute('data-mode');
      if (level) {
        e.stopPropagation();
        setAutonomyLevel(level);
      }
    });
  });

  // Refresh buttons
  document.getElementById('btn-refresh-mode')?.addEventListener('click', loadAutonomousStatus);
  document.getElementById('btn-refresh-approvals')?.addEventListener('click', loadApprovals);
  document.getElementById('btn-refresh-budget')?.addEventListener('click', loadAutonomousStatus);
  document.getElementById('btn-refresh-emergency')?.addEventListener('click', loadAutonomousStatus);
  document.getElementById('btn-refresh-console')?.addEventListener('click', loadAutonomousStatus);

  // Approvals Filter Buttons
  const apfBtns = drawer.querySelectorAll('[data-apf]');
  apfBtns.forEach((btnElem) => {
    btnElem.addEventListener('click', () => {
      apfBtns.forEach((b) => b.classList.remove('is-active'));
      btnElem.classList.add('is-active');
      approvalsFilter = btnElem.getAttribute('data-apf') || 'all';
      renderApprovals();
    });
  });

  // Audit Filter Buttons
  const atfBtns = drawer.querySelectorAll('[data-atf]');
  atfBtns.forEach((btnElem) => {
    btnElem.addEventListener('click', () => {
      atfBtns.forEach((b) => b.classList.remove('is-active'));
      btnElem.classList.add('is-active');
      auditFilter = btnElem.getAttribute('data-atf') || 'all';
      renderAuditTrail();
    });
  });

  // Emergency Stop Buttons
  document.getElementById('btn-emergency-stop')?.addEventListener('click', () => {
    triggerEmergencyStop('Top banner emergency stop triggered by operator');
  });

  document.getElementById('btn-emergency-stop-panel')?.addEventListener('click', () => {
    const reasonInput = document.getElementById('em-reason-input');
    const reason = (reasonInput && reasonInput.value.trim()) || 'Emergency stop triggered via control panel';
    triggerEmergencyStop(reason);
  });

  // Emergency Resume Buttons
  document.getElementById('btn-emergency-resume')?.addEventListener('click', () => {
    resumeEmergencyStop('supervised', 'Operator resumed via top banner');
  });

  document.getElementById('btn-emergency-resume-panel')?.addEventListener('click', () => {
    const confirmBox = document.getElementById('em-resume-confirm');
    if (confirmBox && !confirmBox.checked) {
      alert('Please check the confirmation box indicating all safety invariants are verified.');
      return;
    }
    const select = document.getElementById('em-resume-level-select');
    const resumeLevel = (select && select.value) || 'supervised';
    resumeEmergencyStop(resumeLevel, 'Operator verified invariants and confirmed resume');
  });

  // Budget Limits Configuration Form
  const budgetForm = document.getElementById('form-auto-budget');
  if (budgetForm) {
    budgetForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveBudgetLimits();
    });
  }

  // Intervention Submission
  document.getElementById('btn-submit-intervention')?.addEventListener('click', () => {
    submitIntervention();
  });

  document.getElementById('btn-cancel-intervention')?.addEventListener('click', () => {
    const box = document.getElementById('auto-intervention-box');
    if (box) box.hidden = true;
  });

  // Initial fetch
  loadAutonomousStatus();
}

function startPolling() {
  stopPolling();
  pollingTimer = setInterval(() => {
    if (drawer && !drawer.hidden) {
      loadAutonomousStatus(true);
    }
  }, 4000);
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

export function switchTab(tabKey) {
  currentTab = tabKey;
  if (!drawer) return;

  const tabs = drawer.querySelectorAll('#autonomous-tabs [data-at]');
  tabs.forEach((tab) => {
    const isTarget = tab.getAttribute('data-at') === tabKey;
    tab.classList.toggle('is-active', isTarget);
    tab.setAttribute('aria-selected', String(isTarget));
  });

  const panes = drawer.querySelectorAll('.auto-pane');
  panes.forEach((pane) => {
    pane.hidden = pane.id !== `pane-auto-${tabKey}`;
  });

  loadTab(tabKey);
}

function loadTab(tabKey) {
  if (tabKey === 'approvals') {
    loadApprovals();
  } else {
    loadAutonomousStatus();
  }
}

/**
 * Loads autonomous status from /api/autonomous/status
 */
export async function loadAutonomousStatus(silent = false) {
  try {
    const res = await apiRequest(`/api/autonomous/status${q()}`);
    if (res.ok && res.data) {
      cachedStatus = res.data.state || res.data;
      updateUIFromStatus(cachedStatus);
    } else if (!silent) {
      showFeedback('auto-mode-feedback', res.data?.error || 'Failed to fetch status', true);
    }
  } catch (err) {
    if (!silent) console.warn('[AutonomousView] status fetch error:', err.message);
  }
}

/**
 * Updates UI views according to server autonomous status payload
 */
function updateUIFromStatus(status) {
  if (!status) return;

  const autonomyLevel = status.autonomyLevel || status.policy?.autonomyLevel || 'supervised';
  const executionState = status.executionState || 'idle';
  const emergencyStop = status.emergencyStop || { state: 'idle', halted: false };
  const budgetUsage = status.budgetUsage || status.budget?.usage || {};
  const budgetLimits = status.policy?.budget || status.budget?.limits || {};
  const pendingApprovals = status.pendingApprovals || [];
  const auditTrail = status.auditTrail || [];
  const remediationHistory = status.remediationHistory || [];
  const activeInterventions = status.activeInterventions || [];

  cachedAuditTrail = auditTrail;

  // 1. TOP EMERGENCY BANNER & STATUS BADGE
  const emBanner = document.getElementById('auto-emergency-banner');
  const emBadge = document.getElementById('auto-emergency-status-badge');
  const emDetail = document.getElementById('auto-emergency-detail');
  const emStopBtn = document.getElementById('btn-emergency-stop');
  const emResumeBtn = document.getElementById('btn-emergency-resume');
  const resumeSection = document.getElementById('section-emergency-resume');

  const isHalted = emergencyStop.halted === true || emergencyStop.state === 'halted';
  const isCancelling = emergencyStop.state === 'cancelling' || emergencyStop.state === 'tripping';

  if (emBanner) {
    emBanner.style.borderBottomColor = isHalted ? 'rgba(229, 57, 53, 0.8)' : isCancelling ? 'rgba(255, 152, 0, 0.8)' : 'rgba(229, 57, 53, 0.35)';
  }

  if (emBadge && emDetail) {
    if (isHalted) {
      emBadge.textContent = 'SYSTEM HALTED';
      emBadge.style.background = '#E53935';
      emBadge.style.color = '#FFFFFF';
      emDetail.textContent = `EMERGENCY STOP ACTIVE: ${escapeHtml(emergencyStop.reason || 'Manual halt')}. Dispatches blocked.`;
      if (emStopBtn) emStopBtn.style.opacity = '0.5';
      if (emResumeBtn) emResumeBtn.hidden = false;
      if (resumeSection) resumeSection.hidden = false;
    } else if (isCancelling) {
      emBadge.textContent = 'CANCELLATION REQUESTED';
      emBadge.style.background = '#FF9800';
      emBadge.style.color = '#000000';
      emDetail.textContent = `Halting active executions across providers... (${emergencyStop.cancellationsPending || 0} pending)`;
      if (emStopBtn) emStopBtn.style.opacity = '0.7';
      if (emResumeBtn) emResumeBtn.hidden = true;
      if (resumeSection) resumeSection.hidden = true;
    } else {
      emBadge.textContent = 'SYSTEM NORMAL';
      emBadge.style.background = '#3DDC84';
      emBadge.style.color = '#0D1117';
      emDetail.textContent = 'All autonomous dispatches operating within safety bounds.';
      if (emStopBtn) emStopBtn.style.opacity = '1';
      if (emResumeBtn) emResumeBtn.hidden = true;
      if (resumeSection) resumeSection.hidden = true;
    }
  }

  // 2. AUTONOMY LEVEL UI & CARDS
  const levelBadge = document.getElementById('auto-mode-level-badge');
  const riskBadge = document.getElementById('auto-mode-risk-badge');
  const stateLabel = document.getElementById('auto-execution-state-label');
  const activeDesc = document.getElementById('auto-mode-active-desc');

  if (stateLabel) stateLabel.textContent = executionState;

  if (levelBadge && riskBadge) {
    levelBadge.textContent = autonomyLevel.toUpperCase();
    const colors = {
      readonly: { bg: '#42A5F5', risk: 'Tier 0: None', riskColor: '#42A5F5' },
      assisted: { bg: '#FFB300', risk: 'Tier 1: Low', riskColor: '#FFB300' },
      supervised: { bg: '#5C6BC0', risk: 'Tier 2: Medium', riskColor: '#FFC107' },
      autonomous: { bg: '#3DDC84', risk: 'Tier 3: High', riskColor: '#EF5350' },
    };
    const c = colors[autonomyLevel] || colors.supervised;
    levelBadge.style.background = c.bg;
    riskBadge.textContent = c.risk;
    riskBadge.style.color = c.riskColor;
  }

  const descriptions = {
    readonly: 'Inspection, exploration & threat modeling only. Writes and mutating shell commands are strictly blocked.',
    assisted: 'Agents formulate plans and propose edits. Every command execution and file change requires explicit approval.',
    supervised: 'Agents execute safe operations, bounded workspace edits, and test suites autonomously. Destructive operations require approval.',
    autonomous: 'Full autonomous execution with automated plan decomposition, failure detection, and self-healing loops bounded by budget.',
  };
  if (activeDesc) {
    activeDesc.textContent = descriptions[autonomyLevel] || descriptions.supervised;
  }

  // Toggle active cards border & button state
  ['readonly', 'assisted', 'supervised', 'autonomous'].forEach((lvl) => {
    const card = document.getElementById(`card-mode-${lvl}`);
    const btnElem = document.getElementById(`btn-mode-${lvl}`);
    const warnElem = document.getElementById(`warning-badge-${lvl}`);
    const isCurrent = lvl === autonomyLevel;

    if (card) {
      card.style.borderColor = isCurrent ? (lvl === 'autonomous' ? '#3DDC84' : '#5C6BC0') : 'rgba(255,255,255,0.08)';
      card.style.borderWidth = isCurrent ? '2px' : '1px';
    }
    if (btnElem) {
      btnElem.textContent = isCurrent ? 'Active Level' : `Activate ${lvl.charAt(0).toUpperCase() + lvl.slice(1)}`;
      btnElem.style.background = isCurrent ? '#5C6BC0' : '';
      btnElem.style.color = isCurrent ? '#FFFFFF' : '';
    }
    if (warnElem) {
      warnElem.hidden = !isCurrent;
    }
  });

  // 3. APPROVAL CENTER BADGE & LIST
  const approvalBadge = document.getElementById('auto-approval-badge');
  if (approvalBadge) {
    const count = pendingApprovals.length;
    approvalBadge.textContent = String(count);
    approvalBadge.hidden = count === 0;
  }
  if (currentTab === 'approvals') {
    cachedApprovals = pendingApprovals;
    renderApprovals();
  }

  // 4. BUDGET METERS
  updateBudgetMeters(budgetLimits, budgetUsage);

  // 5. EMERGENCY STOP PANEL
  updateEmergencyStopPanel(emergencyStop);

  // 6. CONSOLE & AUDIT
  renderSelfHealingList(remediationHistory);
  renderInterventionsList(activeInterventions);
  renderAuditTrail();
}

/**
 * Updates Budget Meters Grid with usage percentages and numbers
 */
function updateBudgetMeters(limits = {}, usage = {}) {
  const maxCost = Number(limits.maxCostUsd) || 10.0;
  const usedCost = Number(usage.totalCostUsd) || 0.0;
  const costPct = Math.min(100, Math.round((usedCost / maxCost) * 100));
  updateMeter('meter-budget-cost-bar', 'meter-budget-cost-text', `${costPct}%`, `$${usedCost.toFixed(2)} / $${maxCost.toFixed(2)} (${costPct}%)`, costPct);

  const maxConc = Number(limits.maxConcurrentSubtasks) || 3;
  const activeConc = Number(usage.activeConcurrent) || 0;
  const concPct = Math.min(100, Math.round((activeConc / maxConc) * 100));
  updateMeter('meter-concurrency-bar', 'meter-concurrency-text', `${concPct}%`, `${activeConc} / ${maxConc} subtasks`, concPct);

  const maxTokens = Number(limits.maxTokens) || 500000;
  const usedTokens = Number(usage.tokensUsed) || 0;
  const tokPct = Math.min(100, Math.round((usedTokens / maxTokens) * 100));
  updateMeter('meter-tokens-bar', 'meter-tokens-text', `${tokPct}%`, `${usedTokens.toLocaleString()} / ${maxTokens.toLocaleString()} (${tokPct}%)`, tokPct);

  const maxDur = Number(limits.maxDurationMinutes) || 60;
  const usedDur = Number(usage.durationMinutes) || 0;
  const durPct = Math.min(100, Math.round((usedDur / maxDur) * 100));
  updateMeter('meter-duration-bar', 'meter-duration-text', `${durPct}%`, `${usedDur.toFixed(1)} / ${maxDur} min (${durPct}%)`, durPct);

  const maxSub = Number(limits.maxSubtasks) || 25;
  const usedSub = Number(usage.subtasksCompleted) || 0;
  const subPct = Math.min(100, Math.round((usedSub / maxSub) * 100));
  updateMeter('meter-subtasks-bar', 'meter-subtasks-text', `${subPct}%`, `${usedSub} / ${maxSub} subtasks`, subPct);

  const maxExec = Number(limits.maxExecutions) || 50;
  const usedExec = Number(usage.executionCount) || 0;
  const execPct = Math.min(100, Math.round((usedExec / maxExec) * 100));
  updateMeter('meter-executions-bar', 'meter-executions-text', `${execPct}%`, `${usedExec} / ${maxExec} runs`, execPct);
}

function updateMeter(barId, textId, widthVal, textVal, pct) {
  const bar = document.getElementById(barId);
  const txt = document.getElementById(textId);
  if (bar) {
    bar.style.width = widthVal;
    if (pct >= 90) bar.style.background = '#E53935';
    else if (pct >= 75) bar.style.background = '#FF9800';
  }
  if (txt) {
    txt.textContent = textVal;
    if (pct >= 90) txt.style.color = '#E53935';
  }
}

/**
 * Updates Emergency Stop state machine and cancellation counts
 */
function updateEmergencyStopPanel(stopState = {}) {
  const state = stopState.state || 'idle';
  const states = ['idle', 'tripping', 'cancelling', 'halted', 'recovering'];

  states.forEach((s) => {
    const badge = document.getElementById(`em-state-${s}`);
    if (badge) {
      const isCurrent = s === state;
      badge.style.background = isCurrent ? (s === 'idle' ? '#3DDC84' : s === 'halted' ? '#E53935' : '#FF9800') : 'rgba(255,255,255,0.08)';
      badge.style.color = isCurrent ? '#000000' : 'var(--muted, #8D97AA)';
      badge.style.fontWeight = isCurrent ? '700' : '400';
    }
  });

  const pendingCount = document.getElementById('em-pending-count');
  const confirmedCount = document.getElementById('em-confirmed-count');
  if (pendingCount) pendingCount.textContent = String(stopState.cancellationsPending || 0);
  if (confirmedCount) confirmedCount.textContent = String(stopState.cancellationsConfirmed || 0);
}

/**
 * Updates Autonomy Level via /api/autonomous/set-level
 */
export async function setAutonomyLevel(level) {
  try {
    let res = await apiRequest(`/api/autonomous/set-level${q()}`, {
      method: 'POST',
      body: JSON.stringify({ level }),
    });

    if (!res.ok && res.status === 404) {
      // Fallback endpoint variant
      res = await apiRequest(`/api/autonomous/level${q()}`, {
        method: 'POST',
        body: JSON.stringify({ level }),
      });
    }

    if (res.ok) {
      showFeedback('auto-mode-feedback', `Autonomy Level successfully updated to ${level.toUpperCase()}.`, false);
      loadAutonomousStatus();
    } else {
      showFeedback('auto-mode-feedback', res.data?.error || `Failed to set autonomy level to ${level}`, true);
    }
  } catch (err) {
    showFeedback('auto-mode-feedback', err.message, true);
  }
}

/**
 * Fetches approvals list from /api/autonomous/approvals
 */
export async function loadApprovals() {
  try {
    const res = await apiRequest(`/api/autonomous/approvals${q()}`);
    if (res.ok && res.data) {
      cachedApprovals = res.data.approvals || res.data || [];
      renderApprovals();
    }
  } catch (err) {
    console.warn('[AutonomousView] loadApprovals error:', err.message);
  }
}

/**
 * Renders approval cards based on current filter
 */
function renderApprovals() {
  const container = document.getElementById('auto-approvals-list');
  const emptyBox = document.getElementById('auto-approvals-empty');
  if (!container) return;

  const filtered = (cachedApprovals || []).filter((item) => {
    if (approvalsFilter === 'all') return true;
    if (approvalsFilter === 'pending') return item.status === 'pending';
    if (approvalsFilter === 'approved') return item.status === 'approved';
    if (approvalsFilter === 'rejected') return item.status === 'rejected';
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = '';
    if (emptyBox) emptyBox.hidden = false;
    return;
  }

  if (emptyBox) emptyBox.hidden = true;

  container.innerHTML = filtered
    .map((appr) => {
      const isPending = appr.status === 'pending';
      const riskColor = appr.riskTier === 'high' ? '#EF5350' : appr.riskTier === 'low' ? '#42A5F5' : '#FFB300';
      const payloadSnippet = appr.payload ? JSON.stringify(appr.payload, null, 2) : '';

      return `
      <div class="approval-card" style="background: var(--card, #18202B); border: 1px solid var(--line-2, rgba(255,255,255,0.08)); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <b style="color: var(--ink, #E8ECF4); font-size: 0.95rem;">${escapeHtml(appr.title || appr.actionType)}</b>
            <span class="tb-badge" style="background: rgba(255,255,255,0.08); color: var(--muted, #8D97AA); font-size: 0.72rem;">${escapeHtml(appr.actionType)}</span>
            <span class="tb-badge" style="background: rgba(239, 83, 80, 0.15); color: ${riskColor}; font-size: 0.72rem;">${escapeHtml(appr.riskTier || 'medium')} risk</span>
          </div>
          <span style="font-size: 0.78rem; color: var(--muted, #8D97AA);">
            Status: <b style="color: ${isPending ? '#FFB300' : appr.status === 'approved' ? '#3DDC84' : '#EF5350'}">${escapeHtml(appr.status)}</b> · ${formatTime(appr.createdAt)}
          </span>
        </div>

        <p style="margin: 0; font-size: 0.82rem; color: var(--ink, #E8ECF4); line-height: 1.4;">
          ${escapeHtml(appr.description || 'Action triggered an explicit approval gate.')}
        </p>

        ${
          payloadSnippet
            ? `<pre style="margin: 4px 0 0; background: #0D1117; padding: 8px; border-radius: 6px; font-size: 0.75rem; color: #8D97AA; max-height: 120px; overflow-y: auto;">${escapeHtml(payloadSnippet)}</pre>`
            : ''
        }

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px;">
          <span style="font-size: 0.75rem; color: var(--muted, #8D97AA);">
            ID: <code>${escapeHtml(appr.approvalId)}</code> · Requested by: <b>${escapeHtml(appr.requestedBy || 'system')}</b>
          </span>

          ${
            isPending
              ? `
            <div style="display: flex; gap: 8px;">
              <button type="button" class="tb-btn btn-intervene-action" data-id="${escapeHtml(appr.approvalId)}" style="font-size: 0.78rem; padding: 4px 10px; background: rgba(255, 152, 0, 0.15); color: #FFB300;">
                Intervene
              </button>
              <button type="button" class="tb-btn btn-reject-action" data-id="${escapeHtml(appr.approvalId)}" style="font-size: 0.78rem; padding: 4px 10px; background: rgba(239, 83, 80, 0.15); color: #EF5350;">
                Reject
              </button>
              <button type="button" class="tb-btn btn-approve-action" data-id="${escapeHtml(appr.approvalId)}" style="font-size: 0.78rem; padding: 4px 14px; background: #3DDC84; color: #000; font-weight: 700;">
                Approve
              </button>
            </div>
          `
              : ''
          }
        </div>
      </div>
    `;
    })
    .join('');

  // Attach button click events
  container.querySelectorAll('.btn-approve-action').forEach((btnElem) => {
    btnElem.addEventListener('click', () => {
      const id = btnElem.getAttribute('data-id');
      resolveApproval(id, 'approve');
    });
  });

  container.querySelectorAll('.btn-reject-action').forEach((btnElem) => {
    btnElem.addEventListener('click', () => {
      const id = btnElem.getAttribute('data-id');
      const reason = prompt('Rejection reason (required):', 'Operator rejected action');
      if (reason) resolveApproval(id, 'reject', { reason });
    });
  });

  container.querySelectorAll('.btn-intervene-action').forEach((btnElem) => {
    btnElem.addEventListener('click', () => {
      const id = btnElem.getAttribute('data-id');
      openInterventionBox(id);
    });
  });
}

function openInterventionBox(approvalId) {
  const box = document.getElementById('auto-intervention-box');
  const targetIdInput = document.getElementById('intervention-target-id');
  const guidanceInput = document.getElementById('auto-intervention-guidance');
  if (box && targetIdInput) {
    targetIdInput.value = approvalId;
    if (guidanceInput) guidanceInput.value = '';
    box.hidden = false;
    guidanceInput?.focus();
  }
}

async function submitIntervention() {
  const targetIdInput = document.getElementById('intervention-target-id');
  const guidanceInput = document.getElementById('auto-intervention-guidance');
  const id = targetIdInput ? targetIdInput.value : null;
  const guidance = guidanceInput ? guidanceInput.value.trim() : '';

  if (!id) return;
  if (!guidance) {
    alert('Please enter operator guidance instructions before submitting intervention.');
    return;
  }

  await resolveApproval(id, 'intervene', {
    interventionGuidance: guidance,
    reason: 'Operator manual intervention and direction override',
  });

  const box = document.getElementById('auto-intervention-box');
  if (box) box.hidden = true;
}

/**
 * Resolves approval request via /api/autonomous/approvals/:id/resolve
 */
export async function resolveApproval(approvalId, action, options = {}) {
  try {
    const payload = {
      action,
      decision: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'intervened',
      reason: options.reason || `Operator executed ${action}`,
      interventionGuidance: options.interventionGuidance || null,
      authorizedBy: 'operator',
    };

    // Primary endpoint: /api/autonomous/approvals/:id/resolve
    let res = await apiRequest(`/api/autonomous/approvals/${encodeURIComponent(approvalId)}/resolve${q()}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    // Fallback endpoint: /api/autonomous/approvals/decide
    if (!res.ok && res.status === 404) {
      res = await apiRequest(`/api/autonomous/approvals/decide${q()}`, {
        method: 'POST',
        body: JSON.stringify({ approvalId, ...payload }),
      });
    }

    if (res.ok) {
      loadApprovals();
      loadAutonomousStatus();
    } else {
      alert(`Approval error: ${res.data?.error || 'Failed to resolve approval'}`);
    }
  } catch (err) {
    alert(`Network error resolving approval: ${err.message}`);
  }
}

/**
 * Saves Budget limits configuration via /api/autonomous/budget/update
 */
export async function saveBudgetLimits() {
  const maxCost = parseFloat(document.getElementById('budget-max-cost')?.value || '10.0');
  const maxConc = parseInt(document.getElementById('budget-max-concurrency')?.value || '3', 10);
  const maxTokens = parseInt(document.getElementById('budget-max-tokens')?.value || '500000', 10);
  const maxDur = parseInt(document.getElementById('budget-max-duration')?.value || '60', 10);
  const maxSub = parseInt(document.getElementById('budget-max-subtasks')?.value || '25', 10);

  const limits = {
    maxCostUsd: maxCost,
    maxConcurrentSubtasks: maxConc,
    maxTokens,
    maxDurationMinutes: maxDur,
    maxSubtasks: maxSub,
  };

  try {
    let res = await apiRequest(`/api/autonomous/budget/update${q()}`, {
      method: 'POST',
      body: JSON.stringify({ limits, budget: limits, authorizedBy: 'operator' }),
    });

    if (!res.ok && res.status === 404) {
      res = await apiRequest(`/api/autonomous/budget${q()}`, {
        method: 'POST',
        body: JSON.stringify({ limits, budget: limits, authorizedBy: 'operator' }),
      });
    }

    if (res.ok) {
      showFeedback('auto-budget-status', 'Budget and resource quotas saved successfully.', false);
      loadAutonomousStatus();
    } else {
      showFeedback('auto-budget-status', res.data?.error || 'Failed to save budget limits', true);
    }
  } catch (err) {
    showFeedback('auto-budget-status', err.message, true);
  }
}

/**
 * Triggers instantaneous system-wide Emergency Stop
 */
export async function triggerEmergencyStop(reason = 'Operator manual halt') {
  try {
    const res = await apiRequest(`/api/autonomous/emergency-stop${q()}`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'halt',
        reason,
        triggeredBy: 'operator',
      }),
    });

    if (res.ok) {
      loadAutonomousStatus();
    } else {
      alert(`Emergency stop error: ${res.data?.error || 'Failed to trigger emergency stop'}`);
    }
  } catch (err) {
    alert(`Emergency stop network error: ${err.message}`);
  }
}

/**
 * Resets / Resumes Emergency Stop
 */
export async function resumeEmergencyStop(resumeLevel = 'supervised', reason = 'Operator resume') {
  try {
    let res = await apiRequest(`/api/autonomous/emergency-stop/reset${q()}`, {
      method: 'POST',
      body: JSON.stringify({
        authorizedBy: 'operator',
        reason,
        resumeLevel,
      }),
    });

    if (!res.ok && res.status === 404) {
      res = await apiRequest(`/api/autonomous/emergency-stop${q()}`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'resume',
          authorizedBy: 'operator',
          reason,
          resumeLevel,
        }),
      });
    }

    if (res.ok) {
      loadAutonomousStatus();
    } else {
      alert(`Emergency resume error: ${res.data?.error || 'Failed to resume system'}`);
    }
  } catch (err) {
    alert(`Emergency resume network error: ${err.message}`);
  }
}

/**
 * Renders Active Self-Healing Remediations
 */
function renderSelfHealingList(remediations = []) {
  const container = document.getElementById('auto-self-healing-list');
  const countBadge = document.getElementById('auto-healing-count');
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${remediations.length} Active Loops`;
  }

  if (remediations.length === 0) {
    container.innerHTML = `
      <div style="padding: 16px; text-align: center; color: var(--muted, #8D97AA); font-size: 0.82rem;">
        No active remediation loops. Tasks are executing cleanly without failure loops.
      </div>
    `;
    return;
  }

  container.innerHTML = remediations
    .map((rem) => `
      <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 10px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <b style="color: #AB47BC; font-size: 0.85rem;">${escapeHtml(rem.strategy || 'retry_with_backoff')}</b>
          <p style="margin: 2px 0 0; font-size: 0.78rem; color: var(--muted, #8D97AA);">
            Subtask: <code>${escapeHtml(rem.subtaskId || 'sub_task')}</code> · Attempt ${rem.attemptNumber || 1} of ${rem.maxAttempts || 3}
          </p>
          <span style="font-size: 0.75rem; color: #EF5350;">${escapeHtml(rem.errorSnippet || rem.reason || '')}</span>
        </div>
        <span class="tb-badge" style="background: rgba(171, 71, 188, 0.2); color: #AB47BC; font-size: 0.75rem;">
          ${escapeHtml(rem.status || 'active')}
        </span>
      </div>
    `)
    .join('');
}

/**
 * Renders Human Intervention Logs
 */
function renderInterventionsList(interventions = []) {
  const container = document.getElementById('auto-interventions-list');
  if (!container) return;

  if (interventions.length === 0) {
    container.innerHTML = `
      <div style="padding: 16px; text-align: center; color: var(--muted, #8D97AA); font-size: 0.82rem;">
        No operator interventions recorded yet.
      </div>
    `;
    return;
  }

  container.innerHTML = interventions
    .map((item) => `
      <div style="background: rgba(255, 152, 0, 0.05); border: 1px solid rgba(255, 152, 0, 0.2); border-radius: 6px; padding: 8px 12px; font-size: 0.8rem;">
        <div style="display: flex; justify-content: space-between; color: #FFB300; font-weight: 600;">
          <span>${escapeHtml(item.actionType || 'Intervention')}</span>
          <span style="font-weight: 400; color: var(--muted, #8D97AA);">${formatTime(item.timestamp)}</span>
        </div>
        <p style="margin: 4px 0 0; color: var(--ink, #E8ECF4);">${escapeHtml(item.guidance || item.reason || '')}</p>
      </div>
    `)
    .join('');
}

/**
 * Renders Audit Trail Stream
 */
function renderAuditTrail() {
  const container = document.getElementById('auto-audit-trail');
  if (!container) return;

  const filtered = (cachedAuditTrail || []).filter((entry) => {
    if (auditFilter === 'all') return true;
    if (auditFilter === 'policy') return entry.type?.includes('policy') || entry.type?.includes('level');
    if (auditFilter === 'security') return entry.type?.includes('security') || entry.type?.includes('emergency');
    if (auditFilter === 'remediation') return entry.type?.includes('healing') || entry.type?.includes('remediation');
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<span style="color: var(--muted, #8D97AA);">[Audit stream empty]</span>';
    return;
  }

  container.innerHTML = filtered
    .map((log) => {
      const typeColor = log.type?.includes('emergency') || log.type?.includes('blocked') ? '#EF5350' : log.type?.includes('security') ? '#FFB300' : '#3DDC84';
      const details = log.details ? JSON.stringify(log.details) : '';
      return `<div><span style="color: #8D97AA;">[${formatTime(log.timestamp || log.time)}]</span> <b style="color: ${typeColor};">[${escapeHtml(log.type || 'LOG')}]</b> <span style="color: #E8ECF4;">${escapeHtml(log.message || log.reason || details)}</span></div>`;
    })
    .join('');
}

function showFeedback(elemId, message, isError) {
  const elem = document.getElementById(elemId);
  if (!elem) return;
  elem.textContent = message;
  elem.style.background = isError ? 'rgba(239, 83, 80, 0.15)' : 'rgba(61, 220, 132, 0.15)';
  elem.style.color = isError ? '#EF5350' : '#3DDC84';
  elem.hidden = false;
  setTimeout(() => {
    if (elem) elem.hidden = true;
  }, 5000);
}
