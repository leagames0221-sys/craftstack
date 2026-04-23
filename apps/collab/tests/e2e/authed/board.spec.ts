import { expect, test } from "@playwright/test";

const BOARD_PATH = "/w/e2e/b/seed-e2e-board";

test.describe("Board view (authed)", () => {
  test("renders seeded lists and cards", async ({ page }) => {
    await page.goto(BOARD_PATH);
    await expect(
      page.getByRole("heading", { name: /E2E board/i }),
    ).toBeVisible();
    await expect(page.getByText("To do")).toBeVisible();
    await expect(page.getByText("Done")).toBeVisible();
    await expect(page.getByText("E2E card 1")).toBeVisible();
  });

  test("URL-as-state: search param filters visible cards", async ({ page }) => {
    await page.goto(`${BOARD_PATH}?q=card%202`);
    await expect(page.getByText("E2E card 2")).toBeVisible();
    // Filtered out:
    await expect(page.getByText("E2E card 1")).not.toBeVisible();
  });

  test("REST: /api/cards/:id/move rejects under-specified body with 400", async ({
    request,
  }) => {
    const searchRes = await request.get(
      `/api/search?q=${encodeURIComponent("E2E card 3")}`,
    );
    const search = (await searchRes.json()) as {
      cards: Array<{ id: string; boardId: string }>;
    };
    const card = search.cards.find((c) => c.boardId === "seed-e2e-board");
    expect(card, "found E2E card 3 via search").toBeTruthy();

    // Move body requires version + listId (+ optional beforeId/afterId).
    // Empty body must produce a 400 shape error, not a 500 crash.
    const bad = await request.post(`/api/cards/${card!.id}/move`, {
      data: {},
    });
    expect(bad.status()).toBe(400);
  });
});
