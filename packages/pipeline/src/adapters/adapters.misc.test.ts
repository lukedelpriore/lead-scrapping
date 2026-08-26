import { describe, it, expect } from "vitest";
import { OverpassClient } from "./overpass";
import { SerperClient } from "./serper";
import { PlacesClient } from "./places";
import { decodeServiceAccount } from "./sheets";
import { Mailer } from "./mailer";
import { ClaudeClient } from "./claude";
import { HttpClient } from "./http";
import { TokenBucket } from "./token-bucket";
import { ManualClock, fakeFetch } from "./test-helpers";

function http(sequence: Parameters<typeof fakeFetch>[0], provider = "test") {
  const clock = new ManualClock();
  const { fetch, calls } = fakeFetch(sequence);
  return {
    calls,
    client: new HttpClient({
      provider,
      bucket: new TokenBucket({ capacity: 100, refillPerSecond: 100, clock }),
      clock,
      jitter: () => 1,
      fetchImpl: fetch,
    }),
  };
}

describe("OverpassClient", () => {
  it("builds an ISO3166-2 query for a state", () => {
    const c = new OverpassClient();
    expect(c.buildQuery("fl")).toContain('"ISO3166-2"="US-FL"');
    expect(c.buildQuery("fl")).toContain('"leisure"="golf_course"');
  });

  it("parses named golf courses and skips unnamed", () => {
    const c = new OverpassClient();
    const out = c.parse({
      elements: [
        {
          type: "way",
          id: 1,
          center: { lat: 26.3, lon: -80.1 },
          tags: { name: "Boca CC", website: "https://boca.example.com", phone: "305-555-0100" },
        },
        { type: "node", id: 2, lat: 27, lon: -81, tags: { leisure: "golf_course" } },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      osmId: "way/1",
      name: "Boca CC",
      website: "https://boca.example.com",
      phone: "305-555-0100",
    });
  });

  it("fetches and parses via the injected http client", async () => {
    const { client } = http([
      { status: 200, body: { elements: [{ type: "way", id: 9, tags: { name: "Pine GC" } }] } },
    ]);
    const c = new OverpassClient({ http: client });
    const out = await c.golfCourses("FL");
    expect(out[0]!.name).toBe("Pine GC");
  });
});

describe("SerperClient", () => {
  it("returns only titles and urls from organic results", async () => {
    const { client } = http([
      {
        status: 200,
        body: {
          organic: [
            { title: "A", link: "https://a.test", snippet: "s" },
            { title: "no link" },
          ],
        },
      },
    ]);
    const c = new SerperClient({ apiKey: "k", http: client });
    const out = await c.search("country club weddings");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: "A", url: "https://a.test", snippet: "s" });
  });

  it("throws without a key", () => {
    expect(() => new SerperClient({ apiKey: "" })).toThrow(/Serper/);
  });
});

describe("PlacesClient", () => {
  it("throws when disabled", async () => {
    const c = new PlacesClient({ apiKey: "k", enabled: false });
    await expect(c.fill("Boca CC, FL")).rejects.toThrow(/disabled/);
  });

  it("parses a place fill when enabled", async () => {
    const { client } = http([
      {
        status: 200,
        body: {
          places: [
            {
              id: "abc",
              displayName: { text: "Boca CC" },
              websiteUri: "https://boca.example.com",
              nationalPhoneNumber: "(305) 555-0100",
            },
          ],
        },
      },
    ]);
    const c = new PlacesClient({ apiKey: "k", enabled: true, http: client });
    const out = await c.fill("Boca CC, FL");
    expect(out).toMatchObject({ placeId: "abc", website: "https://boca.example.com" });
  });
});

describe("decodeServiceAccount", () => {
  it("decodes base64 json", () => {
    const json = JSON.stringify({ client_email: "x@y.iam", private_key: "PK" });
    const b64 = Buffer.from(json).toString("base64");
    expect(decodeServiceAccount({ b64 })).toEqual({ client_email: "x@y.iam", private_key: "PK" });
  });

  it("decodes a raw json string", () => {
    const json = JSON.stringify({ client_email: "x@y.iam", private_key: "PK" });
    expect(decodeServiceAccount({ json })).toEqual({ client_email: "x@y.iam", private_key: "PK" });
  });

  it("throws when fields are missing", () => {
    expect(() => decodeServiceAccount({ json: "{}" })).toThrow(/missing/);
  });

  it("throws when nothing is provided", () => {
    expect(() => decodeServiceAccount({})).toThrow(/no service account/);
  });
});

describe("Mailer", () => {
  it("reports disabled with no key and does not send", async () => {
    const m = new Mailer({ from: { email: "leads@dph.com" } });
    expect(m.enabled).toBe(false);
    const res = await m.send({ to: [{ email: "a@b.com" }], subject: "s", html: "<p>x</p>" });
    expect(res).toEqual({ sent: false, disabled: true });
  });

  it("dryRun does not send even with a key", async () => {
    const m = new Mailer({ apiKey: "k", from: { email: "leads@dph.com" }, dryRun: true });
    const res = await m.send({ to: [{ email: "a@b.com" }], subject: "s", html: "<p>x</p>" });
    expect(res.sent).toBe(false);
  });

  it("checks the account when a key is present", async () => {
    const { client } = http([{ status: 200, body: { email: "acct@dph.com", companyName: "DPH" } }]);
    const m = new Mailer({ apiKey: "k", from: { email: "leads@dph.com" }, http: client });
    const acct = await m.account();
    expect(acct).toEqual({ email: "acct@dph.com", company: "DPH" });
  });
});

describe("ClaudeClient", () => {
  it("returns a validated classifier result from an injected client", async () => {
    const fakeClient = {
      messages: {
        create: async () => ({
          content: [
            {
              type: "tool_use",
              input: {
                hosts_weddings: "yes",
                hosts_corporate: "unclear",
                nonmember_events: "yes",
                evidence_url: "https://x.test/weddings",
                evidence_phrase: "membership not required",
                ownership_type: "private_owner",
                group_name: null,
                capacity: 200,
                site_contact: null,
                confidence: 0.9,
              },
            },
          ],
        }),
      },
    };
    const c = new ClaudeClient({ apiKey: "k", client: fakeClient });
    const out = await c.classifyVenue({
      name: "Boca CC",
      city: "Boca Raton",
      state: "FL",
      pages: [{ url: "https://x.test/weddings", text: "membership not required" }],
    });
    expect(out.hosts_weddings).toBe("yes");
    expect(out.confidence).toBe(0.9);
  });

  it("retries once when the first response has no tool block", async () => {
    let n = 0;
    const fakeClient = {
      messages: {
        create: async () => {
          n += 1;
          if (n === 1) return { content: [{ type: "text", text: "oops" }] };
          return {
            content: [
              {
                type: "tool_use",
                input: { primary: "1", alternate: null, confidence: 0.8, reason: "tier 0, ratio 96" },
              },
            ],
          };
        },
      },
    };
    const c = new ClaudeClient({ apiKey: "k", client: fakeClient });
    const out = await c.adjudicate({
      targetName: "Boca CC",
      targetType: "venue",
      city: "Boca Raton",
      state: "FL",
      ownershipType: "private_owner",
      titleHierarchy: [["Owner"]],
      results: [],
    });
    expect(n).toBe(2);
    expect(out.primary).toBe("1");
  });

  it("throws without a key", () => {
    expect(() => new ClaudeClient({ apiKey: "" })).toThrow(/ANTHROPIC_API_KEY/);
  });
});
