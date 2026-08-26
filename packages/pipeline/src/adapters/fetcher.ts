import { request } from "undici";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { TokenBucket } from "./token-bucket";
import { type ApiLogSink, noopApiLog } from "./api-log";

/**
 * Site fetcher for the qualify stage. Section 6.3. Fetches the homepage plus a
 * few internal event pages, extracts main text with Readability on jsdom, caps
 * text per page, and respects a per domain concurrency of one via a limiter.
 * The internal URL selection and text extraction are pure and unit tested; the
 * network fetch is thin.
 */

const EVENT_PATH_HINTS = [
  "wedding",
  "weddings",
  "events",
  "private-events",
  "private events",
  "banquet",
  "banquets",
  "catering",
  "corporate",
  "meetings",
  "venue",
  "celebrations",
];

const MAX_PAGES = 6;
const MAX_CHARS = 3000;

export interface FetchedPage {
  url: string;
  text: string;
  fetchStatus: "ok" | "empty" | "error" | "js_only";
}

export interface FetcherConfig {
  log?: ApiLogSink;
  userAgent?: string;
  timeoutMs?: number;
}

/**
 * Choose which internal links to fetch from the homepage anchors. Keeps links
 * on the same host whose path or anchor text contains an event hint. Returns
 * absolute urls, deduped, homepage first, capped to MAX_PAGES.
 */
export function selectInternalUrls(
  homepageUrl: string,
  anchors: { href: string; text: string }[],
): string[] {
  const base = new URL(homepageUrl);
  const urls = new Set<string>([homepageUrl]);
  for (const a of anchors) {
    if (urls.size >= MAX_PAGES) break;
    let abs: URL;
    try {
      abs = new URL(a.href, base);
    } catch {
      continue;
    }
    if (abs.host !== base.host) continue;
    const hay = `${abs.pathname} ${a.text}`.toLowerCase();
    if (EVENT_PATH_HINTS.some((h) => hay.includes(h))) {
      abs.hash = "";
      urls.add(abs.toString());
    }
  }
  return [...urls].slice(0, MAX_PAGES);
}

/** Extract readable main text from HTML, capped. Pure. */
export function extractText(html: string, url: string): string {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    const text = article?.textContent?.trim() ?? "";
    if (text) return text.slice(0, MAX_CHARS);
    // Fall back to body text.
    const body = dom.window.document.body?.textContent?.trim() ?? "";
    return body.slice(0, MAX_CHARS);
  } catch {
    return "";
  }
}

/** Collect anchors from HTML for internal URL selection. Pure. */
export function collectAnchors(html: string, url: string): { href: string; text: string }[] {
  try {
    const dom = new JSDOM(html, { url });
    return [...dom.window.document.querySelectorAll("a[href]")].map((a) => ({
      href: (a as HTMLAnchorElement).getAttribute("href") ?? "",
      text: a.textContent ?? "",
    }));
  } catch {
    return [];
  }
}

export class Fetcher {
  private readonly log: ApiLogSink;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly bucket: TokenBucket;

  constructor(cfg: FetcherConfig = {}) {
    this.log = cfg.log ?? noopApiLog;
    this.userAgent =
      cfg.userAgent ??
      "Mozilla/5.0 (compatible; DelPrioreLeadEngine/1.0; +https://leads.delpriorehospitality.com)";
    this.timeoutMs = cfg.timeoutMs ?? 12000;
    // One request at a time per domain, gentle refill.
    this.bucket = new TokenBucket({ capacity: 1, refillPerSecond: 2 });
  }

  private async get(url: string): Promise<{ status: number; html: string }> {
    await this.bucket.remove(1);
    const started = Date.now();
    try {
      const res = await request(url, {
        method: "GET",
        headers: { "user-agent": this.userAgent, accept: "text/html" },
        bodyTimeout: this.timeoutMs,
        headersTimeout: this.timeoutMs,
        maxRedirections: 3,
      });
      const html = await res.body.text();
      void this.log.record({
        provider: "fetch",
        endpoint: hostPath(url),
        statusCode: res.statusCode,
        durationMs: Date.now() - started,
        costUnits: 0,
      });
      return { status: res.statusCode, html };
    } catch (err) {
      void this.log.record({
        provider: "fetch",
        endpoint: hostPath(url),
        durationMs: Date.now() - started,
        costUnits: 0,
        note: `error: ${(err as Error).message}`,
      });
      throw err;
    }
  }

  /**
   * Fetch a venue site: homepage, then selected internal event pages. Returns
   * one FetchedPage per url. A page that fails to fetch is marked error and the
   * others still return.
   */
  async fetchSite(homepageUrl: string): Promise<FetchedPage[]> {
    const pages: FetchedPage[] = [];
    let homepageHtml = "";
    try {
      const home = await this.get(homepageUrl);
      homepageHtml = home.html;
      const text = extractText(home.html, homepageUrl);
      pages.push({ url: homepageUrl, text, fetchStatus: text ? "ok" : "empty" });
    } catch {
      pages.push({ url: homepageUrl, text: "", fetchStatus: "error" });
      return pages;
    }

    const anchors = collectAnchors(homepageHtml, homepageUrl);
    const internal = selectInternalUrls(homepageUrl, anchors).filter((u) => u !== homepageUrl);

    for (const url of internal) {
      try {
        const res = await this.get(url);
        const text = extractText(res.html, url);
        pages.push({ url, text, fetchStatus: text ? "ok" : "empty" });
      } catch {
        pages.push({ url, text: "", fetchStatus: "error" });
      }
    }
    return pages;
  }
}

function hostPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url;
  }
}
