/**
 * Login rate limit: 10 attempts per 15 minutes per IP. Section 4.
 *
 * In v1 this is a single process in memory store. A note in DECISIONS.md
 * records that a multi instance production deployment moves this to a shared
 * store (Postgres or Redis). For one web container it is correct.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function checkLoginRate(ip: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const key = ip || "unknown";
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (b.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterMs: b.resetAt - now };
  }
  b.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

/** Clear the counter after a successful sign in. */
export function clearLoginRate(ip: string): void {
  buckets.delete(ip || "unknown");
}
