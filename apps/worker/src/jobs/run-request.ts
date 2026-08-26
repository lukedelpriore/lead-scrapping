import { prisma } from "@dph/db";
import { getEnv } from "@dph/config";
import {
  RocketReachClient,
  Mailer,
  SheetsClient,
  decodeServiceAccount,
  Fetcher,
  rankVenues,
  rankGroups,
  buildSearchPlan,
  SameRunSet,
  type SearchResult,
} from "@dph/pipeline";
import { STATE_ORDER, TITLE_LISTS, SEED_GROUPS, type OwnershipType } from "@dph/config";
import { dbApiLog } from "../db-api-log";
import { buildSuppressionLookup, buildGate2Lookups } from "../stages/suppression-lookup";
import { logRunEvent } from "../stages/discover";
import { runDiscoverJob } from "./discover";
import { qualifyVenueByRules } from "../stages/qualify";
import { createCandidates } from "../stages/find";
import { revealStage } from "../stages/reveal";
import { deliverStage } from "../stages/deliver";
import { logger } from "../logger";

/**
 * Full pipeline orchestration. Runs discover, qualify, find, reveal, and
 * deliver in order for one request. Live network stages (site fetch, person
 * search) degrade gracefully when the network is blocked: a stage logs the
 * failure and the run continues, so an offline run reaches deliver with
 * whatever the free and offline sources produced. REVEAL_MODE stays off, so
 * reveal is a no op that writes fixtures and spends nothing.
 */
export async function runRequestJob(data: { runId: string; requestId: string }): Promise<void> {
  const env = getEnv();
  const seedGroupNames = SEED_GROUPS.map((g) => g.name);

  // 1. Discover (Overpass, RocketReach companies, Serper, pasted).
  await runDiscoverJob(data);

  // 2. Qualify each open venue.
  const fetcher = new Fetcher({ log: dbApiLog });
  const openVenues = await prisma.venue.findMany({ where: { status: "open", qualifiedAt: null } });
  for (const v of openVenues) {
    let pages: { url: string; text: string }[] = [];
    if (v.website) {
      try {
        const fetched = await fetcher.fetchSite(v.website);
        pages = fetched.map((p) => ({ url: p.url, text: p.text }));
      } catch {
        pages = [];
      }
    }
    const groupVenueCount = v.groupId
      ? await prisma.venue.count({ where: { groupId: v.groupId } })
      : 0;
    await qualifyVenueByRules({
      venueId: v.id,
      runId: data.runId,
      name: v.name,
      city: v.city,
      state: v.state,
      pages,
      seedGroupNames,
      groupVenueCount,
    });
  }
  await logRunEvent(data.runId, "qualify", "info", `Qualified ${openVenues.length} venues`);

  // 3. Map and rank. Build the ordered target list.
  const request = await prisma.request.findUnique({ where: { id: data.requestId } });
  const tiers = (request?.tiers as number[]) ?? [1, 2];
  const venues = await prisma.venue.findMany({
    where: { status: "open", tier: { in: tiers } },
    include: { group: true },
  });
  const rankedVenues = rankVenues(
    venues.map((v) => ({ id: v.id, tier: v.tier, state: v.state, confidence: v.classifierConfidence })),
    STATE_ORDER,
  );
  const groups = await prisma.group.findMany({ where: { status: "open" } });
  rankGroups(
    groups.map((g: (typeof groups)[number]) => ({ id: g.id, venueCount: g.venueCount, primaryState: (g.states as string[])?.[0] })),
    STATE_ORDER,
  );

  // 4. Find decision makers per venue (person search is free).
  const rr = env.ROCKETREACH_API_KEY
    ? new RocketReachClient({ apiKey: env.ROCKETREACH_API_KEY, revealMode: env.REVEAL_MODE, log: dbApiLog })
    : null;
  const gate2 = await buildGate2Lookups();
  const sameRun = new SameRunSet();
  void buildSuppressionLookup;

  for (const rv of rankedVenues) {
    const venue = venues.find((v) => v.id === rv.id)!;
    const ownership = (venue.ownershipType === "unclear" ? "private_owner" : venue.ownershipType) as OwnershipType;
    const titleHierarchy = TITLE_LISTS[ownership] ?? TITLE_LISTS.private_owner;
    const titles = titleHierarchy.flat();
    let results: SearchResult[] = [];
    if (rr) {
      const plan = buildSearchPlan({
        venueName: venue.name,
        groupName: venue.group?.name,
        city: venue.city,
        state: venue.state,
        isVenue: true,
        titles,
      });
      for (const step of plan) {
        try {
          const res = await rr.personSearch({ query: step.query, pageSize: 25 });
          results = res.profiles.map((p, i) => ({
            profileId: String(p.id ?? `${venue.id}-${i}`),
            name: p.name ?? "",
            title: p.current_title ?? null,
            employer: p.current_employer ?? null,
            location: p.location ?? null,
            linkedinUrl: p.linkedin_url ?? null,
            position: i,
          }));
          if (results.length >= 2) break;
        } catch (err) {
          await logRunEvent(data.runId, "find", "warn", `Person search failed for ${venue.name}`, { error: (err as Error).message });
        }
      }
    }
    if (results.length > 0) {
      await createCandidates({
        target: {
          runId: data.runId,
          requestId: data.requestId,
          targetType: "venue",
          venueId: venue.id,
          groupId: venue.groupId,
          name: venue.name,
          groupName: venue.group?.name,
          city: venue.city,
          state: venue.state,
          isVenue: true,
          titleHierarchy,
          revealMode: request?.revealMode === "auto" ? "auto" : "ask",
        },
        results,
        gate2,
        sameRun,
      });
    }
  }

  // 5. Reveal (off means fixtures, no credit).
  const settings = await prisma.settings.findFirst();
  await revealStage({
    runId: data.runId,
    requestId: data.requestId,
    revealMode: env.REVEAL_MODE,
    settings: {
      autoRevealMinConfidence: settings?.autoRevealMinConfidence ?? 0.8,
      maxContactsPerVenue: settings?.maxContactsPerVenue ?? 2,
      maxContactsPerGroup: settings?.maxContactsPerGroup ?? 4,
      reserveCredits: settings?.reserveCredits ?? 200,
      maxCreditsPerDay: settings?.maxCreditsPerDay ?? 300,
    },
    creditCap: request?.creditCap ?? 0,
    creditsUsed: request?.creditsUsed ?? 0,
    creditsUsedToday: 0,
    personExportsRemaining: 3600,
    rr,
  });

  // 6. Deliver.
  const sheets = buildSheets(env);
  const mailer = new Mailer({
    apiKey: env.BREVO_API_KEY,
    from: parseFrom(env.MAIL_FROM),
    log: dbApiLog,
  });
  const notificationEmails = (settings?.notificationEmails as string[]) ?? [];
  await deliverStage({
    runId: data.runId,
    requestId: data.requestId,
    gate2,
    sheets,
    mailer,
    sheetTabName: request?.sheetTabName ?? `${request?.name ?? "Request"}`,
    notificationEmails,
  });

  await prisma.run.update({ where: { id: data.runId }, data: { status: "done", finishedAt: new Date() } });
  logger.info({ runId: data.runId }, "run-request complete");
}

function buildSheets(env: ReturnType<typeof getEnv>): SheetsClient | null {
  if (!env.SHEET_ID || (!env.GOOGLE_SERVICE_ACCOUNT_B64 && !env.GOOGLE_SERVICE_ACCOUNT_JSON)) {
    return null;
  }
  try {
    const serviceAccount = decodeServiceAccount({
      b64: env.GOOGLE_SERVICE_ACCOUNT_B64,
      json: env.GOOGLE_SERVICE_ACCOUNT_JSON,
    });
    return new SheetsClient({ serviceAccount, spreadsheetId: env.SHEET_ID, log: dbApiLog });
  } catch {
    return null;
  }
}

function parseFrom(mailFrom: string): { name?: string; email: string } {
  const m = mailFrom.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || undefined, email: m[2]! };
  return { email: mailFrom.trim() };
}
