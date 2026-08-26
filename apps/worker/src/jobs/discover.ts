import { prisma } from "@dph/db";
import { getEnv } from "@dph/config";
import {
  OverpassClient,
  SerperClient,
  RocketReachClient,
  fromOverpass,
  fromSerper,
  fromRocketReachCompanies,
  fromPasted,
  type DiscoveredVenue,
} from "@dph/pipeline";
import { dbApiLog } from "../db-api-log";
import { buildSuppressionLookup } from "../stages/suppression-lookup";
import { persistDiscovery, logRunEvent, bumpStageCounts } from "../stages/discover";
import { logger } from "../logger";

/**
 * Discovery job. Gathers venues per state from Overpass (primary), RocketReach
 * company search, and Serper, plus any pasted clubs, then persists them through
 * gate 1. Each source is attempted independently: a source that fails (for
 * example a blocked network) is logged as a run event and the run continues
 * with what the others returned, per Section "never stall on a download".
 */
export async function runDiscoverJob(data: { runId: string; requestId: string }): Promise<void> {
  const env = getEnv();
  const request = await prisma.request.findUnique({ where: { id: data.requestId } });
  if (!request) throw new Error(`request ${data.requestId} not found`);

  const states = (request.states as string[]) ?? [];
  const pasted = (request.clubsPasted ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const all: DiscoveredVenue[] = [];

  // Pasted clubs need no network.
  if (pasted.length) {
    all.push(...fromPasted(pasted));
    await logRunEvent(data.runId, "discover", "info", `${pasted.length} pasted clubs added`);
  }

  const overpass = new OverpassClient({ log: dbApiLog });
  const serper = env.SERPER_API_KEY ? new SerperClient({ apiKey: env.SERPER_API_KEY, log: dbApiLog }) : null;
  const rr = env.ROCKETREACH_API_KEY
    ? new RocketReachClient({ apiKey: env.ROCKETREACH_API_KEY, revealMode: env.REVEAL_MODE, log: dbApiLog })
    : null;

  for (const state of states) {
    // Overpass, primary.
    try {
      const courses = await overpass.golfCourses(state);
      all.push(...fromOverpass(courses));
      await logRunEvent(data.runId, "discover", "info", `Overpass ${state}: ${courses.length} courses`);
    } catch (err) {
      await logRunEvent(data.runId, "discover", "warn", `Overpass ${state} failed`, {
        error: (err as Error).message,
      });
    }

    // RocketReach company search, free.
    if (rr) {
      for (const kw of ["country club", "golf club", "golf and country club"]) {
        try {
          const res = await rr.companySearch({ keyword: [kw], location: [state] });
          all.push(...fromRocketReachCompanies(res.companies));
        } catch (err) {
          await logRunEvent(data.runId, "discover", "warn", `RocketReach company search ${state} ${kw} failed`, {
            error: (err as Error).message,
          });
        }
      }
    }

    // Serper, low cost.
    if (serper) {
      for (const q of [
        `country club weddings ${state}`,
        `golf club private events ${state}`,
        `site:theknot.com country club ${state}`,
        `site:weddingwire.com country club ${state}`,
      ]) {
        try {
          const res = await serper.search(q, { gl: "us" });
          all.push(...fromSerper(res));
        } catch (err) {
          await logRunEvent(data.runId, "discover", "warn", `Serper ${state} failed`, {
            error: (err as Error).message,
          });
        }
      }
    }
  }

  const suppression = await buildSuppressionLookup();
  const result = await persistDiscovery({ runId: data.runId, venues: all, suppression });

  await bumpStageCounts(data.runId, { discover: result.discovered, dedupe: result.merged });
  await logRunEvent(
    data.runId,
    "discover",
    "info",
    `Discovered ${result.discovered}, merged to ${result.merged}, ${result.suppressed} suppressed`,
  );

  if (result.discovered === 0) {
    await logRunEvent(
      data.runId,
      "discover",
      "warn",
      "No venues discovered. Live discovery sources may be unreachable; pasted clubs still work.",
    );
  }

  logger.info({ runId: data.runId, ...result }, "discover job complete");
}
