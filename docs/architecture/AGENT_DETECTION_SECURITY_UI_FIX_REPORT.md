# My Office — Agent Detection & Security API Bug Fix Report

**Date:** 2026-11-12  
**Location:** `D:\somehting code\my-office`  
**Status:** COMPLETE — ALL REQUIREMENTS DIAGNOSED, REPAIRED & VERIFIED  

---

## 1. Root Cause Analysis

### 1.1 Agent Detection Discrepancy
- **Defect:** The Agents UI previously displayed all integrations as `NOT FOUND`, despite Claude Code (v2.1.322) and Codex CLI (v0.167.0) being installed on the Windows host.
- **Root Causes:**
  1. **Data Nesting Mismatch:** The distribution engine (`distribution-engine.mjs`) returned agent environment data inside an `environment` sub-object (`agent.environment.detected`), whereas the frontend (`tools-view.js`) read `agent.detected` and `agent.executable_path` directly on the top-level object, evaluating to `undefined` (false).
  2. **Windows Wrapper & Path Invisibility:** Standard Node.js `execFile('claude')` without Windows extension resolution failed because global npm tools on Windows are installed as `.cmd` or `.bat` batch wrappers (`%APPDATA%\npm\claude.cmd`, `%APPDATA%\npm\codex.cmd`).
  3. **Superficial Detection Logic:** Prior detection logic only performed boolean directory existence checks (`fs.existsSync(home)`) without verifying actual binary existence, running version probe executions, or distinguishing between configured directories and functional runtimes.

### 1.2 Security API Error (`e.map is not a function`)
- **Defect:** Navigating to the Security tab caused an immediate crash rendering: `Error loading security data: e.map is not a function`.
- **Root Cause:**
  - The endpoint `GET /api/tools/security/policies` returned an **Object** document schema:
    ```json
    {
      "ok": true,
      "policies": {
        "version": "1.0.0",
        "default_action": "DENY",
        "globally_denied_scopes": ["secrets:write"],
        "explicit_denies": [...],
        "agent_policies": {...},
        "tool_policies": {...}
      }
    }
    ```
  - The frontend `tools-view.js` executed `const policies = polData.policies || []; policies.map(...)`.
  - Because `policies` is a plain JavaScript Object (not an Array), `policies.map()` threw a runtime `TypeError: policies.map is not a function` (minified/bundled as `e.map is not a function`).
  - Furthermore, all 5 security endpoints were wrapped inside a single monolithic `Promise.all` + `try...catch` block, causing this single policy contract error to abort the rendering of overview metrics, permission grants, and audit events.

---

## 2. Exact API Response Contracts

### 2.1 `GET /api/tools/distribution/agents`
Returns normalized top-level agent properties and retains `environment` for backward compatibility:
```json
{
  "ok": true,
  "agents": [
    {
      "agent_id": "claude-code",
      "name": "Claude Code",
      "version": "2.1.322 (Claude Code)",
      "detected": true,
      "status": "FUNCTIONALLY_VERIFIED",
      "statuses": ["SUPPORTED", "PRESENT", "CONFIGURED", "DETECTED", "VISIBLE", "FUNCTIONALLY_VERIFIED"],
      "verification_level": 3,
      "executable_path": "C:\\Users\\LENOVO\\AppData\\Roaming\\npm\\claude.cmd",
      "config_path": "C:\\Users\\LENOVO\\.claude\\settings.json",
      "skills_dir": "C:\\Users\\LENOVO\\.claude\\skills",
      "supported_protocols": ["skill", "mcp", "cli"],
      "evidence": "Executable: C:\\Users\\LENOVO\\AppData\\Roaming\\npm\\claude.cmd · Version: 2.1.322 (Claude Code) · Config: C:\\Users\\LENOVO\\.claude\\settings.json · Skills: C:\\Users\\LENOVO\\.claude\\skills",
      "detection_error": null,
      "environment": { ... }
    },
    {
      "agent_id": "codex-cli",
      "name": "Codex CLI",
      "version": "codex-cli 0.167.0",
      "detected": true,
      "status": "FUNCTIONALLY_VERIFIED",
      "statuses": ["SUPPORTED", "PRESENT", "DETECTED", "VISIBLE", "FUNCTIONALLY_VERIFIED"],
      "verification_level": 3,
      "executable_path": "C:\\Users\\LENOVO\\AppData\\Roaming\\npm\\codex.cmd",
      "config_path": null,
      "skills_dir": "C:\\Users\\LENOVO\\.codex\\skills",
      "supported_protocols": ["skill", "mcp", "cli"],
      "evidence": "Executable: C:\\Users\\LENOVO\\AppData\\Roaming\\npm\\codex.cmd · Version: codex-cli 0.167.0 · Skills: C:\\Users\\LENOVO\\.codex\\skills",
      "detection_error": null,
      "environment": { ... }
    },
    {
      "agent_id": "codex-app",
      "name": "Codex App (Desktop)",
      "version": "1.0.0",
      "detected": true,
      "status": "CONFIGURED",
      "statuses": ["SUPPORTED", "PRESENT", "CONFIGURED", "NOT_VERIFIED"],
      "verification_level": 1,
      "executable_path": null,
      "config_path": null,
      "plugins_dir": "C:\\Users\\LENOVO\\.codex\\plugins",
      "skills_dir": "C:\\Users\\LENOVO\\.codex\\skills",
      "supported_protocols": ["skill", "hook"],
      "evidence": "Desktop GUI executable not found (NOT_VERIFIED) · Plugins directory: C:\\Users\\LENOVO\\.codex\\plugins · Skills directory: C:\\Users\\LENOVO\\.codex\\skills",
      "detection_error": "Desktop GUI application not installed in standard location",
      "environment": { ... }
    },
    {
      "agent_id": "antigravity",
      "name": "Antigravity",
      "version": "1.0.0",
      "detected": true,
      "status": "CONFIGURED",
      "statuses": ["SUPPORTED", "PRESENT", "CONFIGURED", "NOT_VERIFIED"],
      "verification_level": 1,
      "executable_path": "C:\\Users\\LENOVO\\.gemini\\antigravity\\bin\\agentapi.bat",
      "config_path": null,
      "skills_dir": "C:\\Users\\LENOVO\\.gemini\\antigravity\\skills",
      "mcp_dir": "C:\\Users\\LENOVO\\.gemini\\antigravity\\mcp",
      "supported_protocols": ["skill", "mcp"],
      "evidence": "Standalone CLI binary (agy/antigravity) not found on PATH (NOT_VERIFIED) · Home: C:\\Users\\LENOVO\\.gemini\\antigravity · AgentAPI: C:\\Users\\LENOVO\\.gemini\\antigravity\\bin\\agentapi.bat · Skills: C:\\Users\\LENOVO\\.gemini\\antigravity\\skills · MCP: C:\\Users\\LENOVO\\.gemini\\antigravity\\mcp",
      "detection_error": "Standalone CLI not installed on global PATH",
      "environment": { ... }
    },
    {
      "agent_id": "generic-mcp",
      "name": "Generic MCP Client",
      "version": "1.0.0",
      "detected": false,
      "status": "SUPPORTED",
      "statuses": ["SUPPORTED", "NOT_FOUND"],
      "verification_level": 0,
      "executable_path": null,
      "config_path": null,
      "supported_protocols": ["mcp"],
      "evidence": "Virtual adapter for Model Context Protocol (MCP) export; external host MCP client configuration file not detected",
      "detection_error": "No external MCP client configuration found on host",
      "environment": { ... }
    }
  ]
}
```

### 2.2 `GET /api/tools/security/policies`
Returns both the policy document object `policies` and the normalized 5-level array `rules`:
```json
{
  "ok": true,
  "policies": {
    "version": "1.0.0",
    "default_action": "DENY",
    "globally_denied_scopes": ["secrets:write"],
    "explicit_denies": [...],
    "agent_policies": {...},
    "tool_policies": {...}
  },
  "rules": [
    { "level": 1, "name": "Global Default Stance", "scope": "*", "action": "DENY", "description": "Default fail-closed stance: all unapproved operations denied" },
    { "level": 2, "name": "Global Blacklist: secrets:write", "scope": "secrets:write", "action": "DENY", "description": "Globally prohibited across all tools and agents" },
    { "level": 3, "name": "deny_system_root_write", "scope": "fs:write", "target": "C:\\Windows\\System32", "action": "DENY", "description": "Block write access to Windows system directory" },
    { "level": 4, "name": "Agent Policy: claude-code", "scope": "fs:read, fs:write, ...", "action": "ALLOW", "description": "Scopes permitted for agent claude-code" },
    { "level": 5, "name": "Tool Restriction: untrusted-tool", "scope": "process:exec", "action": "DENY", "description": "Blocked capabilities for tool untrusted-tool" }
  ]
}
```

### 2.3 `GET /api/tools/security/permissions`
Enriches each grant with tool registry presence:
```json
{
  "ok": true,
  "count": 6,
  "permissions": [
    {
      "permission_id": "perm_528070cf-ad7f-4246-ae70-a174f675dce7",
      "tool_id": "eslint-tool",
      "agent_id": "claude-code",
      "granted_scopes": ["fs:read"],
      "grant_timestamp": "2026-11-12T02:45:59.055Z",
      "expiration": null,
      "revocation_status": "active",
      "is_expired": false,
      "tool_installed": false,
      "tool_status": "uninstalled",
      "is_orphaned": true,
      "approval_reference": "appr-auto"
    }
  ]
}
```

---

## 3. Permission Grant Data Integrity Findings

| Tool ID | Agent ID | Granted Scopes | Installation Status | Origin & Nature | Classification |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `eslint-tool` | `claude-code` | `fs:read` | Uninstalled | Phase 5 Security Verification Suite | **Orphaned Test Grant** |
| `eslint-tool` | `claude-code` | `fs:read` | Uninstalled | Phase 6 Orchestration Verification | **Orphaned Test Grant** |
| `primary-tool` | `claude-code` | `fs:read` | Uninstalled | Phase 5 Fallback Verification | **Orphaned Test Grant** |
| `backup-tool` | `claude-code` | `fs:read` | Uninstalled | Phase 5 Fallback Verification | **Orphaned Test Grant** |
| `doc-gen-tool` | `claude-code` | `fs:read` | Uninstalled | Phase 6 Multi-tool Workflow Test | **Orphaned Test Grant** |
| `primary-tool` | `claude-code` | `fs:read, process:exec` | Uninstalled | Phase 7 Acceptance Scenario Test | **Orphaned Test Grant** |

- **Integrity Assessment:** None of the 6 grants represent corrupted data. They are legitimate historical grants created during Phase 5, Phase 6, and Phase 7 test runs.
- **UI Treatment:** The UI now displays clear, independent status indicators:
  - **Tool Status:** `<span class="tool-badge badge-amber">Orphaned (Tool Uninstalled)</span>` (or `Installed Tool` when present).
  - **Permission Status:** `<span class="tool-badge badge-green">Active Grant</span>` (or `Revoked` / `Expired`).
  - No permission records were deleted or altered automatically.

---

## 4. Overview Metrics Integrity

| Metric | Displayed Value | True Backend Source | Explanation |
| :--- | :---: | :--- | :--- |
| **Installed Tools** | **0** | `data/tools/registry.json` (`tools: []`) | Zero external tools are currently installed in managed storage (clean baseline). |
| **Detected Agents** | **4** (repaired from 0) | `/api/tools/distribution/agents` | Claude Code (Verified), Codex CLI (Verified), Codex App (Configured), Antigravity (Configured). |
| **Active Grants** | **6** | `data/tools/permission-registry.json` | 6 historical test grants remain active. |
| **Orchestrations** | **50** | `data/orchestration/orchestration-tasks.json` (`limit=50` query) | 50 tasks retrieved out of 100 total persisted verification runs. |

---

## 5. Files Changed

1. **`server/tools/adapters/base-adapter.mjs`**:
   - Added Windows-aware binary resolver `findHostBinary(name)`.
   - Added safe version execution prober `probeBinaryVersion(binPath, args)`.
2. **`server/tools/adapters/claude-adapter.mjs`**:
   - Probes `claude.cmd --version`, returns `FUNCTIONALLY_VERIFIED` (Level 3), executable path, config path, skills directory, and evidence.
3. **`server/tools/adapters/codex-cli-adapter.mjs`**:
   - Probes `codex.cmd --version`, returns `FUNCTIONALLY_VERIFIED` (Level 3), executable path, skills directory, and evidence.
4. **`server/tools/adapters/codex-app-adapter.mjs`**:
   - Detects plugin/skills directory presence, verifies desktop GUI executable absence, returns `CONFIGURED` / `NOT_VERIFIED` (Level 1).
5. **`server/tools/adapters/antigravity-adapter.mjs`**:
   - Detects `agentapi.bat` and skills directory, verifies standalone CLI absence on PATH, returns `CONFIGURED` / `NOT_VERIFIED` (Level 1).
6. **`server/tools/adapters/generic-mcp-adapter.mjs`**:
   - Returns `SUPPORTED` (Level 0) with explicit notice that external client config was not detected.
7. **`server/tools/distribution-engine.mjs`**:
   - Normalized `getDetectedAgents()` to return top-level `status`, `statuses`, `verification_level`, `executable_path`, `config_path`, `skills_dir`, `evidence`, `detection_error`.
8. **`server/index.mjs`**:
   - Passed `registry: toolRegistry` to `handleToolSecurityRoutes`.
9. **`server/tools/security-api.mjs`**:
   - Enriched permissions list with `tool_installed`, `tool_status`, `is_orphaned`.
   - Returned `rules` 5-level array alongside `policies` object in `/api/tools/security/policies`.
10. **`src/office/ui/tools-view.js`**:
    - Rewrote `loadSecurityOverview()` with decoupled try/catch blocks for Overview, Permissions, Policies, and Audit.
    - Handled both object and array policies safely (completely eliminating `e.map is not a function`).
    - Rewrote `loadAgentsView()` to render accurate status badges (`FUNCTIONALLY VERIFIED`, `CONFIGURED (NOT VERIFIED)`, etc.), paths, and evidence.
    - Updated `loadOverview()` to count verified/detected/configured agents accurately.
11. **`tests/unit/tools-agent-detection.test.mjs`**:
    - Comprehensive unit test suite for Windows agent detection, status calculation, and honest verification.
12. **`tests/unit/tools-security-shapes.test.mjs`**:
    - Comprehensive unit test suite for all Security API response schemas, orphaned tool detection, and policy hierarchy rules.

---

## 6. Verification Results

- **`node --test tests/unit/tools-agent-detection.test.mjs`**: PASS (7/7 tests passed).
- **`node --test tests/unit/tools-security-shapes.test.mjs`**: PASS (5/5 tests passed).
- **`node --test tests/unit/tools-*.test.mjs`**: PASS (97/97 tests passed across 11 suites).
- **`npm run typecheck`**: PASS (0 TypeScript errors).
- **`npm run lint`**: PASS (0 errors, 0 warnings).
- **`npm test`**: PASS (318 passed, 0 failed, 8 skipped across 326 tests).
- **`node scripts/smoke.mjs`**: PASS (`All good.`).
- **Live Server Test (`http://localhost:4310`)**:
  - `GET /api/tools/distribution/agents`: Claude Code and Codex CLI returned as `FUNCTIONALLY_VERIFIED` with versions `2.1.322` and `0.167.0`; Codex App and Antigravity returned as `CONFIGURED (NOT VERIFIED)`.
  - `GET /api/tools/security/policies`: Returned both `policies` (object) and `rules` (11-item 5-level array).
  - `GET /api/tools/security/permissions`: Returned all 6 grants cleanly marked as `is_orphaned: true` and `tool_installed: false`.

---

## 7. Remaining Limitations

1. **Codex App GUI Execution:** On this Windows machine, Codex is installed as a CLI tool (`codex.cmd`), but no standalone Codex desktop GUI application (`Codex.exe`) is present in standard `%LOCALAPPDATA%\Programs\Codex`. It is accurately classified as `CONFIGURED (NOT VERIFIED)`.
2. **Antigravity Standalone CLI:** Google Antigravity runtime files and internal `agentapi.bat` are present in `~/.gemini/antigravity`, but no standalone global CLI (`agy.cmd` / `antigravity.exe`) is available on system `PATH`. It is accurately classified as `CONFIGURED (NOT VERIFIED)`.
3. **External MCP Clients:** No `claude_desktop_config.json` was detected on the host; Generic MCP client adapter remains ready for on-demand configuration exports.

