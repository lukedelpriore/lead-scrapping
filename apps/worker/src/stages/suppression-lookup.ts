import { prisma } from "@dph/db";
import type { SuppressionLookup, Gate2Lookups, DedupeKey } from "@dph/pipeline";

/**
 * Load suppression keys into in memory sets for fast gate checks during a run.
 * Rebuilt per run so a fresh import is reflected.
 */
export async function buildSuppressionLookup(): Promise<
  SuppressionLookup & {
    hasProfileId(id: string): boolean;
    hasLinkedin(v: string): boolean;
    hasEmail(v: string): boolean;
    hasPhone(v: string): boolean;
    hasNameEmployer(v: string): boolean;
  }
> {
  const rows = await prisma.suppression.findMany({ select: { keyType: true, keyValue: true } });
  const sets = new Map<string, Set<string>>();
  for (const r of rows) {
    let s = sets.get(r.keyType);
    if (!s) {
      s = new Set<string>();
      sets.set(r.keyType, s);
    }
    s.add(r.keyValue);
  }
  const has = (type: string, value: string) => sets.get(type)?.has(value) ?? false;
  return {
    hasDomain: (d) => has("domain", d),
    hasNameState: (k) => has("venue_name_state", k),
    hasInPlayGroup: (g) => has("group", g),
    hasProfileId: (v) => has("profile_id", v),
    hasLinkedin: (v) => has("linkedin", v),
    hasEmail: (v) => has("email", v),
    hasPhone: (v) => has("phone", v),
    hasNameEmployer: (v) => has("name_employer", v),
  };
}

/**
 * Build the gate 2 lookups: a suppressed check across all people key types, and
 * a delivered check across the keys of already delivered contacts. Loaded once
 * per run into memory sets.
 */
export async function buildGate2Lookups(): Promise<Gate2Lookups> {
  const suppRows = await prisma.suppression.findMany({ select: { keyType: true, keyValue: true } });
  const suppSets = new Map<string, Set<string>>();
  for (const r of suppRows) {
    let s = suppSets.get(r.keyType);
    if (!s) { s = new Set(); suppSets.set(r.keyType, s); }
    s.add(r.keyValue);
  }

  // Delivered contacts: index by rr profile id and normalized linkedin.
  const delivered = await prisma.contact.findMany({
    where: { leads: { some: {} } },
    select: { rrProfileId: true, linkedinUrl: true },
  });
  const deliveredProfile = new Set<string>();
  const deliveredLinkedin = new Set<string>();
  for (const c of delivered) {
    if (c.rrProfileId) deliveredProfile.add(c.rrProfileId);
    if (c.linkedinUrl) {
      const n = c.linkedinUrl.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
      deliveredLinkedin.add(n);
    }
  }

  const suppHas = (k: DedupeKey) => suppSets.get(k.keyType)?.has(k.keyValue) ?? false;
  return {
    suppressed: (k) => suppHas(k),
    delivered: (k) =>
      (k.keyType === "profile_id" && deliveredProfile.has(k.keyValue)) ||
      (k.keyType === "linkedin" && deliveredLinkedin.has(k.keyValue)),
  };
}
