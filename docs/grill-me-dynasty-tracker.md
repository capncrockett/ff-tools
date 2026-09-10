# Dynasty Value Tracker - Player Automation Follow-up

The [initial Grill Me](archive/grill-me-dynasty-tracker-initial-2026-09-09.md) and [first follow-up](archive/grill-me-dynasty-tracker-follow-up-2026-09-09.md) are complete and archived. The first follow-up confirmed that this product follows individual player and pick value, automates normal changes from Sleeper, and sends only ambiguous data to review.

The earlier package questions were trying to solve one technical problem: a single Sleeper transaction can add and remove several assets, so the tracker needs its transaction ID to avoid applying only half of an update or applying the same update twice. That ID can remain background provenance. The UI and return calculations do not need a package portfolio, package ROI, or trade-chain view.

Answer by replacing `Answer: Pending`. Questions 1-3 define automatic player entries and exits. They do not block alerts, local capture, or other independent work.

## 1. Confirm the automatic player-level lifecycle

Question: Does this rule match what you mean by player-level tracking?

Recommended: When Sleeper adds a player, create a separate holding for each provider/context from the first fresh observation at or after the move. When Sleeper removes a player, close each open holding at that player's last observation at or before the move. Apply the same rule independently to every player in a multi-player trade. Keep the Sleeper transaction ID only for traceability and replay protection. If the required value is missing or more than 36 hours old, flag that player instead of inventing a value.

Answer: yes

## 2. What is the baseline for a waiver or free-agent addition?

Question: A waiver or free-agent addition has no outgoing player or pick. Should its entry basis be zero or the acquired player's first provider value?

Recommended: Use the player's first fresh provider value after the acquisition. That creates the same editable 20% growth target as every other player. Keep FAAB separate because dollars and provider trade-value points are unrelated. Use zero only when a provider explicitly values the player at zero.

Answer: yes to all that.

## 3. How should a stale removal be finalized?

Question: If a player leaves the Sleeper roster but the last provider value is older than 36 hours, should the tracker wait for your review or close the holding with a visible provisional value?

Recommended: Keep the holding open in `Needs review` state and show the last known value and its age. Let the next normal provider capture resolve it when possible. If the provider no longer returns the departed player, offer that last value as a one-click explicit correction rather than silently treating it as current.

Answer: that sounds good.

## 4. How should future picks be valued before draft order is known?

Question: Should a pick such as your 2027 first use the provider's generic first-round value until it becomes an exact slot, or remain unvalued until the slot is known?

Recommended: Preserve the real Sleeper identity by season, round, and original team. Attach the provider's explicitly labeled generic value while draft order is unknown and mark it provisional. Start a distinct exact-slot series once the order is set. When the pick is used, convert its latest confirmed value in each provider/context into the drafted player's entry basis, as you specified.

Answer: You got it. It would be good to also project the pick cause these platforms differeneitate early, mid, late round picks. Sleeper will always forecast the playoff bracket. In this league we do a style of playoffs that can be seen https://github.com/capncrockett/league-for-all-seasons and here if it's helpful https://league-for-all-seasons.vercel.app/playoffs/live

## 5. Where should the first scheduled browser worker run?

Question: Can the first 4:00 AM capture worker run in a container on your computer or a self-hosted GitHub Actions runner, or must it run entirely on hosted infrastructure?

Recommended: Start with a local container or self-hosted runner that retains the authenticated browser sessions. Run at 4:00 AM Pacific, retry once at 4:30 AM, and upload only validated snapshots to the private hosted app. Your Eugene Art House workflow is a useful model for bounded Playwright execution, but its GitHub-hosted runner starts fresh and does not need to preserve a paid login session.

Answer: As long as Github or Vercel can offer it for free we'll do it that way. For now yes, since we're still in MVP, we can just run it locally.
