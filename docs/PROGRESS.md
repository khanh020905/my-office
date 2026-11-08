# AI Video Production Command Center — progress log

Resume from the last line marked **VERIFIED**.

## Phase 0 — baseline (2026-11-08) — VERIFIED

Repo: clone of https://github.com/khanh020905/my-office at `1df03ee` (v0.5.0). Node v22.18.0, `npm ci` clean.

| Check | Result |
|---|---|
| `npm test` (node --test, tests/unit) | 165 tests: 158 pass, 0 fail, 7 skipped (3 need sqlite3, 1 needs Swift, 3 need a live `claude` / inbox socket) |
| `npm run typecheck` (tsc --noEmit) | pass, 0 errors |
| `npm run lint` (eslint .) | pass, 0 warnings |
| e2e (playwright) | not run yet; needs a browser install and a running server |

### Reusable modules (extend these, don't duplicate them)

- **Event intake**: `server/index.mjs` `POST /event` → `onHook(p)` already maps every Claude Code hook (SessionStart/End, UserPromptSubmit, Pre/PostToolUse(+Failure), PermissionRequest, Notification, SubagentStart/Stop, Stop, StopFailure, PreCompact) to typed events built by `mk()`. Phase 1 adds a normalised view on top of these events, not a new hook or server.
- **Transport**: `broadcast()` → SSE `/stream` (snapshot + 20 s ping), `/api/live` long-poll backlog (400), replay files `data/replay/YYYY-MM-DD.jsonl` (kept 7 days).
- **Timeline**: `src/shared/timeline.js` `buildTimeline` + `/api/timeline`; page side `src/office/replay/timeline.js`.
- **Hook client**: `hooks/send.mjs` (never fails the hook; --async/--fast/--wait/--job).
- **3D**: `src/office/world/pro/wing.js` (4 department rooms × 2 pods), `people/workers.js`, `life/tests.js`; draw-call budget via `?debug`, `userData.noMerge` for moving parts.
- **Demo**: `src/office/demo/demo.js` (`?demo`). It is page-only and never goes through `broadcast`, so demo events stay out of replay history.
- **Safety**: `server/redact.mjs`, loopback checks (`isLoopback`), host allow-list, PIN, path validation.
- **i18n**: `src/i18n/locales/{en,vi}/<area>.js`, `tr()` / `t()`.

### Risks

1. `server/index.mjs` is ~3.5k lines, so new logic goes in separate modules (`server/production/*.mjs`) with a thin hook-in to keep merge conflicts with upstream small.
2. Video QA runs `py -3.14 tools/video_qa.py` from the xuongphim workspace. Spawning Python from the server must use a fixed argv (no shell), loopback only, and validated paths inside an allow-listed root.
3. No upstream concept of a "video project", Type A/B or a "stage", so these must come from real files or explicit events, never from guesses (spec: no fake progress).
4. Bundle and draw-call growth in the 3D scene.
5. ~~Spec not received~~ — resolved: the full spec (sections 1–18) is `spec.md` in the parent session's notes folder.

## Phase 1 — normalised event and agent model (2026-11-08) — VERIFIED

- `src/shared/agent-events.js`: `normalize(e)` maps the office's own events to spec §7 `agent.*` kinds with a `source` (`execution`, or `inferred` for edit/write that was asked for but not confirmed on disk). `createAgentModel()` tracks main sessions and subagents (`sess:agentId`, parent link) with honest states running / reviewing / waiting / blocked / done / failed / unknown (no event for 10 min → unknown, never running).
- Dedup by event id; late events count but never move state back; demo events refused; agent cap evicts the stalest. Recovery: `load(feed)` from the saved state after a restart.
- Server hook-in (4 lines): import, `agentModel.load(feed)` after state load, `agentModel.ingest(e)` in onHook's emit block, `GET /api/production/agents` (behind the existing auth check).
- Checks: `npm test` 171 tests (164 pass, 7 skipped, 0 fail; 6 new in `tests/unit/agent-events.test.mjs`), typecheck pass, lint pass. The route has not been hit on a live server yet.
- Not in this phase: `agent.file_created` (no hook distinguishes create from modify), `production.*` and `video.*` events (Phases 3–4).

## Phase 2 — 3D departments — VERIFIED (2026-11-08)
- `src/shared/departments.js`: 10 production departments (director, research, script, storyboard, visual, animation, audio, editing, qa, library) and `deptOf(event)`, which places an event by agent type or description keywords. An event it can't place gets `null` and is never guessed. The agent model now stores `dept`.
- `world/pro/wing.js`: a production directory board above the HQ sign. It shows only with the HQ flag, uses noMerge, and redraws only when the counts change. Each row shows the department, then active / in review / failed counts, or an idle mark.
- `life/departments.js`: a page-side agent model fed from `onEvent` (incidents.js). It redraws at most once a second, and every 30 s so stale agents drop off. Counts come from real events only. Demo events show on the page and are never stored.
- Locales: en and vi `world.dept.dir/idle/active/review/failed/names.*`.
- Checks: `npm test` ran 174 tests (167 pass, 7 skipped, 0 fail; 3 new in `tests/unit/departments.test.mjs`); typecheck and lint pass. The board has not been looked at in a browser yet.
- Known limit: the page model fills only from events after the page loads, so the board starts idle until new activity arrives.

## Phase 3 — production workflow and timeline (server side) — VERIFIED (2026-11-08)
- `server/production/projects.mjs`: a read-only scan of the video workspace set in `OFFICE_VIDEO_WORKSPACE` (`~` allowed). Projects are `PROJECTS/<slug>/` and `<studio>/projects/<slug>/` folders that hold a `config.json`. Symlinks are skipped, JSON reads are capped at 5 MB, and the scan stops at 200 projects. If the variable is unset or isn't a folder, the API returns `{ configured: false }` and no sample data.
- Type comes only from `config.json` `"type": "A" | "B"`. A project without it is unclassified: `type: null`, `stages: null`. Type A and Type B each keep their own §5 stage list, and each stage depends on the one before it.
- Stage status is file-system state. A stage is `done` when its artifact exists:
  - script: `input/script.txt`
  - voiceover: `input/voiceover.*`
  - storyboard: `story/shots.json`
  - visual_bible: `story/bible.md`
  - character_bible: `scenes/cast.js`
  - visualization / assets: `scenes/sets/`
  - animation: `scenes/shots/`
  - editing: `out/*.mp4`
  - qa: `qa_reports/<mp4 stem>/findings.json`
  
  It is `missing` when that file is absent. Research, validation and concept are always `unknown`, since no file proves them. Editing shows `running` only while `build/final_render.log` is under 2 min old and newer than the MP4.
- Each project lists its artifacts (path and mtime), its QA result (total, recommendation, severity counts, report path), its revisions from `out/revisions/revisions.json`, and a timeline of artifact times and revisions sorted by time.
- Route: `GET /api/production/projects`, behind the existing auth check.
- Checks: `npm test` ran 177 tests (170 pass, 7 skipped, 0 fail; 3 new in `tests/unit/projects.test.mjs`). Typecheck and lint pass. Against the real xuongphim folder it finds 7 projects, and what-if-360-vision shows QA 90.4 and 2 revisions. None of the 7 sets `type`, so all are unclassified until their config says A or B.
- Not done: no page panel for projects yet; an `outdated` state when an upstream file is newer than a downstream one; per-task agent history joined to projects (no event links an agent to a project yet).

## Phase 4 — video QA runner (server side) — VERIFIED (2026-11-08)
- `server/production/qa.mjs`: `projectQa(ws, id)` returns a project's latest render and its findings from `qa_reports/<stem>/findings.json` (time, severity, category, issue, fix, status, source). Evidence paths are dropped and the list is capped at 300.
- `createQaRunner()` runs the workspace's own `tools/video_qa.py` on that render. The request sends only a project id, and the video path comes from the project scan and must be inside the workspace. It uses a fixed argv with no shell, allows one run at a time, kills a run after 30 min and keeps a 2000-char tail of output. Python is `py -3.14` on Windows, or `OFFICE_VIDEO_QA_PYTHON`.
- Route `/api/production/qa`: `GET ?project=` returns the run status and findings. `POST {project}` starts a run and must be loopback, same-origin and JSON. Every start or refusal is written to the action log.
- Only the read-only QA run is offered. `--revision` and `--approve` stay on the command line, because the approval is the user's decision.
- Checks: `npm test` ran 179 tests (172 pass, 7 skipped, 0 fail; 2 new in `tests/unit/qa.test.mjs`), and typecheck and lint pass. Against the real workspace, what-if-360-vision shows 22 findings, and projects without a report show none.
- Not done: no review-studio panel on the page yet, and a real QA spawn through the live server has not been tested.

## Phase 5 — analytics (server side) — VERIFIED (2026-11-08)
- `server/production/analytics.mjs` `analytics(projects, agents)` builds its figures from the project scan and the live agent model. Route `GET /api/production/analytics` sits behind the existing auth check.
- Per project:
  - the span from its first file to its last (wall-clock, not working time)
  - render count and last render time
  - revisions
  - QA total and recommendation
- QA: projects reviewed and passed, and the pass rate. A pass means the recommendation starts with `PUBLISH`. Recommendations are listed as written, plus severity totals.
- Agents: states, active, completed and failed counts, plus tool calls, tool failures and files touched since the office started recording.
- Tokens, cost and render duration come back as `null` with a reason under `unavailable`. No hook reports tokens, and the renderer writes no start time.
- Checks:
  - `npm test`: 180 tests (173 pass, 7 skipped, 0 fail; 1 new in `tests/unit/analytics.test.mjs`).
  - Typecheck and lint pass.
  - On the real workspace: 1 of 1 reviewed projects passes, 2 revisions, and what-if-360-vision spans 12 h.

## Phase 6 — hardening and docs — VERIFIED (2026-11-08)
- Bug fix: `POST /api/production/qa` sat after the server's GET-only gate, so it always returned 405. It now sits before the gate and also needs the PIN (`authorized()`), like `/api/todos`.
- README env table: `OFFICE_VIDEO_WORKSPACE` and `OFFICE_VIDEO_QA_PYTHON`.
- Live smoke test (`node server/index.mjs --dev`, port 4399, real xuongphim workspace):
  - GET `/api/production/agents`, `/projects`, `/qa`, `/analytics` all return 200.
  - POST `/qa` checks: form content type → 403; `../x` → 400 unknown_project; a real project → 200 running; a second POST while running → 409 busy.
  - A real QA run on what-if-360-vision finished with code 0 in about 43 s, scoring 100.0/100 "PUBLISH AFTER MANUAL REVIEW" (3 manual checks). The project scan then showed the new total.
- Checks: `npm test` 180 tests (173 pass, 7 skipped, 0 fail), typecheck pass, lint pass.

## Final report against spec §17
Status: **verified** = checked by a test or a live run; **partial** = server side only, or not checked in a browser; **not done**.

| Area | Criterion | Status |
|---|---|---|
| Agents | Real sessions appear | verified (hook events → agent model, `/api/production/agents`) |
| | Real subagents identified | verified (SubagentStart/Stop, `sess:agentId`) |
| | Parent-child links correct | verified (unit test) |
| | Statuses from real events | verified (unit test; no event for 10 min → unknown) |
| | Task handoffs recorded | partial (subagent start/stop with description; no explicit handoff event exists) |
| | Failures visible | verified (tool failures, StopFailure → failed) |
| 3D | Departments accessible | partial (directory board on the HQ wall; not checked in a browser) |
| | Agents have visual roles | partial (agents mapped to departments; no new avatars) |
| | Animations reflect real activity | partial (board counts come from real events; existing worker animations unchanged) |
| | Inspect agents / camera / responsive | unchanged existing features; no e2e run |
| Video production | Type A and B independent | verified (separate stage lists; type only from `config.json`) |
| | Stages visible | partial (API only; no page panel) |
| | Real artifacts registered | verified (file scan of the real workspace) |
| | Render state accurate | verified (MP4 mtime; `running` only while the render log is fresh) |
| | Video preview works | not done |
| Video QA | Real MP4s inspected | verified (live run through the server) |
| | Technical defects reported | verified (findings with severity) |
| | Visual review linked to timestamps | verified (findings carry `time`) |
| | Audio checks | verified (from the workspace's `video_qa.py`) |
| | Revisions assigned | partial (read from `revisions.json`; assigning is CLI-only, `--revision`) |
| | Corrected output re-reviewed | partial (re-run QA via POST; approval is CLI-only, `--approve`) |
| Reliability | Existing features and hooks work | verified (all upstream tests pass; hooks untouched) |
| | No duplicate event processing | verified (dedup by event id, unit test) |
| | No fake live data | verified (demo never ingested; missing metrics are `null` with a reason) |
| | No critical security regression | verified (loopback, same-origin, JSON, PIN on the one POST; fixed argv, no shell; paths inside the workspace) |
| | No unresolved critical test failures | verified (0 fail; 7 skips are environment-only) |

Delivery: implementation in `server/production/`, `src/shared/agent-events.js`, `src/shared/departments.js`, `src/office/life/departments.js`. Architecture notes are in this file. Install, startup and configuration are in the README (`npm ci`, `npm start` or `node server/index.mjs --dev`, env table). Test results are above.

Known gaps and risks:
- No page panels for projects, QA review or analytics, and no video preview; the data is API-only.
- The 3D board has not been checked in a browser, and no e2e test has run.
- `agent.file_created` can't be told apart from a modify; tokens, cost and render duration are unavailable.
- None of the 7 real projects sets `type`, so all are unclassified until their `config.json` says A or B.
- A QA run overwrites the project's previous report (that is how `video_qa.py` works).

