import { prisma } from "@dph/db";
import { getEnv, OWNER_TITLES } from "@dph/config";
import {
  SerperClient,
  RocketReachClient,
  buildBusinessSerperQueries,
  buildBusinessCompanyQueries,
  fromSerper,
  fromRocketReachCompanies,
  buildSearchPlan,
  SameRunSet,
  type DiscoveredVenue,
  type SearchResult,
} from "@dph/pipeline";
import { dbApiLog } from "../db-api-log";
import { buildSuppressionLookup, buildGate2Lookups } from "../stages/suppression-lookup";
import { persistDiscovery, logRunEvent, bumpStageCounts } from "../stages/discover";
import { createCandidates } from "../stages/find";
import { logger } from "../logger";

/**
 * General business search. Discovers businesses of the requested type in the
 * requested states, then finds the owner or decision maker for each. Person
 * search is free, so this spends no credits. Verifying an owner cell happens
 * later in the reveal-batch job, in the capped batches the operator approves.
 *
 * Live sources (Serper, RocketReach) run only when their keys are present and
 * the network is open; each source is attempted independently and a failure is
 * logged so the run continues with what the others returned.
 */
export async function runSearchJob(data: { runId: string; requestId: string }): Promise<void> {
  const env = getEnv();
  const request = await prisma.request.findUnique({ where: { id: data.requestId } });
  if (!request) throw new Error(`request ${data.requestId} not found`);

  const states = (request.states as string[]) ?? [];
  const keywords = (request.keywords as string[]) ?? [];
  const targetCount = request.targetCount ?? 100;

  const serper = env.SERPER_API_KEY ? new SerperClient({ apiKey: env.SERPER_API_KEY, log: dbApiLog }) : null;
  const rr = env.ROCKETREACH_API_KEY
    ? new RocketReachClient({ apiKey: env.ROCKETREACH_API_KEY, revealMode: env.REVEAL_MODE, log: dbApiLog })
    : null;

  // 1. Discover businesses.
  const all: DiscoveredVenue[] = [];

  if (serper) {
    for (const q of buildBusinessSerperQueries(keywords, states)) {
      try {
        const res = await serper.search(q, { gl: "us" });
        all.push(...fromSerper(res));
      } catch (err) {
        await logRunEvent(data.runId, "discover", "warn", `Search failed: ${q}`, { error: (err as Error).message });
      }
    }
  }
  if (rr) {
    for (const { keyword, location } of buildBusinessCompanyQueries(keywords, states)) {
      try {
        const res = await rr.companySearch({ keyword: [keyword], location: [location] });
        all.push(...fromRocketReachCompanies(res.companies));
      } catch (err) {
        await logRunEvent(data.runId, "discover", "warn", `Company search failed: ${keyword} ${location}`, {
          error: (err as Error).message,
        });
      }
    }
  }

  const suppression = await buildSuppressionLookup();
  const discovered = await persistDiscovery({ runId: data.runId, venues: all, suppression });
  await bumpStageCounts(data.runId, { discover: discovered.discovered, dedupe: discovered.merged });
  await logRunEvent(
    data.runId,
    "discover",
    "info",
    `Found ${discovered.discovered} businesses, ${discovered.merged} after removing duplicates, ${discovered.suppressed} already in your lists.`,
  );

  if (discovered.merged === 0) {
    await logRunEvent(
      data.runId,
      "discover",
      "warn",
      "No businesses found. Add a Serper or RocketReach key, or check the search terms.",
    );
  }

  // 2. Find the owner or decision maker for each business.
  const gate2 = await buildGate2Lookups();
  const sameRun = new SameRunSet();
  const titles = OWNER_TITLES.flat();
  const businesses = await prisma.venue.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "asc" },
    take: targetCount,
  });

  let ownersFound = 0;
  for (const b of businesses) {
    if (!rr) break;
    let results: SearchResult[] = [];
    const plan = buildSearchPlan({
      venueName: b.name,
      city: b.city,
      state: b.state,
      isVenue: true,
      titles,
    });
    for (const step of plan) {
      try {
        const res = await rr.personSearch({ query: step.query, pageSize: 25 });
        results = res.profiles.map((p, i) => ({
          profileId: String(p.id ?? `${b.id}-${i}`),
          name: p.name ?? "",
          title: p.current_title ?? null,
          employer: p.current_employer ?? null,
          location: p.location ?? null,
          linkedinUrl: p.linkedin_url ?? null,
          position: i,
        }));
        if (results.length >= 2) break;
      } catch (err) {
        await logRunEvent(data.runId, "find", "warn", `Owner search failed for ${b.name}`, {
          error: (err as Error).message,
        });
      }
    }
    if (results.length > 0) {
      const out = await createCandidates({
        target: {
          runId: data.runId,
          requestId: data.requestId,
          targetType: "venue",
          venueId: b.id,
          groupId: null,
          name: b.name,
          city: b.city,
          state: b.state,
          isVenue: true,
          titleHierarchy: OWNER_TITLES,
          revealMode: "ask",
        },
        results,
        gate2,
        sameRun,
      });
      if (out.created > 0) ownersFound += 1;
    }
  }

  await bumpStageCounts(data.runId, { find: ownersFound, qualify: businesses.length });
  await logRunEvent(data.runId, "find", "info", `Found an owner or decision maker for ${ownersFound} businesses.`);

  await prisma.run.update({
    where: { id: data.runId },
    data: { status: "needs_review", finishedAt: new Date() },
  });
  await prisma.request.update({ where: { id: data.requestId }, data: { status: "needs_review" } });
  logger.info({ runId: data.runId, ownersFound }, "run-search complete");
}
