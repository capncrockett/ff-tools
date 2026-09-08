# Dynasty tracker next work

The active MVP is the dynasty value tracker. Other experiments remain parked.

## Implemented in this slice

- [x] Local React/DaisyUI tracker with source-specific values, dated history, filters, and freshness.
- [x] Atomic, immutable snapshot persistence with identity matching and strict CSV/JSON import.
- [x] Acquisition lots, editable initial ROI target, manual cost/proceeds, realized exits, and reacquisition.
- [x] Authenticated provider adapters for the supported owned roster with minimum one-hour attempt intervals.
- [x] Confirmed Sleeper league and approved DTC connection.
- [x] Local secret/session boundaries, additive SQLite migrations, diagnostics, and repeatable verification.
- [x] Contextual help, a worked example, and a [review of the original 21-sheet workbook](docs/workbook-review.md).
- [x] One row per player with Dynasty GM and DTC value columns and one entry action.
- [x] Fix DTC's hidden Connect a League control for already-connected leagues; cover both connection states in browser fixtures.
- [x] Replace DTC's hidden-table capture with validated official position exports, force `.5 PPR`, and filter to the current Sleeper roster.

## Confirmed next directions

The completed [Grill Me document](docs/grill-me-dynasty-tracker.md) establishes one owned dynasty roster, tracking from current values, an initial 20% target, separate source scales, and nightly collection after hosting. The old workbook is reference material only; its values will not be imported.

- [ ] Add a package-trade ledger that compares total outgoing value with total incoming value. Do not assign the full package cost to every incoming player.
- [ ] Track owned draft picks, then convert a used pick holding into the drafted player's holding while preserving the transaction history.
- [ ] Add a line graph that can filter tracked value history by position.
- [ ] Add acquisition targets later; current scope remains the owned roster.
- [ ] Define explicit mapping and acquisition-correction workflows.
- [ ] Decide whether Sleeper transaction import should suggest acquisition lots.
- [ ] Define trade-chain return across package trades. Fantasy points and lineup production do not enter ROI.
- [ ] Design nightly capture and Vercel hosting with durable storage, private access, and a browser worker. The current SQLite file and local sessions require an explicit hosting transition.
- [ ] Add in-app target, source-divergence, sharp-drop, and stale-data alerts, then decide whether any should be delivered elsewhere.
- [ ] Define backup/restore UX.

## Operational follow-ups

- [ ] Observe a later real capture to establish actual movement; never invent a prior price.
- [ ] Keep provider DOM fixtures aligned when either subscription UI changes.
- [ ] Add a manual sign-in/session recovery wizard if normal automated sign-in becomes insufficient.
