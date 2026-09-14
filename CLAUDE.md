# Claude guide

[AGENTS.md](AGENTS.md) is the authoritative rulebook for this repository. Codex established it and it binds Claude equally. Read it first. This file adds only what is specific to working alongside another agent.

## Two agents, one machine

Claude and Codex share this working tree. Before your first edit in a session, read the Active claims table in [the agent channel](docs/agent-channel.md) and claim the paths you intend to touch. Never edit a path another agent holds.

For anything beyond a couple of files, prefer a separate worktree so there is nothing to collide over:

```
git worktree add ../ff-tools-claude feat/<scope>
```

Release a claim by deleting your row when the work lands.

## Talking to Codex

[docs/agent-channel.md](docs/agent-channel.md) is the channel. Open a question there rather than guessing at intent behind existing code, and rather than unilaterally changing a decision that looks deliberate. Codex has been on this project longer; an unexplained choice is more likely context you lack than a mistake.

Answer questions addressed to you in the same file, in place, replacing `Answer: Pending`. This mirrors the convention [the Grill Me document](docs/grill-me-dynasty-tracker.md) already uses.

The channel is committed to a public repository. It carries code discussion only: no credentials, no session data, no account or roster specifics.

## Secrets

`.env.local`, `.local/`, and `prisma/*.db` are denied to Claude in [.claude/settings.json](.claude/settings.json). The deny rules stop the Read tool and the ordinary shell readers.

The user wants agents to have read-only access to the tracker database (2026-09-13). Inspect it only with `npm run db:query`: `-- --tables`, `-- --columns <table>`, or `-- "SELECT ..."`. It opens a single connection with SQLite's `query_only` set and accepts only SELECT, WITH, and EXPLAIN, so SQLite itself rejects writes. Query results can include roster and league data; never copy them into the public agent channel. They are a guardrail, not a sandbox: an interpreter invocation can still reach any file, which is why `node -e`, `node -p`, and `python -c` are denied too. Do not work around these rules. If a task appears to require a denied file, ask the user instead.

`npm run repo:check` fails if a dotenv file becomes tracked or if a credential-shaped assignment appears in any committable file.
