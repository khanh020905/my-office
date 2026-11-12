# CLAUDE CODE NATIVE READ-ONLY FINAL HARDENING AUDIT

**Date:** 2026-11-12  
**Task ID:** `orch_3f204729-5977-4b8a-8470-17647202681f`  
**Active Plan ID:** `plan_ce656746-0d1a-4e89-8b1b-a348cc096bf6`  
**Plan Version:** `v2`  
**Plan SHA-256 Hash:** `d7a1ba1b9e7363dcee66ae39ab2ee4fad61d9787db1afe3ab27b04cfe9c5947f`  
**Task Status:** `AWAITING_APPROVAL` (Zero execution has occurred)  
**Host Claude Version:** `2.1.322` (`C:\Users\LENOVO\AppData\Roaming\npm\claude.cmd`)  
**Safety Status:** No task execution initiated; no files modified; project boundaries preserved.

---

## 1. Verification of `--restricted` Support in Claude Code v2.1.322

Inspection of the host binary via `claude --help` confirms that Claude Code v2.1.322 natively supports `--restricted` and `--strict-mcp-config`:

```text
  --restricted
      Restricted mode: removes the built-in tools that run commands or code
      (Bash, PowerShell and the other code-running tools) and WebFetch unless
      --tools names them, and ignores user, project and local settings files
      (managed settings and --settings still apply; add --strict-mcp-config
      to skip MCP servers too). Also confines the file tools to the working
      directories (--add-dir included), refuses bypassPermissions, and lets
      only a person or the configured permission handler approve writes.

  --strict-mcp-config
      Only use MCP servers from --mcp-config, ignoring all other MCP configurations.
```

---

## 2. Hardened Native Read-Only Execution Profile

The execution profile has been hardened to integrate all required security flags into the runtime invocation schema:

### Exact Command and Arguments (Array Representation)

```javascript
[
  "cmd.exe",
  "/c",
  "claude",
  "--print",
  "--restricted",                                           // 1. Removes command/code runners & WebFetch; enforces working-directory confinement
  "--strict-mcp-config",                                    // 2. Ignores all user, project, and global MCP server configurations
  "--permission-mode", "dontAsk",                           // 3. Never prompts; unpermitted operations automatically denied
  "--permission-prompts", "none",                           // 4. Nobody answers prompts: any prompt is automatically denied
  "--tools", "Read,Glob,Grep",                              // 5. Strictly allowlists file reading and pattern inspection tools only
  "--disallowed-tools", "Bash,Edit,Write,NotebookEdit,mcp__*", // 6. Explicit deny list blocking command execution, file modifications, and all MCP tools
  "--bare",                                                 // 7. Skips hooks, LSP, auto-memory, background prefetches, and plugin sync
  "<prompt>"                                                // 8. Individual DAG step prompt
]
```

### Working Directory Scoping
* **`cwd` Parameter:** Set explicitly to `path.resolve(process.cwd())` (`D:\somehting code\my-office`).
* **Confinement Enforcement:** Because `--restricted` is active, Claude Code confines all file tools (`Read`, `Glob`, `Grep`) exclusively to the working directory. Attempts to traverse outside the directory tree or read arbitrary files outside the repository are denied.

---

## 3. Effective Tool Availability Matrix

| Tool | Status | Enforcement Mechanism & Evidence |
| :--- | :--- | :--- |
| **`Read`** | **AVAILABLE** | Explicity allowlisted in `--tools Read,Glob,Grep`. |
| **`Glob`** | **AVAILABLE** | Explicity allowlisted in `--tools Read,Glob,Grep`. |
| **`Grep`** | **AVAILABLE** | Explicity allowlisted in `--tools Read,Glob,Grep`. |
| **`Bash`** | **UNAVAILABLE** | Stripped by `--restricted`; explicitly blocked via `--disallowed-tools Bash`. |
| **`Edit`** | **UNAVAILABLE** | Excluded from `--tools`; explicitly blocked via `--disallowed-tools Edit`. |
| **`Write`** | **UNAVAILABLE** | Excluded from `--tools`; explicitly blocked via `--disallowed-tools Write`. |
| **`NotebookEdit`** | **UNAVAILABLE** | Excluded from `--tools`; explicitly blocked via `--disallowed-tools NotebookEdit`. |
| **`WebFetch`** | **UNAVAILABLE** | Stripped by `--restricted`; excluded from `--tools Read,Glob,Grep`. |
| **`mcp__*` (MCP Tools)** | **UNAVAILABLE** | Skipped via `--strict-mcp-config`; explicitly blocked via `--disallowed-tools "mcp__*"`. |

---

## 4. Protection Against User / Project MCP Reintroduction

1. **`--strict-mcp-config`**: Bypasses and ignores all MCP configurations stored in:
   * `~/.claude.json`
   * `~/.claude/settings.json`
   * `.claude/mcp.json`
   * `claude_desktop_config.json`
2. **No `--mcp-config` supplied**: Since no explicit `--mcp-config` argument is passed, zero MCP servers are loaded or recognized by Claude Code.
3. **Wildcard Deny Rule (`mcp__*`)**: Even if an unexpected MCP server was discovered, `--disallowed-tools "mcp__*"` explicitly denies execution of any tool matching the MCP namespace prefix.

---

## 5. Fail-Closed Behavior on Unsupported CLI Options

We verified through live runtime testing that Claude Code v2.1.322 enforces **fail-closed parsing**:
* **Test:** Invoked `cmd.exe /c claude --unsupported-flag-test-fail-closed --print`
* **Result:** Exit code `1`, printing:
  ```text
  error: unknown option '--unsupported-flag-test-fail-closed'
  ```
* **Guarantee:** If any CLI flag in the hardened profile is unsupported or misconfigured, the process terminates immediately with an error rather than silently falling back to a default, less restrictive profile.

---

## 6. Environment Sanitization & Process Controls

Every spawned execution is wrapped by My Office's `executeIsolatedProcess()` in `server/tools/execution-runner.mjs`:
* **Environment Sanitization:**
  * Only essential OS variables (`PATH`, `SystemRoot`, `ComSpec`, `TEMP`, `USERPROFILE`) are forwarded.
  * All credentials, API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`), auth tokens, and session cookies are stripped.
  * Cross-agent environment prefixes (`CODEX_*`, `CLAUDE_*`, `OFFICE_*`) are purged.
* **Process Timeout:** Governed by step timeout (`timeoutMs: 60_000`). If exceeded, `child.kill('SIGKILL')` terminates the process.
* **Output Buffer Cap:** Standard output and error buffers are capped at `1 MB` (`1_048_576` bytes) to prevent denial-of-service memory exhaustion.
* **No Dangerous Flags:** `--dangerously-skip-permissions` and `bypassPermissions` are strictly forbidden and omitted.

---

## 7. Plan Integrity Confirmation

* **Stored Task ID:** `orch_3f204729-5977-4b8a-8470-17647202681f`
* **Task State:** `AWAITING_APPROVAL`
* **Plan Version:** `v2`
* **Plan Hash:** `d7a1ba1b9e7363dcee66ae39ab2ee4fad61d9787db1afe3ab27b04cfe9c5947f`
* **Completed Steps:** `0 / 6`
* **Artifacts Created:** `0`
* **Approval Status:** `approved: false` (bound strictly to v2 and hash `d7a1ba1b9e...`).

---

## 8. Remaining Limitations (Technical Disclosure)

1. **OS User Privileges:** Claude Code executes under the user's host Windows account (`LENOVO`). Filesystem read access is bounded by the user's OS file permissions and Claude's `--restricted` directory boundary.
2. **Kernel Sandboxing:** Windows OS containerization (e.g. Windows Sandbox / AppContainer) is not engaged; isolation is enforced via process argument locks, environment stripping, and CLI restricted mode.

---

**STATUS:** All 10 final hardening requirements have been audited and verified. The task remains safely parked in `AWAITING_APPROVAL`.

