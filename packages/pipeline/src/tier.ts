/**
 * Tier rules. Section 6.3 of the spec.
 *
 * Tier 1: group with 5 or more venues, or nonmember_events = yes.
 * Tier 2: hosts_weddings = yes or hosts_corporate = yes with
 *         nonmember_events = unclear. Found on The Knot or WeddingWire counts
 *         as hosts_weddings = yes.
 * Tier 3: municipal with event space.
 * Dropped (null): nonmember_events = no, no event space found, or unreachable.
 */

export type Tri = "yes" | "no" | "unclear";

export interface TierInput {
  nonmemberEvents: Tri;
  hostsWeddings: Tri;
  hostsCorporate: Tri;
  ownershipType: "group" | "private_owner" | "member_owned" | "municipal" | "unclear";
  groupVenueCount?: number;
  reachable?: boolean;
}

export type TierResult = 1 | 2 | 3 | null;

export function computeTier(input: TierInput): TierResult {
  const {
    nonmemberEvents,
    hostsWeddings,
    hostsCorporate,
    ownershipType,
    groupVenueCount = 0,
    reachable = true,
  } = input;

  // Dropped: explicit no, or unreachable.
  if (nonmemberEvents === "no") return null;
  if (!reachable) return null;

  const hasEventSpace = hostsWeddings === "yes" || hostsCorporate === "yes";

  // Tier 1
  if (groupVenueCount >= 5) return 1;
  if (nonmemberEvents === "yes") return 1;

  // Tier 2
  if (hasEventSpace && nonmemberEvents === "unclear") return 2;

  // Tier 3
  if (ownershipType === "municipal" && hasEventSpace) return 3;

  // No event space found and nothing above matched.
  if (!hasEventSpace) return null;

  // Event space exists but did not meet tier 1 or tier 2 conditions above;
  // treat as tier 2 conservatively when nonmember status is unknown.
  return 2;
}
