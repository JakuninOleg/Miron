import { expect, test } from "@playwright/test";

const viewports = [
  { name: "SE 1", width: 320, height: 568 },
  { name: "SE 2/3", width: 375, height: 667 },
  { name: "SE browser controls", width: 375, height: 548 },
  { name: "iPhone", width: 390, height: 844 },
  { name: "large iPhone", width: 440, height: 956 },
  { name: "Android", width: 412, height: 915 },
  { name: "iPad mini", width: 768, height: 1024 },
  { name: "iPad Pro portrait", width: 1032, height: 1376 },
  { name: "iPad Pro landscape", width: 1376, height: 1032 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "desktop reference", width: 1672, height: 941 },
  { name: "full HD", width: 1920, height: 1080 },
  { name: "wide desktop", width: 2560, height: 1440 },
  { name: "phone landscape", width: 667, height: 375 },
];

for (const viewport of viewports) {
  test(`interests fit ${viewport.name} with reachable choices and navigation`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/story/interests");
    await page.evaluate(() => document.fonts.ready);
    const choices = page.getByRole("group", { name: "Направления тренировок" });
    await expect(choices.getByRole("button")).toHaveCount(6);
    const geometry = await page.evaluate(() => ({
      fits:
        document.documentElement.scrollHeight <= innerHeight + 1 &&
        document.documentElement.scrollWidth <= innerWidth + 1,
      reachable: [...document.querySelectorAll("button")].every((button) => {
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
      labelsFit: [...document.querySelectorAll('[class*="cardTitle"]')].every((label) => {
        const card = label.closest("button");
        if (!card) return false;
        const rect = label.getBoundingClientRect();
        const bounds = card.getBoundingClientRect();
        return (
          rect.left >= bounds.left &&
          rect.right <= bounds.right &&
          rect.top >= bounds.top &&
          rect.bottom <= bounds.bottom
        );
      }),
    }));
    expect(geometry).toEqual({ fits: true, reachable: true, labelsFit: true });
    const scene = page.locator('[data-art="interests"] img');
    await expect(scene).toBeVisible();
    await scene.evaluate((img) => (img as HTMLImageElement).decode());
    const portrait = viewport.width / viewport.height <= 1.2 && viewport.height > 450;
    expect(await scene.evaluate((img) => (img as HTMLImageElement).currentSrc)).toContain(
      portrait ? "interests-mobile-v2.webp" : "interests-v2.webp",
    );
    await page.getByRole("button", { name: "Йога", exact: true }).click();
    await expect(page.getByRole("button", { name: "Йога", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Дальше", exact: true }).click();
    await expect(page).toHaveURL(/\/story$/);
    await expect(page.getByRole("group", { name: "Выбери первого напарника" })).toBeVisible();
  });
}

test("multiple directions persist, undecided is exclusive, keyboard return keeps selection", async ({
  page,
}) => {
  const privateCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) privateCalls.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/story/interests");
  const yoga = page.getByRole("button", { name: "Йога", exact: true });
  const home = page.getByRole("button", { name: "Силовые дома", exact: true });
  const explore = page.getByRole("button", { name: "Пока не знаю", exact: true });
  await yoga.focus();
  await page.keyboard.press("Space");
  await home.click();
  await page.reload();
  await expect(yoga).toHaveAttribute("aria-pressed", "true");
  await expect(home).toHaveAttribute("aria-pressed", "true");
  await explore.click();
  await expect(yoga).toHaveAttribute("aria-pressed", "false");
  await expect(home).toHaveAttribute("aria-pressed", "false");
  await expect(explore).toHaveAttribute("aria-pressed", "true");
  await yoga.click();
  await expect(explore).toHaveAttribute("aria-pressed", "false");
  await expect(yoga).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Предыдущая сцена" }).click();
  await expect(page.getByRole("heading", { name: "Лика.", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Давай дальше" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(yoga).toHaveAttribute("aria-pressed", "true");
  expect(privateCalls).toEqual([]);
});

test("directions can be skipped and survive orientation changes without compulsory fields", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/story/interests");
  for (const viewport of [
    { width: 1032, height: 1376 },
    { width: 1376, height: 1032 },
    { width: 667, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("button", { name: "Дальше", exact: true })).toBeInViewport();
  }
  await page.getByRole("button", { name: "Дальше", exact: true }).click();
  await expect(page.getByRole("group", { name: "Выбери первого напарника" })).toBeVisible();
});
