import { defineConfig } from "vitest/config";

/**
 * Vitest config for the web app. The Playwright end to end specs live under
 * playwright/ and use Playwright's own runner (pnpm test:e2e), so they are
 * excluded here. Without this exclusion vitest would try to collect the
 * playwright specs and fail because Playwright's test() is not a vitest test.
 */
export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "playwright/**",
    ],
  },
});
