# Safety and approval policy

- Inspect Git status before edits. Preserve user changes, especially untracked `Microsoft/`. Never use destructive Git commands; never commit, push, or deploy.
- Do not change global Codex, Claude, OmniRoute, authentication, account, or credential configuration.
- Do not print or persist secrets, tokens, auth payloads, or full environment variables.
- Ask for approval before deletion/overwrite of user data, destructive database actions, credential changes, global configuration changes, meaningful dependency/security changes, production actions, commits/pushes/deploys, or weakening sandbox/security policies.
- Never modify source code automatically as a Ponytail finding fix. Findings require human approval; resolution requires verification.
- Use temp paths uniquely created for this workflow. Inspect exact targets before cleanup; never wildcard-delete. If cleanup is blocked, report an exact manual command.
- Treat Codex app-server as experimental until the installed interface says otherwise. Never attach to an active App session without approval and a supported documented mechanism.
- Keep CLI JSONL, App GUI, and app-server sources distinct. Normalize only semantics verified from actual payloads.
- If approval is required, stop dependent work, explain the source of the boundary, and retain safe independent progress.
