import { tokenSetRatio } from "../normalize/fuzzy";
import { normalizeName } from "../normalize/index";
import { EXCLUDE_EVERYWHERE, PIPELINE_DEFAULTS } from "@dph/config";

/**
 * Rules adjudicator. Section 6.5. Runs when AI_MODE is off. Scores search
 * results against the target and the title hierarchy for the ownership type,
 * and picks a primary and an alternate. Same output shape as the Claude
 * adjudicator. Pure and unit tested.
 */

export interface SearchResult {
  profileId: string;
  name: string;
  title: string | null;
  employer: string | null;
  location: string | null;
  linkedinUrl: string | null;
  /** Position in the RocketReach result list, 0 based. */
  position: number;
}

export interface AdjudicateInput {
  targetName: string;
  /** For a venue inside a group, the group name also counts as a match. */
  groupName?: string | null;
  targetState?: string | null;
  targetCity?: string | null;
  isVenue: boolean;
  /** Ordered title hierarchy for the ownership type, earlier is better. */
  titleHierarchy: string[][];
  results: SearchResult[];
  employerThreshold?: number;
}

export interface Adjudicated {
  primary: string | null;
  alternate: string | null;
  confidence: number;
  reason: string;
  /** Per result scoring, exposed for the review UI and tests. */
  scored: Array<{ profileId: string; score: number; tier: number; employerRatio: number }>;
}

const SENIORITY_WEIGHTS: [string, number][] = [
  ["owner", 8],
  ["founder", 7],
  ["chief", 6],
  ["president", 5],
  ["chairman", 4],
  ["partner", 3],
  ["vice", 2],
  ["director", 1],
  ["manager", 0],
];

function titleTier(title: string, hierarchy: string[][]): number {
  const t = title.toLowerCase();
  for (let i = 0; i < hierarchy.length; i++) {
    for (const name of hierarchy[i]!) {
      if (t.includes(name.toLowerCase())) return i;
    }
  }
  return hierarchy.length; // below all listed tiers
}

function excluded(title: string): boolean {
  const t = title.toLowerCase();
  return EXCLUDE_EVERYWHERE.some((w) => t.includes(w.toLowerCase()));
}

function seniorityPenalty(title: string): number {
  const t = title.toLowerCase();
  let penalty = 0;
  for (const [word, weight] of SENIORITY_WEIGHTS) {
    if (t.includes(word)) penalty += weight * 10;
  }
  return penalty;
}

export function adjudicateByRules(input: AdjudicateInput): Adjudicated {
  const employerThreshold = input.employerThreshold ?? PIPELINE_DEFAULTS.fuzzy_employer_threshold;
  const targetNorm = normalizeName(input.targetName);
  const groupNorm = input.groupName ? normalizeName(input.groupName) : null;

  const scored = input.results
    .map((r) => {
      const title = r.title ?? "";
      const employer = r.employer ?? "";
      const employerNorm = normalizeName(employer);
      // employer match against venue name or the group name
      const ratioVenue = tokenSetRatio(employerNorm, targetNorm);
      const ratioGroup = groupNorm ? tokenSetRatio(employerNorm, groupNorm) : 0;
      const employerRatio = Math.max(ratioVenue, ratioGroup);

      // Rejections
      if (employerRatio < employerThreshold) return null;
      if (excluded(title)) return null;
      // For venue targets, drop results whose state differs.
      if (input.isVenue && input.targetState && r.location) {
        const state = extractState(r.location);
        if (state && state.toLowerCase() !== input.targetState.toLowerCase()) return null;
      }

      const tier = titleTier(title, input.titleHierarchy);
      // Score = tier*100 - seniority penalty + position. Lowest wins.
      const score = tier * 100 - seniorityPenalty(title) + r.position;
      return { result: r, score, tier, employerRatio };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .sort((a, b) => a.score - b.score);

  if (scored.length === 0) {
    return { primary: null, alternate: null, confidence: 0, reason: "no qualifying result", scored: [] };
  }

  const best = scored[0]!;
  const alternate = scored.find((s) => s.result.profileId !== best.result.profileId) ?? null;

  const confidence = confidenceFor(best.employerRatio, best.tier);
  const reason = `tier ${best.tier}, employer ratio ${best.employerRatio}`;

  return {
    primary: best.result.profileId,
    alternate: alternate?.result.profileId ?? null,
    confidence,
    reason,
    scored: scored.map((s) => ({
      profileId: s.result.profileId,
      score: s.score,
      tier: s.tier,
      employerRatio: s.employerRatio,
    })),
  };
}

function confidenceFor(employerRatio: number, tier: number): number {
  if (employerRatio >= 95 && (tier === 0 || tier === 1)) return 0.9;
  if (employerRatio >= 90 || tier === 2 || tier === 3) return 0.75;
  return 0.5;
}

/** Pull a two letter state code from a location string like "Boca Raton, FL". */
export function extractState(location: string): string | null {
  const m = location.match(/,\s*([A-Z]{2})\b/);
  return m?.[1] ?? null;
}
