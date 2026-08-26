import { prisma, type Prisma } from "@dph/db";
import {
  selectForReveal,
  makeFixtureContact,
  parseLookupResult,
  batchCap as computeBatchCap,
  availableAfterReserve,
  type RevealCandidate,
  type RocketReachClient,
} from "@dph/pipeline";
import { bumpStageCounts, logRunEvent } from "./discover";

/**
 * Reveal stage. Section 6.7. With REVEAL_MODE off this is a no op that reports
 * "would spend n credits" and writes fixture contacts so deliver can be tested
 * end to end. No credit endpoint is called and no ledger charge is written.
 * With reveal on it looks up each selected candidate, polls status, stores the
 * verified data, and writes one ledger charge per successful lookup.
 */
export interface RevealArgs {
  runId: string;
  requestId: string;
  revealMode: "off" | "ask" | "auto";
  settings: {
    autoRevealMinConfidence: number;
    maxContactsPerVenue: number;
    maxContactsPerGroup: number;
    reserveCredits: number;
    maxCreditsPerDay: number;
  };
  creditCap: number;
  creditsUsed: number;
  creditsUsedToday: number;
  personExportsRemaining: number;
  /** RocketReach client, only used when revealMode is not off. */
  rr?: RocketReachClient | null;
}

export interface RevealOutcome {
  selected: number;
  wouldSpend: number;
  spent: number;
  fixtures: number;
}

export async function revealStage(args: RevealArgs): Promise<RevealOutcome> {
  const cap = computeBatchCap({
    requestRemaining: args.creditCap - args.creditsUsed,
    dayRemaining: args.settings.maxCreditsPerDay - args.creditsUsedToday,
    availableAfterReserve: availableAfterReserve(
      args.personExportsRemaining,
      args.settings.reserveCredits,
    ),
  });

  if (cap <= 0) {
    await logRunEvent(args.runId, "reveal", "warn", "Batch cap is 0, nothing to reveal. Check the credit cap and reserve.");
    return { selected: 0, wouldSpend: 0, spent: 0, fixtures: 0 };
  }

  const ready = await prisma.candidate.findMany({
    where: {
      requestId: args.requestId,
      dedupeStatus: "ready",
      // In ask mode only approved candidates reveal; auto uses confidence.
      ...(args.revealMode === "ask" ? { reviewStatus: "approved" } : {}),
    },
    include: { venue: { select: { tier: true } } },
  });

  const candidates: RevealCandidate[] = ready.map((c) => ({
    id: c.id,
    venueId: c.venueId,
    groupId: c.groupId,
    rank: c.rank,
    confidence: c.confidence,
    tier: c.venue?.tier ?? null,
  }));

  const mode: "auto" | "ask" = args.revealMode === "auto" ? "auto" : "ask";
  const selection = selectForReveal(candidates, args.settings, cap, mode);

  // In ask mode with approved candidates, reveal the approved set directly.
  const toReveal =
    args.revealMode === "ask" ? candidates.slice(0, cap) : selection.toReveal;

  if (args.revealMode === "off") {
    // No op: write fixtures for the auto selected set (or all ready, capped).
    const fixtureSet = candidates.slice(0, cap);
    for (const c of fixtureSet) {
      const src = ready.find((r) => r.id === c.id)!;
      const fx = makeFixtureContact({ id: src.id, name: src.name, title: src.title, employer: src.employer });
      await writeContact(src.id, fx, false);
    }
    await bumpStageCounts(args.runId, { reveal: 0 });
    await logRunEvent(
      args.runId,
      "reveal",
      "info",
      `REVEAL_MODE is off. Would spend ${fixtureSet.length} credits. Wrote ${fixtureSet.length} fixture contacts, no credit spent.`,
    );
    return { selected: fixtureSet.length, wouldSpend: fixtureSet.length, spent: 0, fixtures: fixtureSet.length };
  }

  // Live reveal.
  if (!args.rr) throw new Error("reveal on but no RocketReach client provided");
  let spent = 0;
  for (const c of toReveal) {
    const src = ready.find((r) => r.id === c.id)!;
    try {
      const raw = await args.rr.lookupPerson(
        src.rrProfileId ? { id: src.rrProfileId } : { linkedin_url: src.linkedinUrl ?? undefined },
      );
      const parsed = parseLookupResult(raw);
      const charged = parsed.emails.length > 0 || parsed.phones.length > 0;
      await writeContact(src.id, parsed, charged);
      if (charged) {
        spent += 1;
        await prisma.creditsLedger.create({
          data: { kind: "charge", delta: -1, runId: args.runId, contactId: src.id, note: "person lookup" },
        });
      }
    } catch (err) {
      await logRunEvent(args.runId, "reveal", "warn", `Lookup failed for ${src.name}`, { error: (err as Error).message });
    }
  }

  await prisma.request.update({
    where: { id: args.requestId },
    data: { creditsUsed: { increment: spent } },
  });
  await bumpStageCounts(args.runId, { reveal: spent });
  await logRunEvent(args.runId, "reveal", "info", `Revealed ${spent} contacts, spent ${spent} credits.`);
  return { selected: toReveal.length, wouldSpend: selection.wouldSpend, spent, fixtures: 0 };
}

async function writeContact(
  candidateId: string,
  parsed: {
    name: string | null;
    title: string | null;
    employer: string | null;
    linkedinUrl: string | null;
    emails: unknown[];
    phones: unknown[];
    hasMobile: boolean;
    hasVerifiedEmail: boolean;
  },
  creditCharged: boolean,
): Promise<void> {
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  await prisma.contact.create({
    data: {
      candidateId,
      rrProfileId: candidate?.rrProfileId ?? null,
      name: parsed.name ?? candidate?.name ?? "",
      title: parsed.title ?? candidate?.title ?? null,
      employer: parsed.employer ?? candidate?.employer ?? null,
      emails: parsed.emails as Prisma.InputJsonValue,
      phones: parsed.phones as Prisma.InputJsonValue,
      linkedinUrl: parsed.linkedinUrl ?? candidate?.linkedinUrl ?? null,
      hasMobile: parsed.hasMobile,
      hasVerifiedEmail: parsed.hasVerifiedEmail,
      creditCharged,
      lookedUpAt: new Date(),
    },
  });
}
