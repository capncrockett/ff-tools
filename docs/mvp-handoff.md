# Local player MVP handoff - 2026-10-01

## First task: fix failed DTC captures

The user explicitly made DTC capture recovery the first task for the next agent chat. Get the existing player tracker reliably usable before expanding scope. Do not start draft picks, hosting, refactoring, experiment removal, or broad catalog cleanup first.

Read-only inspection of saved runs found the same controlled failure on the two latest DTC attempts:

```text
failureCode: format
DTC did not apply the requested ranking settings.
```

The literal is thrown by `waitForActive` in [dynastyCalculator.ts](../src/server/providers/dynastyCalculator.ts). It checks whether the control's class list contains `active`, polling 20 times at 100ms. `setActive` clicks if needed, then waits for that class. `configureDtcRankingSettings` selects 12 teams, half-PPR, Standard/1QB, and offense; it disables IDP, Devy, TE Premium, and RB PPC. The same helper also activates position tabs during downloads.

The message alone does not identify which control failed. Settings selection is the first place to inspect; a later position-tab activation can produce the same literal. The exact failing control and cause have not been established. Possible selector/state drift or asynchronous changes are hypotheses, not confirmed causes. Do not attribute this message to player age matching: it comes from the DOM control helper before snapshot matching or strict identity validation.

### Suggested first pass

1. Check `git status --short --branch`, run `pnpm run doctor`, and read `AGENTS.md`, [architecture](architecture.md), [workflow](agent-workflow.md), [decisions](grill-me-dynasty-tracker.md), and [agent channel](agent-channel.md). Preserve unrelated edits and claim the paths you will change. Confirm actual model and effort in the new chat and use one focused GitHub issue for this fix. Issue #22 is complete; do not reopen its UI work merely because capture is failing.
2. Re-read the latest DTC run read-only, through the approved wrapper. Do not assume this handoff's error is still current:

   ```powershell
   pnpm run db:query "SELECT status, failureCode, message, startedAt, finishedAt FROM SyncRun WHERE sourceName = 'dynasty-calculator' ORDER BY startedAt DESC LIMIT 3"
   ```

   Results can contain roster details. Keep those local; do not paste them into public issues or this document.

3. Inspect `waitForActive`, `setActive`, `verifyExclusive`, `configureDtcRankingSettings`, and `downloadDtcRankingExports`. The existing browser fixture in [provider-dom.spec.ts](../e2e/provider-dom.spec.ts) simulates `active` classes and passing half-PPR selection. Passing it does not prove today's live DTC controls behave that way.
4. Inspect a normal authenticated DTC page when live access is deliberately authorized, using the existing browser/session flow. [Source notes](sources.md) record prior authorization for DTC league import and roster refresh at most hourly; preserve that scope. `pnpm run record:dtc` is the supported recording workflow if selector evidence is needed. Keep recordings, session files, and account data ignored and local. No endpoint guessing, challenge bypass, or repeated live retries while editing.
5. Identify the failed control and its actual state representation. Add controlled diagnostics identifying the setting or tab if needed, without raw browser errors, credentials, callback URLs, or provider payloads. Use sanitized fixtures to reproduce the real interaction, then make the smallest fix.
6. Preserve validation of the full requested scoring context before every download. Do not remove the checks, accept arbitrary settings, change the saved context, synthesize observations after failures, or merely increase timeouts without evidence.
7. Run narrow tests through `pnpm test -- <file>` and browser tests through the project wrapper. Run `pnpm run verify -- --e2e` before commit and handoff. Perform deliberate live acceptance through `pnpm run sync:calc` or the app's DTC capture button when authorized and eligible; these paths preserve the shared one-hour reservation. Never delete or rewrite `SyncRun` records to bypass it. A successful manual capture is needed to resume automatic collection after a `format` failure.

Acceptance: identify the failed control, cover its real interaction with a sanitized fixture, retain scoring/identity/coverage safeguards, pass the full isolated gate, and verify a successful guarded live DTC capture if authorized. If a login, challenge, subscription, or provider availability problem blocks acceptance, report it plainly and keep the last good observations. Fixture success alone is not live recovery.

Recommended starting setting for the next Codex chat: GPT-6.1 Sol, High, matching the completed implementation session. Work shape: everyday debugging with the invariant that only validated provider settings and identities may produce observations. Confirm actual settings rather than assuming the next chat inherited them.

## Completed checkpoint

Commit `523e51b` (`feat(tracker): finish roster-first player matching review (#22)`) is on `mvp` and was pushed to `origin/mvp` at the user's request. [Issue #22](https://github.com/capncrockett/ff-tools/issues/22) is closed. This handoff is a separate documentation checkpoint.

- The owned-player tracker already has separate Dynasty GM/DTC values, dated history, player-level returns, Sleeper-driven additions/removals, capture buttons, and an optional local capture worker.
- **Review player matches** opens unresolved saved-roster matches first. Other catalog players are searchable; existing links can be explicitly corrected or removed. Choosing a canonical Sleeper player is an explicit action. No new tables or migration were needed.
- Manual decisions survive catalog refresh and automatic rematching. Corrections update future identity resolution; earlier observations and holdings retain their recorded player. Acquisition corrections remain separate work.
- Provider captures use manual links, then validate independent birth-date/age confirmation before saving observations. Catalogs are persisted before that validation so failed identities remain reviewable. DTC's genuine absence-to-zero rule remains; uncertain identity never becomes zero. Dynasty GM can resolve a verified team view when the live Sleeper roster check is unavailable.
- Relevant implementation: [playerReview.ts](../src/server/services/playerReview.ts), [sync.ts](../src/server/services/sync.ts), both provider adapters, [playerMatching.ts](../src/shared/playerMatching.ts), and [PlayerMatchReview.tsx](../src/web/components/PlayerMatchReview.tsx).
- Relevant regressions: [player.review.test.ts](../tests/integration/player.review.test.ts), [player.catalogs.test.ts](../tests/integration/player.catalogs.test.ts), [player-review.spec.ts](../e2e/player-review.spec.ts), and the existing DTC parser/provider DOM tests.

Implementation verification passed: 132 tests across 24 suites, both builds, and 20 Chromium checks, including 375px review, explicit selection, conflict recovery, and reload. A read-only browser check also confirmed the running local app and review dialog. No live paid-provider capture was performed by that implementation session. Subsequent saved DTC failures establish that live DTC recovery remains unfinished.

On Windows, the first sandboxed browser run completed its tests but stalled during process cleanup. Stopping only the test processes started by that session and rerunning the full gate with the necessary sandbox access completed with exit 0. Do not call a stalled run passed or bypass checks.

## Local operation and boundaries

- Work from the primary checkout on `mvp`. Other `ff-tools-*` directories are linked worktrees; inspect their current branches and dirty state before reusing them. A separate Claude worktree previously had extensive user changes. Do not clean it up or copy its contents into this branch.
- `MODEL_EFFORT_SKILL_HANDOFF.md` was already untracked before this work and is unrelated. It was preserved and excluded from these commits.
- `prisma/dev.db` is the real tracker database. Inspect only through `pnpm run db:query`. Never reset, migrate, seed, or capture into it merely to exercise code. Tests must run through the approved wrappers and use temporary databases; never invoke Jest directly.
- Paid-provider credentials are in ignored `.env.local`; sessions and recordings are under ignored `.local`. Never log or commit them. This repository and its issue tracker are public.
- Use `pnpm run dev` and open [the local tracker](http://127.0.0.1:5173). The prior session started it, but verify whether it is still running. App startup backs up local data; it does not start paid captures or the capture worker. `pnpm run capture:plan` is read-only; `pnpm run capture:worker` starts live automation.
- Preserve only QB/RB/WR/TE players and draft-pick scope. Keep provider values and scoring contexts separate, retain historical observations, and preserve fail-closed identity rules.
- Draft picks (#21), hosting/backups UX (#23), and cleanup remain future work. They are not prerequisites for fixing DTC and using the local player slice. Earlier confirmed pick/hosting decisions have not been canceled.
- No release, merge, or deployment was requested. The package remains `0.1.0`; this is an MVP checkpoint, not a shipped release.

## Suggested opening message for the next chat

> Read docs/mvp-handoff.md and AGENTS.md. First fix DTC's failed captures. The last inspected failures said "DTC did not apply the requested ranking settings." Recheck current saved status, identify which control fails using the normal authorized browser flow, add a sanitized regression, and make the smallest fix without weakening scoring or identity validation. Run the full e2e gate and verify guarded live capture when authorized. Keep picks, hosting, and unrelated refactors out of this task.
