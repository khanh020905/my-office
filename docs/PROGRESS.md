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

