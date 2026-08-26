import { describe, it, expect } from "vitest";
import { mergeVenues, isVenueSuppressed, type DiscoveredVenue } from "./gate1";

let n = 0;
function v(p: Partial<DiscoveredVenue>): DiscoveredVenue {
  n += 1;
  return {
    id: p.id ?? `v${n}`,
    name: p.name ?? "Club",
    source: p.source ?? "osm",
    ...p,
  } as DiscoveredVenue;
}

describe("mergeVenues", () => {
  it("merges by registrable domain ignoring www", () => {
    const out = mergeVenues([
      v({ name: "Boca CC", website: "https://www.bocacc.com", source: "osm" }),
      v({ name: "Boca Country Club", website: "https://bocacc.com/weddings", source: "serper" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.members).toHaveLength(2);
  });

  it("merges by osm id", () => {
    const out = mergeVenues([
      v({ name: "A", osmId: "way/1" }),
      v({ name: "Totally Different", osmId: "way/1" }),
    ]);
    expect(out).toHaveLength(1);
  });

  it("merges by place id", () => {
    const out = mergeVenues([
      v({ name: "A", placeId: "p1" }),
      v({ name: "B", placeId: "p1" }),
    ]);
    expect(out).toHaveLength(1);
  });

  it("merges by fuzzy name and state with a compatible city", () => {
    const out = mergeVenues([
      v({ name: "Oak Ridge Country Club", state: "FL", city: "Orlando" }),
      v({ name: "Oak Ridge CC", state: "FL", city: "Orlando" }),
    ]);
    expect(out).toHaveLength(1);
  });

  it("does not merge same name in different states", () => {
    const out = mergeVenues([
      v({ name: "Riverside Country Club", state: "FL", city: "Miami" }),
      v({ name: "Riverside Country Club", state: "TX", city: "Austin" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("does not merge similar names in clearly different cities", () => {
    const out = mergeVenues([
      v({ name: "Lakeview Golf Club", state: "FL", city: "Naples" }),
      v({ name: "Lakeview Golf Club", state: "FL", city: "Jacksonville" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("keeps the first venue as canonical", () => {
    const out = mergeVenues([
      v({ id: "first", name: "Boca CC", website: "https://bocacc.com" }),
      v({ id: "second", name: "Boca Country Club", website: "https://bocacc.com" }),
    ]);
    expect(out[0]!.canonical.id).toBe("first");
  });
});

describe("isVenueSuppressed", () => {
  const supp = {
    hasDomain: (d: string) => d === "clientclub.com",
    hasNameState: (k: string) => k === "prospect club::tx",
    hasInPlayGroup: (g: string) => g === "concert golf partners",
  };

  it("suppresses on a matching domain", () => {
    expect(isVenueSuppressed({ name: "X", website: "https://www.clientclub.com" }, supp)).toBe(true);
  });

  it("suppresses on a matching name and state", () => {
    expect(isVenueSuppressed({ name: "Prospect Club", state: "TX" }, supp)).toBe(true);
  });

  it("suppresses a member of an in play group", () => {
    expect(
      isVenueSuppressed({ name: "Some Club", state: "FL", groupName: "Concert Golf Partners" }, supp),
    ).toBe(true);
  });

  it("does not suppress an unrelated venue", () => {
    expect(isVenueSuppressed({ name: "Fresh Club", state: "FL", website: "https://fresh.com" }, supp)).toBe(false);
  });
});
