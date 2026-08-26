import { getEnv } from "@dph/config";
import { prisma } from "@dph/db";
import { logger } from "./logger";
import { getBoss, stopBoss, JOBS, type RunJobData } from "./queue";
import { runDiscoverJob } from "./jobs/discover";

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

  await boss.work<RunJobData>(JOBS.discover, async (jobs) => {
    for (const job of jobs) {
      logger.info({ jobId: job.id, data: job.data }, "discover job received");
      try {
        await prisma.run.update({ where: { id: job.data.runId }, data: { status: "running" } });
        await runDiscoverJob(job.data);
      } catch (err) {
        logger.error({ err, runId: job.data.runId }, "discover job failed");
        await prisma.run.update({ where: { id: job.data.runId }, data: { status: "failed" } });
        await prisma.request.update({ where: { id: job.data.requestId }, data: { status: "failed" } });
        throw err;
      }
    }
  });

  logger.info("worker ready, discover job registered");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "worker shutting down");
    await stopBoss();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await new Promise<void>(() => {});
}

main().catch((err) => {
  logger.error({ err }, "worker failed to start");
  process.exit(1);
});
