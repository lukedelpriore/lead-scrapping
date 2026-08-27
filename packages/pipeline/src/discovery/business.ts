import { STATE_NAMES } from "@dph/config";

/**
 * Query builders for general business discovery. Given the parsed keywords and
 * states, produce the Serper search strings and the RocketReach company search
 * queries. Pure and testable; the worker runs them against the live adapters.
 */

/** Serper searches, one per keyword and state, plus directory style probes. */
export function buildBusinessSerperQueries(keywords: string[], states: string[]): string[] {
  const queries: string[] = [];
  const locs = states.length ? states.map((s) => STATE_NAMES[s] ?? s) : ["United States"];
  for (const kw of keywords) {
    for (const loc of locs) {
      queries.push(`${kw} in ${loc}`);
      queries.push(`${kw} ${loc} owner`);
    }
  }
  return dedupe(queries);
}

/** RocketReach company searches, one per keyword and state. */
export function buildBusinessCompanyQueries(
  keywords: string[],
  states: string[],
): { keyword: string; location: string }[] {
  const out: { keyword: string; location: string }[] = [];
  const locs = states.length ? states.map((s) => STATE_NAMES[s] ?? s) : ["United States"];
  for (const kw of keywords) {
    for (const loc of locs) {
      out.push({ keyword: kw, location: loc });
    }
  }
  return out;
}

/** Places text search queries, only when Places is enabled. */
export function buildBusinessPlacesQueries(keywords: string[], states: string[]): string[] {
  const queries: string[] = [];
  const locs = states.length ? states.map((s) => STATE_NAMES[s] ?? s) : ["United States"];
  for (const kw of keywords) {
    for (const loc of locs) queries.push(`${kw} in ${loc}`);
  }
  return dedupe(queries);
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
