import { describe, it, expect } from "vitest";
import { parseLookupResult } from "./parse";
import { makeFixtureContact } from "./fixture";

describe("parseLookupResult", () => {
  it("parses emails and phones with types and grades", () => {
    const parsed = parseLookupResult({
      name: "Jane Doe",
      current_title: "Director of Catering",
      current_employer: "Boca Country Club",
      emails: [
        { email: "Jane@Boca.com", type: "work", grade: "A" },
        { email: "jane@gmail.com", type: "personal", grade: "B" },
      ],
      phones: [
        { number: "(305) 555-0134", type: "mobile", is_valid: true },
        { number: "305-555-0100", type: "work", is_valid: "valid" },
      ],
    });
    expect(parsed.emails[0]).toEqual({ address: "jane@boca.com", type: "work", grade: "A" });
    expect(parsed.phones[0]).toEqual({ number: "+13055550134", type: "mobile", valid: true });
    expect(parsed.hasMobile).toBe(true);
    expect(parsed.hasVerifiedEmail).toBe(true);
    expect(parsed.title).toBe("Director of Catering");
  });

  it("handles a result with no contact data", () => {
    const parsed = parseLookupResult({ name: "Nobody" });
    expect(parsed.emails).toEqual([]);
    expect(parsed.phones).toEqual([]);
    expect(parsed.hasMobile).toBe(false);
    expect(parsed.hasVerifiedEmail).toBe(false);
  });

  it("keeps an unparseable phone as its raw value", () => {
    const parsed = parseLookupResult({ name: "X", phones: [{ number: "ext 4", type: "work" }] });
    expect(parsed.phones[0]!.number).toBe("ext 4");
  });
});

describe("makeFixtureContact", () => {
  it("produces a clearly fake, deterministic contact", () => {
    const a = makeFixtureContact({ id: "abc-123", name: "Jane", title: "GM", employer: "Boca CC" });
    const b = makeFixtureContact({ id: "abc-123", name: "Jane", title: "GM", employer: "Boca CC" });
    expect(a).toEqual(b); // deterministic
    expect(a.emails[0]!.address).toContain("@example.com");
    expect(a.phones[0]!.number).toMatch(/^\+1555555\d{4}$/);
    expect(a.name).toBe("Jane");
  });
});
