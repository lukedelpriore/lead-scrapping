import { describe, it, expect } from "vitest";
import {
  normalizeName,
  normalizeEmployer,
  normalizeLinkedin,
  nameEmployerKey,
} from "./names";

describe("normalizeName", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeName("St. Andrew's Golf Club!")).toBe("st andrew s golf club");
  });

  it("collapses whitespace", () => {
    expect(normalizeName("Oak   Ridge    Country Club")).toBe(
      "oak ridge country club",
    );
  });

  it("drops a leading the", () => {
    expect(normalizeName("The Breakers")).toBe("breakers");
  });

  it("does not drop the when not leading", () => {
    expect(normalizeName("Club of the Hills")).toBe("club of the hills");
  });

  it("expands cc to country club as a standalone token", () => {
    expect(normalizeName("Boca Raton CC")).toBe("boca raton country club");
  });

  it("expands gc to golf club as a standalone token", () => {
    expect(normalizeName("Pine Valley GC")).toBe("pine valley golf club");
  });

  it("does not expand cc inside another word", () => {
    expect(normalizeName("Peccary Ridge")).toBe("peccary ridge");
  });

  it("handles empty and nullish input", () => {
    expect(normalizeName("")).toBe("");
    // @ts-expect-error testing runtime guard
    expect(normalizeName(undefined)).toBe("");
  });

  it("expands both the leading the and a trailing cc", () => {
    expect(normalizeName("The Wanderers CC")).toBe("wanderers country club");
  });
});

describe("normalizeEmployer", () => {
  it("uses the same normalization as a name", () => {
    expect(normalizeEmployer("Heritage Golf Group, LLC")).toBe(
      "heritage golf group llc",
    );
  });
});

describe("normalizeLinkedin", () => {
  it("strips protocol, www, query, and trailing slash", () => {
    expect(
      normalizeLinkedin("https://www.linkedin.com/in/jane-doe/?trk=abc"),
    ).toBe("linkedin.com/in/jane-doe");
  });

  it("lowercases", () => {
    expect(normalizeLinkedin("HTTP://LinkedIn.com/in/John")).toBe(
      "linkedin.com/in/john",
    );
  });

  it("returns null for blank", () => {
    expect(normalizeLinkedin("")).toBeNull();
    expect(normalizeLinkedin(null)).toBeNull();
    expect(normalizeLinkedin(undefined)).toBeNull();
  });

  it("strips a fragment", () => {
    expect(normalizeLinkedin("linkedin.com/in/jane#about")).toBe(
      "linkedin.com/in/jane",
    );
  });
});

describe("nameEmployerKey", () => {
  it("joins normalized name and employer", () => {
    expect(nameEmployerKey("The Jane Doe", "Boca CC")).toBe(
      "jane doe::boca country club",
    );
  });
});
