# Dynasty Value Tracker - Follow-up Grill Me Archive

Archived on 2026-09-09 after all 10 questions were answered. These answers confirmed player-level tracking, automatic Sleeper updates with visible ambiguity review, one nightly retry, private single-user access, in-app alert thresholds, and visible session recovery. The later [player automation follow-up](grill-me-dynasty-tracker-player-automation-2026-09-10.md) completed the lifecycle details.

The [initial 20-question Grill Me](archive/grill-me-dynasty-tracker-initial-2026-09-09.md) is complete and archived. It established the current MVP: one owned dynasty roster, values tracked from the first capture forward, separate provider scales, an editable 20% initial target, explicit entries and exits, and position-filtered history.

Answer any section by replacing `Answer: Pending`, then commit when convenient. Pending answers do not stop unrelated implementation. Start with questions 1-4 because they define the next ledger schema.

## 1. How should a package trade become a realized result?

Question: If two players and a pick leave in one trade and three assets arrive, should the tracker report one result for the whole package, close each outgoing player separately, or do both?

Recommended: Save one immutable trade event with every incoming and outgoing asset, one provider and scoring context, and the values observed for that trade. Report the package's total incoming value, total outgoing value, point gain, and percentage return. Mark outgoing holdings as transferred in that trade without inventing individual proceeds. Allow optional manual allocation later when you want player-level realized returns.

Answer: we really just want to focus on player-level values. So the concept of a package being separate isn't something I'm really understanding. Why would you want to do that?

## 2. What is the cost basis when a draft pick becomes a player?

Question: When the 1.05 becomes the selected rookie, should the player's starting cost be the pick's last value, the rookie's first value, or a manual number?

Recommended: Track the pick by season, round, and original team. At the draft, preserve an immutable conversion from that pick to the selected player. Use the pick's latest confirmed value from the same provider and scoring context as the player's initial cost, with an explicit manual override when that value is missing or misleading.

Answer: We should think of the pick as a trade for that player. So pick goes out, and player comes in. Picks latest confirmed value then that becomes the players confirmed value at the time of drafting.

## 3. Should Sleeper transactions create suggestions or ledger entries?

Question: Should the tracker read new Sleeper trades and waiver moves, then ask you to confirm them, or should every entry remain manual?

Recommended: Import transactions from a chosen activation date into a pending review queue. Suggest the involved players and picks, but require confirmation of the provider, scoring context, cost, and package treatment before changing holdings. Do not reconstruct the seven-year FleaFlicker history unless you explicitly reopen that scope.

Answer: Gods no. You're tracking all this! No more manual updates for me hopefully. Flag it if it's ambigious or there's an issue, otherwise this thing should just work.

## 4. What does profit across a trade chain mean?

Question: When one acquired player later becomes several assets and those assets split across more trades, do you want one cumulative chain result, results per trade event, or both?

Recommended: Model the history as connected trade events because packages can split and merge. Show each event's result and a cumulative chain view containing total value sent, total value received, and the current value of assets still owned. Keep every calculation within one provider and scoring context.

Answer: Again.. I'm not sure why you're trying to think of things in packages. Help me understand. I don't think it's warratned.

## 5. Which corrections need an audit trail?

Question: Should you be able to correct acquisition date, cost, target, notes, player mapping, and trade membership? Should any record be permanently deleted?

Recommended: Append a correction record containing the prior value, replacement value, reason, and timestamp. Keep provider observations immutable. Permit an explicit void for a mistaken manual entry while retaining its audit record. Require review before moving observations from one player identity to another.

Answer: Ideally the sources of truth are coming from the platforms. If there's an issue flag it and we can review.

## 6. Where should authenticated captures run after hosting?

Question: When the UI moves to Vercel, should paid-provider browser sessions remain on your computer, move to a private hosted browser worker, or be captured manually and uploaded?

Recommended: For the first hosted version, keep browser sessions and provider credentials in a small local capture agent and send only validated snapshots to the private hosted app. This keeps the already-working normal browser flow while the hosted database and authentication settle. Consider a private hosted browser worker as a separate later migration.

Answer: While getting this to work that sounds great. I guess we'd need a containerized run of some sort? Here's an example of how I've scraped pages in the past: https://github.com/capncrockett/eugene-arthouse-tickets.

## 7. What should the nightly capture schedule do after a failure?

Question: What local time should the nightly attempt run, and should a failed provider try again before the following night?

Recommended: Attempt each provider once at 4:00 AM `America/Los_Angeles`. Preserve the last good snapshot and display the failure. Wait until the following night for the next automatic attempt; a deliberate manual capture remains available under the shared one-hour guard.

Answer: That all sounds good. Allow for one retry if the 4am window fails.

## 8. What access and recovery does the hosted version need?

Question: Is this strictly one-user private access, and should the phone experience be fully editable or primarily for checking values and trades?

Recommended: Authorize one exact user account, keep the complete tracker available on phone and desktop, and require a fresh confirmation for provider session recovery. Store data in a durable hosted database with encrypted daily backups and a tested restore path before relying on nightly collection.

Answer: totally. This is JUST FOR ME. So things should be private and secure.

## 9. Which alert thresholds are actually useful?

Question: What should count as a sharp drop, stale data, or meaningful disagreement between providers?

Recommended: Start with in-app alerts only. Use the holding's configured target for target alerts, 36 hours for stale nightly data, and a 10% change since the previous observation for a sharp move. Compare provider percentage movement from each provider's own baseline only when both observations are fresh; never compare their raw point scales.

Answer: sounds good.

## 10. How should expired provider sessions be recovered?

Question: When a normal login expires, should the app open a visible local browser flow for you to complete, or should recovery remain a developer command?

Recommended: Show a clear `Sign-in required` capture status and provide an explicit action that opens the normal visible browser flow. Save the refreshed session locally, record no credentials or page bodies, and resume scheduled captures only after the session has been verified.

Answer: let's try this first and if there's still issues we'll work it from there.
