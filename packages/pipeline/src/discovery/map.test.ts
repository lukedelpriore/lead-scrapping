import { describe, it, expect } from "vitest";
import { fromOverpass, fromRocketReachCompanies, fromSerper, fromPasted } from "./map";

describe("fromOverpass", () => {
  it("maps golf courses and extracts the domain", () => {
    const out = fromOverpass([
      { osmId: "way/1", name: "Boca CC", lat: 26.3, lng: -80.1, website: "https://www.bocacc.com", phone: null },
    ]);
    expect(out[0]).toMatchObject({ name: "Boca CC", osmId: "way/1", domain: "bocacc.com", source: "osm" });
  });
});

describe("fromRocketReachCompanies", () => {
  it("maps companies and keeps the rr company id", () => {
    const out = fromRocketReachCompanies([{ id: 42, name: "Heritage Golf Group", domain: "heritagegolf.com" }]);
    expect(out[0]).toMatchObject({ name: "Heritage Golf Group", rrCompanyId: "42", domain: "heritagegolf.com", source: "rocketreach" });
  });

  it("drops nameless companies", () => {
    const out = fromRocketReachCompanies([{ id: 1, domain: "x.com" }]);
    expect(out).toHaveLength(0);
  });
});

describe("fromSerper", () => {
  it("tags The Knot and WeddingWire sources", () => {
    const out = fromSerper([
      { title: "Boca CC | The Knot", url: "https://www.theknot.com/x", snippet: null },
      { title: "Oak Ridge - WeddingWire", url: "https://www.weddingwire.com/y", snippet: null },
      { title: "Pine Valley Golf Club", url: "https://pinevalley.com", snippet: null },
    ]);
    expect(out[0]!.source).toBe("knot");
    expect(out[0]!.name).toBe("Boca CC");
    expect(out[1]!.source).toBe("weddingwire");
    expect(out[2]!.source).toBe("serper");
  });
});

describe("fromPasted", () => {
  it("detects urls versus plain names", () => {
    const out = fromPasted(["https://bocacc.com", "Pine Valley Golf Club", "oakridge.org", ""]);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ domain: "bocacc.com", source: "pasted" });
    expect(out[1]!.website).toBeNull();
    expect(out[2]!.domain).toBe("oakridge.org");
  });
});
