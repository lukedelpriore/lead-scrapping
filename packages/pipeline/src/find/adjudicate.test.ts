import { describe, it, expect } from "vitest";
import { adjudicateByRules, extractState, type SearchResult } from "./adjudicate";

const hierarchy = [
  ["Owner", "Founder", "Managing Partner"],
  ["General Manager", "GM"],
  ["Director of Catering", "Director of Private Events"],
];

function r(p: Partial<SearchResult>, i: number): SearchResult {
  return {
    profileId: p.profileId ?? `p${i}`,
    name: p.name ?? "Person",
    title: p.title ?? null,
    employer: p.employer ?? "Boca Country Club",
    location: p.location ?? "Boca Raton, FL",
    linkedinUrl: p.linkedinUrl ?? null,
    position: p.position ?? i,
  };
}

describe("adjudicateByRules", () => {
  const base = {
    targetName: "Boca Country Club",
    isVenue: true,
    targetState: "FL",
    titleHierarchy: hierarchy,
  };

  it("picks the highest tier title as primary", () => {
    const out = adjudicateByRules({
      ...base,
      results: [
        r({ profileId: "gm", title: "General Manager" }, 0),
        r({ profileId: "owner", title: "Owner" }, 1),
      ],
    });
    expect(out.primary).toBe("owner");
    expect(out.alternate).toBe("gm");
  });

  it("drops results whose employer does not match the target", () => {
    const out = adjudicateByRules({
      ...base,
      results: [r({ profileId: "x", title: "Owner", employer: "Some Other Company" }, 0)],
    });
    expect(out.primary).toBeNull();
    expect(out.confidence).toBe(0);
  });

  it("accepts a group employer for a venue in that group", () => {
    const out = adjudicateByRules({
      ...base,
      groupName: "Heritage Golf Group",
      results: [r({ profileId: "g", title: "Owner", employer: "Heritage Golf Group" }, 0)],
    });
    expect(out.primary).toBe("g");
  });

  it("drops excluded titles", () => {
    const out = adjudicateByRules({
      ...base,
      results: [r({ profileId: "a", title: "Assistant to the General Manager" }, 0)],
    });
    expect(out.primary).toBeNull();
  });

  it("drops a venue result in a different state", () => {
    const out = adjudicateByRules({
      ...base,
      results: [r({ profileId: "tx", title: "Owner", location: "Austin, TX" }, 0)],
    });
    expect(out.primary).toBeNull();
  });

  it("gives 0.9 confidence for a strong employer match in a top tier", () => {
    const out = adjudicateByRules({
      ...base,
      results: [r({ profileId: "o", title: "Owner", employer: "Boca Country Club" }, 0)],
    });
    expect(out.confidence).toBe(0.9);
  });

  it("gives 0.75 confidence for a lower tier title", () => {
    const out = adjudicateByRules({
      ...base,
      results: [r({ profileId: "d", title: "Director of Catering", employer: "Boca Country Club" }, 0)],
    });
    expect(out.confidence).toBe(0.75);
  });

  it("returns nulls when nothing qualifies", () => {
    const out = adjudicateByRules({ ...base, results: [] });
    expect(out).toMatchObject({ primary: null, alternate: null, confidence: 0 });
  });

  it("uses result position as a tiebreak within a tier", () => {
    const out = adjudicateByRules({
      ...base,
      results: [
        r({ profileId: "second", title: "Director of Catering", position: 5 }, 5),
        r({ profileId: "first", title: "Director of Catering", position: 0 }, 0),
      ],
    });
    expect(out.primary).toBe("first");
  });
});

describe("extractState", () => {
  it("pulls the state code from a location", () => {
    expect(extractState("Boca Raton, FL")).toBe("FL");
    expect(extractState("Austin, TX 78701")).toBe("TX");
    expect(extractState("no state here")).toBeNull();
  });
});
