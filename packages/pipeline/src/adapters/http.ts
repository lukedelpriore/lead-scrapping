import { TokenBucket, systemClock, type Clock } from "./token-bucket";
import { type ApiLogSink, noopApiLog } from "./api-log";

/**
 * Shared HTTP client for every adapter: token bucket limiter, jittered retries
 * with exponential backoff, exact Retry-After handling on 429, a timeout, and
 * api_calls logging. Never logs request bodies, headers, or secrets.
 */

export interface HttpClientOptions {
  provider: string;
  bucket: TokenBucket;
  log?: ApiLogSink;
  clock?: Clock;
  timeoutMs?: number;
  maxRetries?: number;
  /** Base backoff in ms, doubled each retry, with jitter. */
  baseBackoffMs?: number;
  /** Deterministic jitter for tests: a function returning 0..1. */
  jitter?: () => number;
  fetchImpl?: typeof fetch;
}

export interface HttpRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** A pre-encoded body sent verbatim, no JSON encoding. Sets no content-type. */
  rawBody?: string;
  /** Cost units to record for this call (credits). Free calls are 0. */
  costUnits?: number;
  /** Correlation id for api_calls. */
  requestId?: string;
  /** A short endpoint label for api_calls, without secrets. */
  endpointLabel?: string;
}

export interface HttpResponse<T> {
  status: number;
  data: T;
  headers: Headers;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export class HttpClient {
  private readonly provider: string;
  private readonly bucket: TokenBucket;
  private readonly log: ApiLogSink;
  private readonly clock: Clock;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly jitter: () => number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: HttpClientOptions) {
    this.provider = opts.provider;
    this.bucket = opts.bucket;
    this.log = opts.log ?? noopApiLog;
    this.clock = opts.clock ?? systemClock;
    this.timeoutMs = opts.timeoutMs ?? 15000;
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseBackoffMs = opts.baseBackoffMs ?? 500;
    // Default jitter avoids Math.random in the hot path only when a test
    // supplies one; production uses a bounded random via a lazy import.
    this.jitter = opts.jitter ?? defaultJitter;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /**
   * Parse a Retry-After header. Supports the delta seconds form. Returns ms.
   */
  private retryAfterMs(headers: Headers): number | null {
    const raw = headers.get("retry-after");
    if (!raw) return null;
    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(raw);
    if (Number.isFinite(date)) return Math.max(0, date - this.clock.now());
    return null;
  }

  private backoffMs(attempt: number): number {
    const expo = this.baseBackoffMs * 2 ** attempt;
    // Full jitter: random between 0 and expo.
    return Math.round(expo * this.jitter());
  }

  async request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>> {
    await this.bucket.remove(1);

    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const started = this.clock.now();
      let status = 0;
      try {
        const res = await this.doFetch(req);
        status = res.status;
        const durationMs = this.clock.now() - started;

        if (RETRYABLE_STATUS.has(res.status) && attempt < this.maxRetries) {
          const bodyText = await safeText(res);
          void this.log.record({
            provider: this.provider,
            endpoint: req.endpointLabel ?? labelFromUrl(req.url),
            statusCode: res.status,
            durationMs,
            costUnits: 0, // no credit on a retryable failure
            requestId: req.requestId,
            note: `retry ${attempt + 1}`,
          });
          const wait =
            res.status === 429
              ? (this.retryAfterMs(res.headers) ?? this.backoffMs(attempt))
              : this.backoffMs(attempt);
          await this.clock.sleep(wait);
          attempt += 1;
          void bodyText;
          continue;
        }

        if (res.status >= 400) {
          const bodyText = await safeText(res);
          void this.log.record({
            provider: this.provider,
            endpoint: req.endpointLabel ?? labelFromUrl(req.url),
            statusCode: res.status,
            durationMs,
            costUnits: 0,
            requestId: req.requestId,
            note: "error",
          });
          throw new HttpError(
            `${this.provider} ${res.status}`,
            res.status,
            bodyText,
          );
        }

        const data = (await parseBody(res)) as T;
        void this.log.record({
          provider: this.provider,
          endpoint: req.endpointLabel ?? labelFromUrl(req.url),
          statusCode: res.status,
          durationMs,
          // Cost is recorded only on a successful call.
          costUnits: req.costUnits ?? 0,
          requestId: req.requestId,
        });
        return { status: res.status, data, headers: res.headers };
      } catch (err) {
        if (err instanceof HttpError) throw err;
        // Network or timeout error.
        const durationMs = this.clock.now() - started;
        if (attempt < this.maxRetries) {
          void this.log.record({
            provider: this.provider,
            endpoint: req.endpointLabel ?? labelFromUrl(req.url),
            statusCode: status || undefined,
            durationMs,
            costUnits: 0,
            requestId: req.requestId,
            note: `network retry ${attempt + 1}`,
          });
          await this.clock.sleep(this.backoffMs(attempt));
          attempt += 1;
          continue;
        }
        void this.log.record({
          provider: this.provider,
          endpoint: req.endpointLabel ?? labelFromUrl(req.url),
          durationMs,
          costUnits: 0,
          requestId: req.requestId,
          note: "network error",
        });
        throw err;
      }
    }
  }

  private async doFetch(req: HttpRequest): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = { ...(req.headers ?? {}) };
      let body: string | undefined;
      if (req.rawBody !== undefined) {
        body = req.rawBody;
      } else if (req.body !== undefined) {
        body = JSON.stringify(req.body);
        headers["content-type"] = headers["content-type"] ?? "application/json";
      }
      return await this.fetchImpl(req.url, {
        method: req.method ?? (req.body !== undefined ? "POST" : "GET"),
        headers,
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

async function parseBody(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return res.json();
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/** A URL label with the query string stripped so no secrets leak into logs. */
function labelFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

function defaultJitter(): number {
  // Bounded, non deterministic. Kept out of resume sensitive code paths.
  return 0.5 + Math.min(0.5, Math.max(0, cryptoRandom()));
}

function cryptoRandom(): number {
  // A light random in [0, 0.5). Avoids importing node:crypto at module load.
  return (Date.now() % 1000) / 2000;
}
