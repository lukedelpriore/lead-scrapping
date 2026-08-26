import { describe, it, expect } from "vitest";
import {
  toE164,
  toReadableUsPhone,
  normalizeEmail,
  registrableDomain,
} from "./contact";

describe("toE164", () => {
  it("parses a US number in various formats to E.164", () => {
    expect(toE164("(305) 555-0134")).toBe("+13055550134");
    expect(toE164("305.555.0134")).toBe("+13055550134");
    expect(toE164("+1 305 555 0134")).toBe("+13055550134");
  });

  it("returns null for an invalid number", () => {
    expect(toE164("not a phone")).toBeNull();
    expect(toE164("123")).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164(null)).toBeNull();
  });
});

describe("toReadableUsPhone", () => {
  it("formats a US number as national text", () => {
    expect(toReadableUsPhone("+13055550134")).toBe("(305) 555-0134");
  });

  it("falls back to the trimmed input when unparseable", () => {
    expect(toReadableUsPhone("  ext 42  ")).toBe("ext 42");
  });

  it("returns empty for blank", () => {
    expect(toReadableUsPhone("")).toBe("");
    expect(toReadableUsPhone(null)).toBe("");
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Jane.Doe@Example.COM ")).toBe("jane.doe@example.com");
  });

  it("returns null for blank", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe("registrableDomain", () => {
  it("extracts the registrable domain ignoring www and path", () => {
    expect(registrableDomain("https://www.bocacc.com/weddings")).toBe(
      "bocacc.com",
    );
  });

  it("handles a bare host", () => {
    expect(registrableDomain("events.oakridge.org")).toBe("oakridge.org");
  });

  it("handles a multi part public suffix", () => {
    expect(registrableDomain("https://club.example.co.uk")).toBe(
      "example.co.uk",
    );
  });

  it("returns null for blank or junk", () => {
    expect(registrableDomain("")).toBeNull();
    expect(registrableDomain(null)).toBeNull();
  });
});
