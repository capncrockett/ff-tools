# Agent guide

FF Tools is currently focused on the Dynasty Value Tracker. Keep other experiments intact; their TODOs do not authorize more features.

## Workflow

Adapted from Grundle Ball's current AGENTS.md and docs/agent-workflow.md (2026-09-04).

1. Check `git status --short --branch` and run `npm run doctor`. Preserve user edits.
2. Read [the decision document](docs/grill-me-dynasty-tracker.md), [architecture](docs/architecture.md), and [workflow](docs/agent-workflow.md). An unanswered recommendation is an assumption, not user approval.
3. Keep pure calculations in `src/shared`, provider access in `src/server/providers`, persistence in services, and rendering in `src/web`.
4. Prefer DaisyUI and accessible, dense, responsive interfaces. Label data freshness, missing observations, and provisional interpretations.
5. Use fixture-based tests while developing. Never contact paid providers from tests, builds, doctor, or page reloads.
6. Run `npm run verify` before handoff; include `npm run test:e2e` for visible UI changes. Do not bypass checks or hooks.
7. Commit, push, merge, or deploy only when asked. Feature branches use `feat/<scope>`. Releases use `release/MAJOR.MINOR.PATCH` with the root package version as canonical. See [versioning](docs/versioning.md).
   User authorized frequent implementation checkpoints on 2026-09-05. Commit each working, verified slice during this MVP; do not wait for another permission question. Push/merge/deploy remain separate actions.
8. Never use Unicode em dashes or en dashes in maintained files or responses. Use ASCII hyphen-minus.

## Data boundaries

- Paid-provider credentials belong only in ignored `.env.local`; session state and databases are local and ignored. Never log credentials, tokens, request headers, full provider bodies, or account profiles.
- Use normal authenticated browser flows and responses requested by those pages. No challenge bypass, stealth browser, rotating proxies, or speculative endpoint enumeration. Stop visibly on login/challenge/rate-limit/parser failures.
- Source, valuation format, and observation timestamp are part of a value's identity. Never average raw provider scales or invent earlier observations.
- Ambiguous player matches require explicit mapping. A rank is not a trade value. Unknown cost is not zero cost. Target hit is not a completed trade.
- User requested an asynchronous Grill Me document plus implementation. Do not start an interactive interview or stop implementation to wait for optional answers.
