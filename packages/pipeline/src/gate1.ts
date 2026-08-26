import { normalizeName, registrableDomain } from "./normalize/index";
import { tokenSetRatio } from "./normalize/fuzzy";
import { PIPELINE_DEFAULTS } from "@dph/config";

/**
 * Gate 1, venue dedupe. Section 6.2.
 *
 * Merge order:
 *  1. same registrable domain (ignore www)
 *  2. same place id or osm id
 *  3. name_normalized plus state with token set ratio >= 92 and a fuzzy city match
 *
 * Keep one canonical venue; the rest become sources on it. Pure and testable.
 */

export type VenueSourceKind =
  | "osm"
  | "rocketreach"
  | "serper"
  | "group_page"
  | "places"
  | "pasted"
  | "knot"
  | "weddingwire";

export interface DiscoveredVenue {
  /** A caller assigned id, stable within one discovery run. */
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  website?: string | null;
  domain?: string | null;
  osmId?: string | null;
  placeId?: string | null;
  rrCompanyId?: string | null;
  source: VenueSourceKind;
  raw?: unknown;
}

export interface MergedVenue {
  canonical: DiscoveredVenue;
  /** All members including the canonical, in input order. */
  members: DiscoveredVenue[];
}

const CITY_MATCH_THRESHOLD = 85;

function domainOf(v: DiscoveredVenue): string | null {
  return registrableDomain(v.domain ?? v.website ?? null);
}

function cityMatches(a?: string | null, b?: string | null): boolean {
  // If either city is unknown, do not block the merge on it.
  if (!a || !b) return true;
  return tokenSetRatio(a.toLowerCase(), b.toLowerCase()) >= CITY_MATCH_THRESHOLD;
}

/**
 * Group discovered venues into merged clusters. The first venue to open a
 * cluster is its canonical record. A later duplicate that carries fields the
 * canonical lacks (a website, coordinates) does not change which is canonical;
 * enrichment is a separate concern handled by the caller from members.
 */
export function mergeVenues(
  venues: DiscoveredVenue[],
  opts: { nameThreshold?: number } = {},
): MergedVenue[] {
  const nameThreshold = opts.nameThreshold ?? PIPELINE_DEFAULTS.fuzzy_venue_name_threshold;
  const clusters: MergedVenue[] = [];

  const byDomain = new Map<string, MergedVenue>();
  const byOsm = new Map<string, MergedVenue>();
  const byPlace = new Map<string, MergedVenue>();

  for (const v of venues) {
    const domain = domainOf(v);
    const nameNorm = normalizeName(v.name);
    const state = (v.state ?? "").toLowerCase();

    let target: MergedVenue | undefined;

    // 1. domain
    if (domain && byDomain.has(domain)) {
      target = byDomain.get(domain);
    }
    // 2. place id or osm id
    if (!target && v.placeId && byPlace.has(v.placeId)) {
      target = byPlace.get(v.placeId);
    }
    if (!target && v.osmId && byOsm.has(v.osmId)) {
      target = byOsm.get(v.osmId);
    }
    // 3. name_normalized + state fuzzy, with a fuzzy city match
    if (!target) {
      for (const c of clusters) {
        const cv = c.canonical;
        const cState = (cv.state ?? "").toLowerCase();
        if (state && cState && state !== cState) continue;
        const ratio = tokenSetRatio(nameNorm, normalizeName(cv.name));
        if (ratio >= nameThreshold && cityMatches(v.city, cv.city)) {
          target = c;
          break;
        }
      }
    }

    if (!target) {
      target = { canonical: v, members: [v] };
      clusters.push(target);
    } else {
      target.members.push(v);
    }

    // Index this member's keys so later venues can find the cluster.
    if (domain && !byDomain.has(domain)) byDomain.set(domain, target);
    if (v.placeId && !byPlace.has(v.placeId)) byPlace.set(v.placeId, target);
    if (v.osmId && !byOsm.has(v.osmId)) byOsm.set(v.osmId, target);
  }

  return clusters;
}

export interface SuppressionLookup {
  /** Returns true when a venue level key is suppressed. */
  hasDomain(domain: string): boolean;
  hasNameState(nameNormalizedAndState: string): boolean;
  /** Returns true when a group name (normalized) is marked in_play. */
  hasInPlayGroup(groupNameNormalized: string): boolean;
}

/**
 * Decide whether a merged venue should be suppressed. Section 6.2 second part.
 */
export function isVenueSuppressed(
  venue: { name: string; state?: string | null; domain?: string | null; website?: string | null; groupName?: string | null },
  supp: SuppressionLookup,
): boolean {
  const domain = registrableDomain(venue.domain ?? venue.website ?? null);
  if (domain && supp.hasDomain(domain)) return true;
  if (venue.state) {
    const key = `${normalizeName(venue.name)}::${venue.state.trim().toLowerCase()}`;
    if (supp.hasNameState(key)) return true;
  }
  if (venue.groupName && supp.hasInPlayGroup(normalizeName(venue.groupName))) {
    return true;
  }
  return false;
}
