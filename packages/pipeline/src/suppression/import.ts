import {
  normalizeName,
  normalizeEmployer,
  normalizeLinkedin,
  normalizeEmail,
  toE164,
  registrableDomain,
} from "../normalize/index";
import type { DedupeKey } from "../dedupe/keys";

/**
 * Suppression import. Section 9 Suppression page. A CSV or XLSX is parsed by
 * the caller into rows of string cells with a header row. These pure helpers
 * auto detect the columns, map a row to suppression keys, and summarize the
 * import. Section 6.6 defines the key types.
 */

export type SuppressionField =
  | "name"
  | "company"
  | "title"
  | "linkedin"
  | "email"
  | "phone"
  | "website";

export type ColumnMapping = Partial<Record<SuppressionField, string>>;

const PATTERNS: Record<SuppressionField, RegExp> = {
  name: /^(full ?name|name|contact( ?name)?|person)$/i,
  company: /^(company|employer|organization|organisation|account|club|venue)$/i,
  title: /^(title|job ?title|position|role)$/i,
  linkedin: /^(linkedin|linked ?in( ?url)?|li ?url)$/i,
  email: /^(e-?mail( ?address)?|email)$/i,
  phone: /^(phone|mobile|cell|phone ?number|telephone|tel)$/i,
  website: /^(website|web ?site|url|domain|site)$/i,
};

/**
 * Auto detect which header maps to each field. First header that matches a
 * field pattern wins. Unmatched fields are left out so the operator can map
 * them by hand in the UI.
 */
export function detectColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const header of headers) {
    const h = header.trim();
    for (const field of Object.keys(PATTERNS) as SuppressionField[]) {
      if (mapping[field]) continue;
      if (PATTERNS[field].test(h)) {
        mapping[field] = header;
        break;
      }
    }
  }
  return mapping;
}

export interface ImportedRowKeys {
  keys: DedupeKey[];
  displayName: string | null;
  displayCompany: string | null;
}

/**
 * Map one row to suppression keys. A person row can produce linkedin, email,
 * phone, and name_employer keys. Blank cells are skipped so no wildcard key is
 * created. Section 5.4 forbids importing "My Contacts" wholesale; that is a
 * caller concern, this only transforms the rows it is given.
 */
export function rowToSuppressionKeys(
  row: Record<string, string>,
  mapping: ColumnMapping,
): ImportedRowKeys {
  const get = (field: SuppressionField): string =>
    (mapping[field] ? row[mapping[field]!] : "")?.trim() ?? "";

  const name = get("name");
  const company = get("company");
  const linkedin = get("linkedin");
  const email = get("email");
  const phone = get("phone");
  const website = get("website");

  const keys: DedupeKey[] = [];
  const li = normalizeLinkedin(linkedin);
  if (li) keys.push({ keyType: "linkedin", keyValue: li });
  const em = normalizeEmail(email);
  if (em) keys.push({ keyType: "email", keyValue: em });
  const ph = toE164(phone);
  if (ph) keys.push({ keyType: "phone", keyValue: ph });
  if (name && company) {
    keys.push({
      keyType: "name_employer",
      keyValue: `${normalizeName(name)}::${normalizeEmployer(company)}`,
    });
  }
  const domain = registrableDomain(website);
  if (domain) keys.push({ keyType: "domain", keyValue: domain });

  return {
    keys,
    displayName: name || null,
    displayCompany: company || null,
  };
}

export interface ImportSummary {
  rowsRead: number;
  keysCreated: number;
  duplicatesSkipped: number;
  keys: Array<DedupeKey & { displayName: string | null; displayCompany: string | null }>;
}

/**
 * Turn parsed rows into a deduplicated set of suppression keys and a summary
 * of rows read, keys created, and duplicates skipped.
 */
export function summarizeImport(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): ImportSummary {
  const seen = new Set<string>();
  const keys: ImportSummary["keys"] = [];
  let duplicatesSkipped = 0;

  for (const row of rows) {
    const mapped = rowToSuppressionKeys(row, mapping);
    for (const k of mapped.keys) {
      const id = `${k.keyType}::${k.keyValue}`;
      if (seen.has(id)) {
        duplicatesSkipped += 1;
        continue;
      }
      seen.add(id);
      keys.push({ ...k, displayName: mapped.displayName, displayCompany: mapped.displayCompany });
    }
  }

  return {
    rowsRead: rows.length,
    keysCreated: keys.length,
    duplicatesSkipped,
    keys,
  };
}
