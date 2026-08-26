import { prisma, type Prisma } from "@dph/db";
import {
  classifyByRules,
  computeTier,
  type ClassifyResult,
  type ClassifyPage,
} from "@dph/pipeline";
import { bumpStageCounts } from "./discover";

/**
 * Qualify persistence. Given a classification for a venue, set the flags,
 * ownership, evidence, capacity, tier, and mark it qualified. The classifier
 * itself (rules or Claude) is chosen upstream; both return ClassifyResult.
 * Group venue count is passed in for the tier 1 group rule.
 */
export async function persistQualification(args: {
  venueId: string;
  result: ClassifyResult;
  groupVenueCount?: number;
  reachable?: boolean;
}): Promise<{ tier: number | null; dropped: boolean }> {
  const { result } = args;
  const tier = computeTier({
    nonmemberEvents: result.nonmember_events,
    hostsWeddings: result.hosts_weddings,
    hostsCorporate: result.hosts_corporate,
    ownershipType: result.ownership_type === "unclear" ? "unclear" : result.ownership_type,
    groupVenueCount: args.groupVenueCount ?? 0,
    reachable: args.reachable ?? true,
  });

  await prisma.venue.update({
    where: { id: args.venueId },
    data: {
      hostsWeddings: result.hosts_weddings,
      hostsCorporate: result.hosts_corporate,
      nonmemberEvents: result.nonmember_events,
      ownershipType: result.ownership_type,
      evidenceUrl: result.evidence_url,
      evidencePhrase: result.evidence_phrase,
      capacity: result.capacity,
      classifierConfidence: result.confidence,
      siteContact: (result.site_contact as Prisma.InputJsonValue) ?? undefined,
      tier,
      status: tier === null ? "dropped" : "open",
      qualifiedAt: new Date(),
    },
  });

  return { tier, dropped: tier === null };
}

/**
 * Run the rules classifier for a venue from fetched pages and persist it.
 * The worker job supplies the fetched pages; with AI_MODE on the caller uses
 * the Claude classifier instead, which returns the same shape.
 */
export async function qualifyVenueByRules(args: {
  venueId: string;
  runId: string;
  name: string;
  city?: string | null;
  state?: string | null;
  pages: ClassifyPage[];
  foundOnWeddingDirectory?: boolean;
  seedGroupNames: string[];
  groupVenueCount?: number;
}): Promise<{ tier: number | null }> {
  const reachable = args.pages.some((p) => p.text.trim().length > 0);
  const result = classifyByRules({
    name: args.name,
    city: args.city,
    state: args.state,
    pages: args.pages,
    foundOnWeddingDirectory: args.foundOnWeddingDirectory,
    seedGroupNames: args.seedGroupNames,
  });
  const { tier } = await persistQualification({
    venueId: args.venueId,
    result,
    groupVenueCount: args.groupVenueCount,
    reachable,
  });
  await bumpStageCounts(args.runId, {});
  return { tier };
}
