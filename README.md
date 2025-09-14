# FF Tools — Unified Sleeper Toolkit

A place for all fantasy tools.

Overview

- Sleeper-first, local-only toolkit built with Node + React.
- Express + Zod backend (TypeScript), Prisma + SQLite for storage.
- Vite + React + Tailwind + DaisyUI frontend.
- Playwright scrapers (opt-in, via .env) with CSV fallback.

Quick Start

- Prereqs: Node 20+, pnpm 9+.
- Install: `pnpm install`
- Dev (API + Web): `pnpm dev`
- Build: `pnpm build`
- Run prod: `pnpm start`

Env

- Copy `.env.example` to `.env` and adjust as needed.
- `SLEEPER_USERNAME` defaults to `crockett`.
- `DATABASE_URL` is SQLite at `prisma/dev.db` by default.

Architecture

- Server: `src/server/index.ts` serves `/api/*` and static client from `dist/client`.
- Client: Vite app under `src/web/*` built to `dist/client`.
- Database: Prisma schema in `prisma/schema.prisma`.
- Data: place CSVs under `data/` (e.g., `data/adp.csv`).

MVP Scope

- Dynasty Value Tracker: ingest Dynasty Nerds GM and Dynasty Calculator values (Playwright) → canonicalize via Sleeper → store timeseries → visualize.
- Sleeper Tools (Beta): ADP CSV view and Keeper roster snapshot endpoints.

Scripts

- `pnpm prisma:migrate` — create/update SQLite schema
- `pnpm sync:nerds` — placeholder Playwright sync for Dynasty Nerds
- `pnpm sync:calc` — placeholder Playwright sync for Dynasty Calculator

Notes

- This repo supersedes prior experiments; legacy folders are archived under `legacy/`.

Testing

- Integration (Jest): `pnpm test` (server code, 70%+ coverage threshold)
- Watch: `pnpm test:watch`
- E2E (Playwright): `pnpm test:e2e` (uses `e2e/` with a dev webServer)

API References

- Sleeper API cheat sheet: `docs/sleeper_api_index.md`
- Curated OpenAPI-like JSON: `docs/sleeper_openapi.json`
