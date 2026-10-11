import { expect, test, type Page } from "@playwright/test";

async function openDashboard(page: Page, companion: "max" | "lika" = "max") {
  await page.addInitScript((coach) => {
    localStorage.setItem(
      "miron:story-preview:v2",
      JSON.stringify({
        flowVersion: 3,
        step: 6,
        interests: ["strength", "mobility"],
        locations: [],
        companion: coach,
        completed: true,
      }),
    );
    localStorage.setItem("miron:unrelated-preview-test", "preserved");
  }, companion);
  await page.goto("/story/home");
  await expect(page.getByRole("main")).toHaveAttribute("data-persona", companion);
  await page.evaluate(() => document.fonts.ready);
}

async function openCompanions(page: Page) {
  await page.getByRole("button", { name: "Открыть профиль", exact: true }).click();
  await page.getByRole("button", { name: /^Напарники · сейчас/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("dashboard drafts are honest, separate per coach and never sent or persisted", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const privateCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) privateCalls.push(request.url());
  });
  await openDashboard(page);
  const input = page.getByRole("textbox", { name: "Сообщение напарнику" });
  await page.getByRole("button", { name: "Просто потренироваться", exact: true }).click();
  await expect(input).toHaveValue("Хочу потренироваться сейчас.");
  await expect(input).toBeFocused();
  await input.fill("Хочу занятие дома. Есть 40 минут.");
  await page.getByRole("button", { name: "Что приготовить?", exact: true }).click();
  await expect(input).toHaveValue("Хочу занятие дома. Есть 40 минут.");
  await page.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Мы ничего не отправляли" }),
  ).toBeVisible();
  await expect(input).toHaveValue("Хочу занятие дома. Есть 40 минут.");
  await openCompanions(page);
  await page.getByRole("button", { name: /^Лика Внимательная/ }).click();
  await page.getByRole("button", { name: "Закрыть панель", exact: true }).click();
  await expect(page.getByRole("main")).toHaveAttribute("data-persona", "lika");
  await expect(input).toHaveValue("");
  await input.fill("Лика, хочу сегодня спокойно.");
  await openCompanions(page);
  await page.getByRole("button", { name: /^Макс Прямой/ }).click();
  await page.getByRole("button", { name: "Закрыть панель", exact: true }).click();
  await expect(input).toHaveValue("Хочу занятие дома. Есть 40 минут.");
  const saved = await page.evaluate(() => localStorage.getItem("miron:story-preview:v2"));
  expect(saved).not.toContain("40 минут");
  expect(saved).not.toContain("спокойно");
  expect(privateCalls).toEqual([]);
});

test("calendar and achievement panels restore keyboard focus and keep empty progress", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openDashboard(page, "lika");
  const calendar = page.getByRole("button", { name: "Добавить в календарь", exact: true });
  await calendar.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Твой календарь", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Следующий месяц", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { level: 3 }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(calendar).toBeFocused();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  await page.getByRole("button", { name: "Как получить", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Пока иконки серые");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Начать голосовой ввод", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("main")).toContainText("Пока без расписания");
  expect(await page.evaluate(() => localStorage.getItem("miron:unrelated-preview-test"))).toBe(
    "preserved",
  );
});

test("offline voice is unavailable and reconnect preserves the dashboard draft", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page, "lika");
  const input = page.getByRole("textbox", { name: "Сообщение напарнику" });
  const microphone = page.getByRole("button", { name: "Начать голосовой ввод", exact: true });
  await input.fill("Лика, хочу спокойно потренироваться.");
  await expect(microphone).toBeEnabled();
  await context.setOffline(true);
  await expect(microphone).toBeDisabled();
  await expect(page.locator("#dashboard-voice-offline")).toHaveText(
    "Голосовой ввод доступен с интернетом. Пока можно вводить текст.",
  );
  await expect(microphone).toHaveAttribute("aria-describedby", /dashboard-voice-offline/);
  await input.fill("Лика, черновик можно изменить без сети.");
  await context.setOffline(false);
  await expect(microphone).toBeEnabled();
  await expect(page.locator("#dashboard-voice-offline")).toHaveCount(0);
  await expect(input).toHaveValue("Лика, черновик можно изменить без сети.");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

for (const companion of ["max", "lika"] as const) {
  test(`${companion} dashboard fits phones, tablets and desktop with a long message`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDashboard(page, companion);
    for (const [width, height] of [
      [320, 568],
      [375, 667],
      [390, 844],
      [440, 956],
      [768, 1024],
      [1024, 1366],
      [1366, 768],
      [1536, 1024],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${width}×${height}`,
      ).toBe(true);
      const start = page.getByRole("button", { name: "Просто потренироваться", exact: true });
      await expect(start).toBeVisible();
      const bounds = await start.boundingBox();
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
      await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
      if (width === 390 || width === 1536 || width === 768 || width === 320) {
        await page.screenshot({
          path: `artifacts/screenshots/dashboard-cjm-${companion}-${width}.png`,
          fullPage: width > 760,
          animations: "disabled",
        });
      }
    }
    await page.setViewportSize({ width: 320, height: 568 });
    await page
      .getByRole("textbox", { name: "Сообщение напарнику" })
      .fill("Длинный черновик без отправки. ".repeat(30));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}
