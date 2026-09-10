# Dynasty Value Tracker - Initial Grill Me Archive

Archived on 2026-09-09 after all 20 questions were answered. This document preserves the decisions that defined the first working MVP. New decisions belong in the [active follow-up document](../grill-me-dynasty-tracker.md).

Answer any section by replacing `Answer: Pending`, then commit when convenient. Recommendations below are reversible implementation defaults, not decisions you have already approved. Start with questions 1-5; they have the greatest effect on the next slice.

## 1. What counts as profit?

Question: Is success a higher calculator value, a completed trade returning more value, or a chain of trades that grows your assets?

Recommended: Track both unrealized value growth and realized return on completed exits. Eventually track trade chains separately. A target hit means it is time to consider an exit; it does not mean a league mate will pay that value.

Answer: Yes I think you got it here. We clearly have a baseline and that is the current value of all players on my team. From this point we want to track their value over time so we can determine when to "exit" on a player. Of course the perceived value of a player by another manager (league mate) could differ, but the growth has happened and it's probably time to sell. Then yes we'd also want to track the realized return on a completed trade (exit).

## 2. Confirm the trading direction

Question: You wrote "trade high sell low." Did you mean buy low and sell high, including selling after your ROI target even if the player could rise further?

Recommended: Buy low, sell once the target return is available. Do not try to predict the absolute peak.

Answer: whoops! Yes. of course buy low sell high. My bad. Also yes, we're not trying to chase the absolute peak, we just want some value returned over time and that value to be consistent. Predicting a peak in fantasy football is a fools errand.

## 3. Which league and whose roster?

Question: Which roster ID represents your team, and should other leagues join later?

Recommended: Start with that analyzer, one explicitly selected team, and a league-scoped portfolio. Do not assume Grundle League is this dynasty league or infer a team from its manager's name.

Answer: Confirmed by user: Sleeper league `1378427936817815552` ([league](https://sleeper.com/leagues/1378427936817815552)). Live provider metadata identifies Cascadia Corsairs as the owned team, Dynasty GM analyzer `273947`, and canonical Sleeper roster `7`. Sleeper's actual settings are 12 teams, 1QB, half-PPR, no TE premium, and eight starters. Dynasty GM labels its value set PPR; keep that provider label distinct. Additional leagues: This is my only dynasty league but you got it right. Dyn GM doesn't have 0.5ppr which is lame so ya, we just settle for 1ppr.

## 4. What is the cost basis?

Question: For existing players, should entry cost mean value on acquisition day, value when tracking begins, or your manual allocation of the assets you traded away?

Recommended: Enter a source-specific cost once, with acquisition date and notes. Label the first observed value separately from cost. Never invent historical values. A later slice can suggest acquisition lots from Sleeper trades.

Answer: we can explore this. I don't believe those platforms go back 7 years which is how long we've been playing. Though they might. One thing I forgot to mention, this league migrated from FleaFlicker actually so there's plenty of historical data there in terms of acquisitions of players. I'm of a mind to just set everything from today moving forward though. Especially if there's no historical data on DGM or DTC.

## 5. What is the exit target?

Question: Is a fixed percentage return enough, or do targets vary by player, holding period, or roster role?

Recommended: Editable target per acquisition, initially 20%. Show current return, target value, and points still needed beside the formula. Zero-cost pickups use absolute gain because percentage ROI is undefined.

Answer: I think 20% to start in reasonable. We'll defintely want to tweak it and track it.

## 6. Which scoring settings must match?

Question: Confirm team count, 1QB/SF/2QB, PPR, TE premium, starters, IDP, devy, and any custom valuation settings for the target league.

Recommended: Preserve each provider's actual settings in every snapshot. New settings begin a separate series. Do not label unverified defaults as league-adjusted values.

Answer: Verified from Sleeper on 2026-09-05: `scoring_settings.rec = 0.5`, TE reception bonus absent/zero, and starters QB/RB/RB/WR/WR/TE/FLEX/FLEX. DTC import displays HALF PPR, STANDARD, 12 teams, no TE premium, no RB PPC. Dynasty GM displays its PPR valuation set. Confirm any desired valuation overrides separately.

## 7. What if the providers disagree?

Question: Should an exit signal require either source, both sources, or a preferred source to hit its target?

Recommended: Show source-specific results side by side and let you choose which basis you are acting on. Do not average their raw values.

Answer: You got it. Side by side.

## 8. How much data should we collect?

Question: Track the whole player pool already delivered by each page, only rostered players, or a watchlist?

Recommended: Save only player ID, name, position/team, numeric trade value, settings, and timestamps from the selected view. Avoid per-player page crawls and paid articles/projections. Filter your portfolio in the app.

Answer: Yes this is correct. Let's not worry about the whole player pool just yet. Maybe in the future. Right now just concerned with my team.

## 9. How often should values refresh?

Question: Is a manual snapshot before trade decisions sufficient, or would you eventually want scheduled collection?

Recommended: Manual only for the MVP. Never scrape on page load. Show source-specific freshness and failures.

Answer: User confirmed on 2026-09-05: refresh the roster as needed, no more than once per hour. Enforce a persisted one-hour minimum between source attempts, including failures. No scheduler is enabled. We should schedule a refresh nightly though to be respectful of their servers. That once per hour is more like a guideline for you during development. The golden rule is don't be an asshole to these platforms we love. Perhaps a worker or a serverless function. We'll host this on Vercel and I believe they allow that? We'll have to decide.

## 10. What should happen when login changes?

Question: Would you prefer opening a local browser to sign in again or updating ignored local credentials?

Recommended: Support local session reuse and normal sign-in. Stop on MFA, CAPTCHA, subscription errors, and rate limits. A failed capture keeps the previous history intact. No bypass service.

Answer: User explicitly approved importing/connecting A League For All Seasons into their DTC account on 2026-09-05. Do not ask for this permission again. Local sign-in preference remains pending; existing credentials and sessions are authorized for development.

## 11. How should package trades be allocated?

Question: When two players and a pick buy three assets, should cost be allocated proportionally, manually, or kept only at the trade/package level?

Recommended: Manual allocation until we agree on an auditable package ledger. Never count the full outgoing package as the cost of every incoming player.

Answer: Package trades should be considered the same as a one for one swap on a player. I'm not really sure what you're after here? Like the cost of getting apackage discount or something? If players go out we lose that value, when players come in we gain that value.

## 12. Are draft picks part of the first milestone?

Question: Do you need owned picks with year/round/original-team identity, or just generic early/mid/late pick values?

Recommended: Player tracking first; then real pick identity with explicitly provisional slot estimates. Do not match a pick label to a player.

Answer: I mean yes we want to track players coverted pick value when we draft them in the end. If I have the 1.05 and draft a player the value gets converted, almost like a trade, into the new value. Am I answering the right question?

## 13. Is this a portfolio or also a market watchlist?

Question: Do you want separate owned holdings and acquisition targets, including free agents?

Recommended: A market table for all captured players and an explicit portfolio for acquired players. Add saved buy targets after the ownership/cost workflow is settled.

Answer: let's just start with the tracking. Targets can come layer.

## 14. What is a useful alert?

Question: Target reached, source divergence, sharp drops, or stale data? Should alerts stay in the app or be sent elsewhere?

Recommended: Visible target and freshness badges first. No email, push, or chat delivery in this slice.

Answer: Exactly. Put those things on the roadmap though.

## 15. How do we handle reacquisition?

Question: If you sell and later buy the same player again, should those be independent investments?

Recommended: Separate acquisition lots with their own costs and exits. Preserve the closed lot even while a new one is open.

Answer: agreed.

## 16. Do fantasy points count toward ROI?

Question: Does starting a player for a productive season reduce the return you require when trading him away?

Recommended: Keep roster utility separate from trade-value ROI until you define a conversion. No implicit points-to-value formula.

Answer: Oh ya we're not doing that. We're just using the values from those two platforms.

## 17. Which historical data exists already?

Question: Do your old CSVs contain source, capture date, scoring format, and acquisitions, or only current values?

Recommended: Import dated observations under their original source/settings, retaining gaps. Reject malformed rows visibly. Never backfill using today's values.

Answer: No need to import that. It's 3 years old. It was really just so you could get an idea of how I USED to track things manually. We're building it's replacement and values will come from scratch.

## 18. Where will this run?

Question: Is this a private tool on your Windows computer, or do you need phone access away from home?

Recommended: Local-only Express + SQLite + Vite for this MVP. Hosted access requires its own authentication, secret storage, backups, and provider-permission decisions.

Answer: Ya it will get hosted on Vercel, but for now we'll just be running locally.

## 19. How should corrections work?

Question: If an acquisition cost, player mapping, or observation is wrong, do you need an audit log or is an explicit correction enough?

Recommended: Immutable source observations; explicit acquisition corrections and mapping review. Export history before major data changes. Do not silently rewrite old provider values.

Answer: you got it.

## 20. What would make this useful enough to replace CSV entry?

Question: Name one real player and acquisition/exit scenario we should use as the acceptance example, including source, cost, and target.

Recommended: One real league, both sources captured with verified formats, one acquisition, two dated observations, a visible ROI calculation, and a recorded exit that survives restart.

Answer: There is only one league we're tracking. We'll track this over time so having some sort of graph will be really helpful, just a line graph that can be filered to position.
