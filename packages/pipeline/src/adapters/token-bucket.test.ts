import { describe, it, expect } from "vitest";
import { TokenBucket } from "./token-bucket";
import { ManualClock } from "./test-helpers";

describe("TokenBucket", () => {
  it("starts full and depletes on remove", () => {
    const clock = new ManualClock();
    const b = new TokenBucket({ capacity: 3, refillPerSecond: 1, clock });
    expect(b.available()).toBe(3);
    expect(b.tryRemove()).toBe(true);
    expect(b.tryRemove()).toBe(true);
    expect(b.tryRemove()).toBe(true);
    expect(b.tryRemove()).toBe(false);
  });

  it("refills over time", () => {
    const clock = new ManualClock();
    const b = new TokenBucket({ capacity: 10, refillPerSecond: 2, initialTokens: 0, clock });
    expect(b.available()).toBe(0);
    clock.advance(1000);
    expect(b.available()).toBe(2);
    clock.advance(2000);
    expect(b.available()).toBe(6);
  });

  it("never exceeds capacity", () => {
    const clock = new ManualClock();
    const b = new TokenBucket({ capacity: 5, refillPerSecond: 100, clock });
    clock.advance(10000);
    expect(b.available()).toBe(5);
  });

  it("remove waits via the clock until a token is available", async () => {
    const clock = new ManualClock();
    const b = new TokenBucket({ capacity: 1, refillPerSecond: 1, initialTokens: 0, clock });
    await b.remove(1); // should advance virtual time by ~1000ms
    expect(clock.now()).toBeGreaterThanOrEqual(1000);
  });

  it("throws when a single request exceeds capacity", async () => {
    const b = new TokenBucket({ capacity: 2, refillPerSecond: 1 });
    await expect(b.remove(3)).rejects.toThrow(/exceeds bucket capacity/);
  });
});
