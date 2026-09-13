# Source integration notes

Verified against authenticated subscription views on 2026-09-05. User approved DTC league import and roster refresh as needed, at most once per hour. Access uses ordinary browser sessions; builds, tests, dashboards, and saved-history reloads never request a provider refresh.

## Sleeper

League: [1378427936817815552](https://sleeper.com/leagues/1378427936817815552), A League For All Seasons. Cascadia Corsairs is roster 7. The observed settings are 12 teams, half-PPR (reception 0.5), no TE reception premium, with QB/RB/RB/WR/WR/TE/FLEX/FLEX starters.

The canonical player catalog uses the [public Sleeper API](https://docs.sleeper.com/). It is cached locally for 24 hours and seeded explicitly with `npm run players:seed`. A persisted league check reads the configured owner's roster and completed transactions at most once per hour. DTC reuses that saved roster to match only its QB/RB/WR/TE exports, and the other provider capture can reuse the same check within the hour.

The first check baselines the current roster from each provider's first saved browser observation. Later completed trades, waivers, and free-agent moves create independent player additions and removals. Additions use the first provider value within 36 hours after the move. Removals use the last provider value within 36 hours before the move. Transaction IDs prevent replay but do not create package returns. Missing canonical identities, unexplained roster differences, and stale values remain in the app's review panel. Tests use synthetic responses and never call Sleeper or either paid provider.

## Dynasty GM / Dynasty Nerds

Entry: [analyzer 273947](https://app.dynastynerds.com/analyzer/273947). Normal sign-in starts at [the app sign-in page](https://app.dynastynerds.com/sign-in).

The app's own initialization response provides minimal player and selected-league metadata. Its rank/ADP fields are not trade values. The adapter reads the rendered owned roster's numeric trade value and validates coverage against the supported player IDs in starters, bench, taxi, and IR.

Some players display initials instead of a headshot, so images cannot define roster identity. A changed or incomplete row layout fails the snapshot instead of persisting a partial roster.

The configured team is Dynasty GM team 2982100. The provider calls its selected scoring/value set PPR; preserve that label even though Sleeper is half-PPR. Do not claim its values are exactly adjusted to Sleeper's scoring. No paid articles, projections, account profiles, or broad response bodies are retained.

## Dynasty Trade Calculator

Entry: [rankings](https://dynastytradecalculator.com/dynasty-rankings-2/). Sign-in: [WordPress login](https://dynastytradecalculator.com/wp-login.php).

The previous Connect a League import was explicitly authorized, but its hidden roster table was not reliable enough for unattended capture. The adapter now uses DTC's official Export control. No ChatDTC credits are used.

Capture explicitly selects 12 teams, `.5 PPR`, Standard/1QB, and offense. It explicitly disables IDP, Devy, TE Premium, and RB PPC. Those states are verified before every download. The adapter downloads the deeper QB, RB, WR, and TE lists in memory, validates the exact CSV columns and positions, and discards the raw files after parsing. Matches use prefixed canonical Sleeper IDs because the export has no DTC player ID. Picks are excluded. Zero remains a real zero; missing or changed fields are rejected.

Each snapshot records the configured Sleeper league/owner identity and the verified DTC controls: team count, scoring, QB format, TE premium, RB PPC, offense/IDP/devy, and normal calculator mode. These are the same context settings used by the earlier imported view, so new observations continue that half-PPR series.

## Limits and failures

On 2026-09-08, authenticated live checks verified the rankings controls and official CSV downloads. Overall Top 300 covered only 21 of 30 owned players. The deeper position exports recovered eight more and cover 29 of 30. Jacob Saylors was absent from all five checked exports.

The adapter uses the four position exports and requires every eligible roster player to match unless that exact canonical Sleeper ID is explicitly listed in `DTC_ALLOWED_MISSING_SLEEPER_IDS` in ignored `.env.local`. The optional setting accepts up to 10 comma-separated numeric IDs and defaults to no exceptions. Configure it only after reviewing an actual export absence; it is not a name-matching override. An ambiguous match, an unexpected absence, or an entirely empty match stops the snapshot. Failure messages identify the missing players for review without changing saved history. A successful partial capture names every allowed omission in the persisted source status and CLI/API result. Allowed players are still captured when they appear in a later export. Coverage warnings never change the scoring context or create zero-valued observations.

On 2026-09-13, the normal guarded DTC CLI capture saved 29 fresh observations using the existing scoring context. The known unavailable player remained absent and was explicitly identified in the saved source status. The official position-export flow completed successfully; no cooldown bypass or speculative endpoint access was used.

MVP acceptance on 2026-09-05: a complete Dynasty GM CLI capture and the approved DTC browser import each saved 29 players. The official DTC export flow preserves those canonical Sleeper identities and the existing DTC valuation context. This MVP does not invent a value for the unsupported roster entry or for picks. A whole-market watchlist is a pending decision.

Use the UI, `npm run sync:nerds` / `npm run sync:calc`, or the optional [local nightly worker](local-capture-worker.md). A shared SQLite reservation enforces at least 60 minutes between attempts per source, including failures, CLI calls, and app restarts. There is no force-refresh bypass. The worker attempts at 04:00 Pacific and permits one temporary-unavailability retry after the full hour, within a 04:00-06:00 window. Access and parser failures pause automatic collection until a successful manual capture. Hosted collection remains future work.

Login, MFA/challenges, rate limits, subscription problems, and parser changes stop capture. Previously saved history remains available. There is no stealth/proxy/challenge-bypass service. The UI shows the controlled failure and next eligible time.

Credentials are optional until live capture is needed. Put them in ignored `.env.local`, or reuse ignored Playwright storage state at `.local/sessions/<source>.json`. The adapters save successful authenticated state automatically. Manual MFA/session recovery has no app wizard yet; a changed login flow may require updating the adapter or locally saving a normal Playwright session.

Do not make repeated live calls while debugging. Reuse structural observations and synthetic DOM fixtures, then perform a deliberate eligible live check through the normal refresh service.
