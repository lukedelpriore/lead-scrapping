import { describe, it, expect } from "vitest";
import { selectForReveal, shouldRevealAlternate, type RevealCandidate } from "./select";

const settings = {
  autoRevealMinConfidence: 0.8,
  maxContactsPerVenue: 2,
  maxContactsPerGroup: 4,
};

let n = 0;
function c(p: Partial<RevealCandidate>): RevealCandidate {
  n += 1;
  return {
    id: p.id ?? `c${n}`,
    venueId: p.venueId !== undefined ? p.venueId : "v1",
    groupId: p.groupId !== undefined ? p.groupId : null,
    rank: p.rank ?? "primary",
    confidence: p.confidence ?? 0.9,
    tier: p.tier ?? 1,
    order: p.order,
  };
}

describe("selectForReveal ask mode", () => {
  it("sends everything to review and spends nothing", () => {
    const out = selectForReveal([c({}), c({})], settings, 10, "ask");
    expect(out.toReveal).toHaveLength(0);
    expect(out.toReview).toHaveLength(2);
    expect(out.wouldSpend).toBe(0);
  });
});

describe("selectForReveal auto mode", () => {
  it("reveals confident primaries up to the batch cap", () => {
    const out = selectForReveal(
      [c({ venueId: "a" }), c({ venueId: "b" }), c({ venueId: "c" })],
      settings,
      2,
      "auto",
    );
    expect(out.toReveal).toHaveLength(2);
    expect(out.toReview).toHaveLength(1);
    expect(out.wouldSpend).toBe(2);
  });

  it("sends low confidence candidates to review", () => {
    const out = selectForReveal(
      [c({ venueId: "a", confidence: 0.79 }), c({ venueId: "b", confidence: 0.9 })],
      settings,
      10,
      "auto",
    );
    expect(out.toReveal.map((x) => x.venueId)).toEqual(["b"]);
  });

  it("respects the per venue cap of two", () => {
    const out = selectForReveal(
      [
        c({ id: "p1", venueId: "v", rank: "primary" }),
        c({ id: "p2", venueId: "v", rank: "primary" }),
        c({ id: "p3", venueId: "v", rank: "primary" }),
      ],
      settings,
      10,
      "auto",
    );
    expect(out.toReveal).toHaveLength(2);
  });

  it("respects the per group cap of four", () => {
    const cands = Array.from({ length: 6 }, (_, i) =>
      c({ id: `g${i}`, venueId: null, groupId: "grp", rank: "primary" }),
    );
    const out = selectForReveal(cands, settings, 100, "auto");
    expect(out.toReveal).toHaveLength(4);
  });

  it("does not auto reveal alternates up front", () => {
    const out = selectForReveal(
      [c({ id: "alt", rank: "alternate" }), c({ id: "prim", rank: "primary" })],
      settings,
      10,
      "auto",
    );
    expect(out.toReveal.map((x) => x.id)).toEqual(["prim"]);
    expect(out.toReview.map((x) => x.id)).toContain("alt");
  });
});

describe("shouldRevealAlternate", () => {
  it("reveals the alternate only when the primary had no mobile and tier is 1 or 2", () => {
    expect(shouldRevealAlternate({ primaryHadMobile: false, tier: 1 })).toBe(true);
    expect(shouldRevealAlternate({ primaryHadMobile: false, tier: 2 })).toBe(true);
    expect(shouldRevealAlternate({ primaryHadMobile: true, tier: 1 })).toBe(false);
    expect(shouldRevealAlternate({ primaryHadMobile: false, tier: 3 })).toBe(false);
  });
});
