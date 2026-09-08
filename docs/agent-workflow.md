# Agent workflow

Read [AGENTS.md](../AGENTS.md), [architecture](architecture.md), and [the Grill Me document](grill-me-dynasty-tracker.md) before changing the tracker. The user's async document request overrides an interactive planning interview.

## Start

1. Check `git status --short --branch` and preserve unrelated work.
2. Run `npm run doctor`. It checks prerequisites and local-file presence without fetching data or printing credentials.
3. Use a focused `feat/<scope>` branch. The current Grundle Ball guidance is authoritative over older memories of automatic commits.
4. Identify the smallest coherent product slice and the checks that exercise it.

## Work

Keep provider parsing separate from browser navigation. Reproduce failures with sanitized fixtures; do not repeatedly reload paid sites while editing. All real captures must go through the shared hourly reservation, whether from the API or CLI.

Use `rg` when an exact identifier or path is known. For an architectural question whose wording or location is unknown, `npm run search:index` creates an ignored zvec-grep index with the local `potion-code-16m-v2` model. Use one focused semantic search, then verify its evidence with exact search or direct reads. Workspace text stays local with this model; remote embeddings require separate user approval.

When a provider click path changes, run `npm run record:dtc` or `npm run record:nerds`. Playwright Inspector opens with the ignored saved session when available and writes generated code under `.local/recordings/`. Walk through one normal flow and close the browser. Treat the recording as selector evidence: production adapters must still verify identity, settings, completeness, provider errors, and successful responses. Never commit generated recordings or the separate recording session.

Do not import historical Grundle keeper rules, canonical league snapshots, or deployment settings into this separate dynasty league. Keep parked experiments intact.

Use the existing styling and validation stack. Prefer a useful error and the last saved observation over plausible-looking defaults. Never introduce sample holdings or fake historical values into the user's database.

Keep secrets in ignored `.env.local`, sessions in `.local/sessions`, and temporary inspection files under `.local`. Record only allowlisted provider fields. Do not save whole initialization/account payloads to fixtures.

## Verify

- Small iteration: `npm run verify:quick`.
- Handoff: `npm run verify`.
- Visible UI or scraper DOM changes: `npm run verify -- --e2e`.

The verifier runs sequentially and stops at the first failure. Fix failures instead of bypassing hooks or lowering coverage thresholds. Tests create isolated SQLite files, use fixture values, and block live paid-provider capture. Browser checks cover desktop/mobile fit, table scrolling, dialogs, persistence, and failure recovery.

Do not run history imports, player seeding, or live sync commands merely to exercise a page. The first two write persistent data and the last contacts a paid provider. Live acceptance checks should be deliberate, authorized, and no more than hourly per source.

## Handoff

Explain behavior, validation, and remaining limitations. Link the decision document rather than restarting the interview. Check `git diff --check`, changed-file scope, secret exclusion, and ASCII dash punctuation.

Commit, push, create a release PR, merge, or deploy only when the user asks. When asked, review the current branch/remote/PR state and report actual check results. Use [versioning](versioning.md); never bypass a failing gate.
