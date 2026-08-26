/**
 * Token bucket limiter. Every adapter has one. Refills at a steady rate and
 * blocks callers when empty. A clock is injectable so it is deterministic in
 * tests (no Date.now in the pure logic path).
 */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export interface TokenBucketOptions {
  /** Maximum tokens the bucket can hold. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSecond: number;
  /** Start full unless given. */
  initialTokens?: number;
  clock?: Clock;
}

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly clock: Clock;

  constructor(opts: TokenBucketOptions) {
    this.capacity = opts.capacity;
    this.refillPerSecond = opts.refillPerSecond;
    this.clock = opts.clock ?? systemClock;
    this.tokens = opts.initialTokens ?? opts.capacity;
    this.lastRefill = this.clock.now();
  }

  private refill(): void {
    const now = this.clock.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed <= 0) return;
    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsed * this.refillPerSecond,
    );
    this.lastRefill = now;
  }

  /** Current token count, for tests and status. */
  available(): number {
    this.refill();
    return this.tokens;
  }

  /** Try to take one token without waiting. */
  tryRemove(count = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  /** Take one token, waiting (via the clock) until one is available. */
  async remove(count = 1): Promise<void> {
    // Guard against an impossible request.
    if (count > this.capacity) {
      throw new Error(
        `token request ${count} exceeds bucket capacity ${this.capacity}`,
      );
    }
    // Loop because sleeps can be coarse.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      this.refill();
      if (this.tokens >= count) {
        this.tokens -= count;
        return;
      }
      const needed = count - this.tokens;
      const waitMs = Math.ceil((needed / this.refillPerSecond) * 1000);
      await this.clock.sleep(Math.max(1, waitMs));
    }
  }
}
