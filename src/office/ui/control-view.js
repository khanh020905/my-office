// Client controller for My Office Agent Control Center.
// Connects UI controls to /api/control/* backend and integrates with Activity Center timeline.
import { TOKEN } from '../net/live.js';

let drawer = null;
let currentTab = 'agents';
let cachedAgents = [];
let cachedSessions = [];
let cachedExecutions = [];

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

export const setup = setupControlView;

export function setupControlView() {
  const btn = document.getElementById('btn-control');
  drawer = document.getElementById('dr-control');
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

  // Tab switching
  const tabs = drawer.querySelectorAll('#control-tabs [data-ct]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-ct');
      switchTab(target);
    });
  });

  // Action buttons
  document.getElementById('btn-refresh-agents')?.addEventListener('click', loadAgents);
  document.getElementById('btn-refresh-sessions')?.addEventListener('click', loadSessions);
  document.getElementById('btn-refresh-executions')?.addEventListener('click', loadExecutions);

  // Filter buttons for agents
  drawer.querySelectorAll('#pane-control-agents [data-af]').forEach((btn) => {
    btn.addEventListener('click', () => {
      drawer.querySelectorAll('#pane-control-agents [data-af]').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      renderAgents(btn.getAttribute('data-af'));
    });
  });

  // Target Agent Select change (toggle Codex-specific options)
  const agentSelect = document.getElementById('dispatch-agent-select');
  const codexOptions = document.getElementById('dispatch-codex-options');
  agentSelect?.addEventListener('change', () => {
    if (codexOptions) {
      codexOptions.hidden = agentSelect.value !== 'codex-cli';
    }
  });

  // Dispatch Form Submit
  const dispatchForm = document.getElementById('form-control-dispatch');
  dispatchForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleDispatchSubmit();
  });
}

export function openControlTab(tabName) {
  if (!drawer) drawer = document.getElementById('dr-control');
  const btn = document.getElementById('btn-control');
  if (drawer) {
    drawer.hidden = false;
    btn?.setAttribute('aria-pressed', 'true');
    switchTab(tabName);
  }
}

function switchTab(tabName) {
  currentTab = tabName;
  const navTabs = drawer.querySelectorAll('#control-tabs [data-ct]');
  navTabs.forEach((t) => {
    const isTarget = t.getAttribute('data-ct') === tabName;
    t.classList.toggle('is-active', isTarget);
    t.setAttribute('aria-selected', String(isTarget));
  });

  const panes = drawer.querySelectorAll('.control-pane');
  panes.forEach((p) => {
    p.hidden = p.id !== `pane-control-${tabName}`;
  });

  loadTab(tabName);
}

function loadTab(tabName) {
  if (tabName === 'agents') loadAgents();
  else if (tabName === 'sessions') loadSessions();
  else if (tabName === 'dispatch') setupDispatchDefaults();
  else if (tabName === 'executions') loadExecutions();
}

async function loadAgents() {
  const container = document.getElementById('control-agents-grid');
  if (!container) return;
  container.innerHTML = '<div style="color: var(--muted, #8D97AA); padding: 16px;">Loading connected agents...</div>';

  try {
    const res = await fetch(`/api/control/agents${q()}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Failed to load agents');
    cachedAgents = data.agents || [];
    renderAgents('all');
  } catch (err) {
    container.innerHTML = `<div style="color: #E57373; padding: 16px;">Error: ${escapeHtml(err.message)}</div>`;
  }
}

function renderAgents(filter = 'all') {
  const container = document.getElementById('control-agents-grid');
  if (!container) return;

  let filtered = cachedAgents;
  if (filter === 'verified') filtered = filtered.filter((a) => a.verified);
  else if (filter === 'connected') filtered = filtered.filter((a) => a.connected);
  else if (filter === 'available') filtered = filtered.filter((a) => a.capabilities?.start?.available);

  if (!filtered.length) {
    container.innerHTML = '<div style="color: var(--muted, #8D97AA); grid-column: 1 / -1; padding: 16px;">No agents found matching this filter.</div>';
    return;
  }

  container.innerHTML = filtered
    .map((agent) => {
      const statusColor = agent.verified ? '#3DDC84' : agent.connected ? '#6AAEFF' : agent.installed ? '#EF8A5F' : '#8D97AA';
      const canStart = agent.capabilities?.start?.available;
      const canSteer = agent.capabilities?.steer?.available;
      const canCancel = agent.capabilities?.cancel?.available;

      return `
        <div class="tools-card" style="display: flex; flex-direction: column; justify-content: space-between; padding: 16px; background: var(--card, #18202B); border: 1px solid var(--line-2, rgba(255,255,255,0.08)); border-radius: 8px;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
              <div>
                <b style="font-size: 1.05rem; color: var(--ink, #E8ECF4);">${escapeHtml(agent.displayName)}</b>
                <div style="font-size: 0.75rem; color: var(--muted, #8D97AA); margin-top: 2px;"><code>${escapeHtml(agent.agentId)}</code> · ${escapeHtml(agent.type)}</div>
              </div>
              <span class="tool-badge" style="background: ${statusColor}22; color: ${statusColor}; border: 1px solid ${statusColor}44; font-size: 0.72rem; padding: 2px 8px; border-radius: 4px;">
                ${escapeHtml(agent.overallStatus)}
              </span>
            </div>

            <p style="font-size: 0.82rem; color: var(--muted, #8D97AA); margin: 6px 0 12px; line-height: 1.4;">
              ${escapeHtml(agent.description)}
            </p>

            <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem; background: rgba(0,0,0,0.2); padding: 8px; borderRadius: 4px; margin-bottom: 12px;">
              <div><b>Installed:</b> ${agent.installed ? '<span style="color:#3DDC84">Yes</span>' : '<span style="color:#8D97AA">No</span>'} · <b>Configured:</b> ${agent.configured ? '<span style="color:#3DDC84">Yes</span>' : '<span style="color:#8D97AA">No</span>'}</div>
              <div><b>Binary:</b> <code style="font-size: 0.72rem;">${escapeHtml(agent.executablePath || 'None')}</code></div>
              ${agent.version ? `<div><b>Version:</b> ${escapeHtml(agent.version)}</div>` : ''}
            </div>

            <div style="font-size: 0.78rem; margin-bottom: 12px;">
              <b style="color: var(--ink, #E8ECF4);">Supported Controls:</b>
              <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px;">
                <span class="tool-badge" style="background: ${canStart ? '#3DDC8422' : '#8D97AA22'}; color: ${canStart ? '#3DDC84' : '#8D97AA'};">Start: ${canStart ? 'Yes' : 'No'}</span>
                <span class="tool-badge" style="background: ${canSteer ? '#6AAEFF22' : '#8D97AA22'}; color: ${canSteer ? '#6AAEFF' : '#8D97AA'};">Follow-up: ${canSteer ? 'Yes' : 'No'}</span>
                <span class="tool-badge" style="background: ${canCancel ? '#EF8A5F22' : '#8D97AA22'}; color: ${canCancel ? '#EF8A5F' : '#8D97AA'};">Cancel: ${canCancel ? 'Yes' : 'No'}</span>
                <span class="tool-badge" style="background: #8D97AA22; color: #8D97AA;">Pause: No</span>
              </div>
            </div>
          </div>

          <div style="display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid var(--line-2, rgba(255,255,255,0.08)); padding-top: 10px;">
            ${
              canStart
                ? `<button class="tb-btn btn-assign-task" data-agent="${escapeHtml(agent.agentId)}" type="button" style="background: var(--accent, #EF8A5F); color: #fff; font-size: 0.78rem; padding: 4px 12px;">Assign Task</button>`
                : `<span style="font-size: 0.75rem; color: var(--muted, #8D97AA); align-self: center;">Observer/GUI only</span>`
            }
          </div>
        </div>
      `;
    })
    .join('');

  // Attach button events
  container.querySelectorAll('.btn-assign-task').forEach((btn) => {
    btn.addEventListener('click', () => {
      const agentId = btn.getAttribute('data-agent');
      const select = document.getElementById('dispatch-agent-select');
      if (select) select.value = agentId;
      switchTab('dispatch');
    });
  });
}

async function loadSessions() {
  const container = document.getElementById('control-sessions-list');
  if (!container) return;
  container.innerHTML = '<div style="color: var(--muted, #8D97AA); padding: 16px;">Loading sessions...</div>';

  try {
    const res = await fetch(`/api/control/sessions${q()}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Failed to load sessions');
    cachedSessions = data.sessions || [];
    renderSessions();
  } catch (err) {
    container.innerHTML = `<div style="color: #E57373; padding: 16px;">Error: ${escapeHtml(err.message)}</div>`;
  }
}

function renderSessions() {
  const container = document.getElementById('control-sessions-list');
  if (!container) return;

  if (!cachedSessions.length) {
    container.innerHTML = '<div style="color: var(--muted, #8D97AA); padding: 16px;">No active sessions found.</div>';
    return;
  }

  container.innerHTML = cachedSessions
    .map((s) => {
      const statusColor = s.status === 'working' ? '#3DDC84' : s.status === 'waiting' ? '#EF8A5F' : '#8D97AA';
      const canSteer = s.agentId === 'claude-code';

      return `
        <div class="tools-card" style="padding: 12px 16px; background: var(--card, #18202B); border: 1px solid var(--line-2, rgba(255,255,255,0.08)); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 4px;">
              <b style="color: var(--ink, #E8ECF4); font-size: 0.95rem;">${escapeHtml(s.projectId || s.sessionId)}</b>
              <span class="tool-badge" style="background: ${statusColor}22; color: ${statusColor}; border: 1px solid ${statusColor}44; font-size: 0.72rem; padding: 2px 6px;">
                ${escapeHtml(s.status)}
              </span>
              <span class="tool-badge" style="font-size: 0.72rem; padding: 2px 6px;">
                ${escapeHtml(s.agentId || s.provider)}
              </span>
            </div>
            <div style="font-size: 0.78rem; color: var(--muted, #8D97AA);">
              <span>ID: <code>${escapeHtml(s.sessionId)}</code></span> · 
              <span>Directory: <code>${escapeHtml(s.workingDirectory || 'Unknown')}</code></span>
            </div>
          </div>

          <div style="display: flex; gap: 8px; align-items: center;">
            ${
              canSteer && s.status === 'working'
                ? `<button class="tb-btn btn-steer-session" data-sess="${escapeHtml(s.sessionId)}" type="button" style="background: #6AAEFF; color: #fff; font-size: 0.75rem; padding: 4px 10px;">Send Follow-up</button>`
                : ''
            }
            <button class="tb-btn btn-view-in-activity" data-sess="${escapeHtml(s.sessionId)}" type="button" style="font-size: 0.75rem; padding: 4px 10px;">
              View Timeline
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  // Steer button handler
  container.querySelectorAll('.btn-steer-session').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sid = btn.getAttribute('data-sess');
      const text = prompt(`Send follow-up instruction to session ${sid}:`);
      if (text && text.trim()) {
        try {
          const res = await fetch(`/api/control/sessions/${encodeURIComponent(sid)}/steer${q()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instruction: text.trim() }),
          });
          const data = await res.json();
          if (data.ok) {
            alert('Follow-up instruction successfully dispatched.');
            loadSessions();
          } else {
            alert(`Failed to steer session: ${data.error || 'Unknown error'}`);
          }
        } catch (err) {
          alert(`Error: ${err.message}`);
        }
      }
    });
  });

  // Timeline jump button
  container.querySelectorAll('.btn-view-in-activity').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sid = btn.getAttribute('data-sess');
      navigateToActivityTimeline(sid);
    });
  });
}

function setupDispatchDefaults() {
  const dirInput = document.getElementById('dispatch-dir-input');
  if (dirInput && !dirInput.value) {
    dirInput.value = '.';
  }
}

async function handleDispatchSubmit() {
  const agentSelect = document.getElementById('dispatch-agent-select');
  const dirInput = document.getElementById('dispatch-dir-input');
  const textInput = document.getElementById('dispatch-instruction-input');
  const artifactsInput = document.getElementById('dispatch-artifacts-input');
  const statusMsg = document.getElementById('dispatch-status-msg');
  const submitBtn = document.getElementById('btn-dispatch-submit');

  const agentId = agentSelect.value;
  const workingDirectory = dirInput.value.trim() || '.';
  const instruction = textInput.value.trim();
  const expectedArtifacts = artifactsInput?.value
    ? artifactsInput.value.split(',').map((p) => p.trim()).filter(Boolean)
    : [];

  if (!instruction) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Dispatching...';
  if (statusMsg) {
    statusMsg.hidden = false;
    statusMsg.style.background = 'rgba(239, 138, 95, 0.1)';
    statusMsg.style.color = 'var(--accent, #EF8A5F)';
    statusMsg.textContent = 'Submitting task to target provider runner...';
  }

  try {
    const res = await fetch(`/api/control/dispatch${q()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId,
        working_directory: workingDirectory,
        instruction,
        expected_artifacts: expectedArtifacts,
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Task dispatch failed');

    if (statusMsg) {
      statusMsg.style.background = 'rgba(61, 220, 132, 0.1)';
      statusMsg.style.color = '#3DDC84';
      statusMsg.textContent = `Task dispatched successfully! Execution ID: ${data.execution.executionId}. Activity card created in Activity Center.`;
    }

    textInput.value = '';
    // Switch to Executions tab after short delay
    setTimeout(() => {
      switchTab('executions');
    }, 1200);
  } catch (err) {
    if (statusMsg) {
      statusMsg.style.background = 'rgba(229, 115, 115, 0.1)';
      statusMsg.style.color = '#E57373';
      statusMsg.textContent = `Dispatch error: ${err.message}`;
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Dispatch Task';
  }
}

async function loadExecutions() {
  const container = document.getElementById('control-executions-list');
  if (!container) return;
  container.innerHTML = '<div style="color: var(--muted, #8D97AA); padding: 16px;">Loading executions...</div>';

  try {
    const res = await fetch(`/api/control/executions${q()}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Failed to load executions');
    cachedExecutions = data.executions || [];
    renderExecutions();
  } catch (err) {
    container.innerHTML = `<div style="color: #E57373; padding: 16px;">Error: ${escapeHtml(err.message)}</div>`;
  }
}

function renderExecutions() {
  const container = document.getElementById('control-executions-list');
  if (!container) return;

  if (!cachedExecutions.length) {
    container.innerHTML = '<div style="color: var(--muted, #8D97AA); padding: 16px;">No execution history recorded yet.</div>';
    return;
  }

  container.innerHTML = cachedExecutions
    .map((ex) => {
      const isRunning = ex.status === 'running';
      const isFailed = ex.status === 'failed';
      const isCancelled = ex.status === 'cancelled';
      const isSucceeded = ex.status === 'succeeded';

      const statusColor = isRunning ? '#6AAEFF' : isSucceeded ? '#3DDC84' : isFailed || isCancelled ? '#E57373' : '#8D97AA';

      return `
        <div class="tools-card" style="padding: 14px 16px; background: var(--card, #18202B); border: 1px solid var(--line-2, rgba(255,255,255,0.08)); border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <div>
              <div style="display: flex; gap: 8px; align-items: center;">
                <b style="font-size: 0.95rem; color: var(--ink, #E8ECF4);">${escapeHtml(ex.instruction)}</b>
                <span class="tool-badge" style="background: ${statusColor}22; color: ${statusColor}; border: 1px solid ${statusColor}44; font-size: 0.72rem; padding: 2px 6px;">
                  ${escapeHtml(ex.status)}
                </span>
                <span class="tool-badge" style="font-size: 0.72rem; padding: 2px 6px;">
                  ${escapeHtml(ex.agentId)}
                </span>
              </div>
              <div style="font-size: 0.78rem; color: var(--muted, #8D97AA); margin-top: 4px;">
                <span>Exec ID: <code>${escapeHtml(ex.executionId)}</code></span> · 
                <span>Task ID: <code>${escapeHtml(ex.taskId || 'None')}</code></span> · 
                <span>Dir: <code>${escapeHtml(ex.workingDirectory)}</code></span>
                ${ex.retryOf ? ` · <span style="color: var(--accent, #EF8A5F);">Retry of: <code>${escapeHtml(ex.retryOf)}</code></span>` : ''}
              </div>
            </div>

            <div style="display: flex; gap: 8px;">
              ${
                isRunning
                  ? `<button class="tb-btn btn-cancel-exec" data-exec="${escapeHtml(ex.executionId)}" type="button" style="background: #E57373; color: #fff; font-size: 0.75rem; padding: 3px 8px;">Cancel</button>`
                  : `<button class="tb-btn btn-retry-exec" data-exec="${escapeHtml(ex.executionId)}" type="button" style="font-size: 0.75rem; padding: 3px 8px;">Retry</button>`
              }
              <button class="tb-btn btn-view-in-activity" data-task="${escapeHtml(ex.taskId)}" type="button" style="background: var(--accent, #EF8A5F); color: #fff; font-size: 0.75rem; padding: 3px 8px;">
                Timeline
              </button>
            </div>
          </div>

          ${
            ex.error
              ? `<div style="margin-top: 8px; padding: 8px; background: rgba(229,115,115,0.08); border-left: 3px solid #E57373; font-size: 0.78rem; color: #E57373;">
                  <b>Error:</b> ${escapeHtml(ex.error)}
                 </div>`
              : ''
          }
        </div>
      `;
    })
    .join('');

  // Cancel button handler
  container.querySelectorAll('.btn-cancel-exec').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-exec');
      if (confirm(`Are you sure you want to cancel execution ${id}?`)) {
        try {
          const res = await fetch(`/api/control/executions/${encodeURIComponent(id)}/cancel${q()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'Cancelled by user via Agent Control Center' }),
          });
          const data = await res.json();
          if (data.ok) {
            loadExecutions();
          } else {
            alert(`Cancel failed: ${data.error || 'Unknown error'}`);
          }
        } catch (err) {
          alert(`Error: ${err.message}`);
        }
      }
    });
  });

  // Retry button handler
  container.querySelectorAll('.btn-retry-exec').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-exec');
      if (confirm(`Retry execution ${id}? This will create a new linked execution attempt.`)) {
        try {
          const res = await fetch(`/api/control/executions/${encodeURIComponent(id)}/retry${q()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          const data = await res.json();
          if (data.ok) {
            loadExecutions();
          } else {
            alert(`Retry failed: ${data.error || 'Unknown error'}`);
          }
        } catch (err) {
          alert(`Error: ${err.message}`);
        }
      }
    });
  });

  // Activity timeline jump button
  container.querySelectorAll('.btn-view-in-activity').forEach((btn) => {
    btn.addEventListener('click', () => {
      const taskId = btn.getAttribute('data-task');
      navigateToActivityTimeline(taskId);
    });
  });
}

function navigateToActivityTimeline(identifier) {
  if (!identifier) return;
  // Close Control Drawer
  if (drawer) drawer.hidden = true;
  document.getElementById('btn-control')?.setAttribute('aria-pressed', 'false');

  // Open Activity Feed if collapsed
  const feed = document.getElementById('feed');
  if (feed) {
    feed.classList.add('feed--open');
    feed.classList.add('ph-open');
  }

  // Find card in Activity Center
  setTimeout(() => {
    const card =
      document.querySelector(`.tc-card[data-task-id="${identifier}"]`) ||
      document.querySelector(`.tc-card[data-sess="${identifier}"]`);

    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.style.outline = '2px solid var(--accent, #EF8A5F)';
      setTimeout(() => {
        card.style.outline = '';
      }, 3000);
      // Automatically expand timeline if collapsed
      const toggle = card.querySelector('.tc-timeline-toggle');
      if (toggle && !card.querySelector('.tc-timeline')) {
        toggle.click();
      }
    }
  }, 150);
}
