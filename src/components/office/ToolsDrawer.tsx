// AI Tools Ecosystem Drawer: GitHub Tool Discovery, Static Inspection, Lifecycle Management, Multi-Agent Distribution & Registry.
// Static markup: src/office/ui/tools-view.js finds these elements by id and controls interactivity.
export default function ToolsDrawer() {
  return (
    <aside className="drawer drawer--tools" id="dr-tools" hidden aria-label="AI Tools">
      <header className="dr-head">
        <div className="dr-title">
          <h2>AI Tools Ecosystem</h2>
          <p id="tools-status">Universal Discovery, Lifecycle &amp; Multi-Agent Distribution</p>
        </div>
        <button className="icon-btn" type="button" data-close aria-label="Close">
          <span data-icon="x"></span>
        </button>
      </header>

      {/* Primary Navigation - 7 Semantic Tabs */}
      <div className="tools-nav-bar" role="tablist" id="tools-tabs">
        <button className="tools-nav-btn tab is-active" type="button" role="tab" data-tt="overview" aria-selected="true">
          Overview
        </button>
        <button className="tools-nav-btn tab" type="button" role="tab" data-tt="discover" aria-selected="false">
          Discover
        </button>
        <button className="tools-nav-btn tab" type="button" role="tab" data-tt="tools" aria-selected="false">
          Tools
        </button>
        <button className="tools-nav-btn tab" type="button" role="tab" data-tt="agents" aria-selected="false">
          Agents
        </button>
        <button className="tools-nav-btn tab" type="button" role="tab" data-tt="distribution" aria-selected="false">
          Distribution
        </button>
        <button className="tools-nav-btn tab" type="button" role="tab" data-tt="security" aria-selected="false">
          Security
        </button>
        <button className="tools-nav-btn tab" type="button" role="tab" data-tt="orchestration" aria-selected="false">
          Orchestration
        </button>
      </div>

      <div className="dr-body" id="tools-body">
        {/* 1. OVERVIEW TAB */}
        <div className="tools-pane" id="pane-tools-overview">
          <div className="tools-section" style={{ borderLeft: '4px solid var(--accent, #EF8A5F)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <b style={{ fontSize: '1.05rem', color: 'var(--ink, #E8ECF4)' }}>Universal AI Tool Ecosystem</b>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>
                  Phases 1–7 Architecture Active · Managed Shared Tool Storage · Multi-Agent Distribution
                </p>
              </div>
              <span className="tool-badge badge-green" id="overview-env-badge">Online</span>
            </div>
          </div>

          <div className="tools-metric-grid" id="overview-metrics-grid">
            <div className="tools-metric-card">
              <span className="val" id="stat-tools-installed">--</span>
              <span className="lbl">Installed Tools</span>
            </div>
            <div className="tools-metric-card">
              <span className="val" id="stat-agents-detected">--</span>
              <span className="lbl">Detected Agents</span>
            </div>
            <div className="tools-metric-card">
              <span className="val" id="stat-security-grants">--</span>
              <span className="lbl">Active Grants</span>
            </div>
            <div className="tools-metric-card">
              <span className="val" id="stat-orch-tasks">--</span>
              <span className="lbl">Orchestrations</span>
            </div>
          </div>

          <div className="tools-section">
            <h3 className="tools-section-title">Quick Actions</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
              <button type="button" className="tools-subnav-btn btn-jump-tab" data-target="discover" style={{ textAlign: 'left', padding: '10px 12px' }}>
                <b style={{ display: 'block', color: 'var(--ink, #E8ECF4)' }}>Inspect GitHub Repo</b>
                <span style={{ fontSize: '0.74rem', color: 'var(--muted, #8D97AA)' }}>Scan manifests, license &amp; capabilities</span>
              </button>
              <button type="button" className="tools-subnav-btn btn-jump-tab" data-target="tools" style={{ textAlign: 'left', padding: '10px 12px' }}>
                <b style={{ display: 'block', color: 'var(--ink, #E8ECF4)' }}>Manage Installed Tools</b>
                <span style={{ fontSize: '0.74rem', color: 'var(--muted, #8D97AA)' }}>Lifecycle, health checks, rollback</span>
              </button>
              <button type="button" className="tools-subnav-btn btn-jump-tab" data-target="distribution" style={{ textAlign: 'left', padding: '10px 12px' }}>
                <b style={{ display: 'block', color: 'var(--ink, #E8ECF4)' }}>Agent Distribution Matrix</b>
                <span style={{ fontSize: '0.74rem', color: 'var(--muted, #8D97AA)' }}>Expose tools via junctions &amp; MCP</span>
              </button>
              <button type="button" className="tools-subnav-btn btn-jump-tab" data-target="orchestration" style={{ textAlign: 'left', padding: '10px 12px' }}>
                <b style={{ display: 'block', color: 'var(--ink, #E8ECF4)' }}>Task Orchestration</b>
                <span style={{ fontSize: '0.74rem', color: 'var(--muted, #8D97AA)' }}>Automated tool selection &amp; DAG execution</span>
              </button>
            </div>
          </div>

          <div className="tools-section">
            <h3 className="tools-section-title">Ecosystem Architecture &amp; Boundaries</h3>
            <div style={{ fontSize: '0.82rem', color: 'var(--muted, #8D97AA)', lineHeight: '1.5' }}>
              <p style={{ margin: '0 0 8px 0' }}>
                <strong style={{ color: 'var(--ink, #E8ECF4)' }}>Project Isolation:</strong> My Office, XUONGPHIM, and AI Video Tool operate as three strictly independent projects. Shared managed storage is partitioned with symlinks and NTFS junctions.
              </p>
              <p style={{ margin: 0 }}>
                <strong style={{ color: 'var(--ink, #E8ECF4)' }}>Security Boundary:</strong> Windows environment isolation operates via application-level policy enforcement, sub-process environment scrubbing, and directory jailing.
              </p>
            </div>
          </div>
        </div>

        {/* 2. DISCOVER TAB */}
        <div className="tools-pane" id="pane-tools-discover" hidden>
          <div className="tools-subnav-bar">
            <button className="tools-subnav-btn is-active" id="btn-subnav-inspect" type="button">
              Inspect Repository
            </button>
            <button className="tools-subnav-btn" id="btn-subnav-candidates" type="button">
              Discovered Candidates (<span id="count-candidates">0</span>)
            </button>
          </div>

          {/* Subview 1: Inspector */}
          <div id="subview-discover-inspect">
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <input
                id="tool-github-url"
                className="tools-input"
                type="url"
                placeholder="Enter GitHub Repository URL (e.g. https://github.com/owner/repo)..."
                aria-label="GitHub Repository URL"
                autoComplete="off"
                spellCheck={false}
                style={{ flex: 1 }}
              />
              <button id="btn-inspect-tool" type="button" className="tb-btn" style={{ padding: '0 18px', fontWeight: 600, background: 'var(--accent, #EF8A5F)', color: '#fff' }}>
                Inspect
              </button>
            </div>

            <div id="tool-inspect-loading" hidden style={{ padding: '16px', background: 'var(--card, #18202B)', borderRadius: '8px', color: 'var(--muted, #8D97AA)', marginBottom: '16px' }}>
              Static inspection in progress (parsing manifests, AST, security rules, protocols, licenses)...
            </div>

            <div id="tool-inspect-error" hidden style={{ padding: '12px', background: 'rgba(255, 95, 95, 0.12)', color: '#FF7B7B', border: '1px solid rgba(255, 95, 95, 0.3)', borderRadius: '8px', marginBottom: '16px' }}></div>

            <div id="tool-inspect-report" hidden></div>
          </div>

          {/* Subview 2: Discovered Candidates */}
          <div id="subview-discover-candidates" hidden>
            <div id="tools-candidates-list">
              <p className="muted">Loading discovered tools...</p>
            </div>
          </div>
        </div>

        {/* 3. TOOLS (REGISTRY) TAB */}
        <div className="tools-pane" id="pane-tools-tools" hidden>
          <div className="tools-filter-bar">
            <input
              id="tool-search-input"
              className="tools-input"
              type="search"
              placeholder="Filter tools by name, description, capability..."
              aria-label="Search tools"
              style={{ flex: '1 1 200px' }}
            />
            <select id="tool-filter-category" className="tools-select" aria-label="Filter by category">
              <option value="">All Categories</option>
            </select>
            <select id="tool-filter-protocol" className="tools-select" aria-label="Filter by protocol">
              <option value="">All Protocols</option>
              <option value="mcp">MCP Server</option>
              <option value="cli">CLI Command</option>
              <option value="skill">Agent Skill</option>
              <option value="hook">Hook</option>
              <option value="api">API Endpoint</option>
            </select>
            <select id="tool-filter-status" className="tools-select" aria-label="Filter by status">
              <option value="">All Statuses</option>
              <option value="healthy">Healthy</option>
              <option value="disabled">Disabled</option>
              <option value="failed">Degraded / Failed</option>
            </select>
          </div>

          <div id="tools-registry-list">
            <p className="muted">Loading registry...</p>
          </div>
        </div>

        {/* 4. AGENTS TAB */}
        <div className="tools-pane" id="pane-tools-agents" hidden>
          <div className="tools-section">
            <h3 className="tools-section-title">Supported AI Agent Runtimes</h3>
            <p style={{ margin: '0 0 12px 0', color: 'var(--muted, #8D97AA)', fontSize: '0.82rem' }}>
              Detected local AI agent environments, native integration mechanisms, skills directories, and MCP configuration targets.
            </p>
            <div id="tools-agents-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p className="muted">Scanning agent runtime environments...</p>
            </div>
          </div>
        </div>

        {/* 5. DISTRIBUTION TAB */}
        <div className="tools-pane" id="pane-tools-distribution" hidden>
          <div className="tools-section">
            <h3 className="tools-section-title">Multi-Agent Compatibility &amp; Distribution Matrix</h3>
            <p style={{ margin: '0 0 12px 0', color: 'var(--muted, #8D97AA)', fontSize: '0.82rem' }}>
              Expose installed tools from shared managed storage to multiple agents via NTFS junctions, skills manifests, and native configuration adapters.
            </p>
            <div id="tools-distribution-matrix">
              <p className="muted">Loading compatibility matrix...</p>
            </div>
          </div>

          <div className="tools-section">
            <h3 className="tools-section-title">Active Tool Distributions</h3>
            <div id="tools-distribution-list">
              <p className="muted">Loading active distributions...</p>
            </div>
          </div>
        </div>

        {/* 6. SECURITY & PERMISSIONS TAB */}
        <div className="tools-pane" id="pane-tools-security" hidden>
          <div className="tools-section" id="tools-security-limitations-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <b style={{ fontSize: '0.9rem', color: 'var(--ink, #E8ECF4)' }}>Security Architecture &amp; Boundary Disclosure</b>
              <span className="tool-badge badge-blue">Policy Gate</span>
            </div>
            <div id="tools-security-limitations" style={{ fontSize: '0.8rem', color: 'var(--muted, #8D97AA)', lineHeight: '1.45' }}>
              Loading security disclosure...
            </div>
          </div>

          <div id="tools-security-overview" style={{ marginBottom: '16px' }}>
            <p className="muted">Loading security overview...</p>
          </div>

          <div className="tools-section">
            <h3 className="tools-section-title">Active Permission Grants</h3>
            <div id="tools-security-permissions-list">
              <p className="muted">Loading permissions...</p>
            </div>
          </div>

          <div className="tools-section">
            <h3 className="tools-section-title">5-Level Policy Hierarchy</h3>
            <div id="tools-security-policies-list">
              <p className="muted">Loading policy rules...</p>
            </div>
          </div>

          <div className="tools-section">
            <h3 className="tools-section-title">Security Audit Stream</h3>
            <div id="tools-security-audit-list">
              <p className="muted">Loading audit events...</p>
            </div>
          </div>
        </div>

        {/* 7. DYNAMIC ORCHESTRATION TAB */}
        <div className="tools-pane" id="pane-tools-orchestration" hidden>
          <div className="tools-section">
            <h3 className="tools-section-title">Dynamic Task Orchestration Workspace</h3>
            <p style={{ margin: '0 0 12px 0', color: 'var(--muted, #8D97AA)', fontSize: '0.82rem' }}>
              Autonomous capability matching, DAG plan generation, and policy-gated execution across Claude Code, Codex CLI, Codex App, and Antigravity.
            </p>

            <div className="tools-filter-bar" style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 200px' }}>
                <label htmlFor="orch-workspace-select" style={{ fontSize: '0.74rem', color: 'var(--muted, #8D97AA)' }}>Target Workspace</label>
                <select id="orch-workspace-select" className="tools-select">
                  <option value="D:\\somehting code\\my-office">My Office (Current Workspace)</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '0 1 140px' }}>
                <label htmlFor="orch-mode-select" style={{ fontSize: '0.74rem', color: 'var(--muted, #8D97AA)' }}>Execution Mode</label>
                <select id="orch-mode-select" className="tools-select">
                  <option value="read_only">Read-Only (Strict)</option>
                  <option value="safe_write">Safe Write (Supervised)</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '0 1 160px' }}>
                <label htmlFor="orch-agent-select" style={{ fontSize: '0.74rem', color: 'var(--muted, #8D97AA)' }}>Agent Preference</label>
                <select id="orch-agent-select" className="tools-select">
                  <option value="">Auto-Select Best Match</option>
                  <option value="claude-code">Claude Code</option>
                  <option value="codex-cli">Codex CLI</option>
                  <option value="codex-app">Codex App</option>
                  <option value="antigravity">Antigravity</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <textarea
                id="orch-task-input"
                className="tools-input"
                rows={3}
                placeholder="Describe your task (e.g., 'Inspect the repository code, run unit tests, and review git diff')..."
                aria-label="Task Prompt"
                style={{ width: '100%', resize: 'vertical' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button id="btn-orch-submit" type="button" className="tb-btn" style={{ padding: '6px 18px', fontWeight: 600, background: 'var(--accent, #EF8A5F)', color: '#fff' }}>
                  Analyze &amp; Plan Task
                </button>
              </div>
            </div>

            <div id="orch-status-container" hidden style={{ marginBottom: '14px' }}></div>
            <div id="orch-analysis-container" hidden style={{ marginBottom: '14px' }}></div>
            <div id="orch-matches-container" hidden style={{ marginBottom: '14px' }}></div>
            <div id="orch-plan-container" hidden style={{ marginBottom: '14px' }}></div>
            <div id="orch-trace-container" hidden style={{ marginBottom: '14px' }}></div>
          </div>
        </div>

        {/* INSTALLATION APPROVAL MODAL */}
        <div id="tools-approval-modal" hidden style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card, #18202B)', color: 'var(--ink, #E8ECF4)', border: '1px solid var(--line-2, rgba(255,255,255,0.15))', width: '92%', maxWidth: '640px', borderRadius: '10px', padding: '24px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 id="modal-tool-title" style={{ marginTop: 0, fontSize: '1.15rem' }}>Review Tool Installation Plan</h3>
            <div id="modal-plan-content"></div>
            <div style={{ margin: '16px 0', padding: '12px', background: 'rgba(239, 138, 95, 0.08)', border: '1px solid rgba(239, 138, 95, 0.3)', borderRadius: '6px', fontSize: '0.82rem' }}>
              <label style={{ display: 'flex', gap: '8px', cursor: 'pointer', alignItems: 'center' }}>
                <input type="checkbox" id="modal-approval-checkbox" />
                <span><b>I explicitly approve this installation</b> with the restricted isolation environment and permissions listed above.</span>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button id="modal-btn-cancel" className="tb-btn" type="button">Cancel</button>
              <button id="modal-btn-confirm" className="tb-btn" type="button" disabled style={{ background: '#2e7d32', color: '#fff', fontWeight: 600 }}>Approve &amp; Install</button>
            </div>
          </div>
        </div>

        {/* DISTRIBUTION APPROVAL MODAL */}
        <div id="tools-dist-approval-modal" hidden style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card, #18202B)', color: 'var(--ink, #E8ECF4)', border: '1px solid var(--line-2, rgba(255,255,255,0.15))', width: '92%', maxWidth: '640px', borderRadius: '10px', padding: '24px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 id="modal-dist-title" style={{ marginTop: 0, fontSize: '1.15rem' }}>Approve Agent Tool Distribution</h3>
            <div id="modal-dist-content"></div>
            <div style={{ margin: '16px 0', padding: '12px', background: 'rgba(61, 220, 132, 0.08)', border: '1px solid rgba(61, 220, 132, 0.3)', borderRadius: '6px', fontSize: '0.82rem' }}>
              <label style={{ display: 'flex', gap: '8px', cursor: 'pointer', alignItems: 'center' }}>
                <input type="checkbox" id="modal-dist-checkbox" />
                <span><b>I explicitly approve exposing this tool to the target agent</b> using the native configuration and file junctions shown.</span>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button id="modal-dist-btn-cancel" className="tb-btn" type="button">Cancel</button>
              <button id="modal-dist-btn-confirm" className="tb-btn" type="button" disabled style={{ background: 'var(--accent, #EF8A5F)', color: '#fff', fontWeight: 600 }}>Approve &amp; Distribute</button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
