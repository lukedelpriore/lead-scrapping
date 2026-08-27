import { describe, it, expect } from "vitest";
import {
  buildBusinessSerperQueries,
  buildBusinessCompanyQueries,
  buildBusinessPlacesQueries,
} from "./business";

describe("buildBusinessSerperQueries", () => {
  it("builds one search per keyword and state", () => {
    const q = buildBusinessSerperQueries(["roofing company"], ["OH", "MI"]);
    expect(q).toContain("roofing company in Ohio");
    expect(q).toContain("roofing company in Michigan");
  });

  it("falls back to United States with no states", () => {
    const q = buildBusinessSerperQueries(["gym"], []);
    expect(q.some((s) => s.includes("United States"))).toBe(true);
  });
});

describe("buildBusinessCompanyQueries", () => {
  it("pairs each keyword with each state name", () => {
    const q = buildBusinessCompanyQueries(["hvac company"], ["TX"]);
    expect(q).toEqual([{ keyword: "hvac company", location: "Texas" }]);
  });
});

describe("buildBusinessPlacesQueries", () => {
  it("builds text search queries", () => {
    const q = buildBusinessPlacesQueries(["med spa"], ["FL"]);
    expect(q).toEqual(["med spa in Florida"]);
  });
});
