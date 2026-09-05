# Source integration notes

Verified against authenticated subscription views on 2026-09-05. User approved DTC league import and roster refresh as needed, at most once per hour. Access uses ordinary browser sessions; builds, tests, dashboards, and saved-history reloads never request a provider refresh.

## Sleeper

League: [1378427936817815552](https://sleeper.com/leagues/1378427936817815552), A League For All Seasons. Cascadia Corsairs is roster 7. The observed settings are 12 teams, half-PPR (reception 0.5), no TE reception premium, with QB/RB/RB/WR/WR/TE/FLEX/FLEX starters.

The canonical player catalog uses the [public Sleeper API](https://docs.sleeper.com/). It is cached locally for 24 hours and seeded explicitly with `npm run players:seed`. The app does not poll league rosters independently; each paid source supplies its supported owned roster. Transaction history and automatic acquisition-cost inference are not implemented.

## Dynasty GM / Dynasty Nerds

Entry: [analyzer 273947](https://app.dynastynerds.com/analyzer/273947). Normal sign-in starts at [the app sign-in page](https://app.dynastynerds.com/sign-in).

The app's own initialization response provides minimal player and selected-league metadata. Its rank/ADP fields are not trade values. The adapter reads the rendered owned roster's numeric trade value and validates coverage against the supported player IDs in starters, bench, taxi, and IR.

Some players display initials instead of a headshot, so images cannot define roster identity. A changed or incomplete row layout fails the snapshot instead of persisting a partial roster.

The configured team is Dynasty GM team 2982100. The provider calls its selected scoring/value set PPR; preserve that label even though Sleeper is half-PPR. Do not claim its values are exactly adjusted to Sleeper's scoring. No paid articles, projections, account profiles, or broad response bodies are retained.

## Dynasty Trade Calculator

Entry: [calculator](https://dynastytradecalculator.com/calculator/). Sign-in: [WordPress login](https://dynastytradecalculator.com/wp-login.php).

The normal Connect a League / Sleeper / Import League flow selects league 1378427936817815552 and the current account's Cascadia Corsairs roster. This saved connection and its refresh are explicitly authorized. No ChatDTC credits are used.

Capture reads only player rows delivered in the league-import selection table, not the public/default rankings page. Picks are excluded. DTC's internal ZTE position is normalized to TE. Zero remains a real zero; missing text is rejected.

Each snapshot verifies league/owner identity and records actual calculator rules: team count, scoring, QB format, TE premium, RB PPC, offense/IDP/devy, and normal calculator mode. The verified imported view uses 12 teams, HALF PPR, STANDARD, no TE premium or RB PPC.

## Limits and failures

MVP acceptance on 2026-09-05: a complete Dynasty GM CLI capture saved 29 players. The approved DTC browser import also supplied 29 saved observations with canonical Sleeper identities. Its standalone automatic refresh still failed at the last eligible attempt. The corrected row/settings extractor was checked against the already-loaded real DTC DOM and synthetic browser fixtures, but full automatic DTC navigation needs another eligible live check. Failure-stage messages now identify where a future attempt stops. Do not describe this remaining integration as fully verified or reset its cooldown to retry.

Both providers exposed 29 supported players while Sleeper listed 30 roster entries. This MVP does not invent a value for the missing roster entry or for picks. It currently tracks the supported owned roster; a whole-market watchlist is a pending decision.

Use the UI or `npm run sync:nerds` / `npm run sync:calc`. A shared SQLite reservation enforces at least 60 minutes between attempts per source, including failures, CLI calls, and app restarts. There is no force-refresh bypass. The user now prefers nightly collection for the hosted product; that scheduler and hosting transition are recorded in the next slice, not enabled in this local MVP.

Login, MFA/challenges, rate limits, subscription problems, and parser changes stop capture. Previously saved history remains available. There is no stealth/proxy/challenge-bypass service. The UI shows the controlled failure and next eligible time.

Credentials are optional until live capture is needed. Put them in ignored `.env.local`, or reuse ignored Playwright storage state at `.local/sessions/<source>.json`. The adapters save successful authenticated state automatically. Manual MFA/session recovery has no app wizard yet; a changed login flow may require updating the adapter or locally saving a normal Playwright session.

Do not make repeated live calls while debugging. Reuse sanitized captured fields and synthetic DOM fixtures, then perform a deliberate eligible live check through the normal refresh service.
