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
  test(`Lika fits ${viewport.name} without scrolling, with accessible controls and readable features`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/story/lika");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ЛИКА");
    await page.evaluate(() => document.fonts.ready);
    await expect
      .poll(() =>
        page
          .locator("picture img")
          .evaluate(
            (node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0,
          ),
      )
      .toBe(true);
    await expect(
      page.getByRole("list", { name: "Как помогает Лика" }).getByRole("listitem"),
    ).toHaveCount(4);
    const geometry = await page.evaluate(() => ({
      pageFits:
        document.documentElement.scrollHeight <= innerHeight + 1 &&
        document.documentElement.scrollWidth <= innerWidth + 1,
      contentFits: [...document.querySelectorAll("button, h1, h2")].every((node) => {
        const rect = node.getBoundingClientRect();
        return (
          rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth
        );
      }),
      reachable: [...document.querySelectorAll("button")].every((button) => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return rect.height >= 44 && (hit === button || (hit !== null && button.contains(hit)));
      }),
    }));
    expect(geometry).toEqual({ pageFits: true, contentFits: true, reachable: true });
    await page.getByRole("button", { name: "Давай дальше", exact: true }).click();
    await expect(page).toHaveURL(/\/story$/);
    await expect(page.getByRole("group", { name: "Что тебе интересно" })).toBeVisible();
  });
}

test("Lika has three independent comic images with distinct scenes", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/story/lika");
  const images = page
    .getByRole("complementary", { name: "Знакомство с Ликой в комиксе" })
    .getByRole("img");
  await expect(images).toHaveCount(3);
  await expect
    .poll(() =>
      images.evaluateAll((nodes) =>
        nodes.every(
          (node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0,
        ),
      ),
    )
    .toBe(true);
  expect(
    new Set(
      await images.evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLImageElement).currentSrc),
      ),
    ).size,
  ).toBe(3);
});

test("Max to Lika changes accents, preserves context and supports keyboard return with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 548 });
  await page.goto("/story/max");
  const before = await page
    .getByRole("heading", { level: 1 })
    .evaluate((node) => getComputedStyle(node).color);
  await page.getByRole("button", { name: "Круто, дальше" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "ЛИКА", exact: true })).toBeFocused();
  const after = await page
    .getByRole("heading", { level: 1 })
    .evaluate((node) => getComputedStyle(node).color);
  expect(after).not.toBe(before);
  expect(
    await page
      .locator('[aria-label="История знакомства"]')
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
  await page.reload();
  await expect(page.getByRole("heading", { name: "ЛИКА", exact: true })).toBeFocused();
  for (const viewport of [
    { width: 1032, height: 1376 },
    { width: 1376, height: 1032 },
    { width: 667, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page
        .getByRole("button", { name: "Давай дальше" })
        .evaluate((node) => node.getBoundingClientRect().bottom <= innerHeight),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Предыдущая сцена" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "МАКС", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Круто, дальше" }).click();
  await expect(page.getByRole("heading", { name: "ЛИКА", exact: true })).toBeFocused();
});
