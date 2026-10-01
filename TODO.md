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
- [x] Add an optional local 04:00 Pacific capture worker, bounded retry, persisted scheduling guards, and read-only planning command.

## Confirmed next directions

The completed [initial Grill Me document](docs/archive/grill-me-dynasty-tracker-initial-2026-09-09.md), [first follow-up](docs/archive/grill-me-dynasty-tracker-follow-up-2026-09-09.md), and [player automation follow-up](docs/archive/grill-me-dynasty-tracker-player-automation-2026-09-10.md) establish one owned dynasty roster, player-level tracking from current values, an initial 20% target, separate source scales, automatic Sleeper updates with ambiguity review, one nightly retry, and private single-user hosting. The old workbook is reference material only; its values will not be imported. The [active follow-up questions](docs/grill-me-dynasty-tracker.md) cover projected pick bands and history.

- [ ] Track owned draft picks, then convert a used pick holding into the drafted player's holding while preserving the transaction history. (issue #21)
- [ ] Add acquisition targets later; current scope remains the owned roster.
- [x] Add a roster-first source-truth review queue for ambiguous player mappings and explicit corrections. Continue unambiguous automation without manual confirmation. (issue #22; acquisition corrections remain separate)
- [ ] Design Vercel hosting with durable storage, exact-user access, and upload from the local browser worker. Local nightly execution is implemented; hosted collection and service installation remain separate. (issue #23, pending answers in [the hosting and backup follow-up](docs/grill-me-hosting-and-backups.md))
- [x] Add in-app target, opposite-provider-trend, 10% sharp-move, and 36-hour stale-data alerts. Decide later whether any should be delivered elsewhere.
- [ ] Define backup/restore UX. (issue #23, same document)

## Operational follow-ups

The first usable local slice is the owned Sleeper player roster, separate Dynasty GM/DTC values, saved history, player-level returns, and explicit identity review. Use the existing local app and manual capture buttons. Draft picks remain a confirmed next feature; hosting, whole-market review, parser consolidation, UI refactoring, and experiment cleanup do not block this player slice. A current paid-provider capture is a deliberate acceptance step, not part of fixture verification. This is the implementation scope chosen for the 2026-09-30 usability request; it does not cancel the user's earlier pick or hosting decisions.

- [ ] Observe a later real capture to establish actual movement; never invent a prior price.
- [ ] Keep provider DOM fixtures aligned when either subscription UI changes.
- [ ] Add a manual sign-in/session recovery wizard if normal automated sign-in becomes insufficient.
