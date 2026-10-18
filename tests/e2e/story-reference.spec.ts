import { expect, test } from "@playwright/test";

const scenes = [
  { route: "first", heading: "Привет!", cta: "Давай знакомиться" },
  { route: "max", heading: "Макс.", cta: "Круто, дальше" },
  { route: "lika", heading: "Лика.", cta: "Давай дальше" },
];
const sizes = [
  { name: "reference", width: 1586, height: 992 },
  { name: "reported wide viewport", width: 2560, height: 1290 },
  { name: "phone", width: 390, height: 844 },
  { name: "small phone", width: 375, height: 548 },
];
for (const size of sizes)
  for (const scene of scenes) {
    test(`reference composition: ${scene.route} at ${size.name}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/story/${scene.route}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(scene.heading);
      await page.evaluate(() => document.fonts.ready);
      const art = page.locator("section > picture img");
      await expect
        .poll(() =>
          art.evaluate(
            (node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0,
          ),
        )
        .toBe(true);
      const geometry = await page.evaluate(() => {
        const image = document.querySelector("section > picture img");
        const header = document.querySelector("main > header");
        const title = document.querySelector("h1");
        if (!(image instanceof HTMLImageElement) || !header || !title)
          throw new Error("Scene missing");
        const rect = image.getBoundingClientRect();
        const parent = image.parentElement;
        if (!parent) throw new Error("Picture missing");
        const titleRect = title.getBoundingClientRect();
        const stageRect = document.querySelector("main > section")!.getBoundingClientRect();
        return {
          fit: getComputedStyle(image).objectFit,
          imageTransform: getComputedStyle(image).transform,
          frameRadius: getComputedStyle(parent).borderRadius,
          imageFits:
            rect.top >= -1 &&
            rect.left >= -1 &&
            rect.right <= innerWidth + 1 &&
            rect.bottom <= innerHeight + 1,
          noOpaqueHeader: getComputedStyle(header).backgroundColor === "rgba(0, 0, 0, 0)",
          titleSize: parseFloat(getComputedStyle(title).fontSize),
          titleFits: titleRect.right <= stageRect.right && titleRect.bottom <= innerHeight,
          noScroll: document.documentElement.scrollHeight <= innerHeight + 1,
        };
      });
      expect(geometry.fit).toBe("contain");
      expect(geometry.imageTransform).toBe("none");
      expect(geometry.frameRadius).toBe("0px");
      expect(geometry.imageFits).toBe(true);
      expect(geometry.noOpaqueHeader).toBe(true);
      expect(geometry.titleFits).toBe(true);
      expect(geometry.noScroll).toBe(true);
      if (size.width >= 1500) expect(geometry.titleSize).toBeGreaterThan(90);
      const button = page.getByRole("button", { name: scene.cta, exact: true });
      const buttonRect = await button.boundingBox();
      expect(buttonRect).not.toBeNull();
      expect(buttonRect!.height).toBeGreaterThanOrEqual(size.width >= 1500 ? 70 : 44);
      if (size.width >= 1500 && scene.route !== "first") {
        const introDescription = page.locator("section > div > p").last();
        const firstBenefit = page.getByRole("listitem").first();
        const desc = await introDescription.boundingBox();
        const benefit = await firstBenefit.boundingBox();
        expect(desc).not.toBeNull();
        expect(benefit).not.toBeNull();
        expect(desc!.y + desc!.height + 16).toBeLessThanOrEqual(benefit!.y);
      }
    });
  }
for (const viewport of [
  { width: 1586, height: 992 },
  { width: 390, height: 844 },
]) {
  test(`header remains stable across scenes at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const measures = [];
    for (const route of ["first", "max", "lika", "interests", "choose"]) {
      await page.goto(`/story/${route}`);
      await page.evaluate(() => document.fonts.ready);
      measures.push(
        await page.locator("main > header").evaluate((header) => {
          const logo = header.querySelector("img")!;
          const counter = header.querySelector('[aria-label^="Сцена"]')!;
          const r = header.getBoundingClientRect();
          return {
            height: r.height,
            logoWidth: logo.getBoundingClientRect().width,
            counterFont: getComputedStyle(counter.querySelector("span:last-child")!).fontSize,
          };
        }),
      );
    }
    for (const measure of measures) expect(measure).toEqual(measures[0]);
  });
}
