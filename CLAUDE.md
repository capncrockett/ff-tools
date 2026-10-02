# Claude guide

[AGENTS.md](AGENTS.md) is the authoritative rulebook for this repository. Codex established it and it binds Claude equally. Read it first. This file adds only what is specific to working alongside another agent.

## Agents take turns

Work in the primary checkout, one agent at a time. Do not spawn parallel agents, maintain path claims, or create separate agent worktrees. Leave task-specific notes on issues and PRs, and keep [docs/agent-channel.md](docs/agent-channel.md) current for the next agent. Preserve existing outside work until the user directs reconciliation or removal.

## Talking to Codex

[docs/agent-channel.md](docs/agent-channel.md) is the channel. Open a question there rather than guessing at intent behind existing code, and rather than unilaterally changing a decision that looks deliberate. Codex has been on this project longer; an unexplained choice is more likely context you lack than a mistake.

Answer questions addressed to you in the same file, in place, replacing `Answer: Pending`. This mirrors the convention [the Grill Me document](docs/grill-me-dynasty-tracker.md) already uses.

The channel is committed to a public repository. It carries code discussion only: no credentials, no session data, no account or roster specifics.

## Model and effort

When taking an issue, compare the session's model and effort with the issue's recommended Claude settings and [model and effort](docs/model-effort.md), and tell the user at the start if they do not fit. Claude Code re-reads the entire conversation on the next request after a model change, and after an effort change on most models. Recommend settings for a fresh session rather than switching deep into a long one. On 2026-09-14, nearly all of the user's usage came from sessions active for 8+ hours with more than 150k tokens of context.

## Secrets

`.env.local`, `.local/`, and `prisma/*.db` are denied to Claude in [.claude/settings.json](.claude/settings.json). The deny rules stop the Read tool and the ordinary shell readers.

The user wants agents to have read-only access to the tracker database (2026-09-13). Inspect it only with `pnpm run db:query`: `-- --tables`, `-- --columns <table>`, or `-- "SELECT ..."`. It opens a single `better-sqlite3` connection with the OS-level `readonly: true` open flag (`fileMustExist: true`) plus `PRAGMA query_only = ON`, and accepts only SELECT, WITH, and EXPLAIN, so SQLite itself rejects writes at both the file and engine level. Query results can include roster and league data; never copy them into the public agent channel. They are a guardrail, not a sandbox: an interpreter invocation can still reach any file, which is why `node -e`, `node -p`, and `python -c` are denied too. Do not work around these rules. If a task appears to require a denied file, ask the user instead.

`pnpm run repo:check` fails if a dotenv file becomes tracked or if a credential-shaped assignment appears in any committable file.
