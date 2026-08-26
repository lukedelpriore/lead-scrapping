import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright smoke test config. Uses the pre installed Chromium via an explicit
 * executablePath so no browser download is attempted. Starts the built app on
 * port 3100 with the local environment.
 */
const PORT = 3100;

const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://dph:dph@localhost:5432/dph_lead_engine",
  AUTH_SECRET: process.env.AUTH_SECRET ?? "local_dev_only_secret_change_me_0000000000000",
  AUTH_URL: `http://localhost:${PORT}`,
  ALLOWED_EMAILS: process.env.ALLOWED_EMAILS ?? "luke@delpriorehospitality.com,hashir@delpriorehospitality.com",
  MAIL_FROM: process.env.MAIL_FROM ?? "Del Priore Lead Engine <leads@delpriorehospitality.com>",
  AI_MODE: "off",
  REVEAL_MODE: "off",
  PLACES_ENABLED: "false",
  LOG_LEVEL: "warn",
  TZ: "America/New_York",
  NODE_ENV: "production",
};

export default defineConfig({
  testDir: "./playwright",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    timeout: 60000,
    env,
  },
});
