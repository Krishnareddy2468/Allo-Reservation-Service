import { redis } from "./redis";
import { randomUUID } from "crypto";

const LOCK_TTL_MS = 5000;
const RETRY_INTERVAL_MS = 50;
const MAX_RETRIES = 3;

/**
 * Acquire a distributed lock on the given key.
 * Returns a token (string) on success, null if the lock is held after retries.
 *
 * The Redis lock is a contention dampener — Postgres's atomic conditional UPDATE
 * is the true correctness guarantee. If the lock can't be acquired we return null
 * and let the caller return 409 immediately, saving a wasted DB round-trip.
 */
export async function acquireLock(key: string): Promise<string | null> {
  const token = randomUUID();
  const lockKey = `lock:${key}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await redis.set(lockKey, token, {
      nx: true,
      px: LOCK_TTL_MS,
    });

    if (result === "OK") return token;

    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_INTERVAL_MS);
    }
  }

  return null;
}

/**
 * Release the lock only if we still own it (token matches).
 * Uses a Lua script so the GET + DEL is atomic — prevents releasing
 * another caller's lock if ours expired in the meantime.
 */
export async function releaseLock(key: string, token: string): Promise<void> {
  const lockKey = `lock:${key}`;

  // Lua: atomically compare and delete
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;

  await redis.eval(script, [lockKey], [token]);
}

/**
 * Convenience: run fn inside a lock on the given key.
 * Returns null if the lock cannot be acquired (caller should return 409).
 */
export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const token = await acquireLock(key);
  if (!token) return null;

  try {
    return await fn();
  } finally {
    await releaseLock(key, token);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
