import { prisma } from "@dph/db";
import type { ApiLogSink, ApiCallRecord } from "@dph/pipeline";

/**
 * ApiLogSink backed by Prisma. Writes one api_calls row per external call.
 * Never stores keys or full contact payloads, only the fields the schema
 * defines. Failures to log are swallowed so logging never breaks a call.
 */
export const prismaApiLog: ApiLogSink = {
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
      // Logging must never throw into the calling path.
    }
  },
};
