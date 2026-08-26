import { prisma } from "@dph/db";
import type { SuppressionLookup } from "@dph/pipeline";

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
