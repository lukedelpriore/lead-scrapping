/**
 * Search plan per target. Section 6.5. Builds the ordered RocketReach person
 * search queries, stopping when 2 or more good results appear (the caller runs
 * them in order). Pure query construction, testable without any network.
 *
 * Search syntax: wrap a value in escaped double quotes for exact match, prefix
 * with - to exclude, append ::~25mi to a location for a radius.
 */

export interface TargetForSearch {
  venueName?: string | null;
  groupName?: string | null;
  city?: string | null;
  state?: string | null;
  isVenue: boolean;
  /** Flattened title list for the ownership type. */
  titles: string[];
  radiusMiles?: number;
}

export interface SearchStep {
  label: string;
  query: Record<string, unknown>;
}

function exact(v: string): string {
  return `"${v}"`;
}

function locationRadius(city: string, state: string, miles: number): string {
  return `"${city}, ${state}"::~${miles}mi`;
}

export function buildSearchPlan(t: TargetForSearch): SearchStep[] {
  const steps: SearchStep[] = [];
  const radius = t.radiusMiles ?? 25;
  const employer = t.isVenue ? t.venueName : t.groupName;
  const location =
    t.city && t.state ? [locationRadius(t.city, t.state, radius)] : t.state ? [t.state] : undefined;

  // 1. Exact employer plus titles plus location.
  if (employer) {
    steps.push({
      label: "exact employer",
      query: {
        current_employer: [exact(employer)],
        current_title: t.titles,
        ...(location ? { location } : {}),
      },
    });
    // 2. Loose employer (unquoted).
    steps.push({
      label: "loose employer",
      query: {
        current_employer: [employer],
        current_title: t.titles,
        ...(location ? { location } : {}),
      },
    });
  }

  // 3. Venue name as keyword plus titles plus location.
  if (t.venueName) {
    steps.push({
      label: "venue keyword",
      query: {
        keyword: [t.venueName],
        current_title: t.titles,
        ...(location ? { location } : {}),
      },
    });
  }

  return steps;
}

/** A Serper query to find a LinkedIn profile for a venue GM, for step 4. */
export function linkedinFallbackQuery(venueName: string): string {
  return `site:linkedin.com/in "${venueName}" "general manager"`;
}
