# Dynasty tracker MVP handoff - 2026-10-01

## Update from the Mac session (read this first)

Written by Claude on a second machine (macOS). The Mac has no tracker database, no `.env.local`, and no DTC browser session, so no live work happened there. The real data and saved session live on the Windows machine.

Process change (user, 2026-10-01): only one agent works in this repository at a time. The claims table, worktree advice, and agent-channel posts in CLAUDE.md and AGENTS.md are no longer needed. Those files still describe them and have not been edited. Data boundaries, the verify gate, and the `db:query`-only rule are unchanged.

### State

- Branch `mvp`, commits `4a18f21` (hosting decisions) and `ddef958` (DTC diagnostic) on top of `1399f61`. Pull them before starting.
- Issue #26 is the DTC capture fix, labeled `agent:claude`. Issue #27 is the Turso migration. Do #26 first.
- `ddef958` changes only error messages in `dynastyCalculator.ts`: a failure now names the control, for example `DTC did not apply the requested ranking settings: .dtc-top-team-size 12 (expected active).`, and a control that never appears is a controlled `format` error. It adds one test in `e2e/provider-dom.spec.ts`. It does not fix the capture. Full gate passed on the Mac: 132 unit tests, 21 Chromium checks.

### Next step, on Windows

1. Pull `mvp`. Run a guarded DTC capture (the app button or `pnpm run sync:calc`), which respects the one-hour reservation.
2. Read the new failure message with `pnpm run db:query` (`SELECT status, failureCode, message FROM SyncRun WHERE sourceName = 'dynasty-calculator' ORDER BY startedAt DESC LIMIT 1`). It now names the control. It contains no player data, but keep query output out of public issues anyway.
3. Fix that control with a fixture that matches how the live page behaves. If selector evidence is needed, `pnpm run record:dtc` is the supported recorder.
4. Keep the scoring, identity, and coverage checks. Run `pnpm run verify -- --e2e`, then a live capture to confirm recovery.

### Hosting decisions (issue #23, answered 2026-10-01)

In [the hosting Grill Me](grill-me-hosting-and-backups.md): full hosted app, Turso/libSQL as the single source of truth, local worker only for provider capture (MVP), GitHub sign-in for one allowed account. Q6 to Q8 (backup panel, pruning, restore test) are still pending and do not block #27. Turso also fixes the machine problem: both computers would share one database. #27 comes after #26.

### Environment notes

- The repo pins pnpm 12.4.1. A global pnpm 9.11.0 could not launch it (`ENOEXEC`); install a current global pnpm (`npm i -g pnpm@12`) if Windows shows the same.
- On a fresh machine: `pnpm install`, `pnpm run prisma:generate`, `pnpm run browser:install` before `verify -- --e2e`.

## Earlier handoff (Windows, Codex)

## First task: fix failed DTC captures

The user explicitly made DTC capture recovery the first task for the next agent chat. Get the existing player tracker reliably usable before expanding scope. Do not start draft picks, hosting, refactoring, experiment removal, or broad catalog cleanup first.

## Confirmed MVP update: always-on hosted access and capture

Later on 2026-10-01 the user confirmed both requirements: access from any device while their PC is off, and automatic collection of new provider prices while it is off. The local player slice is a checkpoint, not the complete intended MVP. DTC recovery remains first; hosted app, durable storage, private access, and hosted browser capture come next. A read-only hosted copy fed only by an awake PC is insufficient.

The user's answers are recorded in [hosting decisions](grill-me-hosting-and-backups.md), questions 1 and 3. Hosting provider, database engine, exact login mechanism, source-of-truth cutover, and backup destination are not yet user-approved. Do not turn a recommendation into a confirmed decision or collect unrelated backup preferences before fixing DTC.

Proposed smallest architecture: keep the existing SQLite engine and run the app plus existing browser worker within one always-on service with persistent storage and single-user authentication. This is a recommendation, not a selected platform. [Render persistent disks](https://render.com/docs/disks), checked 2026-10-01, are supported on paid services and survive restarts/deploys; a disk belongs to only one service instance, so separate Render web and worker services cannot share the same SQLite file. Co-locate those processes if this route is selected. Brief deployment downtime and single-instance operation are documented tradeoffs. [Vercel's SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel) says its Functions do not provide the persistent shared local filesystem needed by this database. A Vercel plus remote-database plus separate-browser-worker design would be a broader change.

Hosted implementation must add authentication and the correct network/origin configuration before exposure; the current loopback-only API is not deployable by simply changing its bind address. Keep production history and subscription credentials out of local development/testing. Preserve the existing history through a backed-up, verified cutover rather than inventing two writable production copies. Prove restart persistence, provider session recovery, the existing hourly reservation, hosted capture with the PC off, and recoverable off-host backups. Provider browser acceptance remains unverified; do not relax challenges or scoring/identity validation to make a hosted run appear successful.

## DTC diagnostic starting point

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
- Draft picks (#21) and cleanup remain later work. Hosting (#23) is now required for the intended MVP, after DTC recovery. Backup/restore UI remains a separate preference; hosted persistence and recovery are required operational work. Earlier confirmed pick decisions have not been canceled.
- No release, merge, or deployment was requested. The package remains `0.1.0`; this is an MVP checkpoint, not a shipped release.

## Continue from another computer

The user requested this handoff and all changes be pushed so work can continue across computers. The shared checkpoint is the `mvp` branch at [capncrockett/ff-tools](https://github.com/capncrockett/ff-tools). This committed document is the handoff; do not depend on another machine's chat history, agent memory, absolute paths, or linked worktrees.

For a new checkout, use Node 24+ and the pnpm version pinned in `package.json` (`12.4.1` at this checkpoint):

```powershell
git clone --branch mvp https://github.com/capncrockett/ff-tools.git
Set-Location ff-tools
corepack pnpm install --frozen-lockfile
pnpm run prisma:generate
pnpm run browser:install
pnpm run doctor
```

For an existing checkout, inspect `git status --short --branch` first, preserve local edits, select `mvp` when safe, then run `git pull --ff-only origin mvp`. Reinstall dependencies if the lockfile changed. Confirm the checked-out commit against `origin/mvp` before beginning. Read this handoff and `AGENTS.md`, confirm the new chat's actual model/effort, and use the agent channel for claims. Pull before starting work and push verified checkpoints before switching computers. Git does not prevent two agents on different computers from editing the same paths; coordinate through the channel and keep changes sequential.

Git transfers code, migrations, fixtures, decisions, and this handoff. It does **not** transfer captured history (`prisma/dev.db`), `.env.local`, `.local/sessions`, recordings, local caches, or backups. A fresh clone is sufficient for isolated development and `pnpm run verify -- --e2e`; missing live configuration in doctor is expected until privately configured. Do not run `db:deploy`, `players:seed`, or live captures just to make the new checkout look complete.

Until hosting is working, the existing computer remains the live tracker and capture location. To move live operation deliberately, stop its app and worker, create a fresh consistent backup with `pnpm run db:backup`, transfer that backup privately, configure the destination's ignored `.env.local` and `TRACKER_BACKUP_DIR`, and restore through [the documented restore wrapper](backups.md). On the destination, keep the app and worker stopped while restoring; `pnpm run db:restore` lists available backups and `pnpm run db:restore -- <file name>` restores the chosen one. Inspect restored data through `db:query` before starting it. Keep the original and backups as recovery copies, and run live capture on only the designated computer. Do not sync an actively written SQLite file or merge independently captured databases.

Configure paid-provider credentials privately and use normal login/session recovery on the new machine; browser sessions are sensitive and may not remain valid across machines. Never add them or the database to Git. No private data transfer, restore, or new-machine login was performed by this documentation update. Once the hosted MVP is accepted, devices should use its authenticated URL and development checkouts should remain separate from production data and credentials.

## Suggested opening message for the next chat

> Read docs/mvp-handoff.md and AGENTS.md. First fix DTC's failed captures. The last inspected failures said "DTC did not apply the requested ranking settings." Recheck current saved status, identify which control fails using the normal authorized browser flow, add a sanitized regression, and make the smallest fix without weakening scoring or identity validation. Run the full e2e gate and verify guarded live capture when authorized. Keep picks and unrelated refactors out. After the DTC checkpoint, route hosted operation as its own slice: the app must be accessible from any device and keep collecting prices while the PC is off.
