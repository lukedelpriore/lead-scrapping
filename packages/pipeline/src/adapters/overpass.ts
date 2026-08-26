import { z } from "zod";
import { HttpClient } from "./http";
import { TokenBucket } from "./token-bucket";
import { type ApiLogSink, noopApiLog } from "./api-log";

/**
 * Overpass client. Free, primary discovery source. Section 6.1.
 * Per state: leisure=golf_course features with a name. One request at a time,
 * exponential backoff on 429 and 504 (handled by HttpClient).
 */

const DEFAULT_ENDPOINT = "https://overpass-api.de/api/interpreter";

const overpassElementSchema = z
  .object({
    type: z.string(),
    id: z.number(),
    lat: z.number().optional(),
    lon: z.number().optional(),
    center: z.object({ lat: z.number(), lon: z.number() }).optional(),
    tags: z.record(z.string()).optional(),
  })
  .passthrough();

const overpassResponseSchema = z
  .object({ elements: z.array(overpassElementSchema).default([]) })
  .passthrough();

export interface GolfCourse {
  osmId: string;
  name: string;
  lat: number | null;
  lng: number | null;
  website: string | null;
  phone: string | null;
}

export interface OverpassConfig {
  endpoint?: string;
  log?: ApiLogSink;
  http?: HttpClient;
}

export class OverpassClient {
  private readonly endpoint: string;
  private readonly http: HttpClient;

  constructor(cfg: OverpassConfig = {}) {
    this.endpoint = cfg.endpoint ?? DEFAULT_ENDPOINT;
    this.http =
      cfg.http ??
      new HttpClient({
        provider: "overpass",
        // One request at a time, gentle refill.
        bucket: new TokenBucket({ capacity: 1, refillPerSecond: 0.5 }),
        log: cfg.log ?? noopApiLog,
        timeoutMs: 60000,
      });
  }

  /**
   * Build the Overpass QL for named golf courses in a US state, matched by the
   * ISO3166-2 admin area (for example US-FL).
   */
  buildQuery(stateCode: string): string {
    const area = `US-${stateCode.toUpperCase()}`;
    return `[out:json][timeout:50];
area["ISO3166-2"="${area}"]->.a;
(
  nwr["leisure"="golf_course"]["name"](area.a);
);
out center tags;`;
  }

  async golfCourses(stateCode: string): Promise<GolfCourse[]> {
    const query = this.buildQuery(stateCode);
    const res = await this.http.request<unknown>({
      url: this.endpoint,
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      rawBody: `data=${encodeURIComponent(query)}`,
      endpointLabel: "interpreter",
      costUnits: 0,
    });
    return this.parse(res.data);
  }

  parse(data: unknown): GolfCourse[] {
    const parsed = overpassResponseSchema.parse(data);
    return parsed.elements
      .map((el): GolfCourse | null => {
        const name = el.tags?.name;
        if (!name) return null;
        const lat = el.lat ?? el.center?.lat ?? null;
        const lng = el.lon ?? el.center?.lon ?? null;
        return {
          osmId: `${el.type}/${el.id}`,
          name,
          lat,
          lng,
          website: el.tags?.website ?? el.tags?.["contact:website"] ?? null,
          phone: el.tags?.phone ?? el.tags?.["contact:phone"] ?? null,
        };
      })
      .filter((v): v is GolfCourse => v !== null);
  }
}
