import { describe, it, expect } from "vitest";
import { parseCommand } from "./parse";

describe("parseCommand", () => {
  it("parses type, states, and count from a full sentence", () => {
    const p = parseCommand("Find roofing company owners in Ohio and Michigan, about 200 businesses");
    expect(p.businessType).toBe("Roofing companies");
    expect(p.states.sort()).toEqual(["MI", "OH"]);
    expect(p.targetCount).toBe(200);
    expect(p.keywords.length).toBeGreaterThan(0);
  });

  it("recognizes two letter state codes", () => {
    const p = parseCommand("Find HVAC owners in TX and AZ, 300 businesses");
    expect(p.businessType).toBe("HVAC companies");
    expect(p.states.sort()).toEqual(["AZ", "TX"]);
    expect(p.targetCount).toBe(300);
  });

  it("handles med spas in Florida", () => {
    const p = parseCommand("Find med spa owners in Florida, about 150 businesses");
    expect(p.businessType).toBe("Med spas");
    expect(p.states).toEqual(["FL"]);
    expect(p.targetCount).toBe(150);
  });

  it("defaults count to 100 when none given", () => {
    const p = parseCommand("Find dentists in New York");
    expect(p.businessType).toBe("Dental practices");
    expect(p.states).toEqual(["NY"]);
    expect(p.targetCount).toBe(100);
  });

  it("falls back to a noun phrase for an unknown type", () => {
    const p = parseCommand("Find pool cleaning companies in Arizona, 50 businesses");
    expect(p.businessType.toLowerCase()).toContain("pool cleaning");
    expect(p.states).toEqual(["AZ"]);
    expect(p.keywords.length).toBeGreaterThan(0);
  });

  it("labels location as United States when no state is found", () => {
    const p = parseCommand("Find gyms, 100 businesses");
    expect(p.locationLabel).toBe("United States");
    expect(p.states).toEqual([]);
  });

  it("caps an absurd count", () => {
    const p = parseCommand("Find roofers in Ohio, 999999 businesses");
    expect(p.targetCount).toBe(5000);
  });

  it("has no qualifiers for a plain type and place search", () => {
    const p = parseCommand("Find roofing company owners in Ohio and Michigan, about 200 businesses");
    expect(p.qualifiers).toEqual([]);
    expect(p.keywords).toContain("roofing company");
  });

  it("captures qualifiers and folds them into discovery keywords", () => {
    const p = parseCommand("Please give me a list of country clubs that offer weddings and events for non members");
    expect(p.businessType).toBe("Golf and country clubs");
    expect(p.qualifiers).toEqual(expect.arrayContaining(["weddings", "events", "members"]));
    // The first discovery keyword carries the type plus the qualifier.
    const primary = (p.keywords[0] ?? "").toLowerCase();
    expect(primary).toContain("country club");
    expect(primary).toContain("weddings");
    // The plain type keyword is still present for recall.
    expect(p.keywords).toContain("country club");
  });

  it("keeps qualifiers out of the type words", () => {
    const p = parseCommand("Find wedding venues that allow outside catering in Texas, 100 businesses");
    expect(p.qualifiers).not.toContain("wedding");
    expect(p.qualifiers).toEqual(expect.arrayContaining(["allow", "outside", "catering"]));
  });
});
