# UNIVERSAL AI TOOL ECOSYSTEM — FULL ARCHITECTURE AUDIT
**Document ID:** UTE-AUD-001  
**Version:** 1.0.0  
**Status:** PHASE 0 COMPLETE (Audit Only — Read-Only Inspection)  
**Date:** 2026-11-12  
**Target Repository:** `my-office` (`d:\somehting code\my-office`)

---

## 1. Executive Summary & Audit Scope

My Office is undergoing a strategic architectural expansion to evolve from an agent monitoring and work-dispatching 3D dashboard into a **Universal AI Tooling and Agent Orchestration Platform**.

This audit conducts a deep, read-only architectural investigation across all 18 mandatory inspection dimensions specified in the Master Architecture Prompt. It establishes the authoritative baseline for Phase 0, documents existing working integrations (including Claude Code, Codex CLI, Codex App Hooks, Ponytail, and video production adapters), identifies critical architectural gaps, and formulates the blueprint for a multi-agent, multi-protocol Universal AI Tool Ecosystem.

### Preservation Invariants
1. **Existing AI Tools & Agents Must Not Be Broken**: Claude Code sessions, Codex CLI worktree tasks, Codex App hooks, and 3D Three.js office models must continue operating seamlessly.
2. **Multi-Project Boundaries Must Be Respected**: `My Office`, `XUONGPHIM`, and `AI Video Tool` remain three strictly independent projects. My Office communicates with external workspaces via decoupled adapters, APIs, and CLI runners—never by absorbing external source code or pipeline state.
3. **Configuration & Data Safety**: User configuration (`~/.claude/settings.json`, `~/.codex/`, `data/`) must never be clobbered or silently overwritten. Backups and atomic merges are mandatory.
4. **Zero Phase 0 Source Changes**: No application code, schemas, or configurations were altered during this audit.

---

## 2. Deep System Audit by Inspection Area

### 2.1 Entire Project Structure & Tech Stack
- **Framework & Runtime**:
  - Node.js ESM (`"type": "module"`, Node `>=20.9`, running Node 22.18.0 / npm 10.9.3 on Windows 10/11 x64).
  - Next.js `16.4.3` (App Router) with React `19.2.4` and TypeScript `5.9.3`.
  - 3D Engine: `three.js` (`0.160.0`).
  - Testing: Node test runner (`node --test`), Playwright `1.56.1`, ESLint `9.38.0`.
- **Top-Level Layout**:
  - `app/`: Next.js App Router entry points (`page.tsx`, `layout.tsx`, `panel/page.tsx`).
  - `server/`: Plain Node.js ESM server modules (`index.mjs`, `system.mjs`, `workflows.mjs`, `codex-runs.mjs`, `tasks.mjs`, `vault.mjs`, etc.).
  - `src/office/`: Vanilla JS Three.js 3D engine, scene graphs, characters, furniture, overlays, and event handlers.
  - `src/components/`: Static React components mounting HTML containers (`TopBar`, `SessionRail`, `Stage`, `ActivityPanel`, `OfficeBoot`).
  - `src/shared/`: Shared normalization, event typing, and business utilities (`agent-events.js`, `prompt-coach.js`, `timeline.js`).
  - `data/`: Single-user JSON storage, replay logs (`.jsonl`), vault gzipped conversations (`.json.gz`), and Codex accounts.
  - `plugins/`: Plugin bundles such as `my-office-codex-hooks/`.
  - `.agents/`: Agent marketplace manifests and orchestration skills (`my-office-orchestrator/`).
  - `bin/`: CLI launcher (`bin/cli.mjs`) and background daemon managers (`bin/service.mjs`).

### 2.2 Frontend Architecture & Navigation Patterns
- **Rendering Model**:
  - Static Server Components emit structural DOM skeletons once (`OfficeBoot.tsx` triggers `startOffice()` dynamically).
  - High-performance UI driven by Direct DOM manipulation inside `src/office/ui/` with explicit caching, event delegation, and Three.js canvas overlays.
  - React re-rendering is intentionally minimized to sustain 60 FPS Three.js rendering loops with bounded memory.
- **Navigation Structure**:
  - TopBar (`src/components/office/TopBar.tsx`) provides brand, system clocks, 2D/3D view switches, Mac health pill, Plan limits card, Chat toggle, Replay toggle, and Settings dropdown (`SettingsPanel.tsx`).
  - Modals and drawers slide out dynamically: `SessionDrawer`, `MacDrawer`, `BurnDrawer`, `VaultDrawer`, `PhoneModal`, `WrappedModal`.
  - Chat & Task Sheet: `src/office/ui/task-sheet.js` opens from the group chat to dispatch tasks to Claude and Codex.
- **AI Tools Navigation Insertion Point**:
  - A dedicated `AI Tools` navigation entry and tab panel can seamlessly integrate into TopBar (as a top-level action button alongside Plan and Chat) and within `SettingsPanel` / a new `ToolsDrawer` (`src/components/office/ToolsDrawer.tsx`), reusing existing drawer and modal CSS classes (`src/styles/drawers.css`, `modal.css`).

### 2.3 Backend Architecture & Server Endpoints
- **HTTP/SSE Server (`server/index.mjs`)**:
  - Custom Node HTTP server wrapping Next.js request handler (`nextApp.getRequestHandler()`).
  - Loopback-only enforcement for sensitive endpoints (`isLoopback(req)`).
  - Server-Sent Events (`/stream`) pushes live session states, tool executions, agent turns, and system metrics.
  - Core API Routes:
    - `/api/live`: Initial session snapshot + event stream sync.
    - `/api/tasks`: Claude task dispatch (`POST`), allowance, and status (`GET`).
    - `/api/codex/runs`: Codex CLI runs (`GET` list, `POST` execute, `POST /stop`).
    - `/api/workflows`: DAG workflow orchestration (`GET` list, `POST` create, `/start`, `/cancel`, `/retry`).
    - `/api/production/qa`: Video QA integration invoking external Python tool `video_qa.py`.
    - `/api/production/agents`: Normalized multi-agent snapshot.
    - `/api/agents`: Agent provider truthfulness report (`claude`, `codex-cli`, `antigravity`).
    - `/hook/*`: Synchronous and asynchronous Claude Code hooks (`/hook/loop`, `/hook/bind`, `/hook/question`, `/hook/permission`).
    - `/codex-app-event`: Ingestion endpoint for Codex App desktop lifecycle hooks.

### 2.4 Database & Persistence Layer
- **Current Approach**:
  - File-based JSON persistence in `data/` (`state.json`, `prefs.json`, `projects.json`, `codex-runs.json`, `workflows.json`).
  - Concurrency control: Atomic temporary file writes (`tmp` file + `fs.renameSync`) and exclusive lockfiles with process heartbeat leases (`server/workflows.mjs`).
  - Vault history: `data/vault/c/<uuid>.json.gz` with an inverted keyword search index (`data/vault/index.json`).
  - Codex SQLite DBs: `data/codex/34568213c6/*.sqlite` (used by Codex internally for goals, memories, logs, state; My Office inspects accounts without corrupting internal tables).
- **Assessment**:
  - Excellent for zero-dependency single-user desktop deployments.
  - However, for the **Universal AI Tool Registry**, a structured, versioned schema with indexed queries, dependency trees, capability matching, and migration tracking is required.

### 2.5 Existing AI Tools & Skills Modules
- **Codex System Skills (`data/codex/34568213c6/skills/.system/`)**:
  - `imagegen`: Python CLI scripts for OpenAI image generation and chroma-key removal.
  - `openai-docs`: Documentation and model migration manuals.
  - `review-agent`: Prompt and PR review agent persona.
  - `skill-creator`: Python scripts (`init_skill.py`, `generate_openai_yaml.py`, `quick_validate.py`) for standard `SKILL.md` authoring.
  - `skill-installer`: Python script (`install-skill-from-github.py`, `github_utils.py`) that downloads skills from GitHub URLs, extracts them into `$CODEX_HOME/skills`, and validates YAML frontmatter.
- **Current Limitation**:
  - Skills are siloed inside Codex's home directory. Claude Code cannot discover them; Antigravity cannot discover them; there is no universal cross-agent registry or lifecycle state machine.

### 2.6 Existing AI Agents Module
- **Supported Providers**:
  - **Claude Code**: Full hook integration (`hooks/hooks.json`), process spawning (`claude -p`), background sessions (`claude --bg`), session resume/forking, and OpenTelemetry burn tracking.
  - **Codex CLI**: Isolated Git worktree execution (`codex exec --json --sandbox workspace-write`), JSONL stream parsing, process monitoring, artifact validation.
  - **Codex App (Desktop)**: Lifecycle hook plugin (`plugins/my-office-codex-hooks/`) streaming real-time desktop GUI events to `POST /codex-app-event`.
  - **Antigravity**: Account quota and multi-account state tracking (`server/antigravity-accounts.mjs`). Process dispatch is marked as `NOT VERIFIED` in provider status to ensure truthfulness.
- **Agent Normalization (`src/shared/agent-events.js`)**:
  - Standard event vocabulary: `agent.started`, `agent.tool_started`, `agent.tool_completed`, `agent.tool_failed`, `agent.file_created`, `agent.file_modified`, `agent.awaiting_approval`, `agent.turn_started`, `agent.execution_ended`, etc.

### 2.7 Existing Ponytail Integration
- **Nature of Ponytail**:
  - Ponytail is a specialized Video QA and render review capability originally developed in the `xuongphim` workspace (`xuongphim/tools/video_qa.py`).
  - In My Office, `server/production/qa.mjs` provides an API adapter (`POST /api/production/qa`) that executes `tools/video_qa.py` against project renders in `OFFICE_VIDEO_WORKSPACE`.
  - It maintains execution history, copies `findings.json` and `VIDEO_QA_REPORT.md` into `data/qa_history/`, bounds execution to 30 minutes, and isolates runs without shell injection risks.
- **Status**:
  - Functional as an external backend QA runner.
  - Not yet modeled as a first-class tool inside a Universal Tool Registry.

### 2.8 Existing Graphify Integration
- **Status in Current Tree**:
  - **Not currently integrated in application source code**.
  - Graphify is a codebase knowledge graph / visual call-graph extraction tool identified as a prime candidate for Code Intelligence and Context Optimization in Phase 5 of the ecosystem.
  - Verified that no competing or conflicting graph implementation exists in `my-office`.

### 2.9 Existing Claude & Codex Workflows
- **Workflows Engine (`server/workflows.mjs`)**:
  - Validated DAG scheduler with cycle detection, prerequisite dependency gating, max concurrency limits (default: 2), and exclusive lockfile leases.
  - Providers currently wired: `claude` and `codex-cli`.
  - Tasks can pass declared artifacts (`expectedArtifacts`) across worktrees safely via copy-isolated sandboxes (`server/worktrees.mjs`).
  - Recoverable state: On server restart, active tasks recover gracefully to `interrupted`.

### 2.10 Existing Security & Permissions
- **Loopback Enforcement**: Sensitive routes reject non-loopback requests unless an authenticated phone token/PIN is present.
- **Redaction (`server/redact.mjs`)**: Masks tokens, API keys, and sensitive environmental secrets before serializing to disk or broadcasting over SSE.
- **Execution Isolation**: Codex runs are isolated in ephemeral Git worktrees (`server/worktrees.mjs`). Dirty main repositories cannot be cleaned or destroyed.
- **PreToolUse Hook Safety (`server/loops.mjs`, `server/overlap.mjs`)**: Intercepts stuck loops and cross-session file write overlaps before changes hit the disk.

---

## 3. Preservation Invariants Matrix

| Component | Location | Role | Preservation Mandate |
|---|---|---|---|
| **Claude Code Hooks** | `hooks/`, `server/index.mjs` | Live session ingestion, SSE streaming | **Strictly preserve**. Do not change hook payload contracts. |
| **Codex CLI Runner** | `server/codex-runs.mjs` | Worktree isolation, JSONL stream parsing | **Strictly preserve**. Worktree safety rules are mandatory. |
| **Codex App Hook** | `plugins/my-office-codex-hooks/` | Desktop app event streaming | **Strictly preserve**. Keep loopback hook endpoint functional. |
| **Workflow Engine** | `server/workflows.mjs` | DAG task orchestration and state locks | **Extend, do not replace**. Add tool assignment and capability matching. |
| **Video QA Runner** | `server/production/qa.mjs` | External Ponytail/Video QA execution | **Strictly preserve**. Expose Ponytail as a registered tool capability. |
| **3D Three.js Office** | `src/office/` | 3D visual office world, characters, desks | **Strictly preserve**. Optimization and frame budgets must not degrade. |
| **Vault & History** | `server/vault.mjs`, `data/vault/` | Conversation backup and prompt coaching | **Strictly preserve**. Historical gzipped files must remain intact. |
| **OpenTelemetry Burn** | `server/otel.mjs`, `server/otel-setup.mjs` | Plan limit tracking, token/cost analysis | **Strictly preserve**. OTLP receiver endpoints must stay active. |

---

## 4. Architectural Gap Analysis

| Capability Required | Current My Office State | Architecture Gap |
|---|---|---|
| **Universal Tool Registry** | No unified registry. Tools are ad-hoc scripts or agent-specific skills in `data/codex/`. | Need unified schema with tool ID, version, capabilities, protocols, dependencies, and health. |
| **GitHub Discovery & Onboarding** | Ad-hoc Python script in Codex system skills (`install-skill-from-github.py`). | Need static code/license/security scanner, manifest detector, and UI onboarding pipeline. |
| **Multi-Protocol Tool Support** | Only direct CLI spawn and agent-specific hooks supported. | Need support for MCP (stdio/SSE), CLI wrappers, Agent Skills (`SKILL.md`), and HTTP/REST APIs. |
| **Universal Distribution Engine** | Tools must be manually configured per agent. | Need shared managed store (`data/tools/installed/`) with agent adapters (Claude, Codex, Antigravity). |
| **Tool Lifecycle State Machine** | Ad-hoc file extraction; no state machine, rollback, or version pinning. | Need 15-state lifecycle engine (`Discovered` -> `Installed` -> `Healthy` -> `Rollback`). |
| **Capability Matching in Workflows** | Workflow tasks only specify `provider` (`claude` or `codex-cli`). | Need task-to-capability dynamic discovery, ranking, and minimal tool injection. |
| **Dedicated AI Tools UI** | Only Task Sheet modal with provider radio buttons. | Need dedicated AI Tools view with Discovery, Installed Tools, Categories, Skills, and MCP tabs. |
| **Tool Permissions & Security** | Static allowlists in hooks. No user permission approval dialog for tool capabilities. | Need granular permission manifest (network, filesystem, shell, env) with user consent gates. |

---

## 5. Security & Isolation Audit

1. **Static Analysis Before Execution**: Discovery of GitHub repositories must never execute `npm install`, `pip install`, `setup.py`, or arbitrary build scripts during inspection. Inspection must be strictly static (parsing `package.json`, `pyproject.toml`, `SKILL.md`, `mcp.json`, and AST/regex scanning).
2. **Permission Boundary**: Every tool must declare required scopes:
   - `fs:read`, `fs:write` (with directory boundary constraints)
   - `net:outbound` (with domain allowlists)
   - `process:exec` (with exact binary allowlists)
   - `env:read` (explicit variable names only, secret masking via `server/redact.mjs`)
3. **Managed Storage Sandboxing**: Tools are downloaded and installed into `data/tools/managed/<tool-id>/<version>/`. Agents access tools via symlinks or managed configuration adapters—never by granting tools full access to the host or modifying user-owned configurations destructively.

---

## 6. Baseline Verification & Test Evidence

As part of this audit, full test suites and code health checks were executed:
- `npm test`: **PASS** (216 passed, 0 failed, 8 skipped due to host environment).
- `npm run typecheck`: **PASS** (`tsc --noEmit` exited with code 0).
- `npm run lint`: **PASS** (`eslint .` exited with code 0).
- `git status`: Working copy preserved intact; no files modified or deleted during Phase 0.

