import type { ParsedContact } from "./parse";

/**
 * Fixture contact for REVEAL_MODE off. Section 6.7: the reveal stage becomes a
 * no op that reports "would spend n credits" and writes fixture contacts so
 * deliver can be tested end to end. The data is clearly fake (example.com,
 * 555 phone) and no credit is charged. Deterministic from the candidate id so
 * a re run is stable.
 */
export function makeFixtureContact(candidate: {
  id: string;
  name: string;
  title: string | null;
  employer: string | null;
}): ParsedContact {
  const slug = candidate.id.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "fixture";
  const last4 = (parseInt(slug, 36) % 10000).toString().padStart(4, "0");
  return {
    name: candidate.name,
    title: candidate.title,
    employer: candidate.employer,
    linkedinUrl: null,
    emails: [
      { address: `fixture.${slug}@example.com`, type: "work", grade: "fixture" },
    ],
    phones: [
      { number: `+1555555${last4}`, type: "mobile", valid: null },
    ],
    hasMobile: true,
    hasVerifiedEmail: false,
  };
}

/** The marker stored on fixture contacts so they are never mistaken for real. */
export const FIXTURE_MARKER = "REVEAL_MODE=off fixture, no credit spent";
