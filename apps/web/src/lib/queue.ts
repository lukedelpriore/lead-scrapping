import PgBoss from "pg-boss";
import { getEnv } from "@dph/config";

/**
 * Minimal pg-boss client for the web app to enqueue jobs. The worker owns
 * processing. Job names match apps/worker/src/queue.ts.
 */
export const JOBS = {
  discover: "discover",
} as const;

let boss: PgBoss | null = null;

async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  boss = new PgBoss({ connectionString: getEnv().DATABASE_URL });
  await boss.start();
  return boss;
}

export async function enqueueDiscover(data: { runId: string; requestId: string }): Promise<void> {
  const b = await getBoss();
  await b.createQueue(JOBS.discover);
  await b.send(JOBS.discover, data);
}
