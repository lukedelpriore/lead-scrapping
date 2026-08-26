import { prisma } from "@dph/db";
import {
  adjudicateByRules,
  checkCandidate,
  normalizeName,
  normalizeLinkedin,
  type SearchResult,
  type Gate2Lookups,
  SameRunSet,
} from "@dph/pipeline";
import { bumpStageCounts } from "./discover";

/**
 * Find persistence. Given the search results for a target and the title
 * hierarchy, adjudicate (rules or Claude), create primary and alternate
 * candidates, and run gate 2 on each so duplicates never reach reveal. Zero
 * credits: person search is free and no lookup happens here.
 */
export interface FindTarget {
  runId: string;
  requestId: string;
  targetType: "venue" | "group";
  venueId: string | null;
  groupId: string | null;
  name: string;
  groupName?: string | null;
  city?: string | null;
  state?: string | null;
  isVenue: boolean;
  titleHierarchy: string[][];
  revealMode: "auto" | "ask";
}

export async function createCandidates(args: {
  target: FindTarget;
  results: SearchResult[];
  gate2: Gate2Lookups;
  sameRun: SameRunSet;
}): Promise<{ created: number; ready: number; duplicates: number }> {
  const { target, results, gate2, sameRun } = args;
  const adj = adjudicateByRules({
    targetName: target.name,
    groupName: target.groupName,
    targetState: target.state,
    targetCity: target.city,
    isVenue: target.isVenue,
    titleHierarchy: target.titleHierarchy,
    results,
  });

  const byId = new Map(results.map((r) => [r.profileId, r]));
  const picks: { profileId: string; rank: "primary" | "alternate" }[] = [];
  if (adj.primary) picks.push({ profileId: adj.primary, rank: "primary" });
  if (adj.alternate) picks.push({ profileId: adj.alternate, rank: "alternate" });

  let created = 0;
  let ready = 0;
  let duplicates = 0;

  for (const pick of picks) {
    const r = byId.get(pick.profileId);
    if (!r) continue;

    const keyInput = {
      rrProfileId: r.profileId,
      linkedinUrl: r.linkedinUrl,
      name: r.name,
      employer: r.employer,
    };
    const decision = checkCandidate(keyInput, gate2, sameRun);
    if (decision.status === "ready") {
      sameRun.add([
        { keyType: "profile_id", keyValue: r.profileId },
        ...(normalizeLinkedin(r.linkedinUrl)
          ? [{ keyType: "linkedin" as const, keyValue: normalizeLinkedin(r.linkedinUrl)! }]
          : []),
      ]);
      ready += 1;
    } else {
      duplicates += 1;
    }

    await prisma.candidate.create({
      data: {
        runId: target.runId,
        requestId: target.requestId,
        targetType: target.targetType,
        venueId: target.venueId,
        groupId: target.groupId,
        rrProfileId: r.profileId,
        name: r.name,
        nameNormalized: normalizeName(r.name),
        title: r.title,
        employer: r.employer,
        employerNormalized: r.employer ? normalizeName(r.employer) : null,
        linkedinUrl: r.linkedinUrl,
        linkedinNormalized: normalizeLinkedin(r.linkedinUrl),
        location: r.location,
        rank: pick.rank,
        confidence: adj.confidence,
        reason: adj.reason,
        dedupeStatus: decision.status,
        dedupeKey: decision.dedupeKey,
        dedupeSource: decision.dedupeSource,
        reviewStatus:
          decision.status === "ready" && target.revealMode === "ask" ? "pending" : "none",
      },
    });
    created += 1;
  }

  await bumpStageCounts(target.runId, {});
  return { created, ready, duplicates };
}
