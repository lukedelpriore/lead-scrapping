import { describe, it, expect } from "vitest";
import { selectInternalUrls, extractText, collectAnchors } from "./fetcher";

describe("selectInternalUrls", () => {
  it("keeps same host event links and always includes the homepage first", () => {
    const urls = selectInternalUrls("https://club.com/", [
      { href: "/weddings", text: "Weddings" },
      { href: "/golf", text: "Golf" },
      { href: "https://other.com/events", text: "Events" },
      { href: "/private-events", text: "Private Events" },
    ]);
    expect(urls[0]).toBe("https://club.com/");
    expect(urls).toContain("https://club.com/weddings");
    expect(urls).toContain("https://club.com/private-events");
    expect(urls).not.toContain("https://club.com/golf");
    expect(urls.some((u) => u.includes("other.com"))).toBe(false);
  });

  it("matches on anchor text as well as path", () => {
    const urls = selectInternalUrls("https://club.com/", [
      { href: "/host-your-day", text: "Corporate outings" },
    ]);
    expect(urls).toContain("https://club.com/host-your-day");
  });

  it("caps the number of pages", () => {
    const anchors = Array.from({ length: 20 }, (_, i) => ({ href: `/events-${i}`, text: "events" }));
    const urls = selectInternalUrls("https://club.com/", anchors);
    expect(urls.length).toBeLessThanOrEqual(6);
  });
});

describe("extractText", () => {
  it("extracts readable text and caps length", () => {
    const html = `<html><body><article><h1>Weddings</h1><p>${"word ".repeat(1000)}</p></article></body></html>`;
    const text = extractText(html, "https://club.com/weddings");
    expect(text.length).toBeLessThanOrEqual(3000);
    expect(text.toLowerCase()).toContain("weddings");
  });

  it("returns empty string for junk", () => {
    expect(extractText("", "https://club.com/")).toBe("");
  });
});

describe("collectAnchors", () => {
  it("collects href and text from anchors", () => {
    const anchors = collectAnchors(
      '<a href="/weddings">Weddings</a><a href="/golf">Golf</a>',
      "https://club.com/",
    );
    expect(anchors).toEqual([
      { href: "/weddings", text: "Weddings" },
      { href: "/golf", text: "Golf" },
    ]);
  });
});
