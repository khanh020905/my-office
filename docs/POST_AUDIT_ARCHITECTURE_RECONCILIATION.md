# POST-AUDIT ARCHITECTURE RECONCILIATION
**Document ID:** UTE-REC-001  
**Version:** 1.0.0  
**Status:** AUDIT-ONLY RECONCILIATION (Read-Only Inspection — Awaiting User Approval)  
**Date:** 2026-11-12  
**Inspected Paths:**
1. **My Office**: `D:\somehting code\my-office`
2. **AI Video Tool**: `D:\videoaitool`
3. **XUONGPHIM**: `D:\somehting code\xuongphim`

---

## 1. Verified Project Boundaries

A rigorous inspection of the file trees, build manifests, package configurations, and process models confirms that these are **three completely independent projects** with distinct responsibilities, tech stacks, and architectures:

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                           PROJECT BOUNDARY TOPOLOGY                            │
├──────────────────────────────┬────────────────────────┬────────────────────────┤
│ 1. MY OFFICE                 │ 2. AI VIDEO TOOL       │ 3. XUONGPHIM           │
│ D:\somehting code\my-office  │ D:\videoaitool         │ D:\somehting code\     │
│                              │                        │   xuongphim            │
├──────────────────────────────┼────────────────────────┼────────────────────────┤
│ Purpose: Central Management, │ Purpose: Specialized   │ Purpose: Automated     │
│ Orchestration & AI Tool      │ Operational Command    │ Video Rendering &      │
│ Registry Platform            │ Studio & Dashboard     │ Production Pipeline    │
├──────────────────────────────┼────────────────────────┼────────────────────────┤
│ Stack: Node.js ESM server,   │ Stack: Vite 8, React   │ Stack: Remotion, Node, │
│ Next.js 16, Three.js 0.160,  │ 19, Zustand 5,         │ Python 3, OpenCV,      │
│ App Router, Playwright       │ Tailwind 4, Oxlint     │ FFmpeg, Whisper, uv    │
├──────────────────────────────┼────────────────────────┼────────────────────────┤
│ Boundaries: Loopback HTTP,   │ Boundaries: Client-    │ Boundaries: File-based │
│ SSE, CLI runner child-proc,  │ side SPA talking to    │ project workspaces,    │
│ Git worktree sandboxes       │ REST `/api/v1/*`       │ `video_qa.py` CLI      │
└──────────────────────────────┴────────────────────────┴────────────────────────┘
```

### Clarified Boundaries
- **AI Video Tool (`D:\videoaitool`) does NOT belong to XUONGPHIM**. It is an independent Vite/React/Zustand client-side operational studio dashboard with 11 operational views (Overview, Trend Intelligence, Production Studio, Agent Control Center, Visual Animation Studio, Voice Studio, Video Editor, QA Center, Publishing Center, Cost Analytics, System Settings) designed to interface with a backend via `/api/v1/*` REST & WebSocket endpoints.
- **XUONGPHIM (`D:\somehting code\xuongphim`)** is a dedicated video generation and production pipeline containing Remotion video compositions (`PROJECTS/`, `VIDEO_TYPES/`), Python CLI QA tools (`tools/video_qa.py`), audio synthesis, and social media dispatchers (`Agent-Reach`).
- **My Office (`D:\somehting code\my-office`)** is the central orchestration and management platform. It must not absorb the source code, internal databases, or production pipelines of either XUONGPHIM or AI Video Tool.

---

## 2. My Office Files and Changes That Should Be Retained

### 2.1 The 11 Commits Ahead of `origin/main` (Strictly Retained)
All 11 commits ahead of `origin/main` represent verified milestone progress and must be preserved:
1. `10e6775` — `docs: production command center progress log (phase 0 baseline)`
2. `6ff842b` — `feat: normalised agent event model and /api/production/agents (phase 1)`
3. `242be0c` — `Production departments board in the HQ wing (Phase 2)`
4. `3a86426` — `Phase 3: production projects, stages and timeline from workspace files`
5. `791d7a1` — `Phase 4: video QA runner + findings API`
6. `68c8f82` — `Phase 5: production analytics API (real metrics only)`
7. `ac7d271` — `Phase 6: fix QA POST behind GET gate, env docs, final report`
8. `7f143d4` — `Phase 7: fix PID-cycle hang, keep QA report history, verification notes`
9. `5417bfd` — `docs: Phase 7 e2e results and failure triage`
10. `95133aa` — `fix(server): find Claude Code from a Windows npm install`
11. `ee2e3ac` — `Show Antigravity's agent as a worker while it works`

### 2.2 Working Tree Modifications That Should Be Retained
The uncommitted working tree modifications implement the validated multi-agent orchestration architecture and must NOT be reset or discarded:
- `server/workflows.mjs` — Recoverable DAG workflow scheduler with lease-based concurrency locking.
- `server/codex-runs.mjs` — Worktree-isolated Codex CLI runner with JSONL parsing and terminal state verification.
- `server/worktrees.mjs` — Git worktree lifecycle manager with safety checks preventing deletion of uncommitted/dirty trees.
- `server/codex-app-events.mjs` — Normalization filter for Codex desktop GUI lifecycle hooks.
- `server/tasks.mjs` — Claude Code task execution engine with background session support.
- `src/shared/agent-events.js` — Universal normalized agent event vocabulary (`agent.*`).
- `src/office/ui/task-sheet.js` — Multi-provider task dispatch UI for Claude and Codex CLI.
- `plugins/my-office-codex-hooks/` — Repo-local Codex App lifecycle hook plugin.
- `.agents/skills/my-office-orchestrator/` — Orchestrator skill and checkpoint management.
- Unit and acceptance tests (`tests/unit/workflows.test.mjs`, `codex-runs.test.mjs`, `codex-app-events.test.mjs`, `scripts/codex-write-acceptance.mjs`).
- `docs/architecture/` — Universal AI Ecosystem Phase 0 Audit and Implementation Plan.

---

## 3. Video-Specific Code Placement Assessment

An audit of video-specific logic across the three projects reveals the following misplacements and tight couplings:

### 3.1 Video Code Placed in My Office
1. **`server/production/projects.mjs`**:
   - Directly encodes video production pipeline definitions:
     `PIPELINES = { A: ['research', 'validation', ...], B: ['concept', ... ] }`
   - Hardcodes video artifact expectations: `script.txt`, `voiceover.mp3`, `words.json`, `shots.json`, `cast.js`, `preview.mp4`, `out/*.mp4`.
   - Directly scans the external workspace directory structure (`PROJECTS/`, `qa_reports/`).
2. **`server/production/qa.mjs`**:
   - Hardcodes execution of external Python script `tools/video_qa.py` and copies `findings.json` / `VIDEO_QA_REPORT.md`.
3. **`server/production/analytics.mjs`**:
   - Encodes video-specific QA pass rules: `qa.passRule = 'recommendation starts with PUBLISH'`.
4. **`server/index.mjs`**:
   - Exposes video-specific routes: `/api/production/projects`, `/api/production/qa`, `/api/production/analytics` directly at the top level of the generic server.
5. **Architectural Assessment**:
   - These modules make My Office directly dependent on XUONGPHIM's internal directory conventions.
   - **Reconciliation Plan**: In the Universal AI Tool Ecosystem, Ponytail/Video QA must be refactored into a **decoupled tool adapter** registered in the Universal Tool Registry, rather than hardcoded video-specific endpoints baked into the core office server.

### 3.2 Video Code Placed in XUONGPHIM
1. **`xuongphim/Agent-Reach/`**:
   - A full external tool for Chinese social platforms (WeChat, Bilibili) is embedded inside `xuongphim`.
2. **`xuongphim/tools/agentskills/`**:
   - A standalone repository checkout of `agentskills` sits inside `xuongphim/tools/`.
3. **Architectural Assessment**:
   - XUONGPHIM should remain focused on Remotion rendering, compositing, and production pipelines. External publishing and agent skill tools should be registered as separate tools in My Office rather than deeply nested within XUONGPHIM's repository tree.

### 3.3 Disconnect Between AI Video Tool and My Office / XUONGPHIM
- `D:\videoaitool` is currently a standalone frontend with mock backend fallback (`src/api/mockBackend.ts`), expecting a REST backend at `/api/v1/*`.
- Neither My Office nor XUONGPHIM currently serves `/api/v1/*`. My Office serves `/api/production/*`.
- Therefore, AI Video Tool is completely disconnected from real renders and is running purely on mock data.

---

## 4. Codex App Hook Privacy and All-Projects Scope Assessment

### 4.1 Current Hook Configuration
- `plugins/my-office-codex-hooks/hooks/hooks.json` registers 9 hooks:
  `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Stop`, `Interrupt`.
- Each hook executes `node "${PLUGIN_ROOT}/hooks/send.mjs"` and sends JSON via loopback to `127.0.0.1:4310/codex-app-event`.
- In Codex Desktop settings, when trusted, this plugin is active with **`All projects`** scope.

### 4.2 Privacy Risks Identified
1. **Machine-Wide Prompt Exfiltration**: Because the scope is `All projects`, whenever the user uses Codex Desktop for **any project** on their computer (including private personal projects, NDA work, or unrelated repos), `send.mjs` triggers on `UserPromptSubmit` and posts the full prompt text and `cwd` to My Office.
2. **Persistence in My Office Logs**: `server/index.mjs` ingests these events into `sessions`, normalized event feeds, and `data/replay/*.jsonl`, exposing private prompts in the 3D office group chat and activity feeds.
3. **Over-Broad Session Creation**: Unrelated coding sessions appear as 3D workers in the office, cluttering the workspace with unrelated tasks.

### 4.3 Positive Controls Already Present
- `send.mjs` explicitly **drops** tool inputs, tool outputs, diffs, and transcript paths:
  ```javascript
  const body = {
    hook_event_name: r.hook_event_name,
    session_id: r.session_id,
    cwd: r.cwd,
    model: r.model,
    prompt: r.hook_event_name === 'UserPromptSubmit' ? r.prompt : undefined,
    tool_name: r.tool_name,
    reason: r.hook_event_name === 'SessionEnd' ? r.reason : undefined,
  };
  ```
- `server/codex-app-events.mjs` validates an allowlist of 9 events and clamps payload sizes.

### 4.4 Recommended Safe Privacy Controls
- **Project-Level Whitelist**: In `send.mjs` or `server/codex-app-events.mjs`, check if `cwd` matches an authorized project path (from `data/projects.json`). If the `cwd` is outside allowed projects, drop the event immediately without processing or logging.
- **Privacy Setting in My Office**: Add a toggle in Settings: `"Only track My Office registered projects in Codex App"`.

---

## 5. Unapproved Budget Defaults Assessment

An audit across all three repositories revealed several hardcoded and unapproved budget values:

### 5.1 AI Video Tool (`D:\videoaitool`)
- **`src/api/fixtures.ts`**:
  - `budgetLimitUsd: 250.0`
  - `budget: { monthlyLimitUsd: 250, alertThresholdPct: 80, hardCutoffEnabled: true }`
- **`src/pages/SystemSettings.tsx`**:
  - Hardcodes default monthly budget to **`$250.00`** with an 80% alert threshold.
- **`src/ai/blueprints/archetypes.ts`**:
  - Hardcodes per-video budgets: Archetype A = `$2.00`, Archetype B = `$6.00`, Archetype C = `$12.00`, Archetype D = `$8.00`, Archetype E = `$3.00`, Archetype F = `$10.00`.
- **Assessment**: These values are mock defaults in the frontend; they do not trigger actual payments because no live billing API is integrated, but they must be user-configurable rather than hardcoded.

### 5.2 XUONGPHIM (`D:\somehting code\xuongphim`)
- **`.env.example`**:
  - Line 20: `MAX_VIDEO_BUDGET_USD=5`
  - Line 21: `MAX_PROJECT_BUDGET_USD=10`
- **Assessment**: These are commented defaults in `.env.example` and are not enforced by code.

### 5.3 My Office (`D:\somehting code\my-office`)
- **`server/otel.mjs`**:
  - Tracks Claude Code API cost from telemetry (`/v1/metrics`), but enforces **no spending cap**. It only displays burn rates and sends notifications when plan reset windows approach.
- **Assessment**: My Office does not make paid API calls directly; all model calls are dispatched via installed CLIs (`claude -p`, `codex exec`) using existing user subscriptions. There are no rogue automated payments in My Office.

---

## 6. Safe Correction Plan

The following phased correction plan reconciles the three projects without moving source code, losing commits, or breaking existing workflows:

### Phase A: Architecture Reconciliation & Adapter Decoupling (My Office)
1. **Preserve All Code & Commits**: Maintain the 11 commits ahead of `origin/main` and all uncommitted multi-agent orchestrator files.
2. **Decouple Video Logic into Tool Adapters**:
   - Refactor `server/production/qa.mjs` into a generic `Universal Tool Adapter` for Ponytail.
   - Decouple `server/production/projects.mjs` so video pipeline configurations are loaded dynamically from XUONGPHIM's manifest rather than hardcoded in My Office core.
3. **Codex Hook Privacy Gate**:
   - Update `server/codex-app-events.mjs` to filter events against `data/projects.json`. Ignore Codex App events from unrelated directories on the user's machine unless explicitly enabled.

### Phase B: Interface Contract Between Projects
1. **My Office ↔ XUONGPHIM**:
   - My Office communicates with XUONGPHIM solely via the Universal Tool Registry adapter (invoking `tools/video_qa.py` or Remotion render scripts via CLI).
   - XUONGPHIM retains its own internal pipelines, assets, and project folders.
2. **My Office ↔ AI Video Tool**:
   - If AI Video Tool needs telemetry or orchestration, My Office exposes a standardized `/api/v1/*` adapter or webhook interface.
   - Do not merge AI Video Tool's Vite source code into My Office's Next.js repository.

### Phase C: Budget Transparency
1. Make budget caps in all tools explicit and require zero-cost local modes by default.
2. Never trigger paid cloud generation without an explicit user confirmation dialog showing estimated costs.

---

## 7. Status & Sign-off

- **Audit Status**: Complete.
- **Source Code Alterations**: **ZERO**.
- **Configuration Alterations**: **ZERO**.
- **External API Calls**: **ZERO**.
- **Next Step**: Awaiting user approval of this reconciliation report before initiating any Phase 1 core architecture implementation.

