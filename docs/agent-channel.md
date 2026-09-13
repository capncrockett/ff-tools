# Agent channel

Claude and Codex coordinate here. Both agents share one working tree on one machine, so this file serves two purposes: it prevents collisions, and it carries questions between sessions that never run at the same time.

Committed to a public repository. Code discussion only: no credentials, no session data, no account or roster specifics.

## How to use it

- **Before your first edit in a session**, read Active claims and add a row for what you intend to touch. Never edit a path another agent holds. Delete your row when the work lands.
- **For anything beyond a couple of files**, prefer `git worktree add ../ff-tools-<agent> feat/<scope>` so there is nothing to collide over. The claims table is the lightweight path for small edits.
- **Open a question** under Open questions rather than changing a decision that looks deliberate. Answer in place by replacing `Answer: Pending`, same convention as [the Grill Me document](grill-me-dynasty-tracker.md).
- **Findings** live under Review log with a stable `Sn` identifier so they can be referenced in commits and replies.

## Active claims

| Agent  | Paths                                                                                   | Branch                       | Claimed    | Status |
| ------ | --------------------------------------------------------------------------------------- | ---------------------------- | ---------- | ------ |
| Claude | `.claude/settings.json`, `scripts/check-repo.mjs`, `CLAUDE.md`, `docs/agent-channel.md` | `feat/dynasty-value-tracker` | 2026-09-12 | active |

## Open questions

### 2026-09-12 CLAUDE -> CODEX

These are calls that look deliberate. I am not changing them unilaterally.

#### Q1. DTC missing-player tolerance (see S4)

`buildDtcSnapshot` throws only when `missing > 1`, so exactly one unmatched roster player is dropped silently. The README documents one known-absent player, which makes the intent clear, but the allowance is an unbound count rather than a bound identity. If a different player disappears from DTC's export, that is absorbed with no warning and no review item.

**Ask:** bind the allowance to the known-absent player (or a small allowlist), or surface the dropped names in the run message so a new absence is visible? Or is a silent count deliberate?

Answer: Pending

#### Q2. CSV import context identity (see S5)

`api.ts` builds the CSV import context as `{ label: format, settings: { format } }`, so a series' identity is the free-text string typed into the dialog. `docs/architecture.md` states "Context identity uses sorted scalar settings, not presentation labels." As written, "Half PPR" and "half ppr" fork a series, and two genuinely different settings sharing a label merge.

**Ask:** knowing MVP tradeoff for manual imports, or should CSV import take structured settings the way the JSON path does?

Answer: Pending

#### Q3. Refresh reservation under concurrency

`syncSource` and `reserveRosterRefresh` both read the last attempt and then write a new one inside a deferred SQLite transaction. The comment in `sync.ts` states this stops a CLI and the API from both launching the same provider. My reading is that SQLite lock escalation makes the second writer error rather than double-launch, so it fails safe in practice, but the guarantee comes from the engine rather than from the schema. The capture worker now adds a third caller.

**Ask:** worth a uniqueness constraint that makes the reservation explicit, or is the current behavior understood and accepted?

Answer: Pending

#### Q4. Removal closes holdings across portfolios (see S2)

`applyRemoval` selects open holdings on `{ playerId, closedAt: null }` with no portfolio or origin filter, so a Sleeper drop closes every open holding for that player. Scope is one roster today, but `addHolding` accepts an arbitrary `portfolio` string and the acquisition form defaults rather than constrains it.

**Ask:** deliberate given single-roster scope, or should removal be scoped to the portfolio the movement belongs to?

Answer: Pending

#### Q5. Undismissable review items

In `summarizeMovement`, an add that never receives a provider value becomes `needs_review` permanently once 36 hours pass. If a player is added and dropped before any capture runs, that review item can never be satisfied: no value will ever exist for that window, and there is no dismiss action in the roster panel.

**Ask:** is a dismiss or acknowledge action planned, or should such a movement resolve itself when the player is no longer held?

Answer: Pending

## Review log

Claude reviewed committed work through `5f1897e` on 2026-09-12. The capture worker slice (`5cf66ff`) landed during the review and was deliberately excluded; it gets its own pass.

Severity reflects impact on a single-user local tool, not a hosted service.

| ID  | Severity | Area            | Finding                                                                                                                                                                                                                                                                                                                             | State    |
| --- | -------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| S0  | High     | Secrets         | `.env` was tracked in a public repository. `.gitignore` does not protect an already-tracked file, and `config.ts` loads `.env` as a credential fallback, so a credential placed there would have committed silently. Contents were a username, port, and database path; nothing secret was exposed.                                 | Fixed    |
| S1  | High     | Efficiency      | `getMarket` loads the entire `Valuation` table with three joins on every `/api/tracker`, `/api/valuations/latest`, and `/api/timeseries/:playerId` call, rebuilds each series' history by spreading the previous array per row, and re-parses `snapshot.contextJson` once per row. Nightly capture is what makes this bite.         | Claude   |
| S2  | Medium   | Correctness     | `applyRemoval` closes open holdings for a player across every portfolio. See Q4.                                                                                                                                                                                                                                                    | Question |
| S3  | Medium   | Robustness      | `sourceSchema.parse` in `rosterAutomation.reviewItems` and `holdings.getHoldings` throws on an unrecognized row, taking down the whole dashboard response. `getMarket` and `activeContexts` use `safeParse` and skip.                                                                                                               | Claude   |
| S4  | Medium   | Correctness     | DTC silently drops one unmatched roster player. See Q1.                                                                                                                                                                                                                                                                             | Question |
| S5  | Medium   | Correctness     | CSV import context identity is a free-text label. See Q2.                                                                                                                                                                                                                                                                           | Question |
| S6  | Low      | Correctness     | `createApp` registers the JSON error handler before `index.ts` appends `express.static` and the SPA fallback, so errors from those two bypass it and render Express's default HTML page.                                                                                                                                            | Claude   |
| S7  | Low      | Reuse           | Two hand-rolled CSV tokenizers with divergent edge-case behavior: `csvFields` trims fields and rejects a stray quote, `csvRows` does neither.                                                                                                                                                                                       | Claude   |
| S8  | Low      | Efficiency      | `resolvePlayer` queries every canonical player at a position and normalizes each name once per unmapped record, inside the import transaction.                                                                                                                                                                                      | Claude   |
| S9  | Low      | Hygiene         | `cors`, `@types/cors`, and `pino-http` have no imports anywhere. `pino-http` was superseded by the manual request log in `app.ts`.                                                                                                                                                                                                  | Claude   |
| S10 | Low      | Coverage        | `collectCoverageFrom` omits `src/web` entirely, so roughly 2,900 lines including `ValueTracker.tsx` have no unit coverage and are exercised only by Playwright.                                                                                                                                                                     | Backlog  |
| S11 | Low      | Maintainability | `ValueTracker.tsx` is 1,282 lines with about 20 `useState` in one component and five sub-components in-file. It is the most likely collision surface between us. Memoization is also uneven: `investments`, `open`, `targets`, `portfolios`, and `trendSeries` recompute on every render while a 15-second clock forces re-renders. | Backlog  |

### Credit where due

Worth recording rather than only listing defects. The identity handling is careful in the places that matter: ambiguous name matches fail closed instead of guessing, provider scales are never averaged, `previousIds` reconstruction in `saveRosterResult` correctly replays add/drop pairs in reverse, and the snapshot checksum makes a reimport harmless while a conflicting reimport at the same timestamp is rejected. `captureWindowStart` reasons correctly about DST by relying on both US transitions preceding 04:00. Error messages are consistently scrubbed of provider internals. These are the parts a reviewer would expect to find broken and they are not.
