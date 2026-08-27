import { prisma, type Prisma } from "@dph/db";
import { getEnv } from "@dph/config";
import {
  RocketReachClient,
  Mailer,
  SheetsClient,
  decodeServiceAccount,
  makeFixtureContact,
  parseLookupResult,
  availableAfterReserve,
} from "@dph/pipeline";
import { dbApiLog } from "../db-api-log";
import { buildGate2Lookups } from "../stages/suppression-lookup";
import { deliverStage } from "../stages/deliver";
import { logRunEvent, bumpStageCounts } from "../stages/discover";
import { logger } from "../logger";

/**
 * Verify a capped batch of owner cells, then deliver those leads. This is the
 * only place that can spend a credit. It reveals the top `count` ready
 * primary candidates by confidence. With REVEAL_MODE off it writes fixture
 * contacts and spends nothing; with reveal on it looks up each owner and
 * writes one ledger charge per verified contact. The count is the operator's
 * chosen batch size, so the yearly budget stays under control.
 */
export async function revealBatchJob(data: {
  runId: string;
  requestId: string;
  count: number;
}): Promise<void> {
  const env = getEnv();
  const settings = await prisma.settings.findFirst();
  const reserve = settings?.reserveCredits ?? 200;

  // Cap the batch by the reserve aware budget as a safety net.
  const personExportsRemaining = 3600; // refreshed from the account on a live run
  const budget = availableAfterReserve(personExportsRemaining, reserve);
  const want = Math.max(0, Math.min(data.count, budget));

  // Ready primary candidates that do not yet have a real, credit charged
  // contact. A candidate whose only contact is a fixture (written while reveal
  // was off) is still eligible, so switching reveal on verifies it for real.
  const toReveal = await prisma.candidate.findMany({
    where: {
      requestId: data.requestId,
      dedupeStatus: "ready",
      rank: "primary",
      contacts: { none: { creditCharged: true } },
    },
    orderBy: { confidence: "desc" },
    take: want,
  });

  const rr =
    env.REVEAL_MODE !== "off" && env.ROCKETREACH_API_KEY
      ? new RocketReachClient({ apiKey: env.ROCKETREACH_API_KEY, revealMode: env.REVEAL_MODE, log: dbApiLog })
      : null;

  let spent = 0;
  let fixtures = 0;
  for (const c of toReveal) {
    try {
      // Drop any placeholder contact from a prior off mode pass (and its
      // undelivered lead) so a real lookup replaces it cleanly.
      await prisma.contact.deleteMany({ where: { candidateId: c.id, creditCharged: false } });
      if (env.REVEAL_MODE === "off") {
        const fx = makeFixtureContact({ id: c.id, name: c.name, title: c.title, employer: c.employer });
        await writeContact(c.id, c, fx, false);
        fixtures += 1;
        continue;
      }
      if (!rr) throw new Error("reveal on but no RocketReach key");
      const raw = await rr.lookupPerson(
        c.rrProfileId ? { id: c.rrProfileId } : { linkedin_url: c.linkedinUrl ?? undefined },
      );
      const parsed = parseLookupResult(raw);
      const charged = parsed.emails.length > 0 || parsed.phones.length > 0;
      await writeContact(c.id, c, parsed, charged);
      if (charged) {
        spent += 1;
        await prisma.creditsLedger.create({
          data: { kind: "charge", delta: -1, runId: data.runId, contactId: c.id, note: "owner lookup" },
        });
      }
    } catch (err) {
      await logRunEvent(data.runId, "reveal", "warn", `Could not verify ${c.name}`, { error: (err as Error).message });
    }
  }

  if (spent > 0) {
    await prisma.request.update({ where: { id: data.requestId }, data: { creditsUsed: { increment: spent } } });
  }
  await bumpStageCounts(data.runId, { reveal: spent + fixtures });
  await logRunEvent(
    data.runId,
    "reveal",
    "info",
    env.REVEAL_MODE === "off"
      ? `Would spend ${fixtures} credits. Wrote ${fixtures} example contacts, nothing charged.`
      : `Verified ${spent} owner contacts, spent ${spent} credits.`,
  );

  // Deliver the newly verified leads: export and mark delivered.
  const gate2 = await buildGate2Lookups();
  const sheets = buildSheets(env);
  const mailer = new Mailer({ apiKey: env.BREVO_API_KEY, from: parseFrom(env.MAIL_FROM), log: dbApiLog });
  const request = await prisma.request.findUnique({ where: { id: data.requestId } });
  await deliverStage({
    runId: data.runId,
    requestId: data.requestId,
    gate2,
    sheets,
    mailer,
    sheetTabName: request?.sheetTabName ?? request?.name ?? "Leads",
    notificationEmails: (settings?.notificationEmails as string[]) ?? [],
  });

  logger.info({ runId: data.runId, spent, fixtures }, "reveal-batch complete");
}

async function writeContact(
  candidateId: string,
  candidate: { name: string; title: string | null; employer: string | null; rrProfileId: string | null; linkedinUrl: string | null },
  parsed: {
    name: string | null; title: string | null; employer: string | null; linkedinUrl: string | null;
    emails: unknown[]; phones: unknown[]; hasMobile: boolean; hasVerifiedEmail: boolean;
  },
  creditCharged: boolean,
): Promise<void> {
  await prisma.contact.create({
    data: {
      candidateId,
      rrProfileId: candidate.rrProfileId,
      name: parsed.name ?? candidate.name,
      title: parsed.title ?? candidate.title,
      employer: parsed.employer ?? candidate.employer,
      emails: parsed.emails as Prisma.InputJsonValue,
      phones: parsed.phones as Prisma.InputJsonValue,
      linkedinUrl: parsed.linkedinUrl ?? candidate.linkedinUrl,
      hasMobile: parsed.hasMobile,
      hasVerifiedEmail: parsed.hasVerifiedEmail,
      creditCharged,
      lookedUpAt: new Date(),
    },
  });
}

function buildSheets(env: ReturnType<typeof getEnv>): SheetsClient | null {
  if (!env.SHEET_ID || (!env.GOOGLE_SERVICE_ACCOUNT_B64 && !env.GOOGLE_SERVICE_ACCOUNT_JSON)) return null;
  try {
    const serviceAccount = decodeServiceAccount({ b64: env.GOOGLE_SERVICE_ACCOUNT_B64, json: env.GOOGLE_SERVICE_ACCOUNT_JSON });
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
