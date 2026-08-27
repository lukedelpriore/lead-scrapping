import { getEnv } from "@dph/config";
import { prisma } from "@dph/db";
import { logger } from "./logger";
import { getBoss, stopBoss, JOBS, type RunJobData, type RevealBatchData } from "./queue";
import { runDiscoverJob } from "./jobs/discover";
import { runRequestJob } from "./jobs/run-request";
import { runSearchJob } from "./jobs/run-search";
import { revealBatchJob } from "./jobs/reveal-batch";

/**
 * Worker entry point. Boots pg-boss and registers the pipeline jobs. M2 wires
 * discovery; qualify, find, reveal, and deliver land in M3 and M4. REVEAL_MODE
 * stays off, so no reveal job spends a credit during the build.
 */
async function main() {
  const env = getEnv();
  logger.info(
    { revealMode: env.REVEAL_MODE, aiMode: env.AI_MODE, placesEnabled: env.PLACES_ENABLED },
    "worker starting",
  );
  if (env.REVEAL_MODE !== "off") {
    logger.warn("REVEAL_MODE is not off. During the build it must stay off.");
  }

  const boss = await getBoss();
  await boss.createQueue(JOBS.discover);
  await boss.createQueue(JOBS.runRequest);
  await boss.createQueue(JOBS.runSearch);
  await boss.createQueue(JOBS.revealBatch);

  // General business search: discover businesses, find owners. No credits.
  await boss.work<RunJobData>(JOBS.runSearch, async (jobs) => {
    for (const job of jobs) {
      logger.info({ jobId: job.id, data: job.data }, "run-search job received");
      await failRunOnError(job.data, () => runSearchJob(job.data));
    }
  });

  // Verify a capped batch of owner cells, then deliver. Spends credits.
  await boss.work<RevealBatchData>(JOBS.revealBatch, async (jobs) => {
    for (const job of jobs) {
      logger.info({ jobId: job.id, data: job.data }, "reveal-batch job received");
      try {
        await revealBatchJob(job.data);
      } catch (err) {
        logger.error({ err, runId: job.data.runId }, "reveal-batch failed");
        throw err;
      }
    }
  });

  // Venue pipeline kept for the original flow.
  await boss.work<RunJobData>(JOBS.discover, async (jobs) => {
    for (const job of jobs) {
      await failRunOnError(job.data, () => runDiscoverJob(job.data));
    }
  });
  await boss.work<RunJobData>(JOBS.runRequest, async (jobs) => {
    for (const job of jobs) {
      await failRunOnError(job.data, () => runRequestJob(job.data));
    }
  });

  logger.info("worker ready, run-search and reveal-batch jobs registered");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "worker shutting down");
    await stopBoss();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await new Promise<void>(() => {});
}

async function failRunOnError(
  data: RunJobData,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await prisma.run.update({ where: { id: data.runId }, data: { status: "running" } });
    await fn();
  } catch (err) {
    logger.error({ err, runId: data.runId }, "job failed");
    await prisma.run.update({ where: { id: data.runId }, data: { status: "failed" } });
    await prisma.request.update({ where: { id: data.requestId }, data: { status: "failed" } });
    throw err;
  }
}

main().catch((err) => {
  logger.error({ err }, "worker failed to start");
  process.exit(1);
});
