import {
  normalizeName,
  normalizeEmployer,
  normalizeLinkedin,
  normalizeEmail,
  toE164,
  registrableDomain,
} from "../normalize/index";

/**
 * Suppression and dedupe key generation. Section 6.6.
 *
 * A candidate is checked against suppression and delivered leads on several
 * keys. Each key is (type, value). The gate looks up each generated key and,
 * on any hit, marks the candidate a duplicate with the matching key and source.
 */

export type SuppressionKeyType =
  | "profile_id"
  | "linkedin"
  | "email"
  | "phone"
  | "name_employer"
  | "domain"
  | "venue_name_state"
  | "group";

export interface DedupeKey {
  keyType: SuppressionKeyType;
  keyValue: string;
}

export interface CandidateKeyInput {
  rrProfileId?: string | null;
  linkedinUrl?: string | null;
  name?: string | null;
  employer?: string | null;
  emails?: (string | null | undefined)[];
  phones?: (string | null | undefined)[];
}

/**
 * Every dedupe key a candidate can match on, deduplicated. Empty values are
 * skipped so a blank field never produces a wildcard key.
 */
export function candidateKeys(input: CandidateKeyInput): DedupeKey[] {
  const keys: DedupeKey[] = [];

  if (input.rrProfileId) {
    keys.push({ keyType: "profile_id", keyValue: String(input.rrProfileId) });
  }

  const li = normalizeLinkedin(input.linkedinUrl);
  if (li) keys.push({ keyType: "linkedin", keyValue: li });

  if (input.name && input.employer) {
    const ne = `${normalizeName(input.name)}::${normalizeEmployer(input.employer)}`;
    keys.push({ keyType: "name_employer", keyValue: ne });
  }

  for (const e of input.emails ?? []) {
    const em = normalizeEmail(e);
    if (em) keys.push({ keyType: "email", keyValue: em });
  }

  for (const p of input.phones ?? []) {
    const ph = toE164(p);
    if (ph) keys.push({ keyType: "phone", keyValue: ph });
  }

  return dedupeKeyList(keys);
}

/**
 * Venue level suppression keys: registrable domain, and name plus state.
 * Section 6.2.
 */
export function venueKeys(input: {
  domain?: string | null;
  website?: string | null;
  name?: string | null;
  state?: string | null;
}): DedupeKey[] {
  const keys: DedupeKey[] = [];
  const domain = registrableDomain(input.domain ?? input.website ?? null);
  if (domain) keys.push({ keyType: "domain", keyValue: domain });
  if (input.name && input.state) {
    const key = `${normalizeName(input.name)}::${input.state.trim().toLowerCase()}`;
    keys.push({ keyType: "venue_name_state", keyValue: key });
  }
  return dedupeKeyList(keys);
}

function dedupeKeyList(keys: DedupeKey[]): DedupeKey[] {
  const seen = new Set<string>();
  const out: DedupeKey[] = [];
  for (const k of keys) {
    const id = `${k.keyType}::${k.keyValue}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(k);
  }
  return out;
}
