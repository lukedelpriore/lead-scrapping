import { toReadableUsPhone, normalizeEmail } from "../normalize/contact";

/**
 * Google Sheet row mapping. Section 8. Fixed column order, header row frozen.
 * The app appends only and never writes the last three columns, which belong
 * to Luke. Blank stays blank, never invent a value.
 */

export const SHEET_COLUMNS = [
  "Request ID",
  "Club name",
  "City",
  "State",
  "Website",
  "Events page URL",
  "Main line",
  "Ownership type",
  "Group name",
  "Venues in group",
  "Tier",
  "Contact name",
  "Title",
  "Cell",
  "Work phone",
  "Work email",
  "Personal email",
  "Email grade",
  "LinkedIn URL",
  "RocketReach profile ID",
  "Match confidence",
  "Source",
  "Date pulled",
  "Notes",
  "Rep",
  "Status",
  "Call notes",
] as const;

/** Columns the app owns. The last three (Rep, Status, Call notes) are Luke's. */
export const APP_OWNED_COLUMN_COUNT = SHEET_COLUMNS.length - 3;

export interface Email {
  address: string;
  type?: string; // work | personal | other
  grade?: string;
}

export interface Phone {
  number: string; // E.164
  type?: string; // mobile | work | other
  valid?: boolean;
}

export interface SheetLeadInput {
  requestId: string;
  clubName: string;
  city?: string | null;
  state?: string | null;
  website?: string | null;
  eventsPageUrl?: string | null;
  mainLine?: string | null;
  ownershipType?: string | null;
  groupName?: string | null;
  venuesInGroup?: number | null;
  tier?: number | null;
  contactName?: string | null;
  title?: string | null;
  emails?: Email[];
  phones?: Phone[];
  linkedinUrl?: string | null;
  rrProfileId?: string | null;
  matchConfidence?: number | null;
  source?: string | null;
  datePulled?: string | null; // yyyy-mm-dd
  notes?: string | null;
}

function pickPhone(phones: Phone[] | undefined, types: string[]): string {
  if (!phones) return "";
  const hit = phones.find((p) => p.type && types.includes(p.type.toLowerCase()));
  return hit ? toReadableUsPhone(hit.number) : "";
}

function pickEmail(emails: Email[] | undefined, types: string[]): string {
  if (!emails) return "";
  const hit = emails.find((e) => e.type && types.includes(e.type.toLowerCase()));
  return hit ? normalizeEmail(hit.address) ?? "" : "";
}

function pickEmailGrade(emails: Email[] | undefined): string {
  if (!emails || emails.length === 0) return "";
  // Prefer the grade of the work email, else the first graded email.
  const work = emails.find((e) => e.type?.toLowerCase() === "work" && e.grade);
  if (work?.grade) return work.grade;
  const graded = emails.find((e) => e.grade);
  return graded?.grade ?? "";
}

function blankIfNil(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  return String(v);
}

/**
 * Build a single sheet row in the fixed column order. The three trailing
 * columns are always left blank so the app never overwrites Luke's edits.
 */
export function toSheetRow(input: SheetLeadInput): string[] {
  const cell = pickPhone(input.phones, ["mobile", "cell"]);
  const workPhone = pickPhone(input.phones, ["work", "direct", "office"]);
  const workEmail = pickEmail(input.emails, ["work", "professional"]);
  const personalEmail = pickEmail(input.emails, ["personal"]);
  const emailGrade = pickEmailGrade(input.emails);

  const row = [
    blankIfNil(input.requestId),
    blankIfNil(input.clubName),
    blankIfNil(input.city),
    blankIfNil(input.state),
    blankIfNil(input.website),
    blankIfNil(input.eventsPageUrl),
    blankIfNil(input.mainLine ? toReadableUsPhone(input.mainLine) : ""),
    blankIfNil(input.ownershipType),
    blankIfNil(input.groupName),
    blankIfNil(input.venuesInGroup),
    blankIfNil(input.tier),
    blankIfNil(input.contactName),
    blankIfNil(input.title),
    cell,
    workPhone,
    workEmail,
    personalEmail,
    emailGrade,
    blankIfNil(input.linkedinUrl),
    blankIfNil(input.rrProfileId),
    input.matchConfidence == null ? "" : input.matchConfidence.toFixed(2),
    blankIfNil(input.source),
    blankIfNil(input.datePulled),
    blankIfNil(input.notes),
    // Rep, Status, Call notes: app never writes these.
    "",
    "",
    "",
  ];
  return row;
}

/** The one note row written under the header. Section 12. */
export const SHEET_NOTE_ROW =
  "Cells are for manual dialing. No autodialer, ringless voicemail, or SMS without consent.";
