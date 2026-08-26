import { z } from "zod";
import { HttpClient } from "./http";
import { TokenBucket } from "./token-bucket";
import { type ApiLogSink, noopApiLog } from "./api-log";

/**
 * Serper client. Low cost discovery. Section 6.1 item 3.
 * Harvest result titles and URLs only. Never fetch or parse directory pages.
 */

const ENDPOINT = "https://google.serper.dev/search";

const serperSchema = z
  .object({
    organic: z
      .array(
        z
          .object({
            title: z.string().optional(),
            link: z.string().optional(),
            snippet: z.string().optional(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

export interface SerperResult {
  title: string;
  url: string;
  snippet: string | null;
}

export interface SerperConfig {
  apiKey: string;
  log?: ApiLogSink;
  http?: HttpClient;
}

export class SerperClient {
  private readonly apiKey: string;
  private readonly http: HttpClient;

  constructor(cfg: SerperConfig) {
    if (!cfg.apiKey) throw new Error("missing Serper API key");
    this.apiKey = cfg.apiKey;
    this.http =
      cfg.http ??
      new HttpClient({
        provider: "serper",
        bucket: new TokenBucket({ capacity: 5, refillPerSecond: 2 }),
        log: cfg.log ?? noopApiLog,
      });
  }

  async search(query: string, opts: { gl?: string; num?: number } = {}): Promise<SerperResult[]> {
    const res = await this.http.request<unknown>({
      url: ENDPOINT,
      method: "POST",
      headers: { "X-API-KEY": this.apiKey },
      body: { q: query, gl: opts.gl ?? "us", num: opts.num ?? 20 },
      endpointLabel: "search",
      costUnits: 0,
    });
    const parsed = serperSchema.parse(res.data);
    return parsed.organic
      .filter((r) => r.title && r.link)
      .map((r) => ({
        title: r.title!,
        url: r.link!,
        snippet: r.snippet ?? null,
      }));
  }
}
