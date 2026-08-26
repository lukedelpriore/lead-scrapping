/**
 * Reveal selection. Section 6.7. Decides which ready candidates to reveal
 * within the batch cap and the per venue and per group caps, in rank order.
 * Pure and unit tested. No credit is spent here; this only chooses.
 *
 * Modes:
 *  - auto: reveal every ready candidate with confidence >= auto_reveal_min
 *    in rank order until the batch cap, sending lower confidence ones to review.
 *  - ask: everything goes to the review queue, nothing is auto selected.
 *
 * Caps: max_contacts_per_venue, max_contacts_per_group. Primary first; the
 * alternate is only eligible when its primary returned no mobile and the
 * target is tier 1 or 2. That last rule depends on lookup results, so this
 * function selects primaries and marks alternates eligible for a later pass.
 */

export interface RevealCandidate {
  id: string;
  venueId: string | null;
  groupId: string | null;
  rank: "primary" | "alternate";
  confidence: number;
  tier: number | null;
  /** Sort key within a target, lower is better (from adjudication order). */
  order?: number;
}

export interface RevealSettings {
  autoRevealMinConfidence: number;
  maxContactsPerVenue: number;
  maxContactsPerGroup: number;
}

export interface RevealSelection {
  toReveal: RevealCandidate[];
  toReview: RevealCandidate[];
  wouldSpend: number;
}

export function selectForReveal(
  candidates: RevealCandidate[],
  settings: RevealSettings,
  batchCap: number,
  mode: "auto" | "ask",
): RevealSelection {
  // ask sends everything to review.
  if (mode === "ask") {
    return { toReveal: [], toReview: [...candidates], wouldSpend: 0 };
  }

  // auto: primaries first, in rank then confidence order, respecting caps.
  const perVenue = new Map<string, number>();
  const perGroup = new Map<string, number>();
  const toReveal: RevealCandidate[] = [];
  const toReview: RevealCandidate[] = [];

  const sorted = [...candidates].sort((a, b) => {
    // primary before alternate
    if (a.rank !== b.rank) return a.rank === "primary" ? -1 : 1;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return (a.order ?? 0) - (b.order ?? 0);
  });

  for (const c of sorted) {
    if (toReveal.length >= batchCap) {
      toReview.push(c);
      continue;
    }
    if (c.confidence < settings.autoRevealMinConfidence) {
      toReview.push(c);
      continue;
    }
    // Alternate is not auto revealed up front; it is considered only after a
    // primary returns no mobile, which happens in the lookup pass.
    if (c.rank === "alternate") {
      toReview.push(c);
      continue;
    }
    const vCount = c.venueId ? (perVenue.get(c.venueId) ?? 0) : 0;
    const gCount = c.groupId ? (perGroup.get(c.groupId) ?? 0) : 0;
    if (c.venueId && vCount >= settings.maxContactsPerVenue) {
      toReview.push(c);
      continue;
    }
    if (c.groupId && gCount >= settings.maxContactsPerGroup) {
      toReview.push(c);
      continue;
    }
    toReveal.push(c);
    if (c.venueId) perVenue.set(c.venueId, vCount + 1);
    if (c.groupId) perGroup.set(c.groupId, gCount + 1);
  }

  return { toReveal, toReview, wouldSpend: toReveal.length };
}

/**
 * Whether an alternate should be revealed after its primary: only when the
 * primary returned no mobile and the target is tier 1 or 2. Section 6.7.
 */
export function shouldRevealAlternate(args: {
  primaryHadMobile: boolean;
  tier: number | null;
}): boolean {
  if (args.primaryHadMobile) return false;
  return args.tier === 1 || args.tier === 2;
}
