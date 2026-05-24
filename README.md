# Allo Reservation Service

A checkout-reservation system for multi-warehouse inventory. When a customer proceeds to checkout, a unit is held for 10 minutes. If payment succeeds (simulated here by "Confirm purchase"), the stock is permanently decremented. If the timer runs out or they cancel, the hold is released.

Live URL:https://allo-reservation-service-956mxg8xu.vercel.app/products

---

## How to run locally

**Prerequisites:** Node ≥ 20, pnpm, a [Neon](https://neon.tech) Postgres project, an [Upstash](https://upstash.com) Redis database.

```bash
git clone <repo>
cd allo-reservation-service

# 1. Install dependencies
pnpm install

# 2. Copy env template and fill in your values
cp .env.example .env

# 3. Run migrations against your Neon database
pnpm db:migrate:deploy   # or: pnpm db:migrate  (for dev with migration prompts)

# 4. Seed the database
pnpm db:seed

# 5. Start the dev server
pnpm dev
```

Open http://localhost:3000 — you'll land on the products page.

### Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon pooled connection string (for the app) |
| `DIRECT_URL` | Neon direct connection string (for migrations and raw transactions) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |
| `CRON_SECRET` | Random secret used to authenticate the `/api/cron/sweep-expired` endpoint |

---

## How expiry works in production

Two complementary layers:

**1. Lazy expiry on read** (`lib/reservations/get.ts`)

Every time `GET /api/reservations/:id` is called, the handler checks whether a PENDING reservation is past its `expiresAt`. If so, it runs an atomic transaction that decrements `reservedUnits` on the `StockLevel` row and flips the reservation to `EXPIRED` before returning. This means stock is freed the instant a user (or the SWR poller on the checkout page) looks at the reservation.

**2. Vercel Cron sweep** (`app/api/cron/sweep-expired/route.ts`, `vercel.json`)

A cron job calls `POST /api/cron/sweep-expired` on a schedule. The endpoint bulk-finds all `PENDING` reservations with `expiresAt < now()`, groups them by `(productId, warehouseId)` to batch the stock updates, and updates everything in a single Postgres transaction (sequential `$executeRaw` inside the interactive transaction — Prisma transactions run on a single connection, so concurrent queries inside one are unsafe).

The schedule in `vercel.json` is `0 3 * * *` (once daily at 03:00 UTC) because Vercel's Hobby plan caps cron jobs at one run per day. On a Pro account this would be `* * * * *` (every minute).

Together these layers ensure:
- A reservation that a user is actively viewing expires precisely when the countdown hits zero (next SWR poll, max 3 seconds after expiry).
- Truly abandoned reservations (no one ever opens the page again) are reclaimed at the daily sweep, *or* the moment any other user views them or tries to reserve from the same SKU — `getReservation` runs the lazy-expiry transaction every time it's hit.

In production, I'd replace the daily cron with **Upstash QStash** or **GitHub Actions** firing every minute against `/api/cron/sweep-expired` (the endpoint is already auth'd with `CRON_SECRET`). That gives sub-minute orphan cleanup without paying for Vercel Pro. The current setup is fine for a take-home demo because the lazy-on-read layer is what actually matters for the user-facing flow.

---

## How idempotency works

`POST /api/reservations` and `POST /api/reservations/:id/confirm` both honour an optional `Idempotency-Key: <uuid>` request header.

Flow on the server (`lib/idempotency.ts`):

1. Hash the request body with SHA-256.
2. Look up `idem:{route}:{key}` in Redis.
   - **Key exists, hash matches** → return the stored `{status, body}` immediately, no DB work.
   - **Key exists, hash differs** → return `422 IDEMPOTENCY_KEY_REUSED`.
   - **Key absent** → atomically claim an in-flight slot via `SET idem:inflight:{route}:{key} NX EX 30`.
     - If we win the slot, perform the operation, then write `{status, body, requestHash}` with a 24h TTL and clear the in-flight marker (single Redis pipeline, one round-trip).
     - If we lose the slot, another request with the same key is mid-flight. We poll the final key for up to 5 seconds; if it appears we serve it, otherwise we return `409` so the client can retry.

The `SET ... NX` is the actual mutual-exclusion gate, so two simultaneous retries with the same key cannot both create a reservation.

Limits (documented honestly):
- The store lives only in Redis. If the Redis instance is flushed, stored responses are lost and a retry would be treated as a fresh request. Acceptable for a take-home; in production this would be backed by Postgres.
- TTL is 24 hours. Keys older than that are forgotten.

---

## Concurrency design

The core correctness guarantee is a single SQL statement in `lib/reservations/create.ts`:

```sql
UPDATE "StockLevel"
SET "reservedUnits" = "reservedUnits" + $qty,
    "updatedAt"     = NOW()
WHERE "productId"   = $productId
  AND "warehouseId" = $warehouseId
  AND ("totalUnits" - "reservedUnits") >= $qty
```

If `rowCount === 0`, the row hasn't been updated (no stock), and we throw `NotEnoughStockError` → 409. Two concurrent requests for the last unit will both hit this statement; only one will see `rowCount = 1` because Postgres's row-level locking ensures one executes before the other.

The Redis lock (`lib/lock.ts`) wraps this UPDATE. It doesn't add correctness — the SQL alone is race-free — but it reduces wasted DB work under heavy contention: most requests that arrive while the lock is held will be turned away immediately rather than queueing up at the DB.

The concurrency test in `tests/reservations.concurrent.test.ts` fires 50 parallel requests for the last unit and asserts exactly 1 `201` and 49 `409` responses.

---

## Demo script (for the debrief)

1. Open `/products` in two browser tabs.
2. Find the **Fujifilm X100VI (Last Unit)** — it has exactly 1 unit in Mumbai.
3. Click "Reserve from Mumbai" in both tabs at roughly the same time.
4. One tab gets a reservation page with a 10-minute countdown. The other shows a 409 "out of stock" banner.
5. On the successful tab, wait for the countdown to expire (or shorten `RESERVATION_TTL_MINUTES` to 1 minute for the demo). The page transitions to an "expired" view.
6. Go back to products — the Fujifilm is available again (reservedUnits was released by lazy expiry or the cron sweep).
7. Reserve again and click **Confirm purchase** — the stock is permanently decremented and the reservation shows "Confirmed".

---

## API reference

All error responses have shape `{ error: { code: string, message: string } }`.

| Method | Path | Success | Errors |
|---|---|---|---|
| `GET` | `/api/products` | `200` products with stock per warehouse | — |
| `GET` | `/api/warehouses` | `200` warehouses | — |
| `POST` | `/api/reservations` | `201` reservation | `400` validation, `409` NOT_ENOUGH_STOCK, `409` idempotency in-flight, `422` IDEMPOTENCY_KEY_REUSED, `503` lock timeout |
| `GET` | `/api/reservations/:id` | `200` reservation (lazily expired if past `expiresAt`) | `404` not found |
| `POST` | `/api/reservations/:id/confirm` | `200` confirmed | `404`, `409` not pending, `410` RESERVATION_EXPIRED |
| `POST` | `/api/reservations/:id/release` | `200` released (held units returned to available stock) | `404`, `409` not pending |
| `POST` | `/api/reservations/:id/cancel` | alias for `/release` (kept for backwards compatibility) | same as `/release` |
| `POST` | `/api/cron/sweep-expired` | `200 { swept: N }` | `401` missing/wrong secret |

---

## Trade-offs and things I'd do differently

**No auth.** Sessions are identified by an `httpOnly` cookie (`sid`) set on first visit. A real system would tie reservations to authenticated user accounts, and the confirm step would be triggered by a payment webhook rather than a button click.

**Reservation TTL is hard-coded** at 10 minutes in `lib/reservations/types.ts`. In production this would vary by payment method (UPI timeouts differ from card 3DS flows).

**Idempotency store is Redis-only.** It works for a take-home but a production version would persist results to Postgres so they survive a Redis flush.

**Cron granularity.** Vercel's Hobby plan caps cron jobs at one run per day, so the deployed sweep runs daily at 03:00 UTC. Lazy expiry on read still flips each reservation to `EXPIRED` the instant a user (or any other shopper looking at the same SKU) views it, so the user-facing precision is ±3 seconds (the SWR poll interval) regardless of when the sweep runs. With more time / a paid plan I'd swap the sweep to per-minute via Upstash QStash or GitHub Actions, which is documented in the expiry section above.

**`EXPIRED` vs `RELEASED`.** The spec mentions three statuses (pending, confirmed, released). We split the terminal "released" state into `RELEASED` (user/system cancelled while still valid) and `EXPIRED` (timer ran out) because the distinction is useful for ops and analytics. Both return the held units to available stock the same way.

**`main` branch workflow.** I worked directly on `main` for speed. In a team context I'd use short-lived feature branches and PRs.

**The confirm step stands in for a payment webhook.** A real checkout flow would: create a payment intent → await webhook → confirm the reservation. The current design puts that confirmation in the user's hands, which is fine for a demo but not production.
