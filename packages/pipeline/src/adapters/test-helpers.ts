import type { Clock } from "./token-bucket";

/**
 * A manual clock for tests. sleep advances virtual time immediately and
 * resolves, so retry and limiter logic runs with no real delay and is
 * deterministic.
 */
export class ManualClock implements Clock {
  private t: number;
  constructor(start = 0) {
    this.t = start;
  }
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
  async sleep(ms: number): Promise<void> {
    this.t += ms;
  }
}

export interface FakeResponseSpec {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Build a fake fetch that returns a queued sequence of responses. Each call
 * records the request it received. Useful for retry and shape tests.
 */
export function fakeFetch(sequence: FakeResponseSpec[]): {
  fetch: typeof fetch;
  calls: { url: string; init?: RequestInit }[];
} {
  const calls: { url: string; init?: RequestInit }[] = [];
  let i = 0;
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const spec = sequence[Math.min(i, sequence.length - 1)];
    i += 1;
    const headers = new Headers(spec?.headers ?? {});
    const bodyIsJson = typeof spec?.body !== "string";
    if (bodyIsJson && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const bodyText =
      typeof spec?.body === "string" ? spec.body : JSON.stringify(spec?.body ?? {});
    return new Response(bodyText, { status: spec?.status ?? 200, headers });
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}
