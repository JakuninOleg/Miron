import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

async function settled(page: Page) {
  await expect(page.locator('[aria-label="История знакомства"]')).toHaveAttribute(
    "aria-busy",
    "false",
  );
}
async function next(page: Page, name: string | RegExp = /^(Дальше|Круто, дальше|Давай дальше)$/) {
  await settled(page);
  await page.getByRole("button", { name, exact: true }).click();
  if (name === "Погнали") {
    await expect(page).toHaveURL(/\/story\/home$/);
  } else {
    await settled(page);
  }
}
async function capture(page: Page, path: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.images]
          .filter((image) => image.getClientRects().length > 0)
          .every((image) => image.complete && image.naturalWidth > 0),
      ),
    )
    .toBe(true);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
}
async function reachChoice(page: Page, screenshots = false) {
  await next(page, "Давай знакомиться");
  if (screenshots) await capture(page, ".local/previews/story-v2-max.png");
  await next(page);
  if (screenshots) await capture(page, ".local/previews/story-v2-lika.png");
  await next(page);
  await page.getByRole("button", { name: "Йога", exact: true }).click();
  await page.getByRole("button", { name: "Силовые дома", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Йога", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  if (screenshots) await capture(page, ".local/previews/story-v2-interests.png");
  await next(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("С кем начнём?");
  await expect(page.locator('[aria-label="Сцена 5 из 7"]')).toBeVisible();
  await expect(page.getByRole("group", { name: "Где тебе удобно заниматься" })).toHaveCount(0);
}

test("V2 story saves optional context, switches coach, returns home and replays without private writes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const privateCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) privateCalls.push(request.url());
  });
  await page.goto("/story");
  await expect(page).toHaveURL(/\/story$/);
  await page.evaluate(() => localStorage.setItem("miron:unrelated-test", "preserved"));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Привет");
  await reachChoice(page);
  await expect(page.getByRole("button", { name: "Начать с Максом" })).toBeDisabled();
  await page.getByRole("button", { name: /^МАКС Энергия/ }).click();
  await next(page, "Начать с Максом");
  await expect(page.getByRole("heading", { name: /^Готово/ })).toBeVisible();
  await next(page, "Погнали");
  await expect(page).toHaveURL(/\/story\/home$/);
  await page.getByRole("button", { name: "Открыть профиль", exact: true }).click();
  await page.getByRole("button", { name: /^Напарники · сейчас/ }).click();
  await page.getByRole("button", { name: /^Лика Внимательная/ }).click();
  await expect(page.getByRole("main")).toHaveAttribute("data-persona", "lika");
  await page.getByRole("button", { name: "Закрыть панель", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("main")).toHaveAttribute("data-persona", "lika");
  await page.goto("/story");
  await expect(page).toHaveURL(/\/story\/home$/);
  await page.getByRole("button", { name: "Открыть профиль", exact: true }).click();
  await page.getByRole("button", { name: "Пройти знакомство заново" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Привет");
  expect(await page.evaluate(() => localStorage.getItem("miron:unrelated-test"))).toBe("preserved");
  expect(privateCalls).toEqual([]);
});

test("blocked storage still allows finish and replay", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === "miron:story-preview:v2")
        throw new DOMException("Storage blocked", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.goto("/story");
  await next(page, "Давай знакомиться");
  for (let index = 0; index < 3; index++) await next(page);
  await page.getByRole("button", { name: /^МАКС Энергия/ }).click();
  await next(page, "Начать с Максом");
  await expect(page.getByRole("heading", { name: /^Готово/ })).toBeVisible();
  await next(page, "Погнали");
  await expect(page).toHaveURL(/\/story\/home$/);
  await page.getByRole("button", { name: "Открыть профиль", exact: true }).click();
  await page.getByRole("button", { name: "Пройти знакомство заново" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Привет");
});

test("mobile panels load all artwork, preserve keyboard focus and honor reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/story/home");
  await expect(page).toHaveURL(/\/story$/);
  await capture(page, ".local/previews/story-v2-welcome.png");
  await page.getByRole("button", { name: "Давай знакомиться" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await page.getByRole("button", { name: "Предыдущая сцена" }).click();
  await reachChoice(page, true);
  await page.getByRole("button", { name: /^ЛИКА Внимание/ }).click();
  await capture(page, ".local/previews/story-v2-choice.png");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page
      .getByRole("heading", { level: 1 })
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  await next(page, "Начать с Ликой");
  await expect(page.getByRole("heading", { name: /^Готово/ })).toBeVisible();
  await capture(page, ".local/previews/story-v2-finish.png");
  await next(page, "Погнали");
  await expect(page).toHaveURL(/\/story\/home$/);
  await capture(page, ".local/previews/story-v2-home.png");
});

test("native transitions and decorative O sequence advance once without program claims", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/story");
  await reachChoice(page);
  await page.getByRole("button", { name: /^ЛИКА Внимание/ }).click();
  await expect
    .poll(() =>
      page.getByRole("main").evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .toBe("rgb(41, 38, 35)");
  await page.clock.install();
  await page.getByRole("button", { name: "Начать с Ликой", exact: true }).click();
  await expect(page.getByRole("button", { name: "Можно без ожидания" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("пространство");
  await expect(page.locator('[aria-label="История знакомства"]')).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.getByRole("heading", { level: 1 })).toContainText("пространство");
  await expect(page.locator('[class*="steps"] li[data-state="active"]')).toHaveCount(1);
  await page.clock.fastForward(3100);
  await expect(page.locator('[class*="steps"] li[data-state="done"]')).toHaveCount(1);
  await capture(page, ".local/previews/story-v2-preparation.png");
  await page.clock.fastForward(10000);
  await page.clock.runFor(350);
  await expect(page.getByRole("heading", { name: /^Готово/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Погнали", exact: true })).toBeEnabled();
  await expect(page.getByText("Твой первый план собран.", { exact: true })).toHaveCount(0);
});
