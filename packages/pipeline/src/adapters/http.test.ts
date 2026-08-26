import { describe, it, expect } from "vitest";
import { HttpClient, HttpError } from "./http";
import { TokenBucket } from "./token-bucket";
import { MemoryApiLog } from "./api-log";
import { ManualClock, fakeFetch } from "./test-helpers";

function make(sequence: Parameters<typeof fakeFetch>[0]) {
  const clock = new ManualClock();
  const log = new MemoryApiLog();
  const { fetch, calls } = fakeFetch(sequence);
  const client = new HttpClient({
    provider: "test",
    bucket: new TokenBucket({ capacity: 100, refillPerSecond: 100, clock }),
    log,
    clock,
    baseBackoffMs: 100,
    jitter: () => 1, // deterministic full backoff
    fetchImpl: fetch,
  });
  return { client, log, calls, clock };
}

describe("HttpClient", () => {
  it("returns parsed JSON on success and logs cost units", async () => {
    const { client, log } = make([{ status: 200, body: { ok: true } }]);
    const res = await client.request<{ ok: boolean }>({
      url: "https://x.test/y",
      costUnits: 1,
      endpointLabel: "y",
    });
    expect(res.data.ok).toBe(true);
    expect(log.entries.at(-1)).toMatchObject({ statusCode: 200, costUnits: 1 });
  });

  it("retries a 429 after the exact Retry-After, then succeeds", async () => {
    const { client, log, clock, calls } = make([
      { status: 429, headers: { "retry-after": "7" } },
      { status: 200, body: { ok: true } },
    ]);
    const before = clock.now();
    const res = await client.request({ url: "https://x.test/y" });
    expect(res.status).toBe(200);
    expect(clock.now() - before).toBeGreaterThanOrEqual(7000);
    expect(calls).toHaveLength(2);
    // The retry attempt is logged with zero cost.
    expect(log.entries[0]).toMatchObject({ statusCode: 429, costUnits: 0 });
  });

  it("retries retryable 5xx with backoff", async () => {
    const { client, calls, clock } = make([
      { status: 503 },
      { status: 200, body: { ok: true } },
    ]);
    const before = clock.now();
    await client.request({ url: "https://x.test/y" });
    expect(calls).toHaveLength(2);
    expect(clock.now() - before).toBeGreaterThanOrEqual(100);
  });

  it("throws HttpError on a 4xx and does not retry", async () => {
    const { client, calls } = make([{ status: 401, body: "nope" }]);
    await expect(client.request({ url: "https://x.test/y" })).rejects.toBeInstanceOf(
      HttpError,
    );
    expect(calls).toHaveLength(1);
  });

  it("gives up after maxRetries on persistent 500", async () => {
    const { client, calls } = make([
      { status: 500 },
      { status: 500 },
      { status: 500 },
      { status: 500 },
    ]);
    await expect(client.request({ url: "https://x.test/y" })).rejects.toBeInstanceOf(
      HttpError,
    );
    // initial + 3 retries
    expect(calls).toHaveLength(4);
  });

  it("never records cost on a failed call", async () => {
    const { client, log } = make([{ status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }]);
    await expect(client.request({ url: "https://x.test/y", costUnits: 1 })).rejects.toThrow();
    expect(log.entries.every((e) => (e.costUnits ?? 0) === 0)).toBe(true);
  });
});
