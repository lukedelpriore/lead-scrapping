import { google, type sheets_v4 } from "googleapis";
import { TokenBucket } from "./token-bucket";
import { type ApiLogSink, noopApiLog, type ApiCallRecord } from "./api-log";

/**
 * Google Sheets client. Section 8. Uses a service account. Appends only,
 * never overwrites the three Luke columns. googleapis handles transport, so
 * this adapter adds a limiter and api_calls logging around each call.
 */

export interface SheetsConfig {
  /** Service account JSON as an object, decoded by the caller. */
  serviceAccount: { client_email: string; private_key: string };
  spreadsheetId: string;
  log?: ApiLogSink;
  sheetsApi?: sheets_v4.Sheets; // injectable for tests
}

/**
 * Decode the service account from base64 (cloud) or a raw JSON string.
 */
export function decodeServiceAccount(input: {
  b64?: string;
  json?: string;
}): { client_email: string; private_key: string } {
  let raw: string | undefined;
  if (input.b64) raw = Buffer.from(input.b64, "base64").toString("utf8");
  else if (input.json) raw = input.json;
  if (!raw) throw new Error("no service account provided");
  const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("service account JSON missing client_email or private_key");
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

export class SheetsClient {
  private readonly spreadsheetId: string;
  private readonly log: ApiLogSink;
  private readonly bucket: TokenBucket;
  private readonly serviceAccount: SheetsConfig["serviceAccount"];
  private api: sheets_v4.Sheets | null;

  constructor(cfg: SheetsConfig) {
    this.spreadsheetId = cfg.spreadsheetId;
    this.log = cfg.log ?? noopApiLog;
    this.serviceAccount = cfg.serviceAccount;
    this.bucket = new TokenBucket({ capacity: 5, refillPerSecond: 2 });
    this.api = cfg.sheetsApi ?? null;
  }

  private client(): sheets_v4.Sheets {
    if (this.api) return this.api;
    const auth = new google.auth.JWT({
      email: this.serviceAccount.client_email,
      key: this.serviceAccount.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    this.api = google.sheets({ version: "v4", auth });
    return this.api;
  }

  private async logged<T>(entry: ApiCallRecord, fn: () => Promise<T>): Promise<T> {
    await this.bucket.remove(1);
    const started = Date.now();
    try {
      const out = await fn();
      void this.log.record({ ...entry, statusCode: 200, durationMs: Date.now() - started });
      return out;
    } catch (err) {
      void this.log.record({
        ...entry,
        statusCode: (err as { code?: number })?.code ?? undefined,
        durationMs: Date.now() - started,
        note: "error",
      });
      throw err;
    }
  }

  /** Read the spreadsheet title, a free confirmation that access works. */
  async info(): Promise<{ title: string; tabs: string[] }> {
    return this.logged({ provider: "sheets", endpoint: "spreadsheets.get" }, async () => {
      const res = await this.client().spreadsheets.get({ spreadsheetId: this.spreadsheetId });
      const title = res.data.properties?.title ?? "";
      const tabs = (res.data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);
      return { title, tabs };
    });
  }

  /** Append rows to a tab. values.append, batches up to 500 by the caller. */
  async append(tab: string, rows: string[][]): Promise<{ updatedRange: string | null }> {
    return this.logged({ provider: "sheets", endpoint: "values.append" }, async () => {
      const res = await this.client().spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${tab}!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: rows },
      });
      return { updatedRange: res.data.updates?.updatedRange ?? null };
    });
  }

  /** Clear a range, used to remove the preflight test row. */
  async clear(range: string): Promise<void> {
    await this.logged({ provider: "sheets", endpoint: "values.clear" }, async () => {
      await this.client().spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range,
      });
    });
  }

  /**
   * Test write: append one marker row, then clear it. Proves the service
   * account can write. Returns the range it used. Free of any credit.
   */
  async testWrite(tab = "Leads"): Promise<{ ok: true; range: string }> {
    const marker = [`test ${new Date().toISOString()}`];
    const appended = await this.append(tab, [marker]);
    const range = appended.updatedRange;
    if (!range) throw new Error("append did not return a range");
    await this.clear(range);
    return { ok: true, range };
  }
}
