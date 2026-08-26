import { getEnv } from "@dph/config";
import { logger } from "./logger";

/**
 * Worker entry point. In M0 this validates the environment, confirms it can
 * reach the database, and stays up. Job registration (Overpass, RocketReach
 * search, qualify, find, reveal, deliver) lands in M2 through M4 on pg-boss.
 */
async function main() {
  const env = getEnv();
  logger.info(
    { revealMode: env.REVEAL_MODE, aiMode: env.AI_MODE, placesEnabled: env.PLACES_ENABLED },
    "worker starting",
  );

  if (env.REVEAL_MODE !== "off") {
    logger.warn(
      "REVEAL_MODE is not off. During the build it must stay off; no reveal jobs will run.",
    );
  }

  // pg-boss job wiring is added in M2. Keep the process alive for now.
  logger.info("worker ready, waiting for jobs (job registration lands in M2)");

  const shutdown = (signal: string) => {
    logger.info({ signal }, "worker shutting down");
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Keep alive.
  await new Promise<void>(() => {});
}

main().catch((err) => {
  logger.error({ err }, "worker failed to start");
  process.exit(1);
});
