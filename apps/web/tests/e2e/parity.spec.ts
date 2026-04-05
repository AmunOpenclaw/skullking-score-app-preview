import { expect, test, type Page } from "@playwright/test";

async function resetLocalState(page: Page) {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
}

async function startGameFromSetup(page: Page, players: string[]) {
  await page.goto("/setup");

  for (const player of players) {
    await page.getByTestId("setup-player-input").fill(player);
    await page.getByTestId("setup-add-player").click();
    await expect(page.getByTestId(`setup-player-chip-${player}`)).toBeVisible();
  }

  await page.getByTestId("setup-start-game").click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByRole("heading", { level: 1, name: "Round entry" })).toBeVisible();
}

async function saveRound(page: Page, cards: number, entries: Array<{ bid: number; won: number; bonus?: number }>) {
  await page.getByTestId("game-cards-input").fill(String(cards));

  for (const [index, entry] of entries.entries()) {
    await page.getByTestId(`game-entry-bid-${index}`).fill(String(entry.bid));
    await page.getByTestId(`game-entry-won-${index}`).fill(String(entry.won));
    await page.getByTestId(`game-entry-bonus-${index}`).fill(String(entry.bonus ?? 0));
  }

  await page.getByTestId("game-save-round").click();
}

test.beforeEach(async ({ page }) => {
  await resetLocalState(page);
});

test("history edit + export/share + continue existing from setup", async ({ page }) => {
  await startGameFromSetup(page, ["Alice", "Bob"]);

  await saveRound(page, 2, [
    { bid: 1, won: 1, bonus: 0 },
    { bid: 1, won: 1, bonus: 0 },
  ]);
  await expect(page.getByText("1 rounds saved")).toBeVisible();

  await Promise.all([
    page.waitForURL(/\/history$/),
    page.getByTestId("game-link-history").click(),
  ]);

  await page.getByTestId("history-edit-round-0").click();
  await page.getByTestId("history-edit-bonus-0").fill("10");
  await page.getByTestId("history-save-round-0").click();

  await expect(page.getByTestId("history-round-0")).toContainText("30");
  await expect(page.getByTestId("history-round-0")).toContainText("20");

  const [csvDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("history-export-csv").click(),
  ]);
  expect(csvDownload.suggestedFilename()).toBe("skullking-score.csv");

  const [jsonDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("history-export-json").click(),
  ]);
  expect(jsonDownload.suggestedFilename()).toBe("skullking-score.json");

  await page.evaluate(() => {
    Object.defineProperty(window.navigator, "share", {
      configurable: true,
      value: async () => undefined,
    });
  });

  await page.getByTestId("history-share-summary").click();
  await expect(page.getByText("Summary shared (or copied) successfully.")).toBeVisible();

  await page.getByRole("link", { name: "Setup" }).click();
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByTestId("setup-continue-game").click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByText("1 rounds saved")).toBeVisible();
});

test("turn mode + leave/return player transitions", async ({ page }) => {
  await startGameFromSetup(page, ["Alice", "Bob", "Charlie"]);

  await page.getByTestId("game-mode-turn").click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByTestId("game-entry-row-0")).toBeVisible();

  await page.getByTestId("game-turn-next").click();
  await expect(page.getByTestId("game-entry-row-1")).toBeVisible();

  await page.getByTestId("game-mode-grid").click();
  await expect(page.locator("tbody tr")).toHaveCount(3);

  await page.getByTestId("game-leave-select").selectOption({ label: "Bob" });
  await page.getByTestId("game-leave-button").click();

  await expect(page.getByTestId("game-entry-row-1")).toHaveCount(0);

  await page.getByTestId("game-toggle-inactive").click();
  await expect(page.getByTestId("game-entry-row-1")).toContainText("Bob (left)");

  await page.getByTestId("game-return-select").selectOption({ label: "Bob" });
  await page.getByTestId("game-return-button").click();
  await expect(page.getByTestId("game-entry-row-1")).not.toContainText("(left)");
});

test("setup player library persists across reload", async ({ page }) => {
  await page.goto("/setup");

  await page.getByTestId("setup-player-input").fill("Milo");
  await page.getByTestId("setup-add-player").click();

  await page.getByTestId("setup-player-input").fill("Nora");
  await page.getByTestId("setup-add-player").click();

  await expect(page.getByTestId("setup-player-chip-Milo")).toBeVisible();
  await expect(page.getByTestId("setup-player-chip-Nora")).toBeVisible();

  await page.reload();

  await expect(page.getByTestId("setup-player-chip-Milo")).toBeVisible();
  await expect(page.getByTestId("setup-player-chip-Nora")).toBeVisible();
  await expect(page.getByText("Library size")).toBeVisible();
  await expect(page.getByText("Selected players")).toBeVisible();
});
