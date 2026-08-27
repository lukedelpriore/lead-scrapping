import PgBoss from "pg-boss";
import { getEnv } from "@dph/config";

/**
 * Minimal pg-boss client for the web app to enqueue jobs. The worker processes
 * them. Job names match apps/worker/src/queue.ts.
 */
export const JOBS = {
  runSearch: "run-search",
  revealBatch: "reveal-batch",
} as const;

let boss: PgBoss | null = null;

async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  boss = new PgBoss({ connectionString: getEnv().DATABASE_URL });
  await boss.start();
  return boss;
}

export async function enqueueRunSearch(data: { runId: string; requestId: string }): Promise<void> {
  const b = await getBoss();
  await b.createQueue(JOBS.runSearch);
  await b.send(JOBS.runSearch, data);
}

export async function enqueueRevealBatch(data: {
  runId: string;
  requestId: string;
  count: number;
}): Promise<void> {
  const b = await getBoss();
  await b.createQueue(JOBS.revealBatch);
  await b.send(JOBS.revealBatch, data);
}
