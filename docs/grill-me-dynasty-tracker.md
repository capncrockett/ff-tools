# Dynasty Value Tracker - Pick Projection Follow-up

The [player automation follow-up](archive/grill-me-dynasty-tracker-player-automation-2026-09-10.md) is complete and archived. Its answers established automatic player-level entries and exits from Sleeper, a 36-hour freshness limit, and explicit review of stale removals. The tracker now has the implementation foundation for those rules.

This follow-up defines the next asset type: owned rookie picks. The linked [League for All Seasons playoff app](https://github.com/capncrockett/league-for-all-seasons) provides the league-specific projection rules. Pending answers do not block player tracking or local capture.

Answer by replacing `Answer: Pending`.

## Confirmed player absence rule (2026-09-13)

The user confirmed that a player absent from a provider is worth zero on that provider. This applies independently to Dynasty GM and DTC after a successful validated capture, with an `absent:sleeper:<id>` observation key and a source-status note identifying the tracker rule. It supersedes the earlier missing-player exception list. An unavailable capture, incomplete metadata, an unreadable value, or an ambiguous match is still an error. Existing observations are not rewritten; the rule applies on subsequent captures. This does not decide the pending rookie-pick valuation questions below.

Clarified by the user the same day, after a live check found Dynasty GM's catalog holds 4,362 players against roughly 1,700 active NFL players. DTC ranks only about a top 300, so a DTC absence is a real 0. Dynasty GM lists essentially everyone, so a player it cannot match is a matching problem, never a zero. A Dynasty GM "NR" row is simply a 0. Dynasty GM now matches within the owned team roster and fails visibly on a player with no catalog match.

## Confirmed prompt capture after Sleeper moves (2026-09-13)

The user confirmed that when a Sleeper roster move happens, provider values should update as soon as practical instead of waiting for the next 04:00 window. The hourly per-source limit exists as courtesy to the provider sites, and the user would refresh manually right after a trade anyway. The local worker checks Sleeper at most hourly. After a completed addition (trade, waiver, or free agent), it captures each roster-tracking provider once the shared one-hour limit allows. The single retry for temporary unavailability and the recovery pause still apply. A drop alone does not trigger a capture, because its exit value comes from before the move. Dynasty GM mirrors the Sleeper league on its own schedule, so a roster mismatch right after a move is classified as temporary unavailability rather than a parser failure.

## 1. Confirm the projected pick bands

Question: Should every projected round use these three four-team bands: playoff lottery teams as early picks 1-4, middling-bracket teams as mid picks 5-8, and championship-bracket teams as late picks 9-12?

Recommended: Yes. Apply the same original-team projection to rounds 1-4. Preserve the real pick identity as season, round, and original Sleeper roster. The band selects a provider value but never changes who originally owned the pick.

Answer: Yes

## 2. How should the bottom-four lottery be shown?

Question: Your playoff app gives the bottom four teams weighted lottery tickets, so their exact order is deliberately unknown until the lottery. Should the tracker attempt an expected exact slot or stop at `early`?

Recommended: Stop at `early` before the lottery. Display the four possible exact slots and current ticket odds as forecast detail, but do not turn an expected slot into a provider value. Switch to the exact slot only after the league records the lottery result.

Answer: You got it. Early until lottery, once we know spots we can swap to legit pick slots.

## 3. Which forecast should drive the bracket during the season?

Question: Should the tracker reproduce the current playoff app's forecast, which seeds from Sleeper and simulates future bracket games using each team's season-long weekly average?

Recommended: Yes. Reuse that league-specific algorithm and its custom path that sends championship first-round losers into the middling bracket. Save the forecast timestamp and inputs with each pick observation so a band change can be explained later.

Answer: yes. Whatever the league for all seasons site I shared does, that what we do.

## 4. What should happen when a pick changes bands?

Question: If an original team's forecast moves from `early` to `mid`, should the same pick history continue with the new provider value or should each band have a separate series?

Recommended: Keep one history per real pick, provider, and scoring context. Record the projected band on every observation. A change from early to mid is a real change in the pick's tracked outlook, so the chart should show it and explain that the band changed on that date.

Answer: Yes we should track band changes. Once we start trying to hunt for trade partners we'll want to know how to value their pick based on the current playoff projection.

## 5. What if a provider lacks the needed pick label?

Question: If a provider offers a generic round value but no matching early, mid, or late label for that year and round, should the tracker use the generic value or leave the pick unvalued?

Recommended: Use the provider's generic value only when it is explicitly available, label it `generic/provisional`, and keep it in the same provider scale. Never derive a missing band by averaging other pick values. If neither label exists, show `Needs review` with no invented value.

Answer: sounds good. COuld also just say "1st" if unknown and "1.xx" for example is known.
