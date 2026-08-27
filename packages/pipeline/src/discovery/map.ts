import { registrableDomain } from "../normalize/index";
import type { DiscoveredVenue } from "../gate1";
import type { GolfCourse } from "../adapters/overpass";
import type { SerperResult, SerperPlace } from "../adapters/serper";

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

/**
 * Map Google Maps places results (via Serper) to venues. This is the good
 * source for general business discovery: it carries the real business name,
 * a street address, a phone, and a website.
 */
export function fromSerperPlaces(places: SerperPlace[]): DiscoveredVenue[] {
  return places
    .filter((p) => p.title)
    .map((p) => {
      const loc = parseUsAddress(p.address);
      return {
        id: nextId("places"),
        name: p.title.trim(),
        address: p.address ?? null,
        city: loc.city,
        state: loc.state,
        mainLine: p.phone ?? null,
        website: p.website ?? null,
        domain: registrableDomain(p.website ?? null),
        placeId: p.cid ?? null,
        source: "places" as DiscoveredVenue["source"],
        raw: p,
      };
    });
}

const US_STATE_CODE = /\b([A-Z]{2})\b/;

/**
 * Pull the city and two letter state out of a US formatted address like
 * "290 Meadow Rd, Basking Ridge, NJ 07920". Returns nulls when it cannot tell.
 */
export function parseUsAddress(address: string | null | undefined): {
  city: string | null;
  state: string | null;
} {
  if (!address) return { city: null, state: null };
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return { city: null, state: null };
  // The last part is usually "STATE ZIP" (or just "STATE"); the one before
  // it is the city.
  const tail = parts[parts.length - 1]!;
  const stateMatch = tail.match(US_STATE_CODE);
  const state = stateMatch ? stateMatch[1]! : null;
  const city = parts[parts.length - 2] ?? null;
  return { city: city || null, state };
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
