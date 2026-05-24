import { redis } from "./redis";
import { createHash } from "crypto";

const TTL_SECONDS = 60 * 60 * 24; // 24 hours
const IN_FLIGHT_TTL_SECONDS = 30; // cap per-operation execution
const POLL_INTERVAL_MS = 100;
const POLL_MAX_ATTEMPTS = 50; // 50 × 100ms = 5s ceiling on waiting for an in-flight peer

type StoredResult = {
  status: number;
  body: unknown;
  requestHash: string;
};

export type IdempotencyOutcome =
  | { kind: "cached"; status: number; body: unknown }
  | { kind: "reused" }
  | { kind: "in_progress" } // another request with same key is still running
  | { kind: "proceed" };

function hashBody(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

function redisKey(route: string, key: string): string {
  return `idem:${route}:${key}`;
}

function inFlightKey(route: string, key: string): string {
  return `idem:inflight:${route}:${key}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Check whether to short-circuit, wait, or proceed for this idempotency key.
 *
 * Possible outcomes:
 *   "cached"      — a finished response is in Redis. Return it.
 *   "reused"      — a finished response is in Redis but the body hash differs (422).
 *   "in_progress" — another request with this key is still running. Caller should
 *                   return 409 (the client can retry, by which point we'll either
 *                   serve the cached result or be free).
 *   "proceed"     — no peer, no cache. We've claimed the in-flight slot and the
 *                   caller MUST eventually call saveIdempotencyResult or
 *                   releaseIdempotencyInFlight to free it.
 */
export async function checkIdempotency(
  route: string,
  key: string,
  rawBody: string,
): Promise<IdempotencyOutcome> {
  const hash = hashBody(rawBody);
  const finalKey = redisKey(route, key);
  const lockKey = inFlightKey(route, key);

  const cached = await redis.get<StoredResult>(finalKey);
  if (cached) {
    if (cached.requestHash !== hash) return { kind: "reused" };
    return { kind: "cached", status: cached.status, body: cached.body };
  }

  // Try to claim the in-flight slot. NX guarantees only one caller wins.
  const claimed = await redis.set(lockKey, "1", {
    nx: true,
    ex: IN_FLIGHT_TTL_SECONDS,
  });

  if (claimed === "OK") return { kind: "proceed" };

  // Lost the race. Poll briefly for the final result; if it never appears,
  // surface IN_PROGRESS so the route returns a 409 the client can retry.
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    await sleep(POLL_INTERVAL_MS);
    const result = await redis.get<StoredResult>(finalKey);
    if (result) {
      if (result.requestHash !== hash) return { kind: "reused" };
      return { kind: "cached", status: result.status, body: result.body };
    }
  }

  return { kind: "in_progress" };
}

/**
 * Persist the response and free the in-flight slot in a single pipeline call
 * so we don't pay two REST round-trips on the happy path.
 */
export async function saveIdempotencyResult(
  route: string,
  key: string,
  rawBody: string,
  result: { status: number; body: unknown },
): Promise<void> {
  const toStore: StoredResult = { ...result, requestHash: hashBody(rawBody) };
  const pipe = redis.pipeline();
  pipe.set(redisKey(route, key), toStore, { ex: TTL_SECONDS });
  pipe.del(inFlightKey(route, key));
  await pipe.exec();
}

/**
 * Free the in-flight slot without writing a result — used when the operation
 * fails partway and we don't want to cache an error as the canonical response.
 */
export async function releaseIdempotencyInFlight(
  route: string,
  key: string,
): Promise<void> {
  await redis.del(inFlightKey(route, key));
}
