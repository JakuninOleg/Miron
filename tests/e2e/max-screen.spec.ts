import { expect, test } from "@playwright/test";

const viewports = [
  { name: "SE 1", width: 320, height: 568 },
  { name: "SE 2/3", width: 375, height: 667 },
  { name: "SE browser chrome", width: 375, height: 548 },
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
  test(`Max screen fits ${viewport.name}, with readable benefits and reachable navigation`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/story/max");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("МАКС");
    await page.evaluate(() => document.fonts.ready);
    await expect
      .poll(() =>
        page
          .locator("picture img")
          .evaluate(
            (image) =>
              image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
          ),
      )
      .toBe(true);
    await expect(
      page.getByRole("list", { name: "Как помогает Макс" }).getByRole("listitem"),
    ).toHaveCount(4);
    const bounds = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll("button, h1, h2")];
      return {
        documentFits:
          document.documentElement.scrollHeight <= innerHeight + 1 &&
          document.documentElement.scrollWidth <= innerWidth + 1,
        allFit: nodes.every((node) => {
          const rect = node.getBoundingClientRect();
          return (
            rect.top >= 0 &&
            rect.bottom <= innerHeight &&
            rect.left >= 0 &&
            rect.right <= innerWidth
          );
        }),
        controlsReachable: [...document.querySelectorAll("button")].every((button) => {
          const rect = button.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return rect.height >= 44 && (hit === button || (hit !== null && button.contains(hit)));
        }),
      };
    });
    expect(bounds).toEqual({ documentFits: true, allFit: true, controlsReachable: true });
    await page.getByRole("button", { name: "Круто, дальше", exact: true }).click();
    await expect(page).toHaveURL(/\/story$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ЛИКА");
  });
}

test("Max comic panels are three distinct images with different scenes", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/story/max");
  const aside = page.getByRole("complementary", { name: "Знакомство с Максом в комиксе" });
  const images = aside.getByRole("img");
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
  const sources = await images.evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLImageElement).currentSrc),
  );
  expect(new Set(sources).size).toBe(3);
  for (const image of await images.all()) {
    const rect = await image.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(941);
  }
});

test("keyboard navigation, return to first scene and reduced motion survive orientation changes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 548 });
  await page.goto("/story/first");
  await page.getByRole("button", { name: "Давай знакомиться" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "МАКС", exact: true })).toBeFocused();
  expect(
    await page
      .locator('[aria-label="История знакомства"]')
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
  for (const viewport of [
    { width: 667, height: 375 },
    { width: 1032, height: 1376 },
    { width: 1376, height: 1032 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page
        .getByRole("button", { name: "Круто, дальше" })
        .evaluate((button) => button.getBoundingClientRect().bottom <= innerHeight),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Предыдущая сцена" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ПРИВЕТ!");
  await page.getByRole("button", { name: "Давай знакомиться" }).click();
  await expect(page.getByRole("heading", { name: "МАКС", exact: true })).toBeFocused();
});
