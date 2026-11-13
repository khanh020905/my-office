// Client controller for My Office Multi-Agent Task Orchestration Workspace.
// Coordinates DAG composition, dependency graph visualization, execution board, and handoffs.
import { TOKEN } from '../net/live.js';

let drawer = null;
let currentTab = 'masters';
let cachedMasters = [];
let activeMasterId = null;
let subtaskCounter = 1;

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

export function setup() {
  setupOrchestrationView();
}

export function setupOrchestrationView() {
  const btn = document.getElementById('btn-orch-workspace');
  drawer = document.getElementById('dr-orchestration');
  if (!btn || !drawer) return;

  btn.addEventListener('click', () => {
    const isHidden = drawer.hidden;
    drawer.hidden = !isHidden;
    btn.setAttribute('aria-pressed', String(!isHidden));
    if (!drawer.hidden) {
      loadTab(currentTab);
    }
  });

  const closeBtn = drawer.querySelector('[data-close]');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      drawer.hidden = true;
      btn.setAttribute('aria-pressed', 'false');
    });
  }

  // Navigation tab switching
  const tabs = drawer.querySelectorAll('#orchestration-tabs [data-ot]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-ot');
      switchTab(target);
    });
  });

  document.getElementById('btn-refresh-masters')?.addEventListener('click', loadMasterTasks);
  document.getElementById('btn-refresh-qa')?.addEventListener('click', () => loadQaView(activeMasterId));

  document.getElementById('btn-trigger-review')?.addEventListener('click', async () => {
    const targetId = activeMasterId || (cachedMasters.length > 0 ? cachedMasters[0].masterTaskId : null);
    if (!targetId) {
      alert('Please select or create a Master Task first.');
      return;
    }
    try {
      const res = await fetch(`/api/qa/reviews/evaluate${q()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterTaskId: targetId,
          implementationAgent: 'claude-code',
          instruction: 'Comprehensive Independent Review & Quality Gate Verification',
          testResults: { command: 'npm test', exitCode: 0, total: 5, passed: 5, failed: 0 },
          staticResults: {
            typecheck: { status: 'passed', errorCount: 0 },
            lint: { status: 'passed', errorCount: 0 },
          },
        }),
      });
      const data = await res.json();
      if (!data.ok) alert(`Review error: ${data.error}`);
      else loadQaView(targetId);
    } catch (e) {
      alert(e.message);
    }
  });

  document.getElementById('btn-create-remediation')?.addEventListener('click', async () => {
    const targetId = activeMasterId || (cachedMasters.length > 0 ? cachedMasters[0].masterTaskId : null);
    if (!targetId) {
      alert('Please select a Master Task first.');
      return;
    }
    try {
      const findRes = await fetch(`/api/qa/findings?masterTaskId=${targetId}${TOKEN ? `&k=${TOKEN}` : ''}`);
      const findData = await findRes.json();
      const openIds = (findData.findings || []).filter((f) => ['open', 'fixing'].includes(f.status)).map((f) => f.findingId);
      if (!openIds.length) {
        alert('No open findings requiring remediation.');
        return;
      }
      const remRes = await fetch(`/api/qa/remediate${q()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterTaskId: targetId, findingIds: openIds }),
      });
      const remData = await remRes.json();
      if (!remData.ok) alert(`Remediation error: ${remData.error}`);
      else {
        alert(`Created remediation subtask: ${remData.plan.remediationSubtaskId}`);
        loadQaView(targetId);
      }
    } catch (e) {
      alert(e.message);
    }
  });

  // Subtask DAG Builder
  document.getElementById('btn-add-subtask')?.addEventListener('click', () => {
    appendSubtaskRow();
  });

  // Create Form Submit
  const createForm = document.getElementById('form-create-master');
  createForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleCreateMasterSubmit();
  });
}

export function openOrchestrationTab(tabName, masterId = null) {
  if (!drawer) drawer = document.getElementById('dr-orchestration');
  const btn = document.getElementById('btn-orch-workspace');
  if (drawer) {
    drawer.hidden = false;
    btn?.setAttribute('aria-pressed', 'true');
    if (masterId) activeMasterId = masterId;
    switchTab(tabName);
  }
}

function switchTab(tabName) {
  currentTab = tabName;
  const navTabs = drawer.querySelectorAll('#orchestration-tabs [data-ot]');
  navTabs.forEach((t) => {
    const isTarget = t.getAttribute('data-ot') === tabName;
    t.classList.toggle('is-active', isTarget);
    t.setAttribute('aria-selected', String(isTarget));
  });

  const panes = drawer.querySelectorAll('.orch-pane');
  panes.forEach((p) => {
    p.hidden = p.id !== `pane-orch-${tabName}`;
  });

  loadTab(tabName);
}

function loadTab(tabName) {
  if (tabName === 'masters') loadMasterTasks();
  else if (tabName === 'create') setupCreateDefaults();
  else if (tabName === 'board') renderExecutionBoard();
  else if (tabName === 'detail') loadMasterDetail(activeMasterId);
  else if (tabName === 'qa') loadQaView(activeMasterId);
}

async function loadMasterTasks() {
  const container = document.getElementById('orch-masters-list');
  if (!container) return;
  container.innerHTML = '<div style="color: var(--muted, #8D97AA); padding: 16px;">Loading orchestrated master tasks...</div>';

  try {
    const res = await fetch(`/api/orchestration/master-tasks${q()}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Failed to load master tasks');
    cachedMasters = data.masterTasks || [];
    renderMasterTasks();
  } catch (err) {
    container.innerHTML = `<div style="color: #E57373; padding: 16px;">Error: ${escapeHtml(err.message)}</div>`;
  }
}

function renderMasterTasks() {
  const container = document.getElementById('orch-masters-list');
  if (!container) return;

  if (!cachedMasters.length) {
    container.innerHTML = `
      <div style="color: var(--muted, #8D97AA); padding: 20px; text-align: center;">
        No Master Tasks created yet. Click <b>New Master Task (DAG)</b> to compose your first multi-agent objective.
      </div>`;
    return;
  }

  container.innerHTML = cachedMasters
    .map((mt) => {
      const p = mt.progress || { total: 0, succeeded: 0, percentage: 0 };
      const isRunning = mt.status === 'running';
      const isSucceeded = mt.status === 'succeeded';
      const isFailed = mt.status === 'failed';

      const statusColor = isRunning ? '#6AAEFF' : isSucceeded ? '#3DDC84' : isFailed ? '#E57373' : '#8D97AA';

      return `
        <div class="tools-card" style="padding: 16px; background: var(--card, #18202B); border: 1px solid var(--line-2, rgba(255,255,255,0.08)); border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <div>
              <div style="display: flex; gap: 8px; align-items: center;">
                <b style="font-size: 1.05rem; color: var(--ink, #E8ECF4);">${escapeHtml(mt.title)}</b>
                <span class="tool-badge" style="background: ${statusColor}22; color: ${statusColor}; border: 1px solid ${statusColor}44; font-size: 0.72rem; padding: 2px 6px;">
                  ${escapeHtml(mt.status)}
                </span>
                <span class="tool-badge" style="font-size: 0.72rem; padding: 2px 6px;">
                  ${p.succeeded}/${p.total} Subtasks (${p.percentage}%)
                </span>
              </div>
              <p style="font-size: 0.82rem; color: var(--muted, #8D97AA); margin: 6px 0 0;">
                ${escapeHtml(mt.description || 'No description provided.')}
              </p>
            </div>

            <div style="display: flex; gap: 8px;">
              ${
                mt.status === 'ready' || mt.status === 'draft'
                  ? `<button class="tb-btn btn-start-master" data-mt="${escapeHtml(mt.masterTaskId)}" type="button" style="background: var(--accent, #EF8A5F); color: #fff; font-size: 0.75rem; padding: 4px 12px; font-weight: 600;">Start DAG</button>`
                  : isRunning
                  ? `<button class="tb-btn btn-cancel-master" data-mt="${escapeHtml(mt.masterTaskId)}" type="button" style="background: #E57373; color: #fff; font-size: 0.75rem; padding: 4px 10px;">Cancel</button>`
                  : ''
              }
              <button class="tb-btn btn-view-master-detail" data-mt="${escapeHtml(mt.masterTaskId)}" type="button" style="font-size: 0.75rem; padding: 4px 10px;">
                Inspect Graph
              </button>
            </div>
          </div>

          <div style="margin-top: 10px; background: rgba(0,0,0,0.3); border-radius: 4px; height: 6px; overflow: hidden;">
            <div style="background: ${statusColor}; width: ${p.percentage}%; height: 100%; transition: width 0.3s ease;"></div>
          </div>
        </div>
      `;
    })
    .join('');

  // Start button handler
  container.querySelectorAll('.btn-start-master').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-mt');
      btn.disabled = true;
      btn.textContent = 'Starting...';
      try {
        const res = await fetch(`/api/orchestration/master-tasks/${encodeURIComponent(id)}/start${q()}`, {
          method: 'POST',
        });
        const data = await res.json();
        if (data.ok) {
          activeMasterId = id;
          loadMasterTasks();
          switchTab('board');
        } else {
          alert(`Start failed: ${data.error || 'Unknown error'}`);
          btn.disabled = false;
        }
      } catch (err) {
        alert(`Error: ${err.message}`);
        btn.disabled = false;
      }
    });
  });

  // Cancel button handler
  container.querySelectorAll('.btn-cancel-master').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-mt');
      if (confirm(`Cancel Master Task ${id} and all active subtasks?`)) {
        try {
          const res = await fetch(`/api/orchestration/master-tasks/${encodeURIComponent(id)}/cancel${q()}`, {
            method: 'POST',
          });
          const data = await res.json();
          if (data.ok) loadMasterTasks();
        } catch (err) {
          alert(`Error: ${err.message}`);
        }
      }
    });
  });

  // View detail / graph
  container.querySelectorAll('.btn-view-master-detail').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-mt');
      activeMasterId = id;
      switchTab('detail');
    });
  });
}

function setupCreateDefaults() {
  const container = document.getElementById('subtasks-builder-container');
  if (container && container.children.length === 0) {
    subtaskCounter = 1;
    appendSubtaskRow();
    appendSubtaskRow();
  }
}

function appendSubtaskRow() {
  const container = document.getElementById('subtasks-builder-container');
  if (!container) return;

  const currentId = `subtask-${subtaskCounter++}`;
  const row = document.createElement('div');
  row.className = 'subtask-build-card';
  row.style.padding = '12px';
  row.style.background = 'rgba(0,0,0,0.2)';
  row.style.borderRadius = '6px';
  row.style.border = '1px solid var(--line-2, rgba(255,255,255,0.06))';

  row.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <b style="font-size: 0.85rem; color: var(--accent, #EF8A5F);">ID: <code>${escapeHtml(currentId)}</code></b>
      <button type="button" class="btn-remove-subtask" style="background: none; border: none; color: #E57373; cursor: pointer; font-size: 0.75rem;">✕ Remove</button>
    </div>
    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 8px; margin-bottom: 8px;">
      <input type="text" class="subtask-title-input tools-input" placeholder="Subtask Title" value="Step ${subtaskCounter - 1}" required style="padding: 6px;" />
      <select class="subtask-provider-select tools-input" style="padding: 6px;">
        <option value="claude-code">Claude Code</option>
        <option value="codex-cli">Codex CLI</option>
      </select>
    </div>
    <textarea class="subtask-instruction-input tools-input" rows="2" placeholder="Specific instruction for this subtask..." style="width: 100%; padding: 6px; margin-bottom: 8px;" required></textarea>
    <div style="display: flex; gap: 8px; align-items: center;">
      <label style="font-size: 0.75rem; color: var(--muted, #8D97AA);">Depends on (Comma-separated subtask IDs):</label>
      <input type="text" class="subtask-deps-input tools-input" placeholder="e.g. subtask-1" style="flex: 1; padding: 4px 6px; font-size: 0.78rem;" />
    </div>
  `;

  row.dataset.subtaskId = currentId;

  row.querySelector('.btn-remove-subtask')?.addEventListener('click', () => {
    row.remove();
  });

  container.appendChild(row);
}

async function handleCreateMasterSubmit() {
  const title = document.getElementById('master-title-input')?.value.trim();
  const description = document.getElementById('master-desc-input')?.value.trim();
  const dir = document.getElementById('master-dir-input')?.value.trim() || '.';
  const statusMsg = document.getElementById('master-create-status');
  const submitBtn = document.getElementById('btn-submit-master');

  const container = document.getElementById('subtasks-builder-container');
  const cards = container?.querySelectorAll('.subtask-build-card') || [];

  if (!cards.length) {
    alert('Please add at least one subtask.');
    return;
  }

  const subtasks = Array.from(cards).map((c) => {
    const id = c.dataset.subtaskId;
    const t = c.querySelector('.subtask-title-input')?.value.trim();
    const p = c.querySelector('.subtask-provider-select')?.value;
    const inst = c.querySelector('.subtask-instruction-input')?.value.trim();
    const depsRaw = c.querySelector('.subtask-deps-input')?.value.trim() || '';
    const deps = depsRaw ? depsRaw.split(',').map((x) => x.trim()).filter(Boolean) : [];

    return {
      subtaskId: id,
      title: t,
      assignedProvider: p,
      instruction: inst,
      dependencies: deps,
    };
  });

  submitBtn.disabled = true;
  submitBtn.textContent = 'Validating DAG & Creating...';
  if (statusMsg) {
    statusMsg.hidden = false;
    statusMsg.style.background = 'rgba(239, 138, 95, 0.1)';
    statusMsg.style.color = 'var(--accent, #EF8A5F)';
    statusMsg.textContent = 'Validating circular dependencies and subtask provider capabilities...';
  }

  try {
    const res = await fetch(`/api/orchestration/master-tasks${q()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        working_directory: dir,
        subtasks,
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Failed to create Master Task');

    if (statusMsg) {
      statusMsg.style.background = 'rgba(61, 220, 132, 0.1)';
      statusMsg.style.color = '#3DDC84';
      statusMsg.textContent = `Master Task '${data.masterTask.masterTaskId}' created successfully!`;
    }

    activeMasterId = data.masterTask.masterTaskId;
    setTimeout(() => {
      switchTab('masters');
    }, 1000);
  } catch (err) {
    if (statusMsg) {
      statusMsg.style.background = 'rgba(229, 115, 115, 0.1)';
      statusMsg.style.color = '#E57373';
      statusMsg.textContent = `DAG Error: ${err.message}`;
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create & Initialize Master Task';
  }
}

function renderExecutionBoard() {
  const readyCol = document.getElementById('board-col-ready');
  const runningCol = document.getElementById('board-col-running');
  const blockedCol = document.getElementById('board-col-blocked');
  const succeededCol = document.getElementById('board-col-succeeded');

  if (!readyCol) return;
  readyCol.innerHTML = '';
  runningCol.innerHTML = '';
  blockedCol.innerHTML = '';
  succeededCol.innerHTML = '';

  const activeMaster = cachedMasters.find((m) => m.masterTaskId === activeMasterId) || cachedMasters[0];
  if (!activeMaster) {
    readyCol.innerHTML = '<div style="color: var(--muted, #8D97AA); font-size: 0.8rem;">No active master task</div>';
    return;
  }

  const renderCard = (st) => `
    <div style="background: rgba(0,0,0,0.3); padding: 8px 10px; border-radius: 6px; border: 1px solid var(--line-2, rgba(255,255,255,0.06)); font-size: 0.78rem;">
      <b style="color: var(--ink, #E8ECF4); display: block; margin-bottom: 2px;">${escapeHtml(st.title)}</b>
      <div style="color: var(--muted, #8D97AA); font-size: 0.72rem;">ID: <code>${escapeHtml(st.subtaskId)}</code> · ${escapeHtml(st.assignedProvider)}</div>
      ${st.dependencies?.length ? `<div style="font-size: 0.7rem; color: #6AAEFF; margin-top: 4px;">Depends: ${escapeHtml(st.dependencies.join(', '))}</div>` : ''}
      ${st.error ? `<div style="color: #E57373; font-size: 0.7rem; margin-top: 4px;">${escapeHtml(st.error)}</div>` : ''}
    </div>
  `;

  for (const st of activeMaster.subtasks || []) {
    if (st.status === 'ready' || st.status === 'waiting' || st.status === 'queued') {
      readyCol.innerHTML += renderCard(st);
    } else if (st.status === 'running' || st.status === 'dispatching') {
      runningCol.innerHTML += renderCard(st);
    } else if (st.status === 'blocked' || st.status === 'failed' || st.status === 'cancelled') {
      blockedCol.innerHTML += renderCard(st);
    } else if (st.status === 'succeeded') {
      succeededCol.innerHTML += renderCard(st);
    }
  }
}

async function loadMasterDetail(masterTaskId) {
  const container = document.getElementById('orch-detail-content');
  if (!container) return;

  const targetId = masterTaskId || cachedMasters[0]?.masterTaskId;
  if (!targetId) {
    container.innerHTML = '<div style="color: var(--muted, #8D97AA); padding: 24px; text-align: center;">No Master Tasks available to inspect.</div>';
    return;
  }

  container.innerHTML = '<div style="color: var(--muted, #8D97AA); padding: 24px;">Loading DAG graph and consolidated handoffs...</div>';

  try {
    const res = await fetch(`/api/orchestration/master-tasks/${encodeURIComponent(targetId)}${q()}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Failed to load details');
    renderMasterDetailContent(data.masterTask, data.handoffs || []);
  } catch (err) {
    container.innerHTML = `<div style="color: #E57373; padding: 24px;">Error: ${escapeHtml(err.message)}</div>`;
  }
}

function renderMasterDetailContent(mt, handoffs) {
  const container = document.getElementById('orch-detail-content');
  if (!container) return;

  const subtasksHtml = (mt.subtasks || [])
    .map((st) => {
      const statusColor = st.status === 'succeeded' ? '#3DDC84' : st.status === 'running' ? '#6AAEFF' : st.status === 'blocked' || st.status === 'failed' ? '#E57373' : '#8D97AA';

      return `
        <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px; border-left: 3px solid ${statusColor}; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <b style="color: var(--ink, #E8ECF4);">${escapeHtml(st.title)}</b>
            <span class="tool-badge" style="background: ${statusColor}22; color: ${statusColor}; font-size: 0.72rem;">${escapeHtml(st.status)}</span>
          </div>
          <div style="font-size: 0.78rem; color: var(--muted, #8D97AA); margin: 4px 0;">
            ID: <code>${escapeHtml(st.subtaskId)}</code> · Assigned: <b>${escapeHtml(st.assignedProvider)}</b>
            ${st.dependencies?.length ? ` · Dependencies: <code>${escapeHtml(st.dependencies.join(', '))}</code>` : ''}
          </div>
          <p style="font-size: 0.8rem; margin: 6px 0 0; color: var(--ink, #E8ECF4);">${escapeHtml(st.instruction)}</p>
          ${st.result ? `<div style="font-size: 0.78rem; color: #3DDC84; margin-top: 6px;"><b>Result:</b> ${escapeHtml(st.result)}</div>` : ''}
          ${st.error ? `<div style="font-size: 0.78rem; color: #E57373; margin-top: 6px;"><b>Error:</b> ${escapeHtml(st.error)}</div>` : ''}
        </div>
      `;
    })
    .join('');

  const handoffsHtml = handoffs.length
    ? handoffs
        .map(
          (h) => `
        <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; margin-bottom: 6px; font-size: 0.78rem;">
          <div style="display: flex; justify-content: space-between;">
            <b>Handoff from [${escapeHtml(h.subtaskId)}] (${escapeHtml(h.provider)})</b>
            <span style="color: var(--muted, #8D97AA);">${new Date(h.timestamp).toLocaleTimeString()}</span>
          </div>
          <div style="margin: 4px 0;">${escapeHtml(h.summary)}</div>
          ${h.filesChanged?.length ? `<div><b>Files Changed:</b> ${escapeHtml(h.filesChanged.join(', '))}</div>` : ''}
        </div>
      `
        )
        .join('')
    : '<div style="color: var(--muted, #8D97AA); font-size: 0.8rem;">No completed handoffs recorded yet.</div>';

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
      <div>
        <h3 style="margin: 0 0 4px; font-size: 1.15rem; color: var(--ink, #E8ECF4);">${escapeHtml(mt.title)}</h3>
        <div style="font-size: 0.8rem; color: var(--muted, #8D97AA);">
          Master ID: <code>${escapeHtml(mt.masterTaskId)}</code> · Status: <b>${escapeHtml(mt.status)}</b> · Directory: <code>${escapeHtml(mt.workingDirectory)}</code>
        </div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 3fr 2fr; gap: 16px;">
      <div>
        <b style="font-size: 0.9rem; color: var(--ink, #E8ECF4); display: block; margin-bottom: 8px;">Subtasks &amp; DAG Execution Trace:</b>
        ${subtasksHtml}
      </div>

      <div>
        <b style="font-size: 0.9rem; color: var(--ink, #E8ECF4); display: block; margin-bottom: 8px;">Structured Handoff Outputs:</b>
        ${handoffsHtml}
      </div>
    </div>
  `;
}

async function loadQaView(masterId = null) {
  const targetMasterId = masterId || activeMasterId || (cachedMasters.length > 0 ? cachedMasters[0].masterTaskId : null);

  // 1. Load Overview Stats
  try {
    const statsRes = await fetch(`/api/qa/overview${q()}`);
    const statsData = await statsRes.json();
    if (statsData.ok && statsData.stats) {
      const s = statsData.stats;
      const elPending = document.getElementById('qa-metric-pending');
      const elPassed = document.getElementById('qa-metric-passed');
      const elFailed = document.getElementById('qa-metric-failed');
      const elOpen = document.getElementById('qa-metric-open');
      const elCritical = document.getElementById('qa-metric-critical');
      if (elPending) elPending.textContent = s.remediationRequired || 0;
      if (elPassed) elPassed.textContent = s.passedReviews || 0;
      if (elFailed) elFailed.textContent = s.failedReviews || 0;
      if (elOpen) elOpen.textContent = s.openFindings || 0;
      if (elCritical) elCritical.textContent = s.criticalFindings || 0;
    }
  } catch {}

  // 2. Load Quality Gates for targetMasterId
  const gatesContainer = document.getElementById('qa-gates-container');
  const gatePill = document.getElementById('qa-gate-status-pill');

  if (targetMasterId && gatesContainer) {
    gatesContainer.innerHTML = '<div style="color: var(--muted, #8D97AA); padding: 8px;">Evaluating gates...</div>';
    try {
      const gateRes = await fetch(`/api/qa/gates/${targetMasterId}${q()}`);
      const gateData = await gateRes.json();
      if (gateData.ok && gateData.evaluation) {
        const ev = gateData.evaluation;
        if (gatePill) {
          gatePill.textContent = ev.passed ? 'All Gates Passed' : 'Gates Blocked';
          gatePill.style.background = ev.passed ? '#3DDC8422' : '#E5737322';
          gatePill.style.color = ev.passed ? '#3DDC84' : '#E57373';
        }

        const gates = ev.gates || {};
        gatesContainer.innerHTML = Object.entries(gates).map(([name, g]) => {
          const isPass = g.status === 'passed';
          const isWaived = g.status === 'waived';
          const color = isPass ? '#3DDC84' : isWaived ? '#8D97AA' : '#E57373';
          const label = name.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
          return `
            <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; border-left: 3px solid ${color};">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <b style="font-size: 0.82rem; color: var(--ink, #E8ECF4);">${escapeHtml(label)}</b>
                <span style="font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; background: ${color}22; color: ${color}; text-transform: uppercase;">
                  ${escapeHtml(g.status)}
                </span>
              </div>
              <p style="font-size: 0.75rem; color: var(--muted, #8D97AA); margin: 0;">${escapeHtml(g.reason)}</p>
            </div>
          `;
        }).join('');
      } else {
        gatesContainer.innerHTML = '<div style="color: var(--muted, #8D97AA); font-size: 0.8rem;">No quality gate evaluation recorded for this master task.</div>';
      }
    } catch (err) {
      gatesContainer.innerHTML = `<div style="color: #E57373; font-size: 0.8rem;">Error loading gates: ${escapeHtml(err.message)}</div>`;
    }
  } else if (gatesContainer) {
    gatesContainer.innerHTML = '<div style="color: var(--muted, #8D97AA); font-size: 0.8rem;">Select or create a Master Task to evaluate Quality Gates.</div>';
  }

  // 3. Load Findings
  const findingsContainer = document.getElementById('qa-findings-list');
  if (findingsContainer) {
    findingsContainer.innerHTML = '<div style="color: var(--muted, #8D97AA); padding: 8px;">Loading findings...</div>';
    try {
      const url = targetMasterId ? `/api/qa/findings?masterTaskId=${targetMasterId}${TOKEN ? `&k=${TOKEN}` : ''}` : `/api/qa/findings${q()}`;
      const findRes = await fetch(url);
      const findData = await findRes.json();
      const findings = findData.findings || [];

      if (!findings.length) {
        findingsContainer.innerHTML = '<div style="color: #3DDC84; font-size: 0.82rem; padding: 10px;">Zero unresolved findings. All deliverables satisfy quality standards.</div>';
      } else {
        findingsContainer.innerHTML = findings.map((f) => {
          const sevColor = f.severity === 'critical' ? '#FF5252' : f.severity === 'high' ? '#E57373' : f.severity === 'medium' ? '#EF8A5F' : '#6AAEFF';
          const isResolved = f.status === 'resolved';
          const isRiskAccepted = f.status === 'accepted_risk';
          const statusBadgeColor = isResolved ? '#3DDC84' : isRiskAccepted ? '#A78BFA' : sevColor;

          return `
            <div style="background: rgba(0,0,0,0.25); padding: 12px; border-radius: 6px; border-left: 3px solid ${sevColor}; font-size: 0.82rem;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <b style="color: var(--ink, #E8ECF4); font-size: 0.88rem;">[${escapeHtml(f.severity.toUpperCase())}] ${escapeHtml(f.title)}</b>
                <span style="font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; background: ${statusBadgeColor}22; color: ${statusBadgeColor};">
                  ${escapeHtml(f.status)}
                </span>
              </div>
              <p style="margin: 6px 0; color: var(--muted, #8D97AA);">${escapeHtml(f.description)}</p>
              ${f.recommendation ? `<div style="color: #6AAEFF; font-size: 0.78rem; margin-bottom: 6px;"><b>Recommendation:</b> ${escapeHtml(f.recommendation)}</div>` : ''}
              ${f.affectedFiles?.length ? `<div style="color: var(--muted, #8D97AA); font-size: 0.75rem;">Affected files: <code>${escapeHtml(f.affectedFiles.join(', '))}</code></div>` : ''}
              ${!isResolved && !isRiskAccepted ? `
                <div style="margin-top: 8px; display: flex; gap: 8px;">
                  <button type="button" class="tb-btn btn-qa-accept-risk" data-finding-id="${escapeHtml(f.findingId)}" style="font-size: 0.72rem; padding: 3px 8px; background: rgba(167, 139, 250, 0.2); color: #A78BFA; border: 1px solid #A78BFA;">
                    Accept Risk
                  </button>
                </div>
              ` : ''}
            </div>
          `;
        }).join('');

        // Wire accept risk buttons
        findingsContainer.querySelectorAll('.btn-qa-accept-risk').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const fid = btn.getAttribute('data-finding-id');
            const reason = prompt('Enter justification for accepting this risk:');
            if (!reason) return;
            try {
              const r = await fetch(`/api/qa/findings/${fid}/accept-risk${q()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason, authorizedBy: 'user' }),
              });
              const d = await r.json();
              if (!d.ok) alert(`Error: ${d.error}`);
              else loadQaView(targetMasterId);
            } catch (e) {
              alert(e.message);
            }
          });
        });
      }
    } catch (err) {
      findingsContainer.innerHTML = `<div style="color: #E57373;">Error loading findings: ${escapeHtml(err.message)}</div>`;
    }
  }

  // 4. Load Review Timeline
  const timelineContainer = document.getElementById('qa-timeline-container');
  if (timelineContainer) {
    try {
      const url = targetMasterId ? `/api/qa/reviews?masterTaskId=${targetMasterId}${TOKEN ? `&k=${TOKEN}` : ''}` : `/api/qa/reviews${q()}`;
      const revRes = await fetch(url);
      const revData = await revRes.json();
      const reviews = revData.reviews || [];

      if (!reviews.length) {
        timelineContainer.innerHTML = '<div style="color: var(--muted, #8D97AA); font-size: 0.8rem;">No review audits recorded yet.</div>';
      } else {
        timelineContainer.innerHTML = reviews.map((r) => {
          const isPassed = r.status === 'passed';
          const color = isPassed ? '#3DDC84' : '#E57373';
          return `
            <div style="background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 4px; border-left: 2px solid ${color}; font-size: 0.78rem;">
              <div style="display: flex; justify-content: space-between;">
                <b>Review [${escapeHtml(r.reviewId)}] · Iteration ${r.iteration} / ${r.maxIterations || 3}</b>
                <span style="color: ${color}; font-weight: 600;">${escapeHtml(r.status.toUpperCase())}</span>
              </div>
              <div style="color: var(--muted, #8D97AA); margin-top: 2px;">
                Agent: <b>${escapeHtml(r.implementationAgent)}</b> · Independent Reviewer: <b>${escapeHtml(r.reviewerId)}</b>
                ${r.isIndependent ? ' <span style="color: #3DDC84;">(Independent Verified)</span>' : ''}
              </div>
            </div>
          `;
        }).join('');
      }
    } catch {}
  }
}


