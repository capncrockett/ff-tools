# Local nightly capture

The optional local worker captures each configured provider at 04:00 Pacific, and soon after a new Sleeper roster addition, while the computer is awake and the process is running. It uses the same database, credentials, saved browser sessions, DTC half-PPR validation, and one-hour reservation as the app and manual CLI. Starting the app or reloading a page never starts the worker.

## Start and inspect

From the repository root, with dependencies and Chromium installed:

```powershell
npm run db:deploy
npm run capture:plan
npm run capture:worker
```

`capture:plan` reads local scheduling state once and exits. It never opens a browser, contacts Sleeper or a paid provider, or reserves an attempt. Use it to see whether a source is due, cooling down, already captured, unconfigured, or paused for recovery.

`capture:worker` stays in the foreground and checks eligibility once per minute. While a roster-tracking provider is configured, it also checks the owned Sleeper roster whenever the shared one-hour Sleeper limit allows. Keep this terminal running overnight. Ctrl+C requests shutdown, lets an active capture finish and close its browser, and skips the next provider. It is not installed as a Windows startup task or hosted service. The built equivalent is `node dist/server/jobs/captureWorker.js` after `npm run build`.

`npm run capture:worker -- --once` performs one eligibility check and exits. Unlike `capture:plan`, it can capture live data when due. It does not wait for a future retry. This is the entry point for a future external scheduler.

## Timing and retry rules

- The local window is 04:00 inclusive to 06:00 exclusive in `America/Los_Angeles`, including daylight saving time. Starting or waking during that window permits a late start. A missed window waits until the next morning; daytime startup does not trigger surprise catch-up captures.
- A completed Sleeper addition (trade, waiver, or free agent) is the one daytime exception, confirmed by the user on 2026-09-13. Once the hourly Sleeper check detects it, each roster-tracking provider is due as soon as its one-hour limit allows, so the added player gets an entry value inside the 36-hour window. Any successful capture that starts after detection satisfies the addition. It gets the same budget as a night: one attempt and one retry for temporary unavailability. An addition older than 36 hours no longer triggers captures. A drop alone does not trigger one, because its exit value comes from before the move. `capture:plan` reports additions an earlier check already saved but never checks Sleeper itself.
- Dynasty GM mirrors the Sleeper league on its own schedule. If its roster has not caught up with a move, the capture fails as temporarily unavailable, saves nothing, and retries after the hour.
- Each source gets at most two attempts in the window. All API, CLI, and worker attempts count, and any successful capture in the window satisfies that night's work.
- Only an explicitly classified temporary `unavailable` failure gets one automatic retry. That retry waits at least one hour from the attempt start. The earlier archived 04:30 recommendation conflicts with the shared one-hour guard; the implementation preserves the guard, so a 04:00 attempt retries at 05:00 or later.
- Login, challenge, rate-limit, configuration, parser, validation, and unclassified failures pause that source across subsequent nights. Review the source error in the app, resolve it, and complete a successful manual capture under the normal cooldown to resume. Old failures without a recorded type also require manual recovery.
- A running or interrupted attempt is not automatically retried in the same window. A following night's capture can proceed after its reservation expires.
- Providers run sequentially. One source's failure does not prevent the other source from being checked. A failure preserves the last saved snapshot, and only controlled status messages are logged.

The database checks scheduling eligibility again in the same transaction that reserves a capture. Restarts, multiple worker processes, and manual captures cannot reset the nightly budget. No new provider endpoints or browser bypasses are used.

## Current limits

This completes the local worker, not hosted collection. Sleep, shutdown, or a stopped terminal prevent collection. The UI shows provider capture status; worker-specific pause and schedule reasons are available through `capture:plan` and the worker console. A recovery wizard, hosted storage, private authentication, and service installation remain future work.

The worker uses the same user-confirmed player absence-to-zero rule as manual captures. An unlisted player receives zero after a successful validated capture; a failed or incomplete capture preserves existing values. Scheduling does not change the accepted Dynasty GM PPR approximation.
