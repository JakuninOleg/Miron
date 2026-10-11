import { expect, test } from "@playwright/test";

const viewports = [
  { name: "SE 1", width: 320, height: 568 },
  { name: "SE 2/3", width: 375, height: 667 },
  { name: "SE with browser controls", width: 375, height: 548 },
  { name: "iPhone", width: 390, height: 844 },
  { name: "large Android", width: 412, height: 915 },
  { name: "iPad mini portrait", width: 768, height: 1024 },
  { name: "iPad Pro 13 portrait", width: 1032, height: 1376 },
  { name: "iPad Pro 13 landscape", width: 1376, height: 1032 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "desktop reference", width: 1672, height: 941 },
  { name: "desktop full HD", width: 1920, height: 1080 },
  { name: "phone landscape", width: 667, height: 375 },
];

for (const viewport of viewports) {
  test(`first screen fits ${viewport.name} with reachable CTA`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/story/first");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText("ПРИВЕТ!");
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
    const button = page.getByRole("button", { name: "Давай знакомиться", exact: true });
    await expect(button).toBeVisible();
    const geometry = await button.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return {
        documentFits:
          document.documentElement.scrollHeight <= innerHeight + 1 &&
          document.documentElement.scrollWidth <= innerWidth + 1,
        buttonFits:
          rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth,
        reachable: hit === element || (hit !== null && element.contains(hit)),
        height: rect.height,
      };
    });
    expect(geometry.documentFits).toBe(true);
    expect(geometry.buttonFits).toBe(true);
    expect(geometry.reachable).toBe(true);
    expect(geometry.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("button")).toHaveCount(1);
    await expect(page.getByText("КАК ЭТО РАБОТАЕТ", { exact: false })).toHaveCount(0);
    await button.click();
    await expect(page).toHaveURL(/\/story$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("МАКС");
  });
}

test("first screen remains reachable after portrait/landscape resize", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1032, height: 1376 });
  await page.goto("/story/first");
  const button = page.getByRole("button", { name: "Давай знакомиться", exact: true });
  await expect(button).toBeVisible();
  for (const viewport of [
    { width: 1376, height: 1032 },
    { width: 375, height: 548 },
    { width: 667, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() =>
        button.evaluate((element) => element.getBoundingClientRect().bottom <= innerHeight),
      )
      .toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1),
    ).toBe(true);
  }
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("МАКС");
});
