import { registrableDomain } from "../normalize/index";
import type { DiscoveredVenue } from "../gate1";
import type { GolfCourse } from "../adapters/overpass";
import type { SerperResult } from "../adapters/serper";

/**
 * Map each discovery source to the common DiscoveredVenue shape for gate 1.
 * Section 6.1. Pure, so mapping is unit tested without any network.
 */

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function fromOverpass(courses: GolfCourse[]): DiscoveredVenue[] {
  return courses.map((c) => ({
    id: nextId("osm"),
    name: c.name,
    website: c.website,
    domain: registrableDomain(c.website),
    osmId: c.osmId,
    lat: c.lat,
    lng: c.lng,
    source: "osm" as const,
    raw: c,
  })) as unknown as DiscoveredVenue[];
}

export function fromRocketReachCompanies(
  companies: { id?: string | number; name?: string; domain?: string | null; location?: string | null }[],
): DiscoveredVenue[] {
  return companies
    .filter((c) => c.name)
    .map((c) => ({
      id: nextId("rr"),
      name: c.name!,
      domain: registrableDomain(c.domain ?? null),
      website: c.domain ?? null,
      rrCompanyId: c.id != null ? String(c.id) : null,
      source: "rocketreach" as const,
      raw: c,
    }));
}

/**
 * Serper harvests titles and urls only. A result becomes a weak venue lead: a
 * name from the title and a domain from the url. The Knot and WeddingWire hits
 * are tagged so the qualifier can treat them as hosts_weddings = yes.
 */
export function fromSerper(results: SerperResult[]): DiscoveredVenue[] {
  return results.map((r) => {
    const domain = registrableDomain(r.url);
    const isKnot = /theknot\.com/i.test(r.url);
    const isWeddingWire = /weddingwire\.com/i.test(r.url);
    const source = isKnot ? "knot" : isWeddingWire ? "weddingwire" : "serper";
    return {
      id: nextId("serper"),
      name: cleanTitle(r.title),
      website: r.url,
      domain,
      source: source as DiscoveredVenue["source"],
      raw: r,
    };
  });
}

/** Pasted club names or urls from the request form. */
export function fromPasted(lines: string[]): DiscoveredVenue[] {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const looksUrl = /^https?:\/\//i.test(line) || /\.[a-z]{2,}(\/|$)/i.test(line);
      const domain = looksUrl ? registrableDomain(line) : null;
      return {
        id: nextId("pasted"),
        name: looksUrl ? line : line,
        website: looksUrl ? line : null,
        domain,
        source: "pasted" as const,
        raw: { line },
      } as DiscoveredVenue;
    });
}

function cleanTitle(title: string): string {
  // Strip a trailing site suffix like " | The Knot" and vertical bars.
  return title.split("|")[0]!.split(" - ")[0]!.trim();
}
