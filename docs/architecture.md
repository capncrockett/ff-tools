# Architecture

## Boundaries

- `src/shared/tracker.ts`: validated snapshot contracts, view types, and pure return arithmetic.
- `src/server/providers`: normal authenticated browser navigation and strict source-specific parsing. Minimal metadata and rendered values only.
- `src/server/services`: canonical identity, atomic persistence, history queries, investment lots, and the shared refresh reservation.
- `src/server/routes/api.ts`: local HTTP transport and validated inputs.
- `src/web`: React/DaisyUI tracker, accessible dialogs, filters, dated SVG history, and entry/exit forms.
- `scripts`: repeatable diagnostics, migrations, verification, and isolated test processes.

Vite proxies development API requests to Express. The built Express server serves the client and API together on 127.0.0.1. The local API checks host/origin and requires a custom header on mutations; it is not an authenticated multiuser hosting service.

## Data model

A `Player` is canonical when it has a Sleeper ID. A `Mapping` binds a provider's player ID to that player. Unique name-plus-position matching is allowed only against canonical Sleeper players; ambiguous matches fail closed. Source-only identities stay separate until an explicit correction workflow exists.

A `Snapshot` stores source, capture time, stable settings hash, minimal settings JSON, checksum, row count, and capture method. Its `Valuation` rows are immutable observations. A source/settings/capture-time identity prevents conflicting duplicate captures; reimporting an identical observation batch is harmless. Inserts and identity resolution share one transaction.

A `Holding` is one player acquisition lot with portfolio, date, source/context, cost basis, target, and optional exit date/value. Reacquisition is another lot. Closed lots retain their realized player-level exit value even as market values change. Sleeper transaction IDs may provide idempotency and traceability, but package ROI and trade-chain accounting are outside the confirmed product model. The exact automatic basis and exit rules remain in the active follow-up document.

A `SyncRun` reserves an attempt before opening a browser, then records a controlled success/failure message. All processes consult the same SQLite record. No attempt starts within one hour of the previous source attempt, including interrupted or failed runs. A crashed run becomes eligible after the hour; there is no automatic retry.

## Value semantics

Keep provider scales and valuation contexts separate. A scoring change starts a distinct series. Context identity uses sorted scalar settings, not presentation labels. The capture time is when this tool observed a value, not a claim about when the provider changed it.

The Player values table groups series by canonical database player ID into one row, with Dynasty GM and DTC columns. Multiple formats remain individually labeled inside their source column. Missing sources display no value. Growth sorting uses the named source's most recently captured format; source history, entry cost, and return still use their exact context.

The Value trends chart selects exactly one source and scoring context, then draws one line per matching player. Its position filter never aggregates or rescales provider values. Legend actions open the same exact dated series used by the player table.

History is ordered by observation time even if old files arrive later. The table shows both change since the preceding observation and growth from the first saved value of that exact series. This implements the user's confirmed tracking baseline; it does not claim that value was the historical acquisition cost. Importing an earlier observation moves the tracking baseline earlier. A first observation has no preceding change, and zero baselines have undefined percentage growth.

Unrealized return uses the latest observation at or after acquisition. Realized return uses the saved player exit value. Zero cost has a defined absolute gain and undefined percentage return. Target flags are advisory. Values older than 36 hours are stale and do not enter the fresh-target count.

In-app alerts use saved data only. Sharp movement means at least 10% since the preceding observation in the same series. Provider disagreement requires fresh observations, opposite baseline-growth directions, and at least a 10 percentage-point spread. Raw provider point values are never compared.

Only the provider-supported owned roster is captured today. DTC refreshes the current roster from Sleeper and filters its position exports before persistence. A missing row is never filled with zero. Departed players keep their prior history and become stale unless another valid observation is imported; whole-market scouting is future scope.

## Operational properties

SQLite and local session files persist through app restarts and remain outside Git. Source failure cannot replace the last good snapshot. Errors never include raw browser exceptions, credentials, tokens, account payloads, or callback URLs.

Run migrations before starting a new checkout. The baseline represents the old placeholder schema; the tracker migration is additive. Existing uncontextualized values remain visible as legacy/unverified instead of being relabeled.

Tests use temporary SQLite files and synthetic browser fixtures. Verification does not mutate the real database or fetch provider pages. See [workflow](agent-workflow.md), [source notes](sources.md), [confirmed initial decisions](archive/grill-me-dynasty-tracker-initial-2026-09-09.md), and [active follow-up questions](grill-me-dynasty-tracker.md).
