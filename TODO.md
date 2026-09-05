# Dynasty tracker next work

The active MVP is the dynasty value tracker. Other experiments remain parked.

## Implemented in this slice

- [x] Local React/DaisyUI tracker with source-specific values, dated history, filters, and freshness.
- [x] Atomic, immutable snapshot persistence with identity matching and strict CSV/JSON import.
- [x] Acquisition lots, editable initial ROI target, manual cost/proceeds, realized exits, and reacquisition.
- [x] Authenticated provider adapters for the supported owned roster with minimum one-hour attempt intervals.
- [x] Confirmed Sleeper league and approved DTC connection.
- [x] Local secret/session boundaries, additive SQLite migrations, diagnostics, and repeatable verification.

## Decisions before the next slice

Continue [the Grill Me document](docs/grill-me-dynasty-tracker.md). Answers 1-9 establish one owned dynasty roster, tracking from current values, an initial 20% target, separate source scales, and a preference for nightly collection with eventual Vercel hosting. Historical acquisition records also exist on FleaFlicker.

- [ ] Agree on cost allocation for package trades and which source governs an exit.
- [ ] Decide whether to include draft picks; whole-market/watchlist coverage is explicitly deferred.
- [ ] Define explicit mapping and acquisition-correction workflows.
- [ ] Decide whether Sleeper transaction import should suggest acquisition lots.
- [ ] Define trade-chain return and whether player utility affects it.
- [ ] Design nightly capture and Vercel hosting with durable storage, private access, and a browser worker. The current SQLite file and local sessions require an explicit hosting transition.
- [ ] Decide on delivered alerts and backup/restore UX.

## Operational follow-ups

- [ ] Complete the remaining DTC automatic-refresh check using its failure-stage message and hourly guard; the initial real snapshot is already saved.
- [ ] Observe a later real capture to establish actual movement; never invent a prior price.
- [ ] Keep provider DOM fixtures aligned when either subscription UI changes.
- [ ] Add a manual sign-in/session recovery wizard if normal automated sign-in becomes insufficient.
