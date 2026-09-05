# FF Tools - Dynasty Value Tracker

A private dynasty portfolio for **A League For All Seasons**. Capture the values your subscriptions show, preserve observations over time, record what you invested, and record proceeds when you trade out.

The active MVP uses React, Vite, Tailwind/DaisyUI, Express, Zod, and Prisma/SQLite. Its repository workflow follows [Grundle Ball](https://github.com/capncrockett/grundle-ball); it does not copy that league's keeper rules.

## Run locally

Prerequisites: Node 24+, Corepack/pnpm 9, and Chromium for paid-provider capture.

```powershell
corepack pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
npm run prisma:generate
npm run db:deploy
npm run browser:install
npm run players:seed
npm run dev
```

Only copy the example on first setup; preserve an existing `.env.local`. Fill its optional credentials to enable capture. Player seeding downloads Sleeper's public player catalog at most once per day and provides canonical identities before the first import.

Open [the local app](http://127.0.0.1:5173). For a built app, run `npm run build`, then `npm start` and open [port 3000](http://127.0.0.1:3000). Both servers bind to loopback. This MVP runs on your computer. The user intends Vercel hosting and nightly collection; the durable storage, authentication, and browser-worker design is the next slice.

The database is `prisma/dev.db`. Credentials live in ignored `.env.local`; browser sessions and the player catalog live in ignored `.local/`. Environment variables override local-file values. No credentials belong in Git or the browser app.

## Using the tracker

1. Click **Capture values** for each source when you need a new observation. The API and CLI share a persisted one-hour minimum between attempts, including failures. There is no scheduler, background scraping, or capture on page reload.
2. Filter **Player values** and compare growth since the first saved value under **Since tracking began**. Click a player's name for dated history. Use **Record entry** to record a separate acquisition cost, date, source, portfolio, and target.
3. Review **My investments**. Return is `(value - cost) / cost * 100`; the editable initial target is 20%. A target hit is an unrealized signal, not proof that someone will accept the trade.
4. Use **Record exit** with actual proceeds allocated in the same provider's points. Realized return uses those proceeds, not a later quote. Reacquiring a player creates a separate investment.
5. Export history periodically. The JSON export is a report of observations and holdings, not a one-click database restore. For a full backup, stop the app and copy the SQLite database to a private backup location.

Zero cost produces absolute gain with undefined percentage ROI. Quotes older than an acquisition do not produce unrealized return. Values more than seven days old are visibly stale and excluded from the fresh-target count.

Each provider and scoring context keeps a separate series. DTC's imported league is half-PPR/1QB; Dynasty GM calls its valuation set PPR. Their numbers are never averaged. Current capture scope is the owned QB/RB/WR/TE roster, including supported bench/taxi/IR players. Both providers exposed 29 supported players while Sleeper listed 30 roster entries at verification. Missing players and draft picks do not become zero-valued observations.

See [source behavior and limitations](docs/sources.md).

## Import existing observations

Use **Import snapshot** for one source, one format, and one capture timestamp per file. Use the true observation date; today's price is not historical data.

CSV requires `player_name,value,captured_at`. Optional columns are `source_key,sleeper_id,position,team`. Select the source and describe the original scoring format in the import dialog. For example, this is a synthetic format illustration, not a price to add to your real history:

```csv
player_name,value,captured_at,source_key,position
Example Receiver,120,2026-01-01T12:00:00Z,example-1,WR
```

JSON preserves structured settings and is preferable when continuing an existing context:

```json
{
  "source": "dynasty-nerds",
  "capturedAt": "2026-01-01T12:00:00Z",
  "context": {
    "label": "Example league / PPR / 1QB",
    "settings": { "scoring": "PPR", "quarterbacks": "1QB", "teams": 12 }
  },
  "records": [
    {
      "sourceKey": "example-1",
      "playerName": "Example Receiver",
      "position": "WR",
      "value": 120
    }
  ]
}
```

Include a confirmed `sleeperId` for exact identity. Otherwise a unique normalized name and position can match the seeded Sleeper catalog. Unmatched players retain a visible source identity; ambiguous matches fail the entire import. Existing mappings never silently switch players. There is no mapping-correction UI yet.

Settings, not their display label, define a context. A CSV's free-text format defines a separate context from browser captures; importing an old CSV does not silently splice its values into a live provider series. Identical reimports are idempotent. Conflicting same-time values and malformed/truncated batches fail atomically.

## Development and validation

Start with `npm run doctor` and [the agent workflow](docs/agent-workflow.md).

| Command                                    | Purpose                                                           |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `npm run verify:quick`                     | Repository checks, formatting, lint, and both TypeScript projects |
| `npm run verify`                           | Quick checks, isolated SQLite tests, and client/server builds     |
| `npm run verify -- --e2e`                  | Full checks plus real Chromium UI and provider DOM fixtures       |
| `npm run sync:nerds` / `npm run sync:calc` | Explicit live capture using the same hourly guard as the UI       |
| `npm run players:seed`                     | Seed/update canonical players using the daily local catalog cache |
| `npm run db:deploy`                        | Apply checked-in SQLite migrations without resetting data         |

Tests never contact the paid providers or use the real database. Browser tests run a separate app on port 4174 and use synthetic fixture data. The retained Sleeper ADP/keeper experiments are outside this MVP and remain unlinked in the UI.

For an existing database created with the original schema, make a private backup first, then baseline that existing schema with `corepack pnpm exec prisma migrate resolve --applied 202609040001_baseline` before `npm run db:deploy`. Do not mark the baseline applied to an empty database. The additive tracker migration keeps old valuations under an explicit unverified context.

## Product decisions

Answer and commit [the Grill Me document](docs/grill-me-dynasty-tracker.md) as convenient. Confirmed direction: this one dynasty team, tracking from current values forward, an initial editable 20% ROI target, and separate provider values. Dynasty GM's PPR approximation is accepted. FleaFlicker acquisition history exists, but no historical provider prices have been established. Package allocation, picks, mapping corrections, alerts, and the implementation of nightly hosted collection remain later slices. A first snapshot establishes a baseline, not a trend.

Architecture: [docs/architecture.md](docs/architecture.md). Versioning: [docs/versioning.md](docs/versioning.md). Next work: [TODO.md](TODO.md).
