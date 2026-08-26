import { z } from "zod";
import { HttpClient } from "./http";
import { TokenBucket } from "./token-bucket";
import { type ApiLogSink, noopApiLog } from "./api-log";

/**
 * Places client. Off by default. Section 6.1 item 5 and Section 12.
 * Only fills website or phone for venues still missing them. Stores the place
 * id permanently. Throws when disabled so a paid call cannot happen by mistake.
 */

const TEXT_SEARCH = "https://places.googleapis.com/v1/places:searchText";

const placeSchema = z
  .object({
    id: z.string().optional(),
    displayName: z.object({ text: z.string() }).partial().optional(),
    websiteUri: z.string().optional(),
    nationalPhoneNumber: z.string().optional(),
    formattedAddress: z.string().optional(),
  })
  .passthrough();

const placesResponseSchema = z
  .object({ places: z.array(placeSchema).default([]) })
  .passthrough();

export interface PlaceFill {
  placeId: string | null;
  name: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
}

export interface PlacesConfig {
  apiKey: string;
  enabled: boolean;
  log?: ApiLogSink;
  http?: HttpClient;
}

export class PlacesClient {
  private readonly apiKey: string;
  private readonly enabled: boolean;
  private readonly http: HttpClient;

  constructor(cfg: PlacesConfig) {
    this.apiKey = cfg.apiKey;
    this.enabled = cfg.enabled;
    this.http =
      cfg.http ??
      new HttpClient({
        provider: "places",
        bucket: new TokenBucket({ capacity: 5, refillPerSecond: 2 }),
        log: cfg.log ?? noopApiLog,
      });
  }

  async fill(nameAndLocation: string): Promise<PlaceFill | null> {
    if (!this.enabled) {
      throw new Error("Places is disabled (PLACES_ENABLED is false)");
    }
    if (!this.apiKey) throw new Error("missing Google Maps API key");
    const res = await this.http.request<unknown>({
      url: TEXT_SEARCH,
      method: "POST",
      headers: {
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.websiteUri,places.nationalPhoneNumber,places.formattedAddress",
      },
      body: { textQuery: nameAndLocation },
      endpointLabel: "places:searchText",
      costUnits: 0,
    });
    const parsed = placesResponseSchema.parse(res.data);
    const first = parsed.places[0];
    if (!first) return null;
    return {
      placeId: first.id ?? null,
      name: first.displayName?.text ?? null,
      website: first.websiteUri ?? null,
      phone: first.nationalPhoneNumber ?? null,
      address: first.formattedAddress ?? null,
    };
  }
}
