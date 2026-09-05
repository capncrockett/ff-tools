# Dynasty Value Tracker - Grill Me

Answer any section by replacing `Answer: Pending`, then commit when convenient. Recommendations below are reversible implementation defaults, not decisions you have already approved. Start with questions 1-5; they have the greatest effect on the next slice.

## 1. What counts as profit?

Question: Is success a higher calculator value, a completed trade returning more value, or a chain of trades that grows your assets?

Recommended: Track both unrealized value growth and realized return on completed exits. Eventually track trade chains separately. A target hit means it is time to consider an exit; it does not mean a league mate will pay that value.

Answer: Pending

## 2. Confirm the trading direction

Question: You wrote "trade high sell low." Did you mean buy low and sell high, including selling after your ROI target even if the player could rise further?

Recommended: Buy low, sell once the target return is available. Do not try to predict the absolute peak.

Answer: Pending

## 3. Which league and whose roster?

Question: Which roster ID represents your team, and should other leagues join later?

Recommended: Start with that analyzer, one explicitly selected team, and a league-scoped portfolio. Do not assume Grundle League is this dynasty league or infer a team from its manager's name.

Answer: Confirmed by user: Sleeper league `1378427936817815552` ([league](https://sleeper.com/leagues/1378427936817815552)). Live provider metadata identifies Cascadia Corsairs as the owned team, Dynasty GM analyzer `273947`, and canonical Sleeper roster `7`. Sleeper's actual settings are 12 teams, 1QB, half-PPR, no TE premium, and eight starters. Dynasty GM labels its value set PPR; keep that provider label distinct. Additional leagues: pending.

## 4. What is the cost basis?

Question: For existing players, should entry cost mean value on acquisition day, value when tracking begins, or your manual allocation of the assets you traded away?

Recommended: Enter a source-specific cost once, with acquisition date and notes. Label the first observed value separately from cost. Never invent historical values. A later slice can suggest acquisition lots from Sleeper trades.

Answer: Pending

## 5. What is the exit target?

Question: Is a fixed percentage return enough, or do targets vary by player, holding period, or roster role?

Recommended: Editable target per acquisition, initially 20%. Show current return, target value, and points still needed beside the formula. Zero-cost pickups use absolute gain because percentage ROI is undefined.

Answer: Pending

## 6. Which scoring settings must match?

Question: Confirm team count, 1QB/SF/2QB, PPR, TE premium, starters, IDP, devy, and any custom valuation settings for the target league.

Recommended: Preserve each provider's actual settings in every snapshot. New settings begin a separate series. Do not label unverified defaults as league-adjusted values.

Answer: Verified from Sleeper on 2026-09-05: `scoring_settings.rec = 0.5`, TE reception bonus absent/zero, and starters QB/RB/RB/WR/WR/TE/FLEX/FLEX. DTC import displays HALF PPR, STANDARD, 12 teams, no TE premium, no RB PPC. Dynasty GM displays its PPR valuation set. Confirm any desired valuation overrides separately.

## 7. What if the providers disagree?

Question: Should an exit signal require either source, both sources, or a preferred source to hit its target?

Recommended: Show source-specific results side by side and let you choose which basis you are acting on. Do not average their raw values.

Answer: Pending

## 8. How much data should we collect?

Question: Track the whole player pool already delivered by each page, only rostered players, or a watchlist?

Recommended: Save only player ID, name, position/team, numeric trade value, settings, and timestamps from the selected view. Avoid per-player page crawls and paid articles/projections. Filter your portfolio in the app.

Answer: Pending

## 9. How often should values refresh?

Question: Is a manual snapshot before trade decisions sufficient, or would you eventually want scheduled collection?

Recommended: Manual only for the MVP. Never scrape on page load. Show source-specific freshness and failures.

Answer: User confirmed on 2026-09-05: refresh the roster as needed, no more than once per hour. Enforce a persisted one-hour minimum between source attempts, including failures. No scheduler is enabled.

## 10. What should happen when login changes?

Question: Would you prefer opening a local browser to sign in again or updating ignored local credentials?

Recommended: Support local session reuse and normal sign-in. Stop on MFA, CAPTCHA, subscription errors, and rate limits. A failed capture keeps the previous history intact. No bypass service.

Answer: User explicitly approved importing/connecting A League For All Seasons into their DTC account on 2026-09-05. Do not ask for this permission again. Local sign-in preference remains pending; existing credentials and sessions are authorized for development.

## 11. How should package trades be allocated?

Question: When two players and a pick buy three assets, should cost be allocated proportionally, manually, or kept only at the trade/package level?

Recommended: Manual allocation until we agree on an auditable package ledger. Never count the full outgoing package as the cost of every incoming player.

Answer: Pending

## 12. Are draft picks part of the first milestone?

Question: Do you need owned picks with year/round/original-team identity, or just generic early/mid/late pick values?

Recommended: Player tracking first; then real pick identity with explicitly provisional slot estimates. Do not match a pick label to a player.

Answer: Pending

## 13. Is this a portfolio or also a market watchlist?

Question: Do you want separate owned holdings and acquisition targets, including free agents?

Recommended: A market table for all captured players and an explicit portfolio for acquired players. Add saved buy targets after the ownership/cost workflow is settled.

Answer: Pending

## 14. What is a useful alert?

Question: Target reached, source divergence, sharp drops, or stale data? Should alerts stay in the app or be sent elsewhere?

Recommended: Visible target and freshness badges first. No email, push, or chat delivery in this slice.

Answer: Pending

## 15. How do we handle reacquisition?

Question: If you sell and later buy the same player again, should those be independent investments?

Recommended: Separate acquisition lots with their own costs and exits. Preserve the closed lot even while a new one is open.

Answer: Pending

## 16. Do fantasy points count toward ROI?

Question: Does starting a player for a productive season reduce the return you require when trading him away?

Recommended: Keep roster utility separate from trade-value ROI until you define a conversion. No implicit points-to-value formula.

Answer: Pending

## 17. Which historical data exists already?

Question: Do your old CSVs contain source, capture date, scoring format, and acquisitions, or only current values?

Recommended: Import dated observations under their original source/settings, retaining gaps. Reject malformed rows visibly. Never backfill using today's values.

Answer: Pending

## 18. Where will this run?

Question: Is this a private tool on your Windows computer, or do you need phone access away from home?

Recommended: Local-only Express + SQLite + Vite for this MVP. Hosted access requires its own authentication, secret storage, backups, and provider-permission decisions.

Answer: Pending

## 19. How should corrections work?

Question: If an acquisition cost, player mapping, or observation is wrong, do you need an audit log or is an explicit correction enough?

Recommended: Immutable source observations; explicit acquisition corrections and mapping review. Export history before major data changes. Do not silently rewrite old provider values.

Answer: Pending

## 20. What would make this useful enough to replace CSV entry?

Question: Name one real player and acquisition/exit scenario we should use as the acceptance example, including source, cost, and target.

Recommended: One real league, both sources captured with verified formats, one acquisition, two dated observations, a visible ROI calculation, and a recorded exit that survives restart.

Answer: Pending
