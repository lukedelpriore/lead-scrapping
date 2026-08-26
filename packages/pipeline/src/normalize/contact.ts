import { parsePhoneNumberFromString } from "libphonenumber-js";
import { getDomain } from "tldts";

/**
 * Contact field normalizers: phone to E.164, phone to readable US text,
 * email lowercasing, and registrable domain extraction.
 */

/**
 * Normalize a phone string to E.164 for storage and dedupe. US default region.
 * Returns null when the input cannot be parsed to a valid number.
 */
export function toE164(input: string | null | undefined): string | null {
  if (!input) return null;
  const parsed = parsePhoneNumberFromString(input, "US");
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number; // E.164, e.g. +13055551234
}

/**
 * Readable US phone text for the sheet, for example (305) 555-1234.
 * Falls back to the trimmed input when it cannot be parsed.
 */
export function toReadableUsPhone(input: string | null | undefined): string {
  if (!input) return "";
  const parsed = parsePhoneNumberFromString(input, "US");
  if (!parsed || !parsed.isValid()) return input.trim();
  if (parsed.country === "US") {
    return parsed.formatNational(); // (305) 555-1234
  }
  return parsed.formatInternational();
}

/**
 * Lowercase and trim an email for dedupe and delivery. Returns null when blank.
 */
export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  return s || null;
}

/**
 * Registrable domain from a url or a bare host, ignoring www. Uses tldts so a
 * multi part public suffix (co.uk) is handled. Returns null when absent.
 */
export function registrableDomain(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  if (!/^https?:\/\//.test(s)) s = `http://${s}`;
  const d = getDomain(s);
  return d || null;
}
