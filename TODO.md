# Roadmap (Checklist)

## M1: Dynasty Value Tracker
- [ ] Server: Express+Zod endpoints: `/api/sync/:source`, `/api/players`, `/api/valuations`, `/api/timeseries/:playerId`.
- [ ] DB: Prisma schema applied; migrate and seed players via Sleeper API.
- [ ] Scrapers: Playwright flows for Dynasty Nerds GM and Dynasty Calculator; CSV import fallback.
- [ ] Mapping: Sleeper master players → canonical IDs; add `Mapping` overrides when needed.
- [ ] UI: DaisyUI table with per-player timeseries, source comparison, and sync buttons.

## M1.1: Polish + Scheduler
- [ ] Node-cron nightly sync if creds present; rate limit + backoff.
- [ ] Basic charts and sparklines.

## M2: Sleeper Tools (Beta → Solid)
- [x] Port basic Keeper and ADP endpoints to Node (beta).
- [ ] Configurable league filter; caching; refine data mapping.
- [ ] Add simple draft board (non-drag first).

## M3: Sleeper Mini (TBD)
- [ ] Playoffs bracket experiment.

---

## Testing Strategy (Trophy)
- [x] Integration test setup (Jest + ts-jest + supertest + nock).
- [x] Initial integration tests for health, ADP, keeper endpoints.
- [x] E2E scaffold (Playwright) with smoke test.
- [ ] Maintain 70%+ coverage as features ship.

## Tech Tasks
- [ ] Set up Prisma migration successfully on local (schema engine was flaky on CI).
- [ ] Sleeper API wrapper util and player seeding script.
- [ ] `/api/sync/:source` orchestrator with Playwright providers.
- [x] Add docs: Sleeper API cheat sheet and OpenAPI-like index.

## Cleanup/Archival
- [x] Move legacy projects to `legacy/` and remove nested `.git`.
- [x] Rename legacy `package.json` to `package.json.legacy` to avoid interference.
