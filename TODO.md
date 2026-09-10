# Dynasty tracker next work

The active MVP is the dynasty value tracker. Other experiments remain parked.

## Implemented in this slice

- [x] Local React/DaisyUI tracker with source-specific values, dated history, filters, and freshness.
- [x] Atomic, immutable snapshot persistence with identity matching and strict CSV/JSON import.
- [x] Acquisition lots, editable initial ROI target, manual cost/exit values, realized exits, and reacquisition.
- [x] Authenticated provider adapters for the supported owned roster with minimum one-hour attempt intervals.
- [x] Confirmed Sleeper league and approved DTC connection.
- [x] Local secret/session boundaries, additive SQLite migrations, diagnostics, and repeatable verification.
- [x] Contextual help, a worked example, and a [review of the original 21-sheet workbook](docs/workbook-review.md).
- [x] One row per player with Dynasty GM and DTC value columns and one entry action.
- [x] Fix DTC's hidden Connect a League control for already-connected leagues; cover both connection states in browser fixtures.
- [x] Replace DTC's hidden-table capture with validated official position exports, force `.5 PPR`, and filter to the current Sleeper roster.
- [x] Add source-specific player value trend lines with scoring-format and position filters.
- [x] Reconcile Sleeper additions and removals into player holdings, with provider-specific fresh-value rules, replay protection, and stale-value review.
- [x] Group each acquisition into one player row with separate Dynasty GM and DTC return columns.

## Confirmed next directions

The completed [initial Grill Me document](docs/archive/grill-me-dynasty-tracker-initial-2026-09-09.md), [first follow-up](docs/archive/grill-me-dynasty-tracker-follow-up-2026-09-09.md), and [player automation follow-up](docs/archive/grill-me-dynasty-tracker-player-automation-2026-09-10.md) establish one owned dynasty roster, player-level tracking from current values, an initial 20% target, separate source scales, automatic Sleeper updates with ambiguity review, one nightly retry, and private single-user hosting. The old workbook is reference material only; its values will not be imported. The [active follow-up questions](docs/grill-me-dynasty-tracker.md) cover projected pick bands and history.

- [ ] Track owned draft picks, then convert a used pick holding into the drafted player's holding while preserving the transaction history.
- [ ] Add acquisition targets later; current scope remains the owned roster.
- [ ] Add a source-truth review queue for ambiguous player mappings and acquisition corrections. Continue unambiguous automation without manual confirmation.
- [ ] Design nightly capture and Vercel hosting with durable storage, exact-user access, and a stateful browser worker. Attempt at 4:00 AM Pacific and retry once after failure.
- [x] Add in-app target, opposite-provider-trend, 10% sharp-move, and 36-hour stale-data alerts. Decide later whether any should be delivered elsewhere.
- [ ] Define backup/restore UX.

## Operational follow-ups

- [ ] Observe a later real capture to establish actual movement; never invent a prior price.
- [ ] Keep provider DOM fixtures aligned when either subscription UI changes.
- [ ] Add a manual sign-in/session recovery wizard if normal automated sign-in becomes insufficient.
