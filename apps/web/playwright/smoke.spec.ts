import { test, expect } from "@playwright/test";

/**
 * Smoke test for Lead Finder. Sign in, land on the Find leads page, see the
 * credit meter and the command box, then open the seeded demo search and
 * check the results: stats, the owner table, the verify panel, and the CSV
 * link. The seeded demo run stands in for a completed run since the worker is
 * not driven here and live discovery is offline.
 */

const EMAIL = "luke@delpriorehospitality.com";
const PASSWORD = process.env.SEED_PASSWORD ?? "devpassword";
const DEMO_SEARCH = "Roofing companies in Ohio, Michigan";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/search");
}

test("sign in and see the find leads page", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Find leads" })).toBeVisible();
  await expect(page.getByText("Who do you want to find?")).toBeVisible();
  await expect(page.getByText("Verified contacts left")).toBeVisible();
  // The command box is present and ready to accept a plain words search.
  await expect(page.getByLabel("Describe who to find")).toBeVisible();
});

test("open the demo search and see owners and the verify panel", async ({ page }) => {
  await signIn(page);

  // The seeded demo shows in recent searches.
  await expect(page.getByRole("link", { name: DEMO_SEARCH })).toBeVisible();
  await page.getByRole("link", { name: DEMO_SEARCH }).click();
  await page.waitForURL(/\/search\/.+/);

  // Result stats.
  await expect(page.getByText("Businesses found")).toBeVisible();
  await expect(page.getByText("Owner names found")).toBeVisible();
  await expect(page.getByText("Cells verified")).toBeVisible();

  // A seeded business and owner appear in the table.
  await expect(page.getByText("Summit Roofing Co").first()).toBeVisible();
  await expect(page.getByText("Marcus Hale").first()).toBeVisible();

  // The verify panel and CSV download are available.
  await expect(page.getByText("Verify owner cells")).toBeVisible();
  await expect(page.getByRole("button", { name: "Verify this batch" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download CSV" })).toBeVisible();
});

test("the nav links to the main sections", async ({ page }) => {
  await signIn(page);
  // Each label renders in both the desktop rail and the phone bottom bar, so
  // match the first visible instance.
  await expect(page.getByRole("link", { name: "Find leads" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Leads", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Do not contact" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" }).first()).toBeVisible();
});
