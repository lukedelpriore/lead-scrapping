import { normalizeName } from "../normalize/index";
import type { Tri } from "../tier";

/**
 * Rules classifier. Section 6.3. Runs when AI_MODE is off (the default) and
 * produces the same JSON shape as the Claude classifier so nothing downstream
 * changes. Pure and fully unit tested.
 */

export type Ownership = "group" | "private_owner" | "member_owned" | "municipal" | "unclear";

export interface ClassifyPage {
  url: string;
  text: string;
}

export interface ClassifyInput {
  name: string;
  city?: string | null;
  state?: string | null;
  pages: ClassifyPage[];
  /** The venue was found on The Knot or WeddingWire in stage 1. */
  foundOnWeddingDirectory?: boolean;
  /** Seeded group names to match ownership against. */
  seedGroupNames?: string[];
}

export interface ClassifyResult {
  hosts_weddings: Tri;
  hosts_corporate: Tri;
  nonmember_events: Tri;
  evidence_url: string | null;
  evidence_phrase: string | null;
  ownership_type: Ownership;
  group_name: string | null;
  capacity: number | null;
  site_contact: { name: string; title: string; email: string | null; phone: string | null } | null;
  confidence: number;
}

const NONMEMBER_YES = [
  "membership not required",
  "no membership required",
  "you do not need to be a member",
  "you don't need to be a member",
  "non members welcome",
  "nonmembers welcome",
  "non-members welcome",
  "open to the public",
  "available to non members",
  "available to the public",
  "public welcome",
];

const NONMEMBER_NO = [
  "members only",
  "members and their guests only",
  "must be a member",
  "member sponsored events only",
];

const CORPORATE = [
  "corporate event",
  "corporate events",
  "business meeting",
  "company outing",
  "golf outing",
  "conference",
  "banquet",
  "meeting space",
  "meeting rooms",
];

const MEMBER_OWNED = ["member owned", "owned by its members", "equity club"];
const MUNICIPAL = ["city of", "county of", "parks and recreation", "municipal"];
const PRIVATE_OWNER = ["family owned", "owned and operated by", "proprietor"];

interface Match {
  phrase: string;
  url: string;
}

function findPhrase(pages: { url: string; lower: string }[], phrases: string[]): Match | null {
  for (const p of pages) {
    for (const phrase of phrases) {
      if (p.lower.includes(phrase)) return { phrase, url: p.url };
    }
  }
  return null;
}

export function classifyByRules(input: ClassifyInput): ClassifyResult {
  const pages = input.pages.map((p) => ({ url: p.url, lower: p.text.toLowerCase() }));
  const allText = pages.map((p) => p.lower).join("\n");

  // hosts_weddings
  const urlHasWedding = input.pages.some((p) => /wedding/i.test(new URL(safeUrl(p.url)).pathname));
  const weddingCount = (allText.match(/weddings?/g) ?? []).length;
  const hostsWeddings: Tri =
    urlHasWedding || weddingCount >= 3 || input.foundOnWeddingDirectory ? "yes" : "unclear";

  // hosts_corporate
  const corp = findPhrase(pages, CORPORATE);
  const hostsCorporate: Tri = corp ? "yes" : "unclear";

  // nonmember_events
  const yes = findPhrase(pages, NONMEMBER_YES);
  const no = findPhrase(pages, NONMEMBER_NO);
  let nonmember: Tri = "unclear";
  let nonmemberMatch: Match | null = null;
  if (yes) {
    nonmember = "yes";
    nonmemberMatch = yes;
  } else if (no) {
    nonmember = "no";
    nonmemberMatch = no;
  }

  // ownership_type and group_name
  const { ownership, groupName, ownershipMatch } = classifyOwnership(pages, allText, input);

  // capacity
  const capacity = findCapacity(allText);

  // site_contact
  const siteContact = findSiteContact(input.pages);

  // evidence: prefer the nonmember phrase, then corporate, then ownership
  const evidence = nonmemberMatch ?? corp ?? ownershipMatch ?? null;

  // confidence
  let confidence = 0.3;
  if (nonmember === "yes" || nonmember === "no") confidence = 0.9;
  else if (hostsWeddings === "yes" || hostsCorporate === "yes") confidence = 0.6;

  return {
    hosts_weddings: hostsWeddings,
    hosts_corporate: hostsCorporate,
    nonmember_events: nonmember,
    evidence_url: evidence?.url ?? null,
    evidence_phrase: evidence?.phrase ?? null,
    ownership_type: ownership,
    group_name: groupName,
    capacity,
    site_contact: siteContact,
    confidence,
  };
}

function classifyOwnership(
  pages: { url: string; lower: string }[],
  allText: string,
  input: ClassifyInput,
): { ownership: Ownership; groupName: string | null; ownershipMatch: Match | null } {
  // group: a seeded group name, or a managed by pattern.
  for (const g of input.seedGroupNames ?? []) {
    const gl = g.toLowerCase();
    for (const p of pages) {
      if (p.lower.includes(gl)) {
        return { ownership: "group", groupName: g, ownershipMatch: { phrase: g, url: p.url } };
      }
    }
  }
  const managed = allText.match(/managed by ([a-z0-9 &'.-]{2,40})/);
  if (managed) {
    const name = titleCase(managed[1]!.trim());
    return { ownership: "group", groupName: name, ownershipMatch: { phrase: managed[0]!, url: pages[0]?.url ?? "" } };
  }
  const propertyOf = allText.match(/a ([a-z0-9 &'.-]{2,40}) property/);
  if (propertyOf) {
    const name = titleCase(propertyOf[1]!.trim());
    return { ownership: "group", groupName: name, ownershipMatch: { phrase: propertyOf[0]!, url: pages[0]?.url ?? "" } };
  }

  const member = findPhrase(pages, MEMBER_OWNED);
  if (member) return { ownership: "member_owned", groupName: null, ownershipMatch: member };

  const muni = findPhrase(pages, MUNICIPAL);
  const govDomain = pages.some((p) => /\.gov(\/|$)|\.us(\/|$)/.test(p.url));
  if (muni || govDomain) {
    return { ownership: "municipal", groupName: null, ownershipMatch: muni ?? { phrase: "gov domain", url: pages[0]?.url ?? "" } };
  }

  const owner = findPhrase(pages, PRIVATE_OWNER);
  if (owner) return { ownership: "private_owner", groupName: null, ownershipMatch: owner };

  return { ownership: "unclear", groupName: null, ownershipMatch: null };
}

function findCapacity(text: string): number | null {
  const words = ["guests", "seated", "capacity"];
  let best: number | null = null;
  for (const w of words) {
    let idx = text.indexOf(w);
    while (idx !== -1) {
      const start = Math.max(0, idx - 40);
      const window = text.slice(start, idx + w.length + 40);
      const nums = window.match(/\d[\d,]{1,6}/g);
      if (nums) {
        for (const n of nums) {
          const val = Number(n.replace(/,/g, ""));
          if (Number.isFinite(val) && (best === null || val > best)) best = val;
        }
      }
      idx = text.indexOf(w, idx + 1);
    }
  }
  return best;
}

const CONTACT_TITLES = [
  "Director of Catering",
  "Director of Events",
  "Director of Private Events",
  "Director of Sales",
  "Catering Sales Manager",
  "Event Coordinator",
  "General Manager",
];

function findSiteContact(
  pages: ClassifyPage[],
): { name: string; title: string; email: string | null; phone: string | null } | null {
  for (const page of pages) {
    for (const title of CONTACT_TITLES) {
      const idx = page.text.indexOf(title);
      if (idx === -1) continue;
      const window = page.text.slice(Math.max(0, idx - 120), idx + 300);
      const email = window.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0] ?? null;
      const phone = window.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)?.[0] ?? null;
      // A name: a capitalized two word phrase on the same or previous line.
      const before = page.text.slice(Math.max(0, idx - 80), idx);
      const nameMatch = before.match(/([A-Z][a-z]+ [A-Z][a-z]+)\s*$/) ?? window.match(/([A-Z][a-z]+ [A-Z][a-z]+)/);
      const name = nameMatch?.[1] ?? null;
      if (name && (email || phone)) {
        return { name, title, email, phone };
      }
    }
  }
  return null;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function safeUrl(url: string): string {
  try {
    // eslint-disable-next-line no-new
    new URL(url);
    return url;
  } catch {
    return `https://example.com/${url.replace(/^\/+/, "")}`;
  }
}

/** Matched seed group name from classifier output, normalized for lookup. */
export function normalizedGroupName(name: string | null): string | null {
  return name ? normalizeName(name) : null;
}
