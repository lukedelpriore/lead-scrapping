import { STATE_NAMES } from "@dph/config";

/**
 * Plain language command parser. Turns a sentence like
 * "Find roofing company owners in Ohio and Michigan, about 200 businesses"
 * into a structured search: business type, US states, and a target count.
 *
 * This is the rules parser used when AI_MODE is off (the default). When
 * AI_MODE is on the Claude parser produces the same shape. Pure and testable.
 */

export interface ParsedCommand {
  /** A short label for the kind of business, for display and search keywords. */
  businessType: string;
  /** Search keywords derived from the type, used by discovery. */
  keywords: string[];
  /**
   * Extra descriptive words from the command that narrow the search, for
   * example "weddings", "events", "non members". Kept for display and folded
   * into the discovery keywords so the intent is not lost.
   */
  qualifiers: string[];
  /** Two letter US state codes. */
  states: string[];
  /** Human readable location label. */
  locationLabel: string;
  /** Target number of businesses to find. */
  targetCount: number;
  /** The original text, kept for the record. */
  raw: string;
}

// Build a lookup from full state name (lowercase) to code, plus the codes.
const NAME_TO_CODE: Record<string, string> = {};
for (const [code, name] of Object.entries(STATE_NAMES)) {
  NAME_TO_CODE[name.toLowerCase()] = code;
}

/**
 * A small set of known business types with sensible search keywords. Unknown
 * types still work: the parser falls back to the noun phrase it finds before
 * "owners" or "in". Extend this list in Settings over time.
 */
const TYPE_KEYWORDS: { match: RegExp; label: string; keywords: string[] }[] = [
  { match: /\broof(ing|er)?\b/i, label: "Roofing companies", keywords: ["roofing company", "roofing contractor", "roofer"] },
  { match: /\bhvac\b/i, label: "HVAC companies", keywords: ["hvac company", "heating and cooling", "air conditioning contractor"] },
  { match: /\bplumb(ing|er)\b/i, label: "Plumbing companies", keywords: ["plumbing company", "plumber", "plumbing contractor"] },
  { match: /\bmed ?spa|medical spa\b/i, label: "Med spas", keywords: ["med spa", "medical spa", "aesthetics clinic"] },
  { match: /\bdent(al|ist)s?\b/i, label: "Dental practices", keywords: ["dental practice", "dentist office", "dental clinic"] },
  { match: /\b(gym|fitness)\b/i, label: "Gyms and fitness studios", keywords: ["gym", "fitness studio", "health club"] },
  { match: /\b(hotel|inn|resort)\b/i, label: "Hotels", keywords: ["boutique hotel", "hotel", "inn"] },
  { match: /\b(wedding|event) ?venue|banquet\b/i, label: "Event venues", keywords: ["wedding venue", "event venue", "banquet hall"] },
  { match: /\bcater(ing|er)\b/i, label: "Caterers", keywords: ["catering company", "caterer"] },
  { match: /\brestaurant\b/i, label: "Restaurants", keywords: ["restaurant"] },
  { match: /\b(landscap|lawn)\b/i, label: "Landscaping companies", keywords: ["landscaping company", "lawn care"] },
  { match: /\breal ?estate|realtor\b/i, label: "Real estate agencies", keywords: ["real estate agency", "realtor"] },
  { match: /\bcountry club|golf club\b/i, label: "Golf and country clubs", keywords: ["country club", "golf club"] },
];

export function parseCommand(text: string): ParsedCommand {
  const raw = (text ?? "").trim();
  const lower = raw.toLowerCase();

  // States: match full names and two letter codes surrounded by word boundaries.
  const states = new Set<string>();
  for (const [name, code] of Object.entries(NAME_TO_CODE)) {
    if (lower.includes(name)) states.add(code);
  }
  const codeMatches = raw.match(/\b([A-Z]{2})\b/g) ?? [];
  for (const c of codeMatches) {
    if (STATE_NAMES[c]) states.add(c);
  }

  // Target count: first number, allowing commas.
  const numMatch = lower.match(/(\d[\d,]{0,6})\s*(businesses|leads|owners|companies|places|results)?/);
  let targetCount = numMatch ? parseInt(numMatch[1]!.replace(/,/g, ""), 10) : 100;
  if (!Number.isFinite(targetCount) || targetCount < 1) targetCount = 100;
  if (targetCount > 5000) targetCount = 5000;

  // Business type: first known type match, else a noun phrase heuristic.
  let businessType = "Businesses";
  let keywords: string[] = [];
  for (const t of TYPE_KEYWORDS) {
    if (t.match.test(raw)) {
      businessType = t.label;
      keywords = t.keywords;
      break;
    }
  }
  if (keywords.length === 0) {
    const guess = guessType(raw);
    if (guess) {
      businessType = capitalize(guess);
      keywords = [guess];
    }
  }

  // Descriptive words that narrow the search beyond type and place, for
  // example "weddings events non members" for a country club search. Fold
  // them into the keywords so discovery carries the intent instead of
  // dropping it.
  const qualifiers = extractQualifiers(raw, keywords, targetCount);
  if (qualifiers.length) {
    const phrase = qualifiers.join(" ");
    if (keywords.length) {
      keywords = [`${keywords[0]} ${phrase}`, ...keywords];
    } else {
      keywords = [phrase];
    }
  }

  const stateList = [...states];
  const locationLabel = stateList.length
    ? stateList.map((c) => STATE_NAMES[c] ?? c).join(", ")
    : "United States";

  return { businessType, keywords, qualifiers, states: stateList, locationLabel, targetCount, raw };
}

/** Words that carry no search meaning on their own, stripped from qualifiers. */
const QUALIFIER_STOP = new Set([
  "find", "get", "pull", "list", "search", "for", "that", "offer", "offers",
  "offering", "provide", "provides", "which", "who", "whom", "to", "the", "a",
  "an", "some", "me", "all", "and", "or", "with", "without", "near", "located",
  "location", "owners", "owner", "business", "businesses", "company",
  "companies", "place", "places", "results", "leads", "about", "of", "around",
  "area", "areas", "do", "does", "their", "our", "your", "any",
  // Prepositions and filler that carry no search meaning on their own.
  "in", "on", "at", "by", "from", "into", "over", "under", "us", "usa",
  "please", "give", "list", "show",
]);

/**
 * Pull the descriptive words out of a command, after removing the leading
 * verbs, the type words, the state names, the count, and common filler. What
 * remains is the qualifier: the extra detail that narrows the search.
 */
function extractQualifiers(raw: string, typeKeywords: string[], count: number): string[] {
  let s = raw.toLowerCase();
  // Drop full state names.
  for (const name of Object.keys(NAME_TO_CODE)) {
    if (s.includes(name)) s = s.split(name).join(" ");
  }
  // Drop the count and its unit.
  s = s.replace(/\d[\d,]{0,6}\s*(businesses|leads|owners|companies|places|results)?/g, " ");
  if (count) s = s.split(String(count)).join(" ");

  // Words that belong to the business type, singular and plural, are not
  // qualifiers.
  const typeWords = new Set<string>();
  for (const kw of typeKeywords) {
    for (const w of kw.toLowerCase().split(/\s+/)) {
      if (!w) continue;
      typeWords.add(w);
      typeWords.add(`${w}s`);
    }
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of s.split(/[^a-z]+/)) {
    if (t.length < 2) continue;
    if (QUALIFIER_STOP.has(t)) continue;
    if (typeWords.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.slice(0, 6);
}

/**
 * Heuristic for an unknown type: take the words between a leading verb like
 * "find" and the word "owners", "companies", or "in".
 */
function guessType(text: string): string | null {
  const m = text
    .toLowerCase()
    .match(/(?:find|get|pull|list|search for)\s+(.+?)\s+(?:owners?|companies|company|businesses|in|near|located)/);
  if (m && m[1]) {
    const phrase = m[1].replace(/\b(the|a|an|some|me|all)\b/g, "").replace(/\s+/g, " ").trim();
    if (phrase.length >= 3) return phrase;
  }
  return null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
