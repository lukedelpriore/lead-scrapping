import { describe, it, expect } from "vitest";
import {
  tokenSetRatio,
  venueNamesMatch,
  employersMatch,
  employerRatio,
} from "./fuzzy";

describe("tokenSetRatio", () => {
  it("is 100 for identical strings", () => {
    expect(tokenSetRatio("boca country club", "boca country club")).toBe(100);
  });

  it("is high for reordered tokens", () => {
    expect(tokenSetRatio("country club boca", "boca country club")).toBe(100);
  });
});

describe("venueNamesMatch", () => {
  it("matches names that differ only by cc expansion and the", () => {
    expect(venueNamesMatch("The Boca CC", "Boca Country Club")).toBe(true);
  });

  it("matches with a superset of tokens above threshold", () => {
    expect(venueNamesMatch("Oak Ridge Country Club", "Oak Ridge CC")).toBe(true);
  });

  it("does not match clearly different clubs", () => {
    expect(venueNamesMatch("Boca Country Club", "Pine Valley Golf Club")).toBe(
      false,
    );
  });

  it("respects a custom threshold", () => {
    expect(venueNamesMatch("Oak Ridge", "Oak Ridge Country Club", 100)).toBe(
      true,
    );
  });
});

describe("employersMatch", () => {
  it("matches employer variants at the 90 threshold", () => {
    expect(employersMatch("Heritage Golf Group", "Heritage Golf Group LLC")).toBe(
      true,
    );
  });

  it("does not match different employers", () => {
    expect(employersMatch("Troon", "Invited")).toBe(false);
  });
});

describe("employerRatio", () => {
  it("returns a number 0 to 100", () => {
    const r = employerRatio("Heritage Golf Group", "Heritage Golf");
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThanOrEqual(100);
  });
});
