# Allo Reservation Service

A small inventory reservation service: browse products with per-warehouse stock, hold a unit for 10 minutes, then confirm or cancel. Built as a take-home for Allo Health.

The interesting bits live in `app/api/reservations/*` — concurrent reserves on the last unit of a SKU must yield exactly one success and the rest a clean `409`. See `docs/PLAN.md` for the full design.

## Stack

- Next.js 15 (App Router) + TypeScript
- Prisma + Neon Postgres
- Upstash Redis (locks + idempotency cache)
- Tailwind + shadcn/ui
- Vitest for the concurrency test

## Local setup

> Filled in once the scaffold lands. Short version: clone, copy `.env.example` to `.env`, `pnpm install`, `pnpm prisma migrate dev`, `pnpm dev`.

## Architecture

See `docs/PLAN.md` for the design doc. Highlights:

- Atomic `UPDATE ... WHERE available >= qty` is the correctness guarantee.
- Redis lock is a contention dampener, not a correctness primitive.
- Two-layer expiry: lazy on read + Vercel Cron sweep every minute.

## API

- `GET  /api/products`
- `POST /api/reservations`
- `GET  /api/reservations/[id]`
- `POST /api/reservations/[id]/confirm`
- `POST /api/reservations/[id]/cancel`
- `POST /api/cron/sweep-expired` (cron-secret guarded)

Details and error shapes go here as endpoints land.

## Expiry

TODO: write up the lazy-on-read + cron sweep story once both pieces exist.

## Idempotency

TODO: `Idempotency-Key` header on reserve and confirm, Redis-backed, 24h TTL.

## Trade-offs

- No auth — anonymous `sessionId` cookie is the identity.
- Reservation TTL is hard-coded at 10 minutes.
- Idempotency store is Redis-only (TTL-bound).
- Working on `main` was a take-home choice; on a team I'd use short-lived feature branches and PRs.

More to come as the implementation fills in.
