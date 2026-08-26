import { NextResponse } from "next/server";
import { prisma } from "@dph/db";

export const dynamic = "force-dynamic";

/**
 * Health endpoint. Reports database, queue, and integration status.
 * Section 14. Queue detail lands in M2; for now it reports not_wired.
 */
export async function GET() {
  const health: {
    ok: boolean;
    db: "ok" | "error";
    queue: "ok" | "not_wired" | "error";
    integrations: Record<string, unknown>;
    at: string;
  } = {
    ok: true,
    db: "ok",
    queue: "not_wired",
    integrations: {},
    at: new Date().toISOString(),
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    health.db = "error";
    health.ok = false;
  }

  try {
    const rows = await prisma.integrationStatus.findMany({
      select: { provider: true, lastOkAt: true, lastError: true },
    });
    health.integrations = Object.fromEntries(
      rows.map((r) => [
        r.provider,
        { lastOkAt: r.lastOkAt, lastError: r.lastError },
      ]),
    );
  } catch {
    // Integration status is best effort in the health check.
  }

  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}
