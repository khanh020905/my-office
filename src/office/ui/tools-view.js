// AI Tools Ecosystem View: wires the Tools drawer, discovery, inspection, lifecycle, multi-agent distribution, security, and orchestration.
import { TOKEN } from '../net/live.js';

let drawer = null;
let currentCandidate = null;
let activePlan = null;
let activeCandidateForInstall = null;
let activeDistPlan = null;
let allRegistryTools = [];

const q = () => (TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : '');

export function setupToolsView() {
  const btn = document.getElementById('btn-tools');
  drawer = document.getElementById('dr-tools');
  if (!btn || !drawer) return;

  btn.addEventListener('click', () => {
    const isHidden = drawer.hidden;
    drawer.hidden = !isHidden;
    btn.setAttribute('aria-pressed', String(!isHidden));
    if (!drawer.hidden) {
      loadOverview();
    }
  });

  const closeBtn = drawer.querySelector('[data-close]');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      drawer.hidden = true;
      btn.setAttribute('aria-pressed', 'false');
    });
  }

  // 1. Primary Tab Navigation (7 semantic tabs)
  const navTabs = drawer.querySelectorAll('#tools-tabs [data-tt]');
  navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      switchTab(tab.getAttribute('data-tt'));
    });
  });

  // Quick Action Jump buttons inside Overview
  drawer.querySelectorAll('.btn-jump-tab').forEach((b) => {
    b.addEventListener('click', () => {
      const target = b.getAttribute('data-target');
      if (target) switchTab(target);
    });
  });

  // 2. Discover subnav (Inspector vs Candidates)
  const btnSubnavInspect = document.getElementById('btn-subnav-inspect');
  const btnSubnavCandidates = document.getElementById('btn-subnav-candidates');
  const subviewInspect = document.getElementById('subview-discover-inspect');
  const subviewCandidates = document.getElementById('subview-discover-candidates');

  if (btnSubnavInspect && btnSubnavCandidates) {
    btnSubnavInspect.addEventListener('click', () => {
      btnSubnavInspect.classList.add('is-active');
      btnSubnavCandidates.classList.remove('is-active');
      if (subviewInspect) subviewInspect.hidden = false;
      if (subviewCandidates) subviewCandidates.hidden = true;
    });

    btnSubnavCandidates.addEventListener('click', () => {
      btnSubnavCandidates.classList.add('is-active');
      btnSubnavInspect.classList.remove('is-active');
      if (subviewInspect) subviewInspect.hidden = true;
      if (subviewCandidates) subviewCandidates.hidden = false;
      loadCandidates();
    });
  }

  // 3. Inspect button & URL input
  const inspectBtn = document.getElementById('btn-inspect-tool');
  const urlInput = document.getElementById('tool-github-url');
  if (inspectBtn && urlInput) {
    inspectBtn.addEventListener('click', () => {
      runInspection(urlInput.value);
    });
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runInspection(urlInput.value);
    });
  }

  // 4. Registry Filter & Search Inputs
  const searchInput = document.getElementById('tool-search-input');
  const catSelect = document.getElementById('tool-filter-category');
  const protoSelect = document.getElementById('tool-filter-protocol');
  const statusSelect = document.getElementById('tool-filter-status');

  const triggerFilter = () => renderFilteredRegistry();
  if (searchInput) searchInput.addEventListener('input', triggerFilter);
  if (catSelect) catSelect.addEventListener('change', triggerFilter);
  if (protoSelect) protoSelect.addEventListener('change', triggerFilter);
  if (statusSelect) statusSelect.addEventListener('change', triggerFilter);

  // 5. Installation Approval Modal setup
  const chk = document.getElementById('modal-approval-checkbox');
  const confirmBtn = document.getElementById('modal-btn-confirm');
  const cancelBtn = document.getElementById('modal-btn-cancel');
  const modal = document.getElementById('tools-approval-modal');

  if (chk && confirmBtn) {
    chk.addEventListener('change', () => {
      confirmBtn.disabled = !chk.checked;
    });
  }

  if (cancelBtn && modal) {
    cancelBtn.addEventListener('click', () => {
      modal.hidden = true;
      activePlan = null;
      activeCandidateForInstall = null;
    });
  }

  if (confirmBtn && modal) {
    confirmBtn.addEventListener('click', async () => {
      if (!activePlan || !activeCandidateForInstall) return;
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Installing into Staging...';

      try {
        const res = await fetch(`/api/tools/install${q()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidate_tool: activeCandidateForInstall,
            user_approval: {
              approved: true,
              plan_id: activePlan.plan_id,
              timestamp: new Date().toISOString(),
              granted_permissions: activePlan.execution_plan?.required_permissions || [],
            },
          }),
        });

        const data = await res.json();
        if (res.ok && data.ok) {
          modal.hidden = true;
          alert(`Tool '${data.tool_id}' successfully installed into managed storage and verified!`);
          switchTab('tools');
        } else {
          alert(`Installation failed: ${data.error || 'Unknown error'}`);
        }
      } catch (e) {
        alert(`Installation error: ${e.message}`);
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Approve & Install';
      }
    });
  }

  // 6. Distribution Approval Modal setup
  const distChk = document.getElementById('modal-dist-checkbox');
  const distConfirmBtn = document.getElementById('modal-dist-btn-confirm');
  const distCancelBtn = document.getElementById('modal-dist-btn-cancel');
  const distModal = document.getElementById('tools-dist-approval-modal');

  if (distChk && distConfirmBtn) {
    distChk.addEventListener('change', () => {
      distConfirmBtn.disabled = !distChk.checked;
    });
  }

  if (distCancelBtn && distModal) {
    distCancelBtn.addEventListener('click', () => {
      distModal.hidden = true;
      activeDistPlan = null;
    });
  }

  if (distConfirmBtn && distModal) {
    distConfirmBtn.addEventListener('click', async () => {
      if (!activeDistPlan) return;
      distConfirmBtn.disabled = true;
      distConfirmBtn.textContent = 'Distributing...';

      try {
        const res = await fetch(`/api/tools/distribution/distribute${q()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool_id: activeDistPlan.tool_id,
            agent_id: activeDistPlan.agent_id,
            user_approval: {
              approved: true,
              plan_id: activeDistPlan.plan_id,
              timestamp: new Date().toISOString(),
            },
          }),
        });

        const data = await res.json();
        if (res.ok && data.ok) {
          distModal.hidden = true;
          alert(`Tool '${activeDistPlan.tool_id}' successfully distributed to agent '${activeDistPlan.agent_id}'!`);
          loadDistributionMatrix();
          loadDistributionList();
        } else {
          alert(`Distribution failed: ${data.error || 'Unknown error'}`);
        }
      } catch (e) {
        alert(`Distribution network error: ${e.message}`);
      } finally {
        distConfirmBtn.disabled = false;
        distConfirmBtn.textContent = 'Approve & Distribute';
      }
    });
  }

  // Pre-wire orchestration
  setupOrchestrationView();
}

export function switchTab(tabKey) {
  if (!drawer) drawer = document.getElementById('dr-tools');
  if (!drawer) return;

  const tabs = drawer.querySelectorAll('#tools-tabs [data-tt]');
  tabs.forEach((t) => {
    const isTarget = t.getAttribute('data-tt') === tabKey;
    t.classList.toggle('is-active', isTarget);
    t.classList.toggle('is-on', isTarget);
    t.setAttribute('aria-selected', String(isTarget));
  });

  const panes = {
    overview: document.getElementById('pane-tools-overview'),
    discover: document.getElementById('pane-tools-discover'),
    tools: document.getElementById('pane-tools-tools'),
    registry: document.getElementById('pane-tools-tools') || document.getElementById('pane-tools-registry'),
    agents: document.getElementById('pane-tools-agents'),
    distribution: document.getElementById('pane-tools-distribution'),
    security: document.getElementById('pane-tools-security'),
    orchestration: document.getElementById('pane-tools-orchestration'),
  };

  Object.entries(panes).forEach(([k, pane]) => {
    if (pane) {
      if (k === 'tools' || k === 'registry') {
        pane.hidden = tabKey !== 'tools' && tabKey !== 'registry';
      } else {
        pane.hidden = k !== tabKey;
      }
    }
  });

  if (tabKey === 'overview') loadOverview();
  if (tabKey === 'discover') loadCandidatesCount();
  if (tabKey === 'tools' || tabKey === 'registry') loadRegistry();
  if (tabKey === 'agents') loadAgentsView();
  if (tabKey === 'distribution') {
    loadDistributionMatrix();
    loadDistributionList();
  }
  if (tabKey === 'security') loadSecurityOverview();
  if (tabKey === 'orchestration') setupOrchestrationView();
}

// ----------------- 1. OVERVIEW VIEW -----------------
async function loadOverview() {
  const statTools = document.getElementById('stat-tools-installed');
  const statAgents = document.getElementById('stat-agents-detected');
  const statSec = document.getElementById('stat-security-grants');
  const statOrch = document.getElementById('stat-orch-tasks');

  try {
    const [toolsRes, agentsRes, secRes, orchRes, discRes] = await Promise.all([
      fetch(`/api/tools${q()}`).catch(() => null),
      fetch(`/api/tools/distribution/agents${q()}`).catch(() => null),
      fetch(`/api/tools/security/overview${q()}`).catch(() => null),
      fetch(`/api/orchestration/tasks?limit=50${q()}`).catch(() => null),
      fetch(`/api/tools/discovered${q()}`).catch(() => null),
    ]);

    if (toolsRes && toolsRes.ok) {
      const data = await toolsRes.json();
      if (statTools) statTools.textContent = String(data.tools?.length || 0);
    }

    if (agentsRes && agentsRes.ok) {
      const data = await agentsRes.json();
      const detectedCount = (data.agents || []).filter((a) => {
        const st = a.status || a.environment?.status;
        return st === 'FUNCTIONALLY_VERIFIED' || st === 'DETECTED' || st === 'CONFIGURED' || st === 'PRESENT' || Boolean(a.detected || a.environment?.detected);
      }).length;
      if (statAgents) statAgents.textContent = String(detectedCount);
    }

    if (secRes && secRes.ok) {
      const data = await secRes.json();
      if (statSec) statSec.textContent = String(data.overview?.active_grants_count || 0);
    }

    if (orchRes && orchRes.ok) {
      const data = await orchRes.json();
      if (statOrch) statOrch.textContent = String(data.count ?? data.tasks?.length ?? 0);
    }

    if (discRes && discRes.ok) {
      const data = await discRes.json();
      const candEl = document.getElementById('count-candidates');
      if (candEl) candEl.textContent = String(data.tools?.length || 0);
    }
  } catch {
    // Retain fallback placeholders
  }
}

async function loadCandidatesCount() {
  try {
    const res = await fetch(`/api/tools/discovered${q()}`);
    if (res.ok) {
      const data = await res.json();
      const candEl = document.getElementById('count-candidates');
      if (candEl) candEl.textContent = String(data.tools?.length || 0);
    }
  } catch {
    // ignore
  }
}

// ----------------- 2. DISCOVER VIEW -----------------
async function runInspection(url) {
  const loading = document.getElementById('tool-inspect-loading');
  const errBox = document.getElementById('tool-inspect-error');
  const reportBox = document.getElementById('tool-inspect-report');

  if (!url || !url.trim()) {
    if (errBox) {
      errBox.textContent = 'Please enter a valid GitHub repository URL.';
      errBox.hidden = false;
    }
    return;
  }

  if (errBox) errBox.hidden = true;
  if (reportBox) reportBox.hidden = true;
  if (loading) loading.hidden = false;

  try {
    const res = await fetch(`/api/tools/discover${q()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.trim() }),
    });

    const data = await res.json();
    if (loading) loading.hidden = true;

    if (!res.ok || !data.ok) {
      if (errBox) {
        errBox.textContent = data.error || 'Failed to inspect repository.';
        errBox.hidden = false;
      }
      return;
    }

    currentCandidate = data.inspection.candidate_tool;
    renderInspectionReport(data.inspection);
    if (reportBox) reportBox.hidden = false;
  } catch (e) {
    if (loading) loading.hidden = true;
    if (errBox) {
      errBox.textContent = `Network error: ${e.message}`;
      errBox.hidden = false;
    }
  }
}

function renderInspectionReport(insp) {
  const box = document.getElementById('tool-inspect-report');
  if (!box) return;

  const sec = insp.security || { security_status: 'unknown', findings: [] };
  const secBadgeClass =
    sec.security_status === 'clean' ? 'badge-green' : sec.security_status === 'warnings' ? 'badge-amber' : 'badge-red';

  box.innerHTML = `
    <div class="tool-item-card" style="margin-top: 14px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
        <div>
          <h3 style="margin: 0 0 4px 0; font-size: 1.15rem; color: var(--ink, #E8ECF4);">${escapeHtml(insp.repo)} <small style="color: var(--muted, #8D97AA);">by ${escapeHtml(insp.owner)}</small></h3>
          <p style="margin: 0; color: var(--muted, #8D97AA); font-size: 0.82rem;">Branch: <code>${escapeHtml(insp.ref)}</code> · Version: <b>${escapeHtml(insp.version)}</b> · License: <b>${escapeHtml(insp.license)}</b></p>
        </div>
        <span class="tool-badge ${secBadgeClass}">
          Security: ${escapeHtml(sec.security_status)}
        </span>
      </div>

      <div style="margin-bottom: 12px;">
        <b style="font-size: 0.82rem; color: var(--ink, #E8ECF4);">Detected Capabilities (${insp.capabilities?.length || 0}):</b>
        <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px;">
          ${(insp.capabilities || []).map((c) => `<span class="tool-badge badge-blue">${escapeHtml(c.name)} (${escapeHtml(c.protocol)})</span>`).join('') || '<span style="color: var(--muted, #8D97AA); font-size: 0.78rem;">None detected</span>'}
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <b style="font-size: 0.82rem; color: var(--ink, #E8ECF4);">Multi-Agent Compatibility:</b>
        <ul style="margin: 6px 0 0 16px; padding: 0; font-size: 0.82rem; color: var(--muted, #8D97AA);">
          ${Object.entries(insp.compatibility || {}).map(([agent, compat]) => `
            <li><b style="color: var(--ink, #E8ECF4);">${escapeHtml(agent)}</b>: <span style="color: ${compat.status === 'verified_compatible' ? 'var(--green-ink, #8FEDB8)' : 'var(--amber, #F2B544)'};">${escapeHtml(compat.status)}</span> — ${escapeHtml(compat.reason)}</li>
          `).join('')}
        </ul>
      </div>

      ${sec.findings && sec.findings.length > 0 ? `
        <div style="margin-bottom: 12px; background: rgba(242, 181, 68, 0.1); border: 1px solid rgba(242, 181, 68, 0.3); padding: 10px; border-radius: 6px;">
          <b style="color: var(--amber, #F2B544); font-size: 0.82rem;">Security Warnings (${sec.findings.length}):</b>
          <ul style="margin: 4px 0 0 16px; padding: 0; font-size: 0.78rem; color: var(--ink, #E8ECF4);">
            ${sec.findings.map((f) => `<li>[${escapeHtml(f.severity?.toUpperCase() || 'INFO')}] ${escapeHtml(f.file || '')}: ${escapeHtml(f.description || '')}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <div style="margin-top: 14px; display: flex; justify-content: flex-end; gap: 8px;">
        <button id="btn-save-discovered" class="tb-btn" type="button" style="padding: 6px 16px; font-weight: 600; background: var(--accent, #EF8A5F); color: #fff;">
          Save to Discovered Tools
        </button>
      </div>
    </div>
  `;

  const saveBtn = document.getElementById('btn-save-discovered');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveDiscoveredCandidate);
  }
}

async function saveDiscoveredCandidate() {
  if (!currentCandidate) return;
  const saveBtn = document.getElementById('btn-save-discovered');
  if (saveBtn) saveBtn.disabled = true;

  try {
    const res = await fetch(`/api/tools/discovered${q()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_tool: currentCandidate }),
    });

    const data = await res.json();
    if (res.ok && data.ok) {
      if (saveBtn) saveBtn.textContent = 'Saved to Discovered Registry ✓';
      loadCandidatesCount();
    } else {
      alert(`Failed to save: ${data.error || 'Unknown error'}`);
      if (saveBtn) saveBtn.disabled = false;
    }
  } catch (e) {
    alert(`Network error: ${e.message}`);
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function loadCandidates() {
  const container = document.getElementById('tools-candidates-list');
  if (!container) return;

  try {
    const res = await fetch(`/api/tools/discovered${q()}`);
    const data = await res.json();
    if (!res.ok || !data.ok) {
      container.innerHTML = '<p class="muted">Failed to load discovered tools.</p>';
      return;
    }

    const candEl = document.getElementById('count-candidates');
    if (candEl) candEl.textContent = String(data.tools?.length || 0);

    if (data.tools.length === 0) {
      container.innerHTML = `
        <div class="tools-empty-state">
          <h4>No Discovered Candidates Yet</h4>
          <p>Switch to the "Inspect Repository" tab to scan any GitHub repository URL. The system will detect manifests, capabilities, licenses, and security findings before saving.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = data.tools.map((t) => `
      <div class="tool-item-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <div>
            <b style="font-size: 0.95rem; color: var(--ink, #E8ECF4);">${escapeHtml(t.name)}</b>
            <span style="color: var(--muted, #8D97AA); font-size: 0.8rem; margin-left: 6px;">v${escapeHtml(t.version)}</span>
          </div>
          <button class="tb-btn btn-install-candidate" data-id="${escapeHtml(t.tool_id)}" type="button" style="background: #2e7d32; color: #fff; padding: 4px 14px; font-weight: 600; font-size: 0.82rem;">
            Review &amp; Install
          </button>
        </div>
        <p style="margin: 4px 0 8px; font-size: 0.82rem; color: var(--muted, #8D97AA);">${escapeHtml(t.description || t.source_repository)}</p>
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          ${(t.capabilities || []).map((c) => `<span class="tool-badge badge-blue">${escapeHtml(c.name)}</span>`).join('')}
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-install-candidate').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        const cand = data.tools.find((x) => x.tool_id === id);
        if (cand) openApprovalModal(cand);
      });
    });
  } catch {
    container.innerHTML = '<p class="muted">Error loading discovered tools.</p>';
  }
}

async function openApprovalModal(candidate) {
  const modal = document.getElementById('tools-approval-modal');
  const title = document.getElementById('modal-tool-title');
  const content = document.getElementById('modal-plan-content');
  const chk = document.getElementById('modal-approval-checkbox');
  const confirmBtn = document.getElementById('modal-btn-confirm');
  if (!modal || !content) return;

  if (chk) chk.checked = false;
  if (confirmBtn) confirmBtn.disabled = true;

  title.textContent = `Review Installation Plan: ${candidate.name}`;
  content.innerHTML = '<p class="muted">Generating execution plan, conflict check, and permission analysis...</p>';
  modal.hidden = false;

  try {
    const res = await fetch(`/api/tools/install/plan${q()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_tool: candidate }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      content.innerHTML = `<p style="color: var(--red, #FF5F5F);">Error generating plan: ${escapeHtml(data.error || 'Failed')}</p>`;
      return;
    }

    activePlan = data;
    activeCandidateForInstall = candidate;
    const plan = data.execution_plan || {};

    content.innerHTML = `
      <div style="font-size: 0.85rem; color: var(--ink, #E8ECF4);">
        <p><b>Installation Strategy:</b> <code>${escapeHtml(data.installation_type)}</code></p>
        <p><b>Execution Isolation:</b> <code>${escapeHtml(plan.isolation_level || 'standard_sandbox')}</code></p>
        <p style="color: var(--muted, #8D97AA); font-size: 0.8rem;">${escapeHtml(plan.isolation_description || 'Staging verification prior to promotion')}</p>
        <p><b>Managed Target Directory:</b> <code>${escapeHtml(plan.working_directory || '')}</code></p>
        <p><b>Required Granular Permissions (${plan.required_permissions?.length || 0}):</b></p>
        <ul style="margin: 4px 0 0 16px; padding: 0;">
          ${(plan.required_permissions || []).map((p) => `<li><code>${escapeHtml(p.scope)}</code>: ${escapeHtml(p.justification || p.target || '')}</li>`).join('') || '<li>None inferred</li>'}
        </ul>
        ${data.conflicts?.has_conflicts ? `
          <div style="background: rgba(242, 181, 68, 0.12); border: 1px solid rgba(242, 181, 68, 0.4); padding: 8px; border-radius: 6px; margin-top: 10px;">
            <b style="color: var(--amber, #F2B544);">Conflict Warnings:</b>
            <ul style="margin: 4px 0 0 16px; padding: 0;">
              ${data.conflicts.conflicts.map((c) => `<li>${escapeHtml(c.description)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<p style="color: var(--red, #FF5F5F);">Network error: ${escapeHtml(e.message)}</p>`;
  }
}

// ----------------- 3. TOOLS (REGISTRY) VIEW -----------------
async function loadRegistry() {
  const container = document.getElementById('tools-registry-list');
  if (!container) return;

  container.innerHTML = '<p class="muted">Loading registry...</p>';

  try {
    const [toolsRes, catRes] = await Promise.all([
      fetch(`/api/tools${q()}`),
      fetch(`/api/tools/categories${q()}`).catch(() => null),
    ]);

    const data = await toolsRes.json();
    if (!toolsRes.ok || !data.ok) {
      container.innerHTML = '<p class="muted">Failed to load registry.</p>';
      return;
    }

    allRegistryTools = data.tools || [];

    // Populate category dropdown if available
    const catSelect = document.getElementById('tool-filter-category');
    if (catSelect && catRes && catRes.ok) {
      const catData = await catRes.json();
      const categories = catData.categories || [];
      catSelect.innerHTML = '<option value="">All Categories</option>' +
        categories.map((c) => `<option value="${escapeHtml(c.id || c)}">${escapeHtml(c.name || c)}</option>`).join('');
    }

    renderFilteredRegistry();
  } catch {
    container.innerHTML = '<p class="muted">Error loading registry.</p>';
  }
}

function renderFilteredRegistry() {
  const container = document.getElementById('tools-registry-list');
  if (!container) return;

  const searchInput = document.getElementById('tool-search-input');
  const catSelect = document.getElementById('tool-filter-category');
  const protoSelect = document.getElementById('tool-filter-protocol');
  const statusSelect = document.getElementById('tool-filter-status');

  const qText = (searchInput?.value || '').trim().toLowerCase();
  const selCat = (catSelect?.value || '').toLowerCase();
  const selProto = (protoSelect?.value || '').toLowerCase();
  const selStatus = (statusSelect?.value || '').toLowerCase();

  const filtered = allRegistryTools.filter((t) => {
    if (qText) {
      const matchText = `${t.name} ${t.description || ''} ${t.tool_id} ${(t.tags || []).join(' ')}`.toLowerCase();
      if (!matchText.includes(qText)) return false;
    }
    if (selCat) {
      const cats = Array.isArray(t.categories) ? t.categories : [t.category];
      if (!cats.some((c) => String(c).toLowerCase() === selCat)) return false;
    }
    if (selProto) {
      const protocols = (t.capabilities || []).map((c) => String(c.protocol).toLowerCase());
      if (!protocols.includes(selProto)) return false;
    }
    if (selStatus) {
      if (selStatus === 'healthy' && t.installation_status !== 'healthy') return false;
      if (selStatus === 'disabled' && (t.enabled_status || t.installation_status !== 'disabled')) return false;
      if (selStatus === 'failed' && (t.installation_status === 'healthy' || t.installation_status === 'disabled')) return false;
    }
    return true;
  });

  if (allRegistryTools.length === 0) {
    container.innerHTML = `
      <div class="tools-empty-state">
        <h4>No Installed Tools Registered</h4>
        <p>Shared managed storage is currently empty. You can discover, statically inspect, and verify AI tools from any GitHub repository before installing.</p>
        <button class="tb-btn btn-go-discover" type="button" style="background: var(--accent, #EF8A5F); color: #fff; padding: 6px 16px; font-weight: 600;">
          Discover Tools from GitHub
        </button>
      </div>
    `;
    const goBtn = container.querySelector('.btn-go-discover');
    if (goBtn) {
      goBtn.addEventListener('click', () => switchTab('discover'));
    }
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="tools-empty-state">
        <h4>No Tools Match Filters</h4>
        <p>No tools in the registry match the current search text or filter criteria.</p>
        <button class="tb-btn btn-clear-filters" type="button" style="padding: 4px 12px; font-size: 0.8rem;">
          Clear Filters
        </button>
      </div>
    `;
    const clearBtn = container.querySelector('.btn-clear-filters');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        if (catSelect) catSelect.value = '';
        if (protoSelect) protoSelect.value = '';
        if (statusSelect) statusSelect.value = '';
        renderFilteredRegistry();
      });
    }
    return;
  }

  container.innerHTML = filtered.map((t) => {
    const isHealthy = t.installation_status === 'healthy';
    const isEnabled = Boolean(t.enabled_status);
    const isPinned = Boolean(t.pinned_version);
    const badgeClass = isHealthy ? 'badge-green' : t.installation_status === 'disabled' ? 'badge-muted' : 'badge-red';

    return `
      <div class="tool-item-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div>
            <b style="font-size: 1.05rem; color: var(--ink, #E8ECF4);">${escapeHtml(t.name)}</b>
            <span style="font-size: 0.8rem; color: var(--muted, #8D97AA); margin-left: 6px;">v${escapeHtml(t.version)}</span>
            ${isPinned ? '<span class="tool-badge badge-amber" style="margin-left: 6px;">PINNED</span>' : ''}
          </div>
          <span class="tool-badge ${badgeClass}">
            ${escapeHtml(t.installation_status)}
          </span>
        </div>

        <p style="margin: 4px 0 8px 0; font-size: 0.82rem; color: var(--muted, #8D97AA);">${escapeHtml(t.description || t.source_repository)}</p>

        <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px;">
          ${(t.capabilities || []).map((c) => `<span class="tool-badge badge-blue">${escapeHtml(c.name)} (${escapeHtml(c.protocol)})</span>`).join('')}
        </div>

        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; padding-top: 8px; border-top: 1px solid var(--line, rgba(255,255,255,0.07));">
          <button class="tb-btn btn-toggle-enable" data-id="${escapeHtml(t.tool_id)}" data-enable="${!isEnabled}" type="button" style="padding: 3px 10px; font-size: 0.78rem;">
            ${isEnabled ? 'Disable' : 'Enable'}
          </button>

          <button class="tb-btn btn-verify-tool" data-id="${escapeHtml(t.tool_id)}" type="button" style="padding: 3px 10px; font-size: 0.78rem;">
            Health Check
          </button>

          <button class="tb-btn btn-pin-tool" data-id="${escapeHtml(t.tool_id)}" data-pinned="${isPinned}" data-version="${escapeHtml(t.version)}" type="button" style="padding: 3px 10px; font-size: 0.78rem;">
            ${isPinned ? 'Unpin Version' : 'Pin Version'}
          </button>

          <button class="tb-btn btn-rollback-tool" data-id="${escapeHtml(t.tool_id)}" type="button" style="padding: 3px 10px; font-size: 0.78rem;">
            Rollback
          </button>

          <button class="tb-btn btn-uninstall-tool" data-id="${escapeHtml(t.tool_id)}" type="button" style="padding: 3px 10px; font-size: 0.78rem; color: var(--red, #FF5F5F);">
            Uninstall
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Wire actions
  container.querySelectorAll('.btn-toggle-enable').forEach((b) => {
    b.addEventListener('click', async () => {
      const id = b.getAttribute('data-id');
      const enable = b.getAttribute('data-enable') === 'true';
      const ep = enable ? '/api/tools/enable' : '/api/tools/disable';
      await fetch(`${ep}${q()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_id: id }),
      });
      loadRegistry();
    });
  });

  container.querySelectorAll('.btn-verify-tool').forEach((b) => {
    b.addEventListener('click', async () => {
      const id = b.getAttribute('data-id');
      const res = await fetch(`/api/tools/verify${q()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_id: id }),
      });
      const d = await res.json();
      alert(`Health Check for '${id}': ${d.health?.status || 'unknown'}\n${d.health?.message || ''}`);
      loadRegistry();
    });
  });

  container.querySelectorAll('.btn-pin-tool').forEach((b) => {
    b.addEventListener('click', async () => {
      const id = b.getAttribute('data-id');
      const isPinned = b.getAttribute('data-pinned') === 'true';
      const ver = b.getAttribute('data-version');
      const ep = isPinned ? '/api/tools/unpin' : '/api/tools/pin';
      await fetch(`${ep}${q()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_id: id, version: ver }),
      });
      loadRegistry();
    });
  });

  container.querySelectorAll('.btn-rollback-tool').forEach((b) => {
    b.addEventListener('click', async () => {
      const id = b.getAttribute('data-id');
      if (!confirm(`Rollback tool '${id}' to its previous working snapshot?`)) return;
      const res = await fetch(`/api/tools/rollback${q()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_id: id }),
      });
      const d = await res.json();
      if (d.ok) {
        alert(`Tool '${id}' restored to version ${d.version}`);
      } else {
        alert(`Rollback failed: ${d.error || 'No snapshots available'}`);
      }
      loadRegistry();
    });
  });

  container.querySelectorAll('.btn-uninstall-tool').forEach((b) => {
    b.addEventListener('click', async () => {
      const id = b.getAttribute('data-id');
      if (!confirm(`Are you sure you want to completely uninstall '${id}' from managed storage?`)) return;
      const res = await fetch(`/api/tools/uninstall${q()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_id: id, user_confirmation: true }),
      });
      const d = await res.json();
      if (d.ok) {
        alert(`Tool '${id}' uninstalled safely.`);
      } else {
        alert(`Uninstall failed: ${d.error}`);
      }
      loadRegistry();
    });
  });
}

// ----------------- 4. AGENTS VIEW -----------------
async function loadAgentsView() {
  const container = document.getElementById('tools-agents-list');
  if (!container) return;

  container.innerHTML = '<p class="muted">Scanning host agent runtimes and configurations...</p>';

  try {
    const res = await fetch(`/api/tools/distribution/agents${q()}`);
    const data = await res.json();
    if (!res.ok || !data.ok) {
      container.innerHTML = `<p class="muted" style="color: var(--red, #FF5F5F);">Failed to query agent detection API: ${escapeHtml(data.error || 'Server error')}</p>`;
      return;
    }

    const agents = data.agents || [];
    if (agents.length === 0) {
      container.innerHTML = '<p class="muted">No agents registered in distribution engine.</p>';
      return;
    }

    container.innerHTML = agents.map((a) => {
      const st = a.status || a.environment?.status || 'NOT_FOUND';
      const vLvl = a.verification_level ?? a.environment?.verification_level ?? 0;
      const exe = a.executable_path || a.environment?.executable_path;
      const cfg = a.config_path || a.environment?.config_path;
      const skl = a.skills_dir || a.environment?.skills_dir;
      const ver = a.version || a.environment?.version;
      const ev = a.evidence || a.environment?.evidence;
      const detErr = a.detection_error || a.environment?.detection_error;
      const observedAt = a.lastObservedAt ? new Date(a.lastObservedAt).toLocaleString() : 'Never';
      const verifiedAt = a.lastVerifiedAt ? new Date(a.lastVerifiedAt).toLocaleString() : 'Not verified';

      let badgeClass = 'badge-muted';
      let badgeLabel = st;

      if (st === 'FUNCTIONALLY_VERIFIED') {
        badgeClass = 'badge-green';
        badgeLabel = 'FUNCTIONALLY VERIFIED';
      } else if (st === 'CONFIGURED') {
        badgeClass = 'badge-amber';
        badgeLabel = 'CONFIGURED (NOT VERIFIED)';
      } else if (st === 'DETECTED') {
        badgeClass = 'badge-blue';
        badgeLabel = 'DETECTED';
      } else if (st === 'PRESENT') {
        badgeClass = 'badge-blue';
        badgeLabel = 'PRESENT';
      } else if (st === 'SUPPORTED') {
        badgeClass = 'badge-muted';
        badgeLabel = 'SUPPORTED (NOT INSTALLED)';
      } else if (st === 'NOT_FOUND') {
        badgeClass = 'badge-muted';
        badgeLabel = 'NOT FOUND';
      }

      return `
        <div class="tool-item-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div>
              <b style="font-size: 1rem; color: var(--ink, #E8ECF4);">${escapeHtml(a.name || a.agent_id)}</b>
              <code style="font-size: 0.75rem; color: var(--muted, #8D97AA); margin-left: 8px;">${escapeHtml(a.agent_id)}</code>
              ${ver ? `<span class="tool-badge badge-blue" style="margin-left: 6px;">v${escapeHtml(ver)}</span>` : ''}
              <span class="tool-badge badge-muted" style="margin-left: 6px;">Level ${vLvl}</span>
            </div>
            <span class="tool-badge ${badgeClass}">${badgeLabel}</span>
          </div>

          <div style="font-size: 0.8rem; color: var(--muted, #8D97AA); margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
            <div><b>Executable:</b> ${exe ? `<code>${escapeHtml(exe)}</code>` : '<span style="color: var(--muted, #8D97AA);">Not detected on PATH</span>'}</div>
            <div><b>Configuration:</b> ${cfg ? `<code>${escapeHtml(cfg)}</code>` : '<span style="color: var(--muted, #8D97AA);">None detected</span>'}</div>
            <div><b>Skills Directory:</b> ${skl ? `<code>${escapeHtml(skl)}</code>` : '<span style="color: var(--muted, #8D97AA);">None detected</span>'}</div>
            <div><b>Integration Protocols:</b> ${(a.supported_protocols || ['skills', 'mcp', 'cli']).map((p) => `<span class="tool-badge badge-blue" style="margin-right: 4px;">${escapeHtml(p)}</span>`).join('')}</div>
            <div><b>Supported:</b> ${a.supported ? 'Yes' : 'No'} · <b>Installed:</b> ${a.installed == null ? 'Unknown' : a.installed ? 'Yes' : 'No'} · <b>Configured:</b> ${a.configured ? 'Yes' : 'No'}</div>
            <div><b>Connected:</b> ${a.connected ? 'Yes' : 'No'} · <b>Observed:</b> ${a.observed ? 'Yes' : 'No'} · <b>Functionally verified:</b> ${a.functionallyVerified ? 'Yes' : 'No'}</div>
            <div><b>Provider:</b> ${escapeHtml(a.provider || a.agent_id)} · <b>Evidence:</b> ${escapeHtml(a.evidenceSource || 'None')} · <b>Last observed:</b> ${escapeHtml(observedAt)} · <b>Last verified:</b> ${escapeHtml(verifiedAt)}${a.evidenceStale ? ' · STALE' : ''}</div>
            ${a.verificationScope ? `<div><b>Scope:</b> ${escapeHtml(a.verificationScope)}</div>` : ''}
            ${ev ? `<div style="margin-top: 2px;"><b>Evidence:</b> <span style="color: var(--ink, #E8ECF4);">${escapeHtml(ev)}</span></div>` : ''}
            ${detErr ? `<div style="margin-top: 2px; color: var(--amber, #F2B544);"><b>Notice:</b> ${escapeHtml(detErr)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<p style="color: var(--red, #FF5F5F);">Error querying agent runtimes: ${escapeHtml(err.message)}</p>`;
  }
}

// ----------------- 5. DISTRIBUTION VIEW -----------------
async function loadDistributionMatrix() {
  const container = document.getElementById('tools-distribution-matrix');
  if (!container) return;

  container.innerHTML = '<p class="muted">Loading compatibility matrix...</p>';

  try {
    const res = await fetch(`/api/tools/distribution/matrix${q()}`);
    const data = await res.json();
    if (!res.ok || !data.ok) {
      container.innerHTML = '<p class="muted">Failed to load compatibility matrix.</p>';
      return;
    }

    if (data.matrix.length === 0) {
      container.innerHTML = `
        <div class="tools-empty-state">
          <h4>No Installed Tools Available for Distribution</h4>
          <p>Install tools into shared managed storage first to distribute them to Claude Code, Codex CLI, Codex App, or Antigravity.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = data.matrix.map((row) => `
      <div class="tool-item-card" style="margin-bottom: 12px;">
        <div style="margin-bottom: 8px;">
          <b style="font-size: 1.05rem; color: var(--ink, #E8ECF4);">${escapeHtml(row.tool_name)}</b>
          <span style="color: var(--muted, #8D97AA); font-size: 0.82rem; margin-left: 6px;">v${escapeHtml(row.tool_version)}</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
          ${Object.values(row.agents || {}).map((a) => {
            const isDist = a.distributed;
            const isEnabled = a.enabled;
            const badgeClass = a.status === 'verified_compatible' ? 'badge-green' : a.status === 'potentially_compatible' ? 'badge-amber' : 'badge-muted';

            return `
              <div style="display: flex; justify-content: space-between; align-items: center; background: var(--card, #18202B); padding: 8px 12px; border-radius: 6px;">
                <div>
                  <b style="color: var(--ink, #E8ECF4);">${escapeHtml(a.agent_name || a.agent_id)}</b>
                  <span class="tool-badge ${badgeClass}" style="margin-left: 6px;">${escapeHtml(a.status)}</span>
                  ${isDist ? `<span class="tool-badge badge-blue" style="margin-left: 6px;">LVL ${a.verification_level || 1}</span>` : ''}
                  <div style="font-size: 0.78rem; color: var(--muted, #8D97AA); margin-top: 2px;">${escapeHtml(a.reason || '')}</div>
                </div>

                <div style="display: flex; gap: 6px;">
                  ${!isDist ? `
                    <button class="tb-btn btn-open-dist-plan" data-tool="${escapeHtml(row.tool_id)}" data-agent="${escapeHtml(a.agent_id)}" type="button" style="background: var(--accent, #EF8A5F); color: #fff; padding: 3px 10px; font-size: 0.78rem;" ${!a.compatible ? 'disabled' : ''}>
                      Distribute
                    </button>
                  ` : `
                    <button class="tb-btn btn-dist-toggle" data-id="${escapeHtml(a.distribution_id)}" data-enable="${!isEnabled}" type="button" style="padding: 3px 8px; font-size: 0.78rem;">
                      ${isEnabled ? 'Disable' : 'Enable'}
                    </button>
                    <button class="tb-btn btn-dist-remove" data-id="${escapeHtml(a.distribution_id)}" type="button" style="padding: 3px 8px; font-size: 0.78rem; color: var(--red, #FF5F5F);">
                      Remove
                    </button>
                  `}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-open-dist-plan').forEach((b) => {
      b.addEventListener('click', () => {
        const toolId = b.getAttribute('data-tool');
        const agentId = b.getAttribute('data-agent');
        openDistributionModal(toolId, agentId);
      });
    });

    container.querySelectorAll('.btn-dist-toggle').forEach((b) => {
      b.addEventListener('click', async () => {
        const distId = b.getAttribute('data-id');
        const enable = b.getAttribute('data-enable') === 'true';
        const ep = enable ? '/api/tools/distribution/enable' : '/api/tools/distribution/disable';
        await fetch(`${ep}${q()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ distribution_id: distId }),
        });
        loadDistributionMatrix();
        loadDistributionList();
      });
    });

    container.querySelectorAll('.btn-dist-remove').forEach((b) => {
      b.addEventListener('click', async () => {
        const distId = b.getAttribute('data-id');
        if (!confirm('Remove this tool integration from this agent?')) return;
        await fetch(`/api/tools/distribution/remove${q()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ distribution_id: distId }),
        });
        loadDistributionMatrix();
        loadDistributionList();
      });
    });
  } catch {
    container.innerHTML = '<p class="muted">Error loading distribution matrix.</p>';
  }
}

async function loadDistributionList() {
  const container = document.getElementById('tools-distribution-list');
  if (!container) return;

  try {
    const res = await fetch(`/api/tools/distribution/list${q()}`);
    const data = await res.json();
    if (!res.ok || !data.ok) {
      container.innerHTML = '<p class="muted">Failed to load distributions.</p>';
      return;
    }

    const dists = data.distributions || [];
    if (dists.length === 0) {
      container.innerHTML = '<p class="muted" style="font-size: 0.82rem;">No active agent distributions yet.</p>';
      return;
    }

    container.innerHTML = dists.map((d) => `
      <div style="background: var(--card, #18202B); padding: 8px 12px; border-radius: 6px; margin-bottom: 6px; font-size: 0.82rem; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <b style="color: var(--ink, #E8ECF4);">${escapeHtml(d.tool_id)} &rarr; ${escapeHtml(d.agent_id)}</b>
          <div style="color: var(--muted, #8D97AA); font-size: 0.75rem;">Junction: <code>${escapeHtml(d.target_path || d.target_location || '')}</code></div>
        </div>
        <span class="tool-badge ${d.enabled ? 'badge-green' : 'badge-muted'}">${d.enabled ? 'Active' : 'Disabled'}</span>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<p class="muted">Error loading distributions.</p>';
  }
}

async function openDistributionModal(toolId, agentId) {
  const modal = document.getElementById('tools-dist-approval-modal');
  const title = document.getElementById('modal-dist-title');
  const content = document.getElementById('modal-dist-content');
  const chk = document.getElementById('modal-dist-checkbox');
  const confirmBtn = document.getElementById('modal-dist-btn-confirm');
  if (!modal || !content) return;

  if (chk) chk.checked = false;
  if (confirmBtn) confirmBtn.disabled = true;

  title.textContent = `Distribute Tool: ${toolId} ➔ ${agentId}`;
  content.innerHTML = '<p class="muted">Generating distribution plan and backup strategy...</p>';
  modal.hidden = false;

  try {
    const res = await fetch(`/api/tools/distribution/plan${q()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_id: toolId, agent_id: agentId }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      content.innerHTML = `<p style="color: var(--red, #FF5F5F);">Error generating plan: ${escapeHtml(data.error || 'Failed')}</p>`;
      return;
    }

    activeDistPlan = data.plan;

    content.innerHTML = `
      <div style="font-size: 0.85rem; color: var(--ink, #E8ECF4);">
        <p><b>Target Agent:</b> <code>${escapeHtml(data.plan.agent_id)}</code></p>
        <p><b>Protocol:</b> <code>${escapeHtml(data.plan.protocol)}</code> (${escapeHtml(data.plan.method)})</p>
        <p><b>Target Location:</b> <code>${escapeHtml(data.plan.target_location)}</code></p>
        ${data.plan.config_path ? `<p><b>Configuration File:</b> <code>${escapeHtml(data.plan.config_path)}</code></p>` : ''}
        <p><b>Backup Strategy:</b> ${escapeHtml(data.plan.backup_strategy)}</p>
        <p><b>Rollback Plan:</b> ${escapeHtml(data.plan.rollback_plan)}</p>
        <p><b>Compatibility Evidence:</b> ${escapeHtml(data.plan.compatibility_evidence)}</p>
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<p style="color: var(--red, #FF5F5F);">Network error: ${escapeHtml(e.message)}</p>`;
  }
}

// ----------------- 6. SECURITY VIEW -----------------
async function loadSecurityOverview() {
  const limitationsEl = document.getElementById('tools-security-limitations');
  const overviewEl = document.getElementById('tools-security-overview');
  const permsEl = document.getElementById('tools-security-permissions-list');
  const policiesEl = document.getElementById('tools-security-policies-list');
  const auditEl = document.getElementById('tools-security-audit-list');

  if (overviewEl) overviewEl.innerHTML = '<p class="muted">Loading security metrics...</p>';
  if (permsEl) permsEl.innerHTML = '<p class="muted">Loading permission grants...</p>';
  if (policiesEl) policiesEl.innerHTML = '<p class="muted">Loading policy rules...</p>';
  if (auditEl) auditEl.innerHTML = '<p class="muted">Loading audit events...</p>';

  // 1. Overview & Limitations
  try {
    const [ovRes, limRes] = await Promise.all([
      fetch(`/api/tools/security/overview${q()}`),
      fetch(`/api/tools/security/limitations${q()}`),
    ]);

    if (ovRes.ok && overviewEl) {
      const ovData = await ovRes.json();
      const ov = ovData.overview || {};
      overviewEl.innerHTML = `
        <div class="tools-metric-grid">
          <div class="tools-metric-card">
            <span class="val" style="color: var(--green-ink, #8FEDB8);">${ov.active_grants_count ?? 0}</span>
            <span class="lbl">Active Grants</span>
          </div>
          <div class="tools-metric-card">
            <span class="val" style="color: var(--red, #FF5F5F);">${ov.audit_summary?.blocked_executions ?? 0}</span>
            <span class="lbl">Blocked Operations</span>
          </div>
          <div class="tools-metric-card">
            <span class="val" style="color: var(--blue, #6AAEFF);">${ov.total_permissions_count ?? 0}</span>
            <span class="lbl">Total Records</span>
          </div>
          <div class="tools-metric-card">
            <span class="val" style="color: var(--accent, #EF8A5F);">STRICT</span>
            <span class="lbl">Default Stance</span>
          </div>
        </div>
      `;
    } else if (overviewEl) {
      overviewEl.innerHTML = '<p style="color: var(--red, #FF5F5F);">Failed to load security overview metrics.</p>';
    }

    if (limRes.ok && limitationsEl) {
      const limData = await limRes.json();
      const lim = limData.limitations || {};
      limitationsEl.innerHTML = `
        <p style="margin: 0 0 6px 0;"><strong>Enforcement Model:</strong> ${escapeHtml(lim.enforcement_model || 'Application-level authorization gate and process sandbox.')}</p>
        <p style="margin: 0 0 6px 0;"><strong>Technical Disclosure:</strong> ${escapeHtml(lim.disclaimer || 'Windows kernel isolation containers are not employed; safety boundaries operate via token-checked wrappers, directory restrictions, and sanitized environment variables.')}</p>
        <p style="margin: 0;"><strong>Cross-Agent Isolation:</strong> Tools distributed via junctions inherit separate sandbox contexts per agent.</p>
      `;
    }
  } catch (err) {
    if (overviewEl) overviewEl.innerHTML = `<p style="color: var(--red, #FF5F5F);">Error loading overview: ${escapeHtml(err.message)}</p>`;
  }

  // 2. Permissions List
  try {
    const permRes = await fetch(`/api/tools/security/permissions${q()}`);
    if (permsEl) {
      if (!permRes.ok) {
        permsEl.innerHTML = '<p style="color: var(--red, #FF5F5F);">Failed to load permission grants from server.</p>';
      } else {
        const permData = await permRes.json();
        const permissions = Array.isArray(permData.permissions) ? permData.permissions : [];

        if (permissions.length === 0) {
          permsEl.innerHTML = '<p class="muted" style="font-size: 0.82rem;">No permission grants recorded. All operations default to DENY.</p>';
        } else {
          permsEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${permissions.map((p) => {
                const toolBadge = p.tool_installed
                  ? '<span class="tool-badge badge-green">Installed Tool</span>'
                  : '<span class="tool-badge badge-amber" title="Grant exists for a tool that is not in the installed registry">Orphaned (Tool Uninstalled)</span>';

                let statusBadge = '<span class="tool-badge badge-green">Active Grant</span>';
                if (p.revocation_status === 'revoked') {
                  statusBadge = '<span class="tool-badge badge-red">Revoked</span>';
                } else if (p.revocation_status === 'expired' || p.is_expired) {
                  statusBadge = '<span class="tool-badge badge-muted">Expired</span>';
                }

                return `
                  <div style="border: 1px solid var(--line, rgba(255,255,255,0.08)); border-radius: 6px; padding: 10px; background: var(--card-2, #1E2734); font-size: 0.82rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                      <div>
                        <b style="color: var(--ink, #E8ECF4); font-size: 0.9rem;">${escapeHtml(p.tool_id)}</b>
                        <span style="color: var(--muted, #8D97AA); margin: 0 4px;">&rarr;</span>
                        <code style="color: var(--blue, #6AAEFF);">${escapeHtml(p.agent_id)}</code>
                        <span style="margin-left: 8px;">${toolBadge}</span>
                      </div>
                      ${statusBadge}
                    </div>

                    <div style="color: var(--muted, #8D97AA); margin-bottom: 6px;">
                      <b>Granted Scopes:</b> <code>${escapeHtml(Array.isArray(p.granted_scopes) ? p.granted_scopes.join(', ') : String(p.granted_scopes || 'none'))}</code>
                      ${p.approval_reference ? `<span style="margin-left: 10px; font-size: 0.75rem;">(Ref: <code>${escapeHtml(p.approval_reference)}</code>)</span>` : ''}
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.74rem;">
                      <span style="color: var(--muted, #8D97AA);">
                        Granted: ${p.grant_timestamp ? new Date(p.grant_timestamp).toLocaleString() : 'N/A'}
                        ${p.expiration ? ` · Expires: ${new Date(p.expiration).toLocaleString()}` : ' · No Expiration'}
                      </span>
                      ${p.revocation_status === 'active' ? `
                        <button type="button" class="tb-btn btn-revoke-perm" data-perm-id="${escapeHtml(p.permission_id)}" style="font-size: 0.74rem; padding: 2px 10px; color: var(--red, #FF5F5F); border-color: rgba(255,95,95,0.4);">
                          Revoke Grant
                        </button>
                      ` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `;

          permsEl.querySelectorAll('.btn-revoke-perm').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
              const permId = e.currentTarget.getAttribute('data-perm-id');
              if (!confirm(`Revoke permission ${permId}?`)) return;
              try {
                const res = await fetch(`/api/tools/security/permissions/revoke${q()}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ permission_id: permId, reason: 'Revoked by user via Security UI' }),
                });
                const d = await res.json();
                if (d.ok) {
                  loadSecurityOverview();
                } else {
                  alert(d.error || 'Failed to revoke');
                }
              } catch (err) {
                alert(err.message);
              }
            });
          });
        }
      }
    }
  } catch (err) {
    if (permsEl) permsEl.innerHTML = `<p style="color: var(--red, #FF5F5F);">Error loading permissions: ${escapeHtml(err.message)}</p>`;
  }

  // 3. Policies Hierarchy
  try {
    const polRes = await fetch(`/api/tools/security/policies${q()}`);
    if (policiesEl) {
      if (!polRes.ok) {
        policiesEl.innerHTML = '<p style="color: var(--red, #FF5F5F);">Failed to load security policies.</p>';
      } else {
        const polData = await polRes.json();
        let ruleItems = [];

        if (Array.isArray(polData.rules) && polData.rules.length > 0) {
          ruleItems = polData.rules;
        } else if (polData.policies && typeof polData.policies === 'object') {
          const p = polData.policies;
          ruleItems.push({
            level: 1,
            name: 'Global Default Action',
            scope: '*',
            action: p.default_action || 'DENY',
            description: 'All undeclared operations default to DENY',
          });
          for (const s of (p.globally_denied_scopes || [])) {
            ruleItems.push({
              level: 2,
              name: `Global Deny Scope: ${s}`,
              scope: s,
              action: 'DENY',
              description: 'Globally prohibited scope across all agents and tools',
            });
          }
          for (const d of (p.explicit_denies || [])) {
            ruleItems.push({
              level: 3,
              name: d.rule_id || 'Explicit Path Block',
              scope: d.scope || '*',
              action: 'DENY',
              description: d.description || d.target || 'Blocked target',
            });
          }
          for (const [ag, aPol] of Object.entries(p.agent_policies || {})) {
            ruleItems.push({
              level: 4,
              name: `Agent Policy: ${ag}`,
              scope: (aPol.allowed_scopes || []).join(', ') || 'none',
              action: 'ALLOW',
              description: `Scopes permitted for agent ${ag}`,
            });
          }
          for (const [t, tPol] of Object.entries(p.tool_policies || {})) {
            ruleItems.push({
              level: 5,
              name: `Tool Restriction: ${t}`,
              scope: (tPol.denied_scopes || []).join(', ') || 'none',
              action: 'DENY',
              description: `Scopes blocked for tool ${t}`,
            });
          }
        }

        if (ruleItems.length === 0) {
          policiesEl.innerHTML = '<p class="muted">Standard 5-level hierarchy active (Default Deny &rarr; Tool &rarr; Agent &rarr; Workspace &rarr; System).</p>';
        } else {
          policiesEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.8rem;">
              ${ruleItems.map((rule) => `
                <div style="background: var(--card-2, #1E2734); padding: 8px 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <span class="tool-badge badge-blue" style="margin-right: 6px;">Level ${rule.level || 1}</span>
                    <b style="color: var(--ink, #E8ECF4);">${escapeHtml(rule.name)}</b>
                    <div style="color: var(--muted, #8D97AA); font-size: 0.75rem; margin-top: 2px;">
                      Scopes: <code>${escapeHtml(rule.scope || '*')}</code> · ${escapeHtml(rule.description || '')}
                    </div>
                  </div>
                  <span class="tool-badge ${rule.action === 'ALLOW' ? 'badge-green' : 'badge-amber'}">${escapeHtml(rule.action || 'DENY')}</span>
                </div>
              `).join('')}
            </div>
          `;
        }
      }
    }
  } catch (err) {
    if (policiesEl) policiesEl.innerHTML = `<p style="color: var(--red, #FF5F5F);">Error loading policies: ${escapeHtml(err.message)}</p>`;
  }

  // 4. Audit Events
  try {
    const audRes = await fetch(`/api/tools/security/audit?limit=25${q()}`);
    if (auditEl) {
      if (!audRes.ok) {
        auditEl.innerHTML = '<p style="color: var(--red, #FF5F5F);">Failed to load security audit log.</p>';
      } else {
        const audData = await audRes.json();
        const events = Array.isArray(audData.events) ? audData.events : [];

        if (events.length === 0) {
          auditEl.innerHTML = '<p class="muted" style="font-size: 0.82rem;">No security events logged yet.</p>';
        } else {
          auditEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 6px; max-height: 250px; overflow-y: auto;">
              ${events.map((e) => `
                <div style="font-size: 0.78rem; border-left: 3px solid ${e.decision === 'DENY' || e.severity === 'critical' ? 'var(--red, #FF5F5F)' : e.severity === 'warning' ? 'var(--amber, #F2B544)' : 'var(--green-ink, #8FEDB8)'}; padding: 6px 10px; background: var(--card-2, #1E2734); border-radius: 4px;">
                  <div style="display: flex; justify-content: space-between;">
                    <b style="color: var(--ink, #E8ECF4);">${escapeHtml(e.type || e.action || 'EVENT')}</b>
                    <span style="color: var(--muted, #8D97AA); font-size: 0.72rem;">${e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : ''}</span>
                  </div>
                  <div style="color: var(--muted, #8D97AA); margin-top: 2px;">${escapeHtml(e.reason || e.operation || '')}</div>
                </div>
              `).join('')}
            </div>
          `;
        }
      }
    }
  } catch (err) {
    if (auditEl) auditEl.innerHTML = `<p style="color: var(--red, #FF5F5F);">Error loading audit events: ${escapeHtml(err.message)}</p>`;
  }
}

// ----------------- 7. ORCHESTRATION VIEW -----------------
function setupOrchestrationView() {
  const submitBtn = document.getElementById('btn-orch-submit');
  const inputEl = document.getElementById('orch-task-input');
  if (!submitBtn || !inputEl || submitBtn.dataset.wired) return;
  submitBtn.dataset.wired = 'true';

  submitBtn.addEventListener('click', async () => {
    const prompt = inputEl.value.trim();
    if (!prompt) return;

    const wsSelect = document.getElementById('orch-workspace-select');
    const modeSelect = document.getElementById('orch-mode-select');
    const agentSelect = document.getElementById('orch-agent-select');

    const statusEl = document.getElementById('orch-status-container');
    const analysisEl = document.getElementById('orch-analysis-container');
    const matchesEl = document.getElementById('orch-matches-container');
    const planEl = document.getElementById('orch-plan-container');
    const traceEl = document.getElementById('orch-trace-container');

    statusEl.hidden = false;
    statusEl.innerHTML = '<p class="muted">Analyzing task capabilities, querying tool registry, and selecting compatible agent...</p>';
    if (analysisEl) analysisEl.hidden = true;
    if (matchesEl) matchesEl.hidden = true;
    if (planEl) planEl.hidden = true;
    if (traceEl) traceEl.hidden = true;

    try {
      const payload = {
        prompt,
        workspace_path: wsSelect?.value || 'D:\\somehting code\\my-office',
        read_only: modeSelect?.value === 'read_only',
        target_agent: agentSelect?.value || null,
      };

      const res = await fetch(`/api/orchestration/submit${q()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        statusEl.innerHTML = `<p style="color: var(--red, #FF5F5F);">Orchestration failed: ${escapeHtml(data.error || 'Failed')}</p>`;
        return;
      }

      renderOrchestrationResult(data.task);
    } catch (err) {
      statusEl.innerHTML = `<p style="color: var(--red, #FF5F5F);">Network error: ${escapeHtml(err.message)}</p>`;
    }
  });
}

function renderOrchestrationResult(task) {
  const statusEl = document.getElementById('orch-status-container');
  const analysisEl = document.getElementById('orch-analysis-container');
  const matchesEl = document.getElementById('orch-matches-container');
  const planEl = document.getElementById('orch-plan-container');
  const traceEl = document.getElementById('orch-trace-container');

  const statusColor =
    task.status === 'COMPLETED' ? 'var(--green-ink, #8FEDB8)' :
    task.status === 'AWAITING_APPROVAL' ? 'var(--amber, #F2B544)' :
    task.status === 'FAILED' || task.status === 'BLOCKED' ? 'var(--red, #FF5F5F)' : 'var(--blue, #6AAEFF)';

  statusEl.hidden = false;
  statusEl.innerHTML = `
    <div style="border-left: 4px solid ${statusColor}; background: var(--card-2, #1E2734); padding: 12px 14px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <span style="font-weight: bold; color: ${statusColor}; font-size: 0.95rem;">${escapeHtml(task.status)}</span>
        <span style="font-size: 0.78rem; color: var(--muted, #8D97AA); margin-left: 8px;">Task ID: <code>${escapeHtml(task.task_id)}</code></span>
      </div>
      ${task.status === 'AWAITING_APPROVAL' ? `
        <button id="btn-orch-approve-plan" type="button" class="tb-btn" style="background: #2e7d32; color: #fff; font-weight: 600; padding: 4px 14px; font-size: 0.82rem;">
          Approve &amp; Execute Plan
        </button>
      ` : ''}
    </div>
  `;

  if (task.status === 'AWAITING_APPROVAL') {
    const approveBtn = document.getElementById('btn-orch-approve-plan');
    if (approveBtn) {
      approveBtn.addEventListener('click', async () => {
        approveBtn.disabled = true;
        approveBtn.textContent = 'Approving...';
        try {
          const res = await fetch(`/api/orchestration/tasks/${encodeURIComponent(task.task_id)}/approve${q()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approved_by: 'user_ui' }),
          });
          const d = await res.json();
          if (d.ok) {
            renderOrchestrationResult(d.task);
          } else {
            alert(d.error || 'Failed to approve');
          }
        } catch (err) {
          alert(err.message);
        }
      });
    }
  }

  // Task Analysis
  if (task.task_spec && analysisEl) {
    const spec = task.task_spec;
    analysisEl.hidden = false;
    analysisEl.innerHTML = `
      <div style="background: var(--card-2, #1E2734); border: 1px solid var(--line, rgba(255,255,255,0.08)); border-radius: 8px; padding: 12px; font-size: 0.82rem;">
        <h4 style="margin: 0 0 8px 0; color: var(--ink, #E8ECF4);">Task Analysis</h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; margin-bottom: 8px;">
          <div><b>Type:</b> <code>${escapeHtml(spec.task_type)}</code></div>
          <div><b>Risk Level:</b> <span style="font-weight: bold; color: ${spec.risk_level === 'critical' || spec.risk_level === 'high' ? 'var(--red, #FF5F5F)' : spec.risk_level === 'medium' ? 'var(--amber, #F2B544)' : 'var(--green-ink, #8FEDB8)'};">${escapeHtml(spec.risk_level?.toUpperCase() || 'LOW')}</span></div>
          <div><b>Selected Agent:</b> <code>${escapeHtml(task.selected_agent?.name || task.selected_agent?.agent_id || 'none')}</code></div>
        </div>
        <div><b>Required Capabilities:</b> <code>${escapeHtml(spec.required_capabilities?.join(', ') || 'none')}</code></div>
        ${spec.expected_output_artifacts?.length > 0 ? `<div style="margin-top: 4px;"><b>Expected Outputs:</b> <code>${escapeHtml(spec.expected_output_artifacts.join(', '))}</code></div>` : ''}
      </div>
    `;
  }

  // Tool Matches
  if (task.matched_tools && task.matched_tools.length > 0 && matchesEl) {
    matchesEl.hidden = false;
    matchesEl.innerHTML = `
      <div style="background: var(--card-2, #1E2734); border: 1px solid var(--line, rgba(255,255,255,0.08)); border-radius: 8px; padding: 12px; font-size: 0.82rem;">
        <h4 style="margin: 0 0 8px 0; color: var(--ink, #E8ECF4);">Ranked Tool Matches (${task.matched_tools.length})</h4>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${task.matched_tools.map((m) => `
            <div style="background: var(--card, #18202B); padding: 8px 10px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <b style="color: var(--ink, #E8ECF4);">${escapeHtml(m.tool_name || m.tool_id)}</b>
                <span style="color: var(--muted, #8D97AA); font-size: 0.74rem; margin-left: 6px;">Score: ${(m.score != null ? m.score.toFixed(2) : '1.00')}</span>
                <div style="color: var(--muted, #8D97AA); font-size: 0.76rem; margin-top: 2px;">${escapeHtml(m.reason || 'Capability match')}</div>
              </div>
              <span class="tool-badge badge-blue">${escapeHtml(m.protocol || 'mcp')}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Execution Plan DAG
  if (task.execution_plan && planEl) {
    const plan = task.execution_plan;
    planEl.hidden = false;
    planEl.innerHTML = `
      <div style="background: var(--card-2, #1E2734); border: 1px solid var(--line, rgba(255,255,255,0.08)); border-radius: 8px; padding: 12px; font-size: 0.82rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h4 style="margin: 0; color: var(--ink, #E8ECF4);">Execution DAG Plan (${plan.steps?.length || 0} Steps)</h4>
          <span style="font-size: 0.72rem; color: var(--muted, #8D97AA);">
            v${plan.plan_version || 1} · Hash: <code title="${escapeHtml(plan.plan_hash || '')}">${escapeHtml(plan.plan_hash ? plan.plan_hash.slice(0, 10) + '...' : 'none')}</code>
          </span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${(plan.steps || []).map((s, idx) => `
            <div style="background: var(--card, #18202B); border: 1px solid var(--line, rgba(255,255,255,0.06)); border-radius: 6px; padding: 10px 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <b style="color: var(--ink, #E8ECF4);">${idx + 1}. ${escapeHtml(s.title || s.step_id)}</b>
                <span style="font-size: 0.75rem; color: var(--muted, #8D97AA);">Agent: <code>${escapeHtml(s.agent_id || 'claude-code')}</code> (${escapeHtml(s.protocol || 'agent_native')})</span>
              </div>
              <div style="color: var(--muted, #8D97AA); font-size: 0.76rem; margin-top: 4px; display: flex; justify-content: space-between;">
                <span>Permissions: <code>${escapeHtml(s.required_permissions?.join(', ') || 'none')}</code></span>
                <span>Depends on: <code>${escapeHtml(s.depends_on?.length ? s.depends_on.join(', ') : 'root')}</code></span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Trace Timeline
  if (task.trace?.length > 0 && traceEl) {
    traceEl.hidden = false;
    traceEl.innerHTML = `
      <h4 style="margin: 12px 0 6px 0; color: var(--ink, #E8ECF4); font-size: 0.88rem;">Execution Trace</h4>
      <div style="display: flex; flex-direction: column; gap: 4px; max-height: 220px; overflow-y: auto; font-size: 0.78rem;">
        ${task.trace.map((t) => `
          <div style="padding: 6px 10px; background: var(--card-2, #1E2734); border-radius: 4px; border-left: 3px solid var(--accent, #EF8A5F);">
            <div style="display: flex; justify-content: space-between;">
              <b style="color: var(--ink, #E8ECF4);">${escapeHtml(t.type || 'EVENT')}</b>
              <span style="color: var(--muted, #8D97AA); font-size: 0.72rem;">${new Date(t.timestamp).toLocaleTimeString()}</span>
            </div>
            <div style="color: var(--muted, #8D97AA); margin-top: 2px;">${escapeHtml(t.message || '')}</div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const setup = setupToolsView;
