import { describe, it, expect } from "vitest";
import { classifyByRules } from "./rules";

const base = { name: "Test Club", city: "Miami", state: "FL" };

describe("classifyByRules hosts_weddings", () => {
  it("is yes when a fetched url path contains wedding", () => {
    const r = classifyByRules({ ...base, pages: [{ url: "https://c.com/weddings", text: "hello" }] });
    expect(r.hosts_weddings).toBe("yes");
  });

  it("is yes when wedding appears three or more times", () => {
    const r = classifyByRules({
      ...base,
      pages: [{ url: "https://c.com/events", text: "wedding wedding weddings here" }],
    });
    expect(r.hosts_weddings).toBe("yes");
  });

  it("is yes when found on a wedding directory", () => {
    const r = classifyByRules({ ...base, pages: [{ url: "https://c.com/", text: "x" }], foundOnWeddingDirectory: true });
    expect(r.hosts_weddings).toBe("yes");
  });

  it("is unclear otherwise", () => {
    const r = classifyByRules({ ...base, pages: [{ url: "https://c.com/", text: "golf only" }] });
    expect(r.hosts_weddings).toBe("unclear");
  });
});

describe("classifyByRules hosts_corporate", () => {
  it("is yes on a corporate phrase", () => {
    const r = classifyByRules({ ...base, pages: [{ url: "https://c.com/", text: "we host your corporate events and banquet" }] });
    expect(r.hosts_corporate).toBe("yes");
  });
});

describe("classifyByRules nonmember_events", () => {
  it("is yes on a nonmember phrase with high confidence", () => {
    const r = classifyByRules({ ...base, pages: [{ url: "https://c.com/e", text: "membership not required for events" }] });
    expect(r.nonmember_events).toBe("yes");
    expect(r.confidence).toBe(0.9);
    expect(r.evidence_phrase).toBe("membership not required");
  });

  it("is no on a members only phrase with high confidence", () => {
    const r = classifyByRules({ ...base, pages: [{ url: "https://c.com/e", text: "events are members only" }] });
    expect(r.nonmember_events).toBe("no");
    expect(r.confidence).toBe(0.9);
  });

  it("prefers yes when both appear", () => {
    const r = classifyByRules({
      ...base,
      pages: [{ url: "https://c.com/e", text: "members only for golf but open to the public for events" }],
    });
    expect(r.nonmember_events).toBe("yes");
  });

  it("is unclear with only a hosts flag, confidence 0.6", () => {
    const r = classifyByRules({ ...base, pages: [{ url: "https://c.com/weddings", text: "beautiful venue" }] });
    expect(r.nonmember_events).toBe("unclear");
    expect(r.confidence).toBe(0.6);
  });

  it("is 0.3 confidence with nothing matched", () => {
    const r = classifyByRules({ ...base, pages: [{ url: "https://c.com/", text: "just golf" }] });
    expect(r.confidence).toBe(0.3);
  });
});

describe("classifyByRules ownership", () => {
  it("detects a seeded group name", () => {
    const r = classifyByRules({
      ...base,
      pages: [{ url: "https://c.com/", text: "a proud member of the Troon family of clubs" }],
      seedGroupNames: ["Troon", "Invited"],
    });
    expect(r.ownership_type).toBe("group");
    expect(r.group_name).toBe("Troon");
  });

  it("detects a managed by pattern", () => {
    const r = classifyByRules({ ...base, pages: [{ url: "https://c.com/", text: "this club is managed by Acme Golf Partners today" }] });
    expect(r.ownership_type).toBe("group");
    expect(r.group_name).toContain("Acme");
  });

  it("detects member owned", () => {
    const r = classifyByRules({ ...base, pages: [{ url: "https://c.com/", text: "we are a member owned equity club" }] });
    expect(r.ownership_type).toBe("member_owned");
  });

  it("detects municipal by phrase or gov domain", () => {
    expect(classifyByRules({ ...base, pages: [{ url: "https://c.com/", text: "operated by the city of Miami parks and recreation" }] }).ownership_type).toBe("municipal");
    expect(classifyByRules({ ...base, pages: [{ url: "https://parks.miamigov.gov/golf", text: "golf" }] }).ownership_type).toBe("municipal");
  });

  it("detects a private owner", () => {
    const r = classifyByRules({ ...base, pages: [{ url: "https://c.com/", text: "family owned and operated since 1980" }] });
    expect(r.ownership_type).toBe("private_owner");
  });
});

describe("classifyByRules capacity and contact", () => {
  it("finds the largest capacity number near a keyword", () => {
    const r = classifyByRules({ ...base, pages: [{ url: "https://c.com/", text: "seated for 250 guests, capacity up to 400 for receptions" }] });
    expect(r.capacity).toBe(400);
  });

  it("finds a named site contact with a title and email", () => {
    const r = classifyByRules({
      ...base,
      pages: [{ url: "https://c.com/contact", text: "Jane Smith\nDirector of Catering\njane@club.com or call us" }],
    });
    expect(r.site_contact).not.toBeNull();
    expect(r.site_contact!.title).toBe("Director of Catering");
    expect(r.site_contact!.email).toBe("jane@club.com");
  });
});
