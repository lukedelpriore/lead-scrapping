/**
 * api_calls logging sink. Every external call writes a row with provider,
 * endpoint, status, duration, and cost units. Never logs keys or full contact
 * payloads. The sink is injectable so tests use a fake and the worker or web
 * app passes one backed by Prisma.
 */
export interface ApiCallRecord {
  provider: string;
  endpoint: string;
  statusCode?: number;
  durationMs?: number;
  costUnits?: number;
  requestId?: string;
  note?: string;
}

export interface ApiLogSink {
  record(entry: ApiCallRecord): Promise<void> | void;
}

/** A sink that does nothing, for dryRun paths and simple tests. */
export const noopApiLog: ApiLogSink = {
  record() {
    /* no op */
  },
};

/** An in memory sink for assertions in tests. */
export class MemoryApiLog implements ApiLogSink {
  readonly entries: ApiCallRecord[] = [];
  record(entry: ApiCallRecord): void {
    this.entries.push(entry);
  }
}
