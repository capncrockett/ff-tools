# Dynasty Value Tracker - Hosting and Backup UX Follow-up

Two `TODO.md` items have been parked as "confirmed next directions" without the decisions needed to start them: "Design Vercel hosting with durable storage, exact-user access, and upload from the local browser worker", and "Define backup/restore UX". This document asks for those decisions.

The tracker currently runs locally and backs itself up. On 2026-10-01 the user confirmed that the MVP must be accessible from any device with their PC off and must keep collecting provider prices then. Hosting and hosted capture are therefore part of the intended MVP. Fixing DTC capture remains the first task, followed by hosted operation. The remaining questions decide deployment details, not whether hosting is wanted.

Answer by replacing `Answer: Pending`. Recommendations are the agent's reading of the existing constraints, not decisions already made.

## What is already true

Recorded here so the questions below do not re-ask settled things.

- The tracker is a local Express plus React app on SQLite at `prisma/dev.db`, bound to loopback. Private single-user hosting was confirmed in the archived initial Grill Me document.
- Provider capture drives a real Chromium session against paid subscriptions, using saved browser sessions in ignored `.local/` and credentials in ignored `.env.local`. `AGENTS.md` requires normal authenticated browser flows only, with no challenge bypass, stealth browser, or rotating proxies.
- The local worker captures at 04:00 Pacific and soon after a Sleeper roster addition, with a one-hour per-source reservation shared by the API, CLI, and worker. See [local capture worker](local-capture-worker.md).
- Backups are automatic, compressed, integrity-checked, never pruned, and stored in `ff-tools-backups` outside the repository, or wherever `TRACKER_BACKUP_DIR` points. Restore is CLI-only and backs up the current database first. See [backups](backups.md).
- Captured history cannot be re-captured. That single fact drives most of the caution below.

## 1. Is hosting still wanted, and what is it for?

Question: The hosting item has sat in `TODO.md` since the initial decisions. Before designing anything, what problem would hosting solve that the local app does not? The honest options differ enormously in cost.

Recommended: Say which of these you actually want, because the rest of the answers depend on it.

- (a) **Nothing. Stay local.** Close the item. The tool works, the data is backed up, and hosting adds an attack surface, a bill, and a sync problem for a single-user tool.
- (b) **Read-only viewing from a phone.** You want to check values and ROI away from the desk. This is much cheaper than it sounds and does not require the hosted side to write anything.
- (c) **Full hosted app.** Capture, entry, exit, and review all work from anywhere, and the computer no longer needs to be awake.

Recommendation if you are unsure: (b). It covers the realistic use (checking the portfolio during a trade conversation) without moving the system of record off your machine.

Answer: User-confirmed on 2026-10-01: access from any device, even when the PC is off, and keep collecting new provider prices automatically while it is off. A local-only app or a hosted view that waits for the PC to capture does not satisfy this requirement. Hosted entry/exit editing and the exact login mechanism were not separately discussed.

## 2. Where would the data live?

Question: Vercel's serverless filesystem is ephemeral, so a SQLite file cannot persist there. Hosting means either a different database or a different host. Which direction?

Recommended after the confirmed always-on requirement: keep SQLite on a host with genuine persistent storage, with the app and capture worker using the same database in one service instance. This preserves the current engine and migrations. Hosted Postgres or libSQL remain alternatives if the chosen platform requires them. No platform or storage option has been user-approved yet; Vercel was an earlier planning idea, not a deployment requirement.

Note the migration risk either way: Prisma 7 with the `better-sqlite3` adapter is current, and every migration in `prisma/migrations` is SQLite. Moving engines is a real port, not a connection string change, and the existing captured history has to survive it exactly.

Answer: Pending

## 3. Should anything hosted ever talk to the providers?

Question: Capture needs a logged-in browser session against your paid subscriptions. Should that ever run on a server, or should the local worker remain the only thing that contacts a provider?

Recommended following the 2026-10-01 answer: run the existing browser capture worker on always-on hosted compute. Preserve normal authenticated page flows, provider cooldowns, visible failures, and session recovery. Deliberate hosted-browser acceptance must establish that both provider flows work there; local fixtures do not establish that. The earlier local-only recommendation was not user-approved and is superseded by the confirmed off-PC capture requirement.

Answer: User-confirmed on 2026-10-01: yes. New provider prices must continue to be collected automatically while the PC is off. This authorizes planning hosted capture through normal browser flows; it does not authorize challenge bypass or relaxed validation.

## 4. Which copy is the source of truth?

Question: If a hosted copy exists and the local worker keeps capturing, there are two databases. Which one is authoritative, and what happens when they disagree?

Recommended after the confirmed hosted-capture requirement: one hosted database becomes the production system of record after a backed-up, verified cutover. The existing local database remains preserved during that transition; local development and tests use separate data. Avoid concurrent local and hosted production capture workers writing independent histories. This removes a two-way synchronization problem. The cutover details and remote manual entry/exit editing have not been user-approved separately.

Answer: Pending

## 5. How should access be restricted?

Question: "Exact-user access" was the original phrase. What does that mean concretely?

Recommended: A single-user check, not a user system. In practice: one provider-backed sign-in (GitHub or Google) with a hardcoded allowed account, or a long-lived signed cookie issued once from the local machine. No registration, no password storage, no roles. The repository is public, so the access rule has to work correctly with the source code fully visible.

Answer: Pending

## 6. Should backup and restore have a UI at all?

Question: Backups are automatic and restore is CLI-only (`pnpm run db:restore`). `doctor` reports backup count and the newest backup's age. What, if anything, should the app itself show or let you do?

Recommended: Show, do not do. A small panel with the newest backup's age, the count, and a visible warning when the newest is older than expected would catch the real failure mode, which is backups silently stopping. Keep the restore itself on the CLI: it requires the app and worker stopped, and a restore button in a running app would be a button that cannot safely work.

Answer: Pending

## 7. Should backups ever be pruned?

Question: Nothing is pruned automatically today, deliberately, because captured history cannot be re-captured. `docs/backups.md` says to archive old files by hand if the folder grows. A few hundred kilobytes per backup, taken hourly while the app runs, adds up slowly but without bound. Should that stay?

Recommended: Keep never-prune as the default, and do not add automatic deletion. If the folder size becomes a real annoyance, the safe version is a reporting command that lists what could be archived and requires you to run the deletion yourself, rather than anything that deletes on a schedule. Note that backups are only taken when the database has actually changed, so an idle app does not accumulate them.

Answer: Pending

## 8. Is there a restore path you have actually tested?

Question: Restore is implemented, integrity-checked, and unit-tested against temporary files. Have you ever run it for real against a copy, so you know the procedure works on your machine when you need it?

Recommended: Worth doing once, deliberately, against a copy rather than the live database, and worth recording the date here when done. A backup system nobody has restored from is a hypothesis. This is not a code change; it is a thing to do on a quiet evening.

Answer: Pending
