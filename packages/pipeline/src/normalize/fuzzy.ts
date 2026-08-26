import * as fuzzballNs from "fuzzball";
import { PIPELINE_DEFAULTS } from "@dph/config";
import { normalizeName, normalizeEmployer } from "./names";

/**
 * fuzzball ships as CommonJS. Resolve the callable module whether the loader
 * hands us a namespace object or a default wrapped export, so this works under
 * tsx, Vitest, and the Next bundler alike.
 */
const ns = fuzzballNs as unknown as Record<string, unknown>;
const fuzzball = (
  typeof ns["token_set_ratio"] === "function" ? ns : ns["default"]
) as { token_set_ratio: (a: string, b: string) => number };

/**
 * Fuzzy comparison helpers built on fuzzball token set ratio. Thresholds come
 * from Section 15. Used by gate 1 venue merge and gate 2 candidate dedupe.
 */

/** Token set ratio, 0 to 100, on two raw strings. */
export function tokenSetRatio(a: string, b: string): number {
  return fuzzball.token_set_ratio(a ?? "", b ?? "");
}

/** Two venue names match when the normalized token set ratio clears the threshold. */
export function venueNamesMatch(
  a: string,
  b: string,
  threshold: number = PIPELINE_DEFAULTS.fuzzy_venue_name_threshold,
): boolean {
  return tokenSetRatio(normalizeName(a), normalizeName(b)) >= threshold;
}

/** Two employers match when the normalized token set ratio clears the threshold. */
export function employersMatch(
  a: string,
  b: string,
  threshold: number = PIPELINE_DEFAULTS.fuzzy_employer_threshold,
): boolean {
  return tokenSetRatio(normalizeEmployer(a), normalizeEmployer(b)) >= threshold;
}

/** The employer ratio used for adjudication confidence and reasons. */
export function employerRatio(a: string, b: string): number {
  return tokenSetRatio(normalizeEmployer(a), normalizeEmployer(b));
}
