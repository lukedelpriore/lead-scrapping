import { describe, it, expect } from "vitest";
import { checkCandidate, SameRunSet, type Gate2Lookups } from "./gate2";
import { rankGroups, rankVenues } from "./rank";
import { buildSearchPlan, linkedinFallbackQuery } from "./search-plan";
import type { DedupeKey } from "../dedupe/keys";

describe("gate2 checkCandidate", () => {
  const none: Gate2Lookups = { suppressed: () => false, delivered: () => false };

  it("marks a suppressed candidate duplicate with source suppression", () => {
    const lookups: Gate2Lookups = {
      suppressed: (k: DedupeKey) => k.keyType === "email" && k.keyValue === "jane@x.com",
      delivered: () => false,
    };
    const d = checkCandidate({ emails: ["jane@x.com"] }, lookups, new SameRunSet());
    expect(d.status).toBe("duplicate");
    expect(d.dedupeSource).toBe("suppression");
    expect(d.dedupeKey).toBe("email::jane@x.com");
  });

  it("marks a delivered candidate duplicate", () => {
    const lookups: Gate2Lookups = {
      suppressed: () => false,
      delivered: (k) => k.keyType === "profile_id",
    };
    const d = checkCandidate({ rrProfileId: "1" }, lookups, new SameRunSet());
    expect(d.dedupeSource).toBe("delivered");
  });

  it("catches the same person twice in one run", () => {
    const set = new SameRunSet();
    const first = checkCandidate({ rrProfileId: "9" }, none, set);
    expect(first.status).toBe("ready");
    set.add([{ keyType: "profile_id", keyValue: "9" }]);
    const second = checkCandidate({ rrProfileId: "9" }, none, set);
    expect(second.status).toBe("duplicate");
    expect(second.dedupeSource).toBe("same_run");
  });

  it("returns ready when nothing matches", () => {
    const d = checkCandidate({ emails: ["fresh@x.com"] }, none, new SameRunSet());
    expect(d.status).toBe("ready");
  });
});

describe("rankGroups", () => {
  it("ranks by venue count then state order", () => {
    const order = ["FL", "TX", "CA"];
    const out = rankGroups(
      [
        { id: "a", venueCount: 3, primaryState: "TX" },
        { id: "b", venueCount: 10, primaryState: "CA" },
        { id: "c", venueCount: 10, primaryState: "FL" },
      ],
      order,
    );
    expect(out.map((g) => g.id)).toEqual(["c", "b", "a"]);
  });
});

describe("rankVenues", () => {
  it("ranks by tier then state then confidence", () => {
    const order = ["FL", "TX"];
    const out = rankVenues(
      [
        { id: "a", tier: 2, state: "FL", confidence: 0.9 },
        { id: "b", tier: 1, state: "TX", confidence: 0.5 },
        { id: "c", tier: 1, state: "FL", confidence: 0.6 },
        { id: "d", tier: 1, state: "FL", confidence: 0.8 },
      ],
      order,
    );
    expect(out.map((v) => v.id)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("buildSearchPlan", () => {
  it("builds exact, loose, and keyword steps for a venue with a location radius", () => {
    const plan = buildSearchPlan({
      venueName: "Boca Country Club",
      city: "Boca Raton",
      state: "FL",
      isVenue: true,
      titles: ["General Manager", "Director of Catering"],
    });
    expect(plan.map((s) => s.label)).toEqual(["exact employer", "loose employer", "venue keyword"]);
    expect(plan[0]!.query.current_employer).toEqual(['"Boca Country Club"']);
    expect(plan[0]!.query.location).toEqual(['"Boca Raton, FL"::~25mi']);
    expect(plan[1]!.query.current_employer).toEqual(["Boca Country Club"]);
  });

  it("uses the group name as employer for a group target", () => {
    const plan = buildSearchPlan({
      groupName: "Heritage Golf Group",
      state: "FL",
      isVenue: false,
      titles: ["CEO"],
    });
    expect(plan[0]!.query.current_employer).toEqual(['"Heritage Golf Group"']);
  });

  it("builds a linkedin fallback query", () => {
    expect(linkedinFallbackQuery("Boca Country Club")).toBe(
      'site:linkedin.com/in "Boca Country Club" "general manager"',
    );
  });
});
