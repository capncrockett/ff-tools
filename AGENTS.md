# Agent guide

FF Tools is currently focused on the Dynasty Value Tracker. Keep other experiments intact; their TODOs do not authorize more features.

## Workflow

Adapted from Grundle Ball's current AGENTS.md and docs/agent-workflow.md (2026-09-04).

1. Check `git status --short --branch` and run `npm run doctor`. Preserve user edits.
2. Read [the decision document](docs/grill-me-dynasty-tracker.md), [architecture](docs/architecture.md), and [workflow](docs/agent-workflow.md). An unanswered recommendation is an assumption, not user approval. When uncertain about user intent, scope, or source semantics, read the relevant repository docs and agent channel first. Then check authoritative internet sources when the question is externally verifiable, or ask the user. State uncertainty plainly, and never record an inference as user-confirmed.
3. Keep pure calculations in `src/shared`, provider access in `src/server/providers`, persistence in services, and rendering in `src/web`.
4. Prefer DaisyUI and accessible, dense, responsive interfaces. Label data freshness, missing observations, and provisional interpretations.
5. Use fixture-based tests while developing. Never contact paid providers from tests, builds, doctor, or page reloads.
6. Run `npm run verify -- --e2e` before every commit and handoff. The user asked on 2026-09-13 for e2e runs early and often, not only for visible UI changes. Do not bypass checks or hooks.
7. Commit, push, merge, or deploy only when asked. Feature branches use `feat/<scope>`. Releases use `release/MAJOR.MINOR.PATCH` with the root package version as canonical. See [versioning](docs/versioning.md).
   User authorized frequent implementation checkpoints on 2026-09-05. Commit each working, verified slice during this MVP; do not wait for another permission question. Push/merge/deploy remain separate actions.
8. Never use Unicode em dashes or en dashes in maintained files or responses. Use ASCII hyphen-minus.
9. Claude and Codex share this working tree. Read [the agent channel](docs/agent-channel.md) before your first edit, claim the paths you will touch, and answer questions addressed to you there. Prefer a separate `git worktree` for anything beyond a couple of files.

Use `rg` for exact names, paths, keys, and exhaustive matches. When the wording or location is unknown, or the answer depends on relationships across files, use the local zvec-grep index for one focused semantic search and verify the result with `rg` or direct file reads. Run `npm run search:index` to create or refresh the ignored local index. Do not use remote embeddings for this repository without explicit user approval.

## Data boundaries

- `prisma/dev.db` is the user's real tracker database. It is backed up automatically outside the repository ([backups](docs/backups.md)), but a backup is a recovery path, not permission to risk the data. Never delete, prune, or commit backups. Run tests only through `npm test`, `npm run verify`, or `npm run test:e2e`, which create throwaway databases. Never run jest or another test runner directly; pass file arguments through the wrapper (`npm test -- tests/unit/foo.test.ts`). Never reset, push, migrate, seed, capture into, or delete the local database unless the user asks. To inspect it, use only `npm run db:query`, which opens it read-only; the user wants agents to have that access (2026-09-13). On 2026-09-13 a direct jest run wiped it (S14). Jest and test-mode config guards now refuse, but do not rely on them.
- Paid-provider credentials belong only in ignored `.env.local`; session state and databases are local and ignored. Never log credentials, tokens, request headers, full provider bodies, or account profiles.
- Use normal authenticated browser flows and responses requested by those pages. No challenge bypass, stealth browser, rotating proxies, or speculative endpoint enumeration. Stop visibly on login/challenge/rate-limit/parser failures.
- Source, valuation format, and observation timestamp are part of a value's identity. Never average raw provider scales or invent earlier observations.
- Ambiguous player matches require explicit mapping. User-confirmed on 2026-09-14: Sleeper birth dates are the source of truth. A provider's birth date or age only confirms a name match; any disagreement or missing date, however small, leaves the catalog row for manual review rather than an automatic link. A rank is not a trade value. Unknown cost is not zero cost. Target hit is not a completed trade.
- User-confirmed on 2026-09-13, clarified the same day: DTC ranks only about a top 300, so a player absent from its validated position exports is valued at zero on DTC. Mark these observations with `absent:sleeper:<id>` and identify the rule in capture status. Dynasty GM's catalog covers the whole player pool (4,362 entries against about 1,700 active NFL players), so a Sleeper player it lacks is a matching failure, never a zero. A Dynasty GM "NR" row displays 0 and is saved as that 0. Capture failures, unreadable values, and ambiguous identities do not become zeros; do not rewrite earlier observations.
- User requested an asynchronous Grill Me document plus implementation. Do not start an interactive interview or stop implementation to wait for optional answers.
