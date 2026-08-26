import { prisma, type Prisma } from "@dph/db";
import {
  mergeVenues,
  isVenueSuppressed,
  normalizeName,
  registrableDomain,
  type DiscoveredVenue,
  type MergedVenue,
  type SuppressionLookup,
} from "@dph/pipeline";

/**
 * Persist a set of discovered venues: merge duplicates (gate 1), pick a
 * canonical record, attach the rest as venue_sources, and mark suppressed
 * venues. Updates the run stage counts for discover and dedupe. The live
 * gathering from Overpass, RocketReach, and Serper is done by the caller and
 * passed in as DiscoveredVenue arrays, so this is testable with fixtures.
 */
export interface DiscoverResult {
  discovered: number;
  merged: number;
  suppressed: number;
  venueIds: string[];
}

function bestField<T>(members: DiscoveredVenue[], pick: (v: DiscoveredVenue) => T | null | undefined): T | null {
  for (const m of members) {
    const val = pick(m);
    if (val !== null && val !== undefined && val !== "") return val;
  }
  return null;
}

export async function persistDiscovery(args: {
  runId: string;
  venues: DiscoveredVenue[];
  suppression: SuppressionLookup;
  groupNameByVenue?: (v: MergedVenue) => string | null;
}): Promise<DiscoverResult> {
  const clusters = mergeVenues(args.venues);
  const venueIds: string[] = [];
  let suppressedCount = 0;

  for (const cluster of clusters) {
    const c = cluster.canonical;
    const name = c.name;
    const website = bestField(cluster.members, (m) => m.website);
    const domain =
      bestField(cluster.members, (m) => m.domain) ?? registrableDomain(website);
    const state = bestField(cluster.members, (m) => m.state);
    const city = bestField(cluster.members, (m) => m.city);
    const osmId = bestField(cluster.members, (m) => m.osmId);
    const placeId = bestField(cluster.members, (m) => m.placeId);
    const rrCompanyId = bestField(cluster.members, (m) => m.rrCompanyId);
    const groupName = args.groupNameByVenue?.(cluster) ?? null;

    const suppressed = isVenueSuppressed(
      { name, state, domain, website, groupName },
      args.suppression,
    );
    if (suppressed) suppressedCount += 1;

    const venue = await prisma.venue.create({
      data: {
        name,
        nameNormalized: normalizeName(name),
        city: city ?? null,
        state: state ?? null,
        website: website ?? null,
        domain: domain ?? null,
        osmId: osmId ?? null,
        placeId: placeId ?? null,
        rrCompanyId: rrCompanyId ?? null,
        status: suppressed ? "suppressed" : "open",
        sources: {
          create: cluster.members.map((m) => ({
            source: m.source,
            sourceRef: m.osmId ?? m.placeId ?? m.rrCompanyId ?? m.website ?? null,
            raw: (m.raw as Prisma.InputJsonValue) ?? undefined,
          })),
        },
      },
    });
    venueIds.push(venue.id);
  }

  await bumpStageCounts(args.runId, {
    discover: args.venues.length,
    dedupe: clusters.length,
  });

  return {
    discovered: args.venues.length,
    merged: clusters.length,
    suppressed: suppressedCount,
    venueIds,
  };
}

/** Merge new counts into run.stage_counts. */
export async function bumpStageCounts(
  runId: string,
  counts: Record<string, number>,
): Promise<void> {
  const run = await prisma.run.findUnique({ where: { id: runId }, select: { stageCounts: true } });
  const current = (run?.stageCounts as Record<string, number>) ?? {};
  const merged = { ...current, ...counts };
  await prisma.run.update({
    where: { id: runId },
    data: { stageCounts: merged as Prisma.InputJsonValue },
  });
}

/** Record a run event. */
export async function logRunEvent(
  runId: string,
  stage: string,
  level: "info" | "warn" | "error",
  message: string,
  data?: unknown,
): Promise<void> {
  await prisma.runEvent.create({
    data: { runId, stage, level, message, data: (data as Prisma.InputJsonValue) ?? undefined },
  });
}
