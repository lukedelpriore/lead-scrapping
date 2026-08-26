import { z } from "zod";
import { toE164 } from "../normalize/contact";

/**
 * Parse a RocketReach person lookup response into the fields we store.
 * Section 6.7: store every email (address, type, grade) and phone (number,
 * type, validity), plus the returned title and employer. Best effort against
 * the Section 5.3 shape, validated at the boundary. Pure and testable.
 */

const lookupSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    name: z.string().optional(),
    current_title: z.string().nullable().optional(),
    current_employer: z.string().nullable().optional(),
    linkedin_url: z.string().nullable().optional(),
    emails: z
      .array(
        z
          .object({
            email: z.string(),
            type: z.string().nullable().optional(),
            grade: z.string().nullable().optional(),
            smtp_valid: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .optional(),
    phones: z
      .array(
        z
          .object({
            number: z.string(),
            type: z.string().nullable().optional(),
            is_valid: z.union([z.boolean(), z.string()]).nullable().optional(),
            valid: z.union([z.boolean(), z.string()]).nullable().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export interface ParsedContactEmail {
  address: string;
  type: string | null;
  grade: string | null;
}

export interface ParsedContactPhone {
  number: string; // E.164 when parseable, else the raw
  type: string | null;
  valid: boolean | null;
}

export interface ParsedContact {
  name: string | null;
  title: string | null;
  employer: string | null;
  linkedinUrl: string | null;
  emails: ParsedContactEmail[];
  phones: ParsedContactPhone[];
  hasMobile: boolean;
  hasVerifiedEmail: boolean;
}

export function parseLookupResult(raw: unknown): ParsedContact {
  const data = lookupSchema.parse(raw);
  const emails: ParsedContactEmail[] = (data.emails ?? []).map((e) => ({
    address: e.email.toLowerCase(),
    type: e.type ?? null,
    grade: e.grade ?? null,
  }));
  const phones: ParsedContactPhone[] = (data.phones ?? []).map((p) => ({
    number: toE164(p.number) ?? p.number,
    type: p.type ?? null,
    valid: normalizeBool(p.is_valid ?? p.valid),
  }));

  const hasMobile = phones.some((p) => (p.type ?? "").toLowerCase().includes("mobile"));
  const hasVerifiedEmail = emails.some(
    (e) => (e.grade ?? "").toLowerCase() === "a" || (e.grade ?? "").toLowerCase().startsWith("valid"),
  );

  return {
    name: data.name ?? null,
    title: data.current_title ?? null,
    employer: data.current_employer ?? null,
    linkedinUrl: data.linkedin_url ?? null,
    emails,
    phones,
    hasMobile,
    hasVerifiedEmail,
  };
}

function normalizeBool(v: boolean | string | null | undefined): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  const s = v.toLowerCase();
  if (s === "true" || s === "valid" || s === "yes") return true;
  if (s === "false" || s === "invalid" || s === "no") return false;
  return null;
}
