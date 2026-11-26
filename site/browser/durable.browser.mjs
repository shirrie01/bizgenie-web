import { test, expect } from "@playwright/test";

test("requires a durable receipt for browser confirmation and retains the exact payload after outage", async ({ page }) => {
  const origin = process.env.BG_DURABLE_SITE_ORIGIN;
  const leadURL = process.env.BG_DURABLE_LEAD_URL;
  if (!origin || !leadURL ||
      [origin, leadURL].some((value) => new URL(value).hostname !== "127.0.0.1")) {
    throw new Error("Use the synthetic loopback site and lead service");
  }
  const attempts = [];
  await page.route(leadURL, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts.push(route.request().postDataJSON());
    if (attempts.length === 1) {
      return route.fulfill({
        status: 202,
        headers: { "Access-Control-Allow-Origin": origin },
        json: { status: "received" },
      });
    }
    return route.continue();
  });
  await page.goto(origin + "/?utm_source=qa&utm_campaign=release08", { referer: "https://referrer.example.test/" });
  await page.getByRole("link", { name: "Join early access" }).first().click();
  await page.getByLabel(/^Your name/).fill("Synthetic Reviewer");
  await page.getByLabel(/^Business email/).fill("durable-browser@example.test");
  await page.getByLabel(/^Business or company name/).fill("Synthetic Orchard");
  await page.getByLabel(/^Industry/).selectOption("product_brand");
  await page.getByLabel(/I agree that BizGenie may use these details/).check();
  const submit = page.getByRole("button", { name: "Register my interest" });
  await submit.click();
  await expect(page.locator("#status")).toContainText("not available right now");
  await expect(page.locator("#success")).toBeHidden();
  const response = page.waitForResponse((value) => value.url() === leadURL && value.request().method() === "POST");
  await submit.click();
  await expect(page.locator("#success")).toBeVisible();
  const receipt = await (await response).json();
  expect(receipt.reference_id).toMatch(/^ea_[A-Za-z0-9_-]+$/);
  await expect(page.locator("#success")).toContainText(receipt.reference_id);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  if (process.env.BG_DURABLE_SCREENSHOT) await page.screenshot({ path: process.env.BG_DURABLE_SCREENSHOT });
});
