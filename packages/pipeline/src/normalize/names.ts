/**
 * Name and text normalizers. Section 6.1 and 6.6 of the spec.
 * Pure functions, unit tested, no external calls.
 */

/**
 * name_normalized: lowercase, strip punctuation, collapse whitespace, expand
 * "cc" to "country club" and "gc" to "golf club", drop a leading "the".
 *
 * The abbreviation expansion runs on whole word tokens so it does not touch a
 * substring inside another word.
 */
export function normalizeName(input: string): string {
  let s = (input ?? "").toLowerCase();
  // strip punctuation to spaces, keep alphanumerics and spaces
  s = s.replace(/[^a-z0-9]+/g, " ");
  // collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";
  // drop a leading "the"
  const tokens = s.split(" ");
  if (tokens[0] === "the") tokens.shift();
  // expand cc and gc as standalone tokens
  const expanded = tokens.flatMap((t) => {
    if (t === "cc") return ["country", "club"];
    if (t === "gc") return ["golf", "club"];
    return [t];
  });
  return expanded.join(" ").trim();
}

/**
 * employer_normalized for dedupe: the same normalization as a name so a
 * fuzzy token set ratio compares like with like.
 */
export function normalizeEmployer(input: string): string {
  return normalizeName(input);
}

/**
 * linkedin_normalized: lowercase, strip protocol, www, trailing slash, and
 * query string. Section 6.6.
 */
export function normalizeLinkedin(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  // drop query string and fragment
  s = s.split("?")[0]!.split("#")[0]!;
  // strip protocol
  s = s.replace(/^https?:\/\//, "");
  // strip leading www.
  s = s.replace(/^www\./, "");
  // strip trailing slash
  s = s.replace(/\/+$/, "");
  return s || null;
}

/**
 * A stable dedupe key combining a normalized name and employer.
 */
export function nameEmployerKey(name: string, employer: string): string {
  return `${normalizeName(name)}::${normalizeEmployer(employer)}`;
}
