/**
 * Ranking. Section 6.4. Groups by venue count descending then request state
 * order. Single venues by tier, then state order, then classifier confidence.
 * Pure and testable.
 */

export interface RankableGroup {
  id: string;
  venueCount: number;
  primaryState?: string | null;
}

export interface RankableVenue {
  id: string;
  tier: number | null;
  state?: string | null;
  confidence?: number | null;
}

function stateIndex(order: string[], state?: string | null): number {
  if (!state) return order.length;
  const i = order.indexOf(state.toUpperCase());
  return i === -1 ? order.length : i;
}

export function rankGroups(groups: RankableGroup[], stateOrder: string[]): RankableGroup[] {
  return [...groups].sort((a, b) => {
    if (b.venueCount !== a.venueCount) return b.venueCount - a.venueCount;
    return stateIndex(stateOrder, a.primaryState) - stateIndex(stateOrder, b.primaryState);
  });
}

export function rankVenues(venues: RankableVenue[], stateOrder: string[]): RankableVenue[] {
  return [...venues].sort((a, b) => {
    const at = a.tier ?? 99;
    const bt = b.tier ?? 99;
    if (at !== bt) return at - bt; // tier 1 first
    const as = stateIndex(stateOrder, a.state);
    const bs = stateIndex(stateOrder, b.state);
    if (as !== bs) return as - bs;
    return (b.confidence ?? 0) - (a.confidence ?? 0); // higher confidence first
  });
}
