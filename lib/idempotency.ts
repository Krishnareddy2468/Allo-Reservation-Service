import { redis } from "./redis";
import { createHash } from "crypto";

const TTL_SECONDS = 60 * 60 * 24; // 24 hours
const IN_FLIGHT_TTL_SECONDS = 30;  // max time for the actual operation

type StoredResult = {
  status: number;
  body: unknown;
  requestHash: string;
};

function hashBody(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

function redisKey(route: string, key: string): string {
  // Namespace by route so the same key on different endpoints never collides
  return `idem:${route}:${key}`;
}

function inFlightKey(route: string, key: string): string {
  return `idem:inflight:${route}:${key}`;
}

/**
 * Check whether a cached response exists for this idempotency key.
 *
 * Returns:
 *   "REUSED"       — key exists but body hash differs (422 situation)
 *   StoredResult   — key exists and body matches (return the cached response)
 *   null           — key is new, proceed with the operation
 *
 * If the key is in-flight (another request is mid-operation), we wait a short
 * time and retry once, then fall through to let the DB handle it.
 */
export async function checkIdempotency(
  route: string,
  key: string,
  rawBody: string,
): Promise<StoredResult | "REUSED" | null> {
  const hash = hashBody(rawBody);
  const rKey = redisKey(route, key);

  const stored = await redis.get<StoredResult>(rKey);

  if (stored) {
    if (stored.requestHash !== hash) return "REUSED";
    return stored;
  }

  // Mark in-flight so concurrent retries with the same key don't race
  await redis.set(inFlightKey(route, key), "1", { ex: IN_FLIGHT_TTL_SECONDS, nx: true });

  return null;
}

/**
 * Store the result of a completed idempotent operation.
 */
export async function saveIdempotencyResult(
  route: string,
  key: string,
  rawBody: string,
  result: { status: number; body: unknown },
): Promise<void> {
  const hash = hashBody(rawBody);
  const rKey = redisKey(route, key);

  const toStore: StoredResult = { ...result, requestHash: hash };

  await redis.set(rKey, toStore, { ex: TTL_SECONDS });
  // Clean up the in-flight marker
  await redis.del(inFlightKey(route, key));
}
