import { expect, test } from "@playwright/test";

test("home loads and navigation to about works", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Next.js bootstrap is ready." })).toBeVisible();

  await page.getByRole("link", { name: "About this migration" }).click();

  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("heading", { level: 1, name: "About Skull King v2 migration" })).toBeVisible();
});
