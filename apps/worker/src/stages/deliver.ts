import { prisma } from "@dph/db";
import {
  toSheetRow,
  reconcile,
  normalizeEmail,
  toE164,
  type SheetsClient,
  type Mailer,
  type Gate2Lookups,
  type SheetLeadInput,
} from "@dph/pipeline";
import { bumpStageCounts, logRunEvent } from "./discover";

/**
 * Deliver stage. Section 6.8. Post reveal check on phone and email against
 * suppression and delivered leads, append to the Google Sheet, write the
 * ledger reconcile row, and send one email. When the sheet is not configured
 * the run sits in done_pending_sheet; when email is disabled the run reports
 * it. Nothing here spends a credit.
 */
export interface DeliverArgs {
  runId: string;
  requestId: string;
  gate2: Gate2Lookups;
  sheets?: SheetsClient | null;
  mailer?: Mailer | null;
  sheetTabName: string;
  notificationEmails: string[];
  /** For reconciliation, the person exports remaining before and after reveal. */
  reconcileInput?: { ledgerChargeTotal: number; remainingBefore: number; remainingAfter: number };
}

export interface DeliverOutcome {
  delivered: number;
  duplicatesAtDelivery: number;
  sheetWritten: boolean;
  emailSent: boolean;
  pendingSheet: boolean;
}

export async function deliverStage(args: DeliverArgs): Promise<DeliverOutcome> {
  const request = await prisma.request.findUnique({ where: { id: args.requestId } });
  if (!request) throw new Error("request not found");

  // Contacts revealed in this run that are not yet delivered.
  const contacts = await prisma.contact.findMany({
    where: {
      candidate: { requestId: args.requestId },
      leads: { none: {} },
    },
    include: { candidate: { include: { venue: { include: { group: true } } } } },
  });

  const rows: string[][] = [];
  const toDeliver: typeof contacts = [];
  let duplicatesAtDelivery = 0;

  for (const contact of contacts) {
    // Post reveal check: any revealed email or phone already known.
    const emails = (contact.emails as { address: string }[]) ?? [];
    const phones = (contact.phones as { number: string }[]) ?? [];
    const hit =
      emails.some((e) => {
        const n = normalizeEmail(e.address);
        return n ? args.gate2.suppressed({ keyType: "email", keyValue: n }) || args.gate2.delivered({ keyType: "email", keyValue: n }) : false;
      }) ||
      phones.some((p) => {
        const n = toE164(p.number);
        return n ? args.gate2.suppressed({ keyType: "phone", keyValue: n }) || args.gate2.delivered({ keyType: "phone", keyValue: n }) : false;
      });

    if (hit) {
      duplicatesAtDelivery += 1;
      await prisma.candidate.update({
        where: { id: contact.candidateId },
        data: { dedupeStatus: "duplicate", dedupeSource: "delivered", dedupeKey: "post_reveal" },
      });
      continue;
    }

    toDeliver.push(contact);
    rows.push(toSheetRow(contactToSheetInput(request.name, contact)));
  }

  // Append to the sheet.
  let sheetWritten = false;
  let pendingSheet = false;
  if (args.sheets && rows.length > 0) {
    try {
      await args.sheets.append(args.sheetTabName, rows);
      await args.sheets.append("Leads", rows);
      sheetWritten = true;
    } catch (err) {
      pendingSheet = true;
      await logRunEvent(args.runId, "deliver", "warn", "Sheet write failed, run is done_pending_sheet", { error: (err as Error).message });
    }
  } else if (!args.sheets) {
    pendingSheet = rows.length > 0;
    await logRunEvent(args.runId, "deliver", "warn", "No Google Sheet configured, leads are stored in the database only.");
  }

  // Create lead rows.
  for (const contact of toDeliver) {
    await prisma.lead.create({
      data: {
        contactId: contact.id,
        requestId: args.requestId,
        runId: args.runId,
        venueId: contact.candidate.venueId,
        groupId: contact.candidate.groupId,
        deliveredAt: sheetWritten ? new Date() : null,
      },
    });
  }

  // Reconcile the ledger against RocketReach if we spent anything.
  if (args.reconcileInput) {
    const rec = reconcile(args.reconcileInput);
    await prisma.creditsLedger.create({
      data: {
        kind: "reconcile",
        delta: 0,
        rrPersonExportsRemaining: args.reconcileInput.remainingAfter,
        runId: args.runId,
        note: rec.ok ? "reconciled, no drift" : `drift ${rec.drift}`,
      },
    });
    if (!rec.ok) {
      await logRunEvent(args.runId, "deliver", "warn", `Credit drift detected: ledger ${rec.ledgerSpent}, RocketReach ${rec.providerSpent}.`);
    }
  }

  // Email.
  let emailSent = false;
  if (args.mailer && args.mailer.enabled && args.notificationEmails.length > 0) {
    const summary = await sendSummary(args, request.name, toDeliver.length, duplicatesAtDelivery);
    emailSent = summary;
  } else {
    await logRunEvent(args.runId, "deliver", "info", "Email delivery is disabled, no notification sent.");
  }

  await bumpStageCounts(args.runId, { deliver: toDeliver.length });
  await prisma.request.update({
    where: { id: args.requestId },
    data: { status: pendingSheet ? "done_pending_sheet" : "done", sheetTabName: args.sheetTabName },
  });

  return {
    delivered: toDeliver.length,
    duplicatesAtDelivery,
    sheetWritten,
    emailSent,
    pendingSheet,
  };
}

function contactToSheetInput(requestName: string, contact: {
  candidate: { venue: { name: string; city: string | null; state: string | null; website: string | null; evidenceUrl: string | null; mainLine: string | null; ownershipType: string; tier: number | null; group: { name: string; venueCount: number } | null } | null; confidence: number; rrProfileId: string | null };
  name: string;
  title: string | null;
  emails: unknown;
  phones: unknown;
  linkedinUrl: string | null;
}): SheetLeadInput {
  const v = contact.candidate.venue;
  return {
    requestId: requestName,
    clubName: v?.name ?? "",
    city: v?.city,
    state: v?.state,
    website: v?.website,
    eventsPageUrl: v?.evidenceUrl,
    mainLine: v?.mainLine,
    ownershipType: v?.ownershipType,
    groupName: v?.group?.name ?? "",
    venuesInGroup: v?.group?.venueCount ?? null,
    tier: v?.tier ?? null,
    contactName: contact.name,
    title: contact.title,
    emails: (contact.emails as SheetLeadInput["emails"]) ?? [],
    phones: (contact.phones as SheetLeadInput["phones"]) ?? [],
    linkedinUrl: contact.linkedinUrl,
    rrProfileId: contact.candidate.rrProfileId,
    matchConfidence: contact.candidate.confidence,
    source: "rocketreach",
    datePulled: new Date().toISOString().slice(0, 10),
  };
}

async function sendSummary(
  args: DeliverArgs,
  requestName: string,
  delivered: number,
  duplicates: number,
): Promise<boolean> {
  if (!args.mailer) return false;
  const html = `<p>Request ${escapeHtml(requestName)} finished.</p><ul><li>Delivered: ${delivered}</li><li>Already have: ${duplicates}</li></ul>`;
  const res = await args.mailer.send({
    to: args.notificationEmails.map((email) => ({ email })),
    subject: `Lead Engine: ${requestName} finished`,
    html,
    text: `Request ${requestName} finished. Delivered ${delivered}, already have ${duplicates}.`,
  });
  return res.sent;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
