import PgBoss from "pg-boss";
import { getEnv } from "@dph/config";

/**
 * pg-boss queue. Postgres backed, no Redis. Section 11. One shared instance
 * per process. Job names are constants so the web app and worker agree.
 */
export const JOBS = {
  discover: "discover",
  runRequest: "run-request",
  runSearch: "run-search",
  revealBatch: "reveal-batch",
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];

export interface RunJobData {
  runId: string;
  requestId: string;
}

export interface RevealBatchData {
  runId: string;
  requestId: string;
  count: number;
}

let boss: PgBoss | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  const env = getEnv();
  boss = new PgBoss({ connectionString: env.DATABASE_URL });
  await boss.start();
  return boss;
}

export async function stopBoss(): Promise<void> {
  if (boss) {
    await boss.stop();
    boss = null;
  }
}
