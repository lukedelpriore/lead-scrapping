import { candidateKeys, type CandidateKeyInput, type DedupeKey } from "../dedupe/keys";

/**
 * Gate 2, the credit gate. Section 6.6. Every candidate is checked before any
 * lookup against suppression, delivered leads, and same run duplicates. A match
 * becomes dedupe_status duplicate with the matching key and source and never
 * reaches reveal. Pure: the lookups are injected.
 */

export interface Gate2Lookups {
  /** True if a suppression key matches. */
  suppressed(key: DedupeKey): boolean;
  /** True if a delivered lead matches. */
  delivered(key: DedupeKey): boolean;
}

export type Gate2Source = "suppression" | "delivered" | "same_run";

export interface Gate2Decision {
  status: "ready" | "duplicate";
  dedupeKey: string | null;
  dedupeSource: Gate2Source | null;
}

/**
 * A running set of keys already seen in this run, used for the same run check.
 * The caller adds a candidate's keys after deciding to keep it.
 */
export class SameRunSet {
  private seen = new Set<string>();

  has(keys: DedupeKey[]): DedupeKey | null {
    for (const k of keys) {
      if (this.seen.has(id(k))) return k;
    }
    return null;
  }

  add(keys: DedupeKey[]): void {
    for (const k of keys) this.seen.add(id(k));
  }
}

function id(k: DedupeKey): string {
  return `${k.keyType}::${k.keyValue}`;
}

/**
 * Decide a candidate. Checks suppression, then delivered, then same run.
 * When ready, the caller should add the keys to the SameRunSet so a later
 * occurrence of the same person (under a venue and its group) is caught.
 */
export function checkCandidate(
  candidate: CandidateKeyInput,
  lookups: Gate2Lookups,
  sameRun: SameRunSet,
): Gate2Decision {
  const keys = candidateKeys(candidate);

  for (const k of keys) {
    if (lookups.suppressed(k)) {
      return { status: "duplicate", dedupeKey: id(k), dedupeSource: "suppression" };
    }
  }
  for (const k of keys) {
    if (lookups.delivered(k)) {
      return { status: "duplicate", dedupeKey: id(k), dedupeSource: "delivered" };
    }
  }
  const same = sameRun.has(keys);
  if (same) {
    return { status: "duplicate", dedupeKey: id(same), dedupeSource: "same_run" };
  }

  return { status: "ready", dedupeKey: null, dedupeSource: null };
}
