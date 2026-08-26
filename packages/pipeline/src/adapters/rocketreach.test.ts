import { describe, it, expect } from "vitest";
import { RocketReachClient, RocketReachError } from "./rocketreach";
import { HttpClient } from "./http";
import { TokenBucket } from "./token-bucket";
import { MemoryApiLog } from "./api-log";
import { ManualClock, fakeFetch } from "./test-helpers";

function httpWith(sequence: Parameters<typeof fakeFetch>[0], log = new MemoryApiLog()) {
  const clock = new ManualClock();
  const { fetch, calls } = fakeFetch(sequence);
  const http = new HttpClient({
    provider: "rocketreach",
    bucket: new TokenBucket({ capacity: 100, refillPerSecond: 100, clock }),
    log,
    clock,
    jitter: () => 1,
    baseBackoffMs: 10,
    fetchImpl: fetch,
  });
  return { http, calls, log };
}

const REVEAL_OFF = { apiKey: "k", revealMode: "off" as const };

describe("RocketReachClient free endpoints", () => {
  it("parses the account response and normalizes status", async () => {
    const { http } = httpWith([
      {
        status: 200,
        body: {
          name: "Pro",
          plan: { name: "Pro" },
          person_exports_remaining: 3600,
          company_exports_remaining: 3600,
          rate_limits: { person_search: { per_minute: 30 } },
        },
      },
    ]);
    const rr = new RocketReachClient({ ...REVEAL_OFF, http });
    const status = await rr.status();
    expect(status.planName).toBe("Pro");
    expect(status.personExportsRemaining).toBe(3600);
    expect(status.companyExportsRemaining).toBe(3600);
  });

  it("parses a person search response", async () => {
    const { http } = httpWith([
      {
        status: 200,
        body: {
          profiles: [
            {
              id: 1,
              name: "Jane Doe",
              current_title: "Director of Catering",
              current_employer: "Boca Country Club",
              linkedin_url: "https://linkedin.com/in/jane",
              location: "Boca Raton, FL",
            },
          ],
          pagination: { start: 1, next: 2, total: 1 },
        },
      },
    ]);
    const rr = new RocketReachClient({ ...REVEAL_OFF, http });
    const res = await rr.personSearch({ query: { current_employer: ['"Boca Country Club"'] } });
    expect(res.profiles).toHaveLength(1);
    expect(res.profiles[0]!.name).toBe("Jane Doe");
  });

  it("polls status through the documented states", async () => {
    for (const s of ["waiting", "searching", "progress", "complete", "failed"] as const) {
      const { http } = httpWith([{ status: 200, body: { id: 5, status: s } }]);
      const rr = new RocketReachClient({ ...REVEAL_OFF, http });
      const res = await rr.checkStatus(5);
      expect(res.status).toBe(s);
    }
  });

  it("records zero cost on free calls", async () => {
    const log = new MemoryApiLog();
    const { http } = httpWith([{ status: 200, body: { name: "Pro" } }], log);
    const rr = new RocketReachClient({ ...REVEAL_OFF, http });
    await rr.account();
    expect(log.entries.at(-1)).toMatchObject({ endpoint: "account", costUnits: 0 });
  });
});

describe("RocketReachClient credit guard", () => {
  it("refuses person lookup when REVEAL_MODE is off, without any call", async () => {
    const { http, calls } = httpWith([{ status: 200, body: {} }]);
    const rr = new RocketReachClient({ ...REVEAL_OFF, http });
    await expect(rr.lookupPerson({ id: 1 })).rejects.toBeInstanceOf(RocketReachError);
    expect(calls).toHaveLength(0);
  });

  it("refuses company lookup when disabled", async () => {
    const { http } = httpWith([{ status: 200, body: {} }]);
    const rr = new RocketReachClient({ apiKey: "k", revealMode: "auto", http });
    await expect(rr.companyLookup(1)).rejects.toThrow(/disabled/);
  });

  it("refuses company lookup when reveal off even if enabled", async () => {
    const { http, calls } = httpWith([{ status: 200, body: {} }]);
    const rr = new RocketReachClient({
      apiKey: "k",
      revealMode: "off",
      companyLookupEnabled: true,
      http,
    });
    await expect(rr.companyLookup(1)).rejects.toBeInstanceOf(RocketReachError);
    expect(calls).toHaveLength(0);
  });

  it("allows person lookup only when reveal is on and records one credit", async () => {
    const log = new MemoryApiLog();
    const { http, calls } = httpWith(
      [{ status: 200, body: { id: 1, emails: [], phones: [] } }],
      log,
    );
    const rr = new RocketReachClient({ apiKey: "k", revealMode: "auto", http });
    await rr.lookupPerson({ id: 1 });
    expect(calls).toHaveLength(1);
    expect(log.entries.at(-1)).toMatchObject({ endpoint: "person/lookup", costUnits: 1 });
  });

  it("requires an identifier for lookup", async () => {
    const { http } = httpWith([{ status: 200, body: {} }]);
    const rr = new RocketReachClient({ apiKey: "k", revealMode: "auto", http });
    await expect(rr.lookupPerson({})).rejects.toThrow(/needs id/);
  });
});
