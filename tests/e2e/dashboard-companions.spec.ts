import { expect, test, type Page } from "@playwright/test";

async function openDashboard(page: Page, companion: "max" | "lika") {
  await page.addInitScript((coach) => {
    localStorage.setItem(
      "miron:story-preview:v2",
      JSON.stringify({
        flowVersion: 3,
        step: 6,
        interests: ["strength"],
        locations: [],
        companion: coach,
        completed: true,
      }),
    );
  }, companion);
  await page.goto("/story/home");
  await expect(page.getByRole("main")).toHaveAttribute("data-persona", companion);
  await page.evaluate(() => document.fonts.ready);
}

for (const companion of ["max", "lika"] as const) {
  test(`${companion}: separate mascot scene, responsive chat and an actual progress tab`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openDashboard(page, companion);
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [768, 1024],
      [1024, 768],
      [1440, 1000],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      const mobile = page.getByTestId("dashboard-mobile-mascot");
      const desktop = page.getByTestId("dashboard-desktop-mascot");
      if (width <= 850) {
        await expect(mobile).toBeVisible();
        await expect(desktop).toBeHidden();
        const scene = await mobile.boundingBox();
        const content = await page
          .getByRole("heading", { name: "С чего начнём?", exact: true })
          .boundingBox();
        expect(scene).toBeTruthy();
        expect(content).toBeTruthy();
        expect(content!.y).toBeGreaterThanOrEqual(scene!.y + scene!.height);
      } else {
        await expect(desktop).toBeVisible();
        const scene = await desktop.boundingBox();
        const chat = await page.locator("section[data-chat-expanded]").boundingBox();
        expect(scene!.x).toBeGreaterThanOrEqual(chat!.x + chat!.width);
      }
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: `.local/previews/dashboard-${companion}-${width}-v1.png`,
          fullPage: true,
          animations: "disabled",
        });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const input = page.getByRole("textbox", { name: "Сообщение напарнику" });
    await input.fill("Черновик длинного сообщения. ".repeat(35));
    await expect(page.getByTestId("dashboard-mobile-mascot")).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Навигация на телефоне" })).toBeHidden();
    // A short visual viewport exercises the layout budget; native iOS keyboard still needs device QA.
    await page.setViewportSize({ width: 390, height: 460 });
    await expect
      .poll(async () => {
        const bounds = await input.boundingBox();
        return Boolean(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 460);
      })
      .toBe(true);
    await page.screenshot({
      path: `.local/previews/dashboard-${companion}-typing-v1.png`,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Свернуть чат", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("dashboard-mobile-mascot")).toBeVisible();
    await expect(input).toHaveValue("Черновик длинного сообщения. ".repeat(35));
    await page.getByRole("button", { name: "Уровень 1. Открыть прогресс", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Твой прогресс", exact: true })).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Твои достижения", exact: true })).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    await expect(page.getByText("Первое занятие ещё впереди", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "К разговору", exact: true }).click();
    await expect(input).toHaveValue("Черновик длинного сообщения. ".repeat(35));
    expect(errors).toEqual([]);
  });
}
