/**
 * Pipeline defaults and title lists from Section 15 of the spec. These seed
 * the single settings row and are editable in the portal Settings page.
 */

export const PIPELINE_DEFAULTS = {
  reserve_credits: 200,
  max_credits_per_request: 100,
  max_credits_per_day: 300,
  auto_reveal_min_confidence: 0.8,
  max_contacts_per_venue: 2,
  max_contacts_per_group: 4,
  search_quota_headroom: 0.9,
  fuzzy_venue_name_threshold: 92,
  fuzzy_employer_threshold: 90,
  venue_location_radius_miles: 25,
  adjudication_max_distance_miles: 50,
  discovery_refresh_days: 90,
  timezone: "America/New_York",
} as const;

/**
 * State order: FL, TX, CA, NJ, NY, IL, OH, MI, PA, GA, NC, SC, AZ, then the
 * rest alphabetical.
 */
const PRIORITY_STATES = [
  "FL", "TX", "CA", "NJ", "NY", "IL", "OH", "MI", "PA", "GA", "NC", "SC", "AZ",
];

const ALL_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL",
  "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT",
  "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];

export const STATE_ORDER: string[] = [
  ...PRIORITY_STATES,
  ...ALL_STATES.filter((s) => !PRIORITY_STATES.includes(s)).sort(),
];

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida",
  GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana",
  IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine",
  MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska",
  NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

/**
 * Title lists per ownership type. Earlier lists rank higher in adjudication.
 */
export type OwnershipType =
  | "group"
  | "private_owner"
  | "member_owned"
  | "municipal";

export const TITLE_LISTS: Record<OwnershipType, string[][]> = {
  group: [
    ["Owner", "Founder", "Co Founder", "Managing Partner", "Chairman"],
    ["CEO", "Chief Executive Officer", "President"],
    ["COO", "Chief Operating Officer", "VP Operations", "EVP", "Regional Vice President"],
    ["CMO", "VP Marketing", "Director of Marketing", "VP Sales and Marketing", "Director of Sales and Marketing"],
    ["Director of Private Events", "Director of Catering", "Director of Events"],
  ],
  private_owner: [
    ["Owner", "Managing Partner", "Proprietor"],
    ["General Manager", "GM", "GM/COO"],
    ["Director of Catering", "Director of Private Events", "Director of Sales", "Catering Sales Manager"],
    ["Membership Director"],
  ],
  member_owned: [
    ["General Manager", "COO", "GM/COO", "Chief Operating Officer"],
    ["Director of Catering", "Director of Private Events", "Director of Events"],
    ["Director of Marketing", "Membership Director", "Director of Membership and Marketing"],
    ["Board President", "President"],
  ],
  municipal: [
    ["Director of Golf", "Golf Operations Manager", "Head Golf Professional"],
  ],
};

export const EXCLUDE_EVERYWHERE = [
  "Assistant", "Intern", "Server", "Bartender", "Cook", "Groundskeeper",
  "Caddie", "Former", "Retired",
];

/**
 * Seed groups. Verify each portfolio on the group's own site before use.
 * Concert Golf Partners and Heritage Golf Group seed as in_play.
 */
export const SEED_GROUPS: { name: string; status: "open" | "in_play" }[] = [
  { name: "Invited", status: "open" },
  { name: "Troon", status: "open" },
  { name: "Arcis Golf", status: "open" },
  { name: "KemperSports", status: "open" },
  { name: "Heritage Golf Group", status: "in_play" },
  { name: "Concert Golf Partners", status: "in_play" },
  { name: "Landscapes Golf Management", status: "open" },
  { name: "Bobby Jones Links", status: "open" },
  { name: "McConnell Golf", status: "open" },
  { name: "Century Golf Partners", status: "open" },
  { name: "Escalante Golf", status: "open" },
  { name: "Hampton Golf", status: "open" },
  { name: "Touchstone Golf", status: "open" },
  { name: "GreatLIFE Golf", status: "open" },
  { name: "Brown Golf Management", status: "open" },
  { name: "Toll Golf", status: "open" },
  { name: "Dominion Golf Group", status: "open" },
];

/**
 * Published Pro rate limit fallback, read live from the account endpoint at
 * boot and hourly when the network allows.
 */
export const RATE_LIMIT_FALLBACK = {
  person_search: { per_minute: 30, per_hour: 250, per_day: 750, per_month: 15000 },
  person_lookup: { per_minute: 50, per_hour: 300, per_day: 1500, per_month: 20000 },
  company_search: { per_minute: 30, per_hour: 250, per_day: 750, per_month: 15000 },
  bulk_jobs: { per_minute: 10, per_hour: 25, per_day: 100, per_month: null },
  global_per_second: 10,
} as const;

/**
 * Credit pool facts for the plan year. Figures confirmed from the account on
 * 2026-08-26. Reset date drives the ledger label.
 */
export const CREDIT_PLAN = {
  person_exports_total: 3600,
  company_exports_total: 3600,
  reset_date: "2027-06-15",
} as const;
