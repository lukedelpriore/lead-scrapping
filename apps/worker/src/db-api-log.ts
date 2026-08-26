import { prisma } from "@dph/db";
import type { ApiLogSink, ApiCallRecord } from "@dph/pipeline";

/** ApiLogSink backed by Prisma for the worker. Never throws into the caller. */
export const dbApiLog: ApiLogSink = {
  async record(entry: ApiCallRecord): Promise<void> {
    try {
      await prisma.apiCall.create({
        data: {
          provider: entry.provider,
          endpoint: entry.endpoint,
          statusCode: entry.statusCode ?? null,
          durationMs: entry.durationMs ?? null,
          costUnits: entry.costUnits ?? 0,
          requestId: entry.requestId ?? null,
          note: entry.note ?? null,
        },
      });
    } catch {
      /* logging never breaks a call */
    }
  },
};
