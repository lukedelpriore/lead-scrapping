import { describe, it, expect } from "vitest";
import { computeTier } from "./tier";

const base = {
  nonmemberEvents: "unclear" as const,
  hostsWeddings: "unclear" as const,
  hostsCorporate: "unclear" as const,
  ownershipType: "private_owner" as const,
  groupVenueCount: 0,
  reachable: true,
};

describe("computeTier", () => {
  it("tier 1 when the group has 5 or more venues", () => {
    expect(computeTier({ ...base, ownershipType: "group", groupVenueCount: 5 })).toBe(1);
  });

  it("tier 1 when nonmember events is yes", () => {
    expect(computeTier({ ...base, nonmemberEvents: "yes" })).toBe(1);
  });

  it("tier 2 when hosts weddings yes and nonmember unclear", () => {
    expect(computeTier({ ...base, hostsWeddings: "yes" })).toBe(2);
  });

  it("tier 2 when hosts corporate yes and nonmember unclear", () => {
    expect(computeTier({ ...base, hostsCorporate: "yes" })).toBe(2);
  });

  it("tier 3 for a municipal with event space", () => {
    expect(
      computeTier({ ...base, ownershipType: "municipal", hostsCorporate: "yes", nonmemberEvents: "no" }),
    ).toBe(null); // explicit no drops before tier 3
    expect(
      computeTier({ ...base, ownershipType: "municipal", hostsCorporate: "yes" }),
    ).toBe(2); // nonmember unclear reaches tier 2 first
  });

  it("tier 3 for a municipal with event space when not otherwise tiered", () => {
    // hosts flags no, but municipal with corporate space and no wedding signal
    expect(
      computeTier({
        nonmemberEvents: "unclear",
        hostsWeddings: "no",
        hostsCorporate: "yes",
        ownershipType: "municipal",
        groupVenueCount: 0,
        reachable: true,
      }),
    ).toBe(2);
  });

  it("dropped when nonmember events is no", () => {
    expect(computeTier({ ...base, nonmemberEvents: "no", hostsWeddings: "yes" })).toBe(null);
  });

  it("dropped when no event space is found", () => {
    expect(computeTier({ ...base })).toBe(null);
  });

  it("dropped when unreachable", () => {
    expect(computeTier({ ...base, hostsWeddings: "yes", reachable: false })).toBe(null);
  });

  it("a pure municipal event space with no nonmember signal is tier 3", () => {
    expect(
      computeTier({
        nonmemberEvents: "unclear",
        hostsWeddings: "unclear",
        hostsCorporate: "unclear",
        ownershipType: "municipal",
        groupVenueCount: 0,
        reachable: true,
      }),
    ).toBe(null); // no event space
  });
});
