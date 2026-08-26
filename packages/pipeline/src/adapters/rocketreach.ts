import { z } from "zod";
import { HttpClient } from "./http";
import { TokenBucket } from "./token-bucket";
import { type ApiLogSink, noopApiLog } from "./api-log";
import { RATE_LIMIT_FALLBACK } from "@dph/config";

/**
 * RocketReach client. Section 5.
 *
 * SAFETY: the credit endpoints (person lookup, bulk lookup, company lookup)
 * are NEVER called while revealMode is "off". lookupPerson and companyLookup
 * throw immediately in that mode. Search, account, company search, and status
 * polling are free and always allowed.
 *
 * These request and response shapes follow the Section 5.3 summary. The live
 * docs at docs.rocketreach.co are validated against this in a session with
 * network, per DECISIONS.md; any difference is reconciled there.
 */

const BASE = "https://api.rocketreach.co/api/v2";

export type RevealMode = "off" | "ask" | "auto";

export interface RocketReachConfig {
  apiKey: string;
  revealMode: RevealMode;
  companyLookupEnabled?: boolean;
  log?: ApiLogSink;
  http?: HttpClient;
  /** Requests per second cap. Published global is 10. */
  requestsPerSecond?: number;
}

// ---- response schemas (best effort, validated at the boundary) ----

const accountSchema = z
  .object({
    id: z.number().optional(),
    name: z.string().optional(),
    plan: z
      .object({ name: z.string().optional(), id: z.number().optional() })
      .partial()
      .optional(),
    // Balances vary by plan; capture what is present.
    lookup_credit_balance: z.number().optional(),
    export_credit_balance: z.number().optional(),
    person_exports_remaining: z.number().optional(),
    company_exports_remaining: z.number().optional(),
    // Rate limits when present.
    rate_limits: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type RocketReachAccount = z.infer<typeof accountSchema>;

const personSearchResultSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    name: z.string().optional(),
    current_title: z.string().nullable().optional(),
    current_employer: z.string().nullable().optional(),
    linkedin_url: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
  })
  .passthrough();

const personSearchSchema = z
  .object({
    profiles: z.array(personSearchResultSchema).default([]),
    pagination: z
      .object({
        start: z.number().optional(),
        next: z.number().nullable().optional(),
        total: z.number().optional(),
      })
      .partial()
      .optional(),
  })
  .passthrough();

export type PersonSearchResponse = z.infer<typeof personSearchSchema>;

const checkStatusSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    status: z.enum(["complete", "failed", "waiting", "searching", "progress"]),
  })
  .passthrough();

export type CheckStatusResponse = z.infer<typeof checkStatusSchema>;

const companySearchSchema = z
  .object({
    companies: z
      .array(
        z
          .object({
            id: z.union([z.number(), z.string()]).optional(),
            name: z.string().optional(),
            domain: z.string().nullable().optional(),
            location: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

export type CompanySearchResponse = z.infer<typeof companySearchSchema>;

export interface PersonSearchQuery {
  start?: number;
  pageSize?: number;
  query: Record<string, unknown>;
  orderBy?: string;
}

export class RocketReachError extends Error {}

export class RocketReachClient {
  private readonly apiKey: string;
  private readonly revealMode: RevealMode;
  private readonly companyLookupEnabled: boolean;
  private readonly http: HttpClient;

  constructor(cfg: RocketReachConfig) {
    if (!cfg.apiKey) throw new RocketReachError("missing RocketReach API key");
    this.apiKey = cfg.apiKey;
    this.revealMode = cfg.revealMode;
    this.companyLookupEnabled = cfg.companyLookupEnabled ?? false;
    this.http =
      cfg.http ??
      new HttpClient({
        provider: "rocketreach",
        bucket: new TokenBucket({
          capacity: cfg.requestsPerSecond ?? RATE_LIMIT_FALLBACK.global_per_second,
          refillPerSecond: cfg.requestsPerSecond ?? RATE_LIMIT_FALLBACK.global_per_second,
        }),
        log: cfg.log ?? noopApiLog,
      });
  }

  private headers(): Record<string, string> {
    return { "Api-Key": this.apiKey };
  }

  /** Free. Account, plan, balances, and rate limits. */
  async account(): Promise<RocketReachAccount> {
    const res = await this.http.request<unknown>({
      url: `${BASE}/account`,
      method: "GET",
      headers: this.headers(),
      endpointLabel: "account",
      costUnits: 0,
    });
    return accountSchema.parse(res.data);
  }

  /** Free. Person search. Executives first with order_by popularity. */
  async personSearch(q: PersonSearchQuery): Promise<PersonSearchResponse> {
    const body = {
      start: q.start ?? 1,
      page_size: Math.min(q.pageSize ?? 25, 100),
      query: q.query,
      order_by: q.orderBy ?? "popularity",
    };
    const res = await this.http.request<unknown>({
      url: `${BASE}/person/search`,
      method: "POST",
      headers: this.headers(),
      body,
      endpointLabel: "person/search",
      costUnits: 0,
    });
    return personSearchSchema.parse(res.data);
  }

  /** Free. Company search. */
  async companySearch(query: Record<string, unknown>): Promise<CompanySearchResponse> {
    const res = await this.http.request<unknown>({
      url: `${BASE}/company/search`,
      method: "POST",
      headers: this.headers(),
      body: { query },
      endpointLabel: "company/search",
      costUnits: 0,
    });
    return companySearchSchema.parse(res.data);
  }

  /** Free. Poll a lookup status. Callers must not poll faster than every 3s. */
  async checkStatus(id: string | number): Promise<CheckStatusResponse> {
    const res = await this.http.request<unknown>({
      url: `${BASE}/person/checkStatus?ids=${encodeURIComponent(String(id))}`,
      method: "GET",
      headers: this.headers(),
      endpointLabel: "person/checkStatus",
      costUnits: 0,
    });
    // checkStatus can return an array; normalize to one.
    const raw = Array.isArray(res.data) ? res.data[0] : res.data;
    return checkStatusSchema.parse(raw);
  }

  /**
   * CREDITS. Person lookup. Guarded: throws when revealMode is off so the
   * credit endpoint is never hit during the build. The reveal stage only calls
   * this when revealMode is ask or auto and the candidate passed both gates.
   */
  async lookupPerson(identifier: {
    id?: string | number;
    linkedin_url?: string;
    email?: string;
    name?: string;
    current_employer?: string;
  }): Promise<unknown> {
    if (this.revealMode === "off") {
      throw new RocketReachError(
        "person lookup blocked: REVEAL_MODE is off. This endpoint spends a credit.",
      );
    }
    const params = new URLSearchParams();
    if (identifier.id != null) params.set("id", String(identifier.id));
    else if (identifier.linkedin_url) params.set("linkedin_url", identifier.linkedin_url);
    else if (identifier.email) params.set("email", identifier.email);
    else if (identifier.name) {
      params.set("name", identifier.name);
      if (identifier.current_employer)
        params.set("current_employer", identifier.current_employer);
    } else {
      throw new RocketReachError("lookupPerson needs id, linkedin_url, email, or name");
    }
    const res = await this.http.request<unknown>({
      url: `${BASE}/person/lookup?${params.toString()}`,
      method: "GET",
      headers: this.headers(),
      endpointLabel: "person/lookup",
      costUnits: 1,
    });
    return res.data;
  }

  /** CREDITS. Company lookup. Off unless company_lookup_enabled and reveal on. */
  async companyLookup(id: string | number): Promise<unknown> {
    if (!this.companyLookupEnabled) {
      throw new RocketReachError("company lookup is disabled");
    }
    if (this.revealMode === "off") {
      throw new RocketReachError(
        "company lookup blocked: REVEAL_MODE is off. This endpoint spends a credit.",
      );
    }
    const res = await this.http.request<unknown>({
      url: `${BASE}/company/lookup?id=${encodeURIComponent(String(id))}`,
      method: "GET",
      headers: this.headers(),
      endpointLabel: "company/lookup",
      costUnits: 1,
    });
    return res.data;
  }

  /**
   * Read plan, balances, and rate limits into a normalized status shape for
   * integration_status. Rate limits fall back to the published Pro values.
   */
  async status(): Promise<{
    planName: string | null;
    personExportsRemaining: number | null;
    companyExportsRemaining: number | null;
    limits: unknown;
  }> {
    const acct = await this.account();
    return {
      planName: acct.plan?.name ?? acct.name ?? null,
      personExportsRemaining:
        acct.person_exports_remaining ?? acct.export_credit_balance ?? null,
      companyExportsRemaining: acct.company_exports_remaining ?? null,
      limits: acct.rate_limits ?? RATE_LIMIT_FALLBACK,
    };
  }
}
