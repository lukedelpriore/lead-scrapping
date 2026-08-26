import { test, expect } from "@playwright/test";

/**
 * Smoke test. Sign in, view the dashboard, open the seeded demo request, watch
 * its scorecard, and open the Review and Already have tabs. The seeded demo run
 * stands in for a completed demo run since the worker is not driven here and
 * live discovery is offline. Also exercises the New request draft path.
 */

const EMAIL = "luke@delpriorehospitality.com";
const PASSWORD = process.env.SEED_PASSWORD ?? "devpassword";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}

test("sign in and see the dashboard ledger", async ({ page }) => {
  await signIn(page);
  await expect(page.getByText("Export credits, plan year ending")).toBeVisible();
  await expect(page.getByRole("link", { name: "New request" })).toBeVisible();
});

test("open the demo request and watch the scorecard and tabs", async ({ page }) => {
  await signIn(page);
  await page.goto("/requests");
  await expect(page.getByRole("link", { name: "Demo Florida Tier 1" })).toBeVisible();
  await page.getByRole("link", { name: "Demo Florida Tier 1" }).click();
  await page.waitForURL(/\/requests\/.+/);

  // Scorecard cells (exact so the empty-state sentence mentioning Reveal does
  // not also match).
  await expect(page.getByText("Discover", { exact: true })).toBeVisible();
  await expect(page.getByText("Reveal", { exact: true })).toBeVisible();

  // Review tab shows ready candidates.
  await page.getByRole("link", { name: "Review" }).click();
  await expect(page.getByText(/Demo Contact/).first()).toBeVisible();

  // Already have tab shows duplicates.
  await page.getByRole("link", { name: "Already have" }).click();
  await expect(page.getByText("delivered").first()).toBeVisible();
});

test("open the new request form and save a draft", async ({ page }) => {
  await signIn(page);
  await page.goto("/requests/new");
  await page.locator('input[name="name"]').fill("Smoke Test Draft");
  await page.locator('select[name="states"]').selectOption("FL");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForURL("**/requests");
  await expect(page.getByText("Smoke Test Draft")).toBeVisible();
});
