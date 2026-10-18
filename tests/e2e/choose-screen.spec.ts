import { expect, test } from "@playwright/test";

const viewports = [
  { name: "SE 1", width: 320, height: 568 },
  { name: "SE 2/3", width: 375, height: 667 },
  { name: "browser controls", width: 375, height: 548 },
  { name: "iPhone", width: 390, height: 844 },
  { name: "large phone", width: 440, height: 956 },
  { name: "Android", width: 412, height: 915 },
  { name: "iPad mini", width: 768, height: 1024 },
  { name: "iPad Pro portrait", width: 1032, height: 1376 },
  { name: "iPad Pro landscape", width: 1376, height: 1032 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "desktop", width: 1672, height: 941 },
  { name: "wide desktop", width: 2560, height: 1440 },
  { name: "landscape phone", width: 667, height: 375 },
  { name: "narrow landscape", width: 412, height: 375 },
];

for (const viewport of viewports) {
  test(`choice fits ${viewport.name}, both coaches and navigation remain reachable`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/story/choose");
    await page.evaluate(() => document.fonts.ready);
    const next = page.getByRole("button", { name: "Начать с Максом", exact: true });
    await expect(next).toBeDisabled();
    const group = page.getByRole("group", { name: "Выбери первого напарника" });
    await expect(group.getByRole("button")).toHaveCount(2);
    for (const id of ["max", "lika"]) {
      const coach = page.locator(`button[data-coach="${id}"]`);
      await coach.click();
      await expect(coach).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("main")).toHaveAttribute("data-persona", id);
      const geometry = await page.evaluate(() => ({
        fits:
          document.documentElement.scrollHeight <= innerHeight + 1 &&
          document.documentElement.scrollWidth <= innerWidth + 1,
        controlsFit: [...document.querySelectorAll("button")].every((button) => {
          const rect = button.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return (
            rect.height >= 44 &&
            rect.top >= 0 &&
            rect.bottom <= innerHeight &&
            rect.left >= 0 &&
            rect.right <= innerWidth &&
            (hit === button || (hit !== null && button.contains(hit)))
          );
        }),
        labelsFit: [...document.querySelectorAll('[class*="cardCopy"]')].every((copy) => {
          const card = copy.closest("button");
          if (!card) return false;
          const bounds = card.getBoundingClientRect();
          return [...copy.children]
            .filter((child) => child.getClientRects().length)
            .every((child) => {
              const rect = child.getBoundingClientRect();
              return (
                rect.top >= bounds.top &&
                rect.bottom <= bounds.bottom &&
                rect.left >= bounds.left &&
                rect.right <= bounds.right
              );
            });
        }),
      }));
      expect(geometry).toEqual({ fits: true, controlsFit: true, labelsFit: true });
      if (viewport.width <= viewport.height) {
        const nameTops = await page
          .locator('[class*="coachName"]')
          .evaluateAll((names) => names.map((name) => name.getBoundingClientRect().top));
        expect(Math.abs(nameTops[0] - nameTops[1])).toBeLessThanOrEqual(1);
        if (viewport.width < 600) {
          const cards = await group.boundingBox();
          const action = await page
            .getByRole("button", {
              name: id === "max" ? "Начать с Максом" : "Начать с Ликой",
              exact: true,
            })
            .boundingBox();
          expect(cards).not.toBeNull();
          expect(action).not.toBeNull();
          if (cards && action) {
            const hint = await page.locator('[id="coach-choice-hint"]').boundingBox();
            expect(hint).not.toBeNull();
            if (hint) {
              expect(hint.y).toBeGreaterThanOrEqual(cards.y + cards.height);
              expect(hint.y + hint.height).toBeLessThanOrEqual(action.y);
            }
            expect(cards.height / viewport.height).toBeGreaterThanOrEqual(
              viewport.height <= 700 ? 0.38 : 0.48,
            );
            const gap = action.y - cards.y - cards.height;
            expect(gap).toBeGreaterThanOrEqual(8);
            expect(gap).toBeLessThanOrEqual(48);
          }
        }
      }
    }
    await page.getByRole("button", { name: "Начать с Ликой", exact: true }).click();
    await expect(page).toHaveURL(/\/story$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("пространство");
  });
}

test("keyboard choice persists across reload and back navigation without private requests", async ({
  page,
}) => {
  const privateCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) privateCalls.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/story/choose");
  const lika = page.getByRole("button", { name: "ЛИКА Внимание и баланс", exact: true });
  await lika.focus();
  await page.keyboard.press("Space");
  await expect(lika).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('button[data-coach="max"]')).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(lika).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Предыдущая сцена", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Что тебе");
  await page.getByRole("button", { name: "Дальше", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(lika).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.getByRole("main").evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
  expect(privateCalls).toEqual([]);
});

test("coach accents change within the same neutral scene without moving the header or choices", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/story/choose");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[aria-label="История знакомства"]').evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  const bounds = () => page.locator("main > header").boundingBox();
  const before = await bounds();
  const cardsBefore = await page
    .getByRole("group", { name: "Выбери первого напарника" })
    .boundingBox();
  await page.locator('button[data-coach="lika"]').click();
  const background = await page
    .getByRole("main")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await expect(page.getByRole("main")).toHaveAttribute("data-persona", "lika");
  expect(await bounds()).toEqual(before);
  expect(await page.getByRole("group", { name: "Выбери первого напарника" }).boundingBox()).toEqual(
    cardsBefore,
  );
  await page.locator('button[data-coach="max"]').click();
  expect(await page.getByRole("main").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    background,
  );
  expect(await bounds()).toEqual(before);
  expect(await page.getByRole("group", { name: "Выбери первого напарника" }).boundingBox()).toEqual(
    cardsBefore,
  );
});
