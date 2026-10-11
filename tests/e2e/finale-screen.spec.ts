import { expect, test } from "@playwright/test";

const viewports = [
  { name: "SE", width: 320, height: 568 },
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
  for (const kind of ["prepare", "finish"] as const) {
    test(`${kind} fits ${viewport.name} and can continue with either coach`, async ({
      browser,
      baseURL,
    }) => {
      for (const companion of ["max", "lika"] as const) {
        const page = await browser.newPage({ viewport, reducedMotion: "reduce", baseURL });
        const privateCalls: string[] = [];
        page.on("request", (request) => {
          if (request.url().includes("/api/")) privateCalls.push(request.url());
        });
        await page.addInitScript(
          ({ kind, companion }) => {
            localStorage.setItem(
              "miron:story-preview:v2",
              JSON.stringify({
                flowVersion: 3,
                step: kind === "prepare" ? 5 : 6,
                interests: ["home", "yoga"],
                locations: [],
                companion,
                completed: false,
              }),
            );
          },
          { kind, companion },
        );
        await page.clock.install();
        await page.clock.pauseAt(new Date());
        await page.goto("/story");
        await expect(page.getByRole("heading", { level: 1 })).toContainText(
          kind === "prepare" ? "ПРОСТРАНСТВО" : "ГОТОВО",
        );
        await page.evaluate(() => document.fonts.ready);
        await page
          .locator('[data-art][aria-hidden="false"] img')
          .evaluate((image) => (image as HTMLImageElement).decode());
        await expect(
          page.locator(`[aria-label="Сцена ${kind === "prepare" ? 6 : 7} из 7"]`),
        ).toBeVisible();
        await expect(page.getByRole("main")).toHaveAttribute("data-persona", companion);
        const geometry = await page.evaluate(() => {
          const title = document.querySelector("h1");
          return {
            fits:
              document.documentElement.scrollHeight <= innerHeight + 1 &&
              document.documentElement.scrollWidth <= innerWidth + 1,
            titleFits: !!title && title.scrollWidth <= title.clientWidth + 1,
            controlsFit: [...document.querySelectorAll("button")].every((button) => {
              const rect = button.getBoundingClientRect();
              const hit = document.elementFromPoint(
                rect.x + rect.width / 2,
                rect.y + rect.height / 2,
              );
              return (
                rect.height >= 44 &&
                rect.top >= 0 &&
                rect.bottom <= innerHeight &&
                rect.left >= 0 &&
                rect.right <= innerWidth &&
                (hit === button || (hit !== null && button.contains(hit)))
              );
            }),
          };
        });
        expect(geometry).toEqual({ fits: true, titleFits: true, controlsFit: true });
        expect(
          await page
            .locator('[aria-label="История знакомства"]')
            .evaluate((el) => getComputedStyle(el).animationName),
        ).toBe("none");
        if (kind === "prepare") {
          await page.clock.runFor(160);
          await expect(page.locator('[class*="steps"] li[data-state="done"]')).toHaveCount(2);
          await expect(page.getByRole("button", { name: "Можно без ожидания" })).toHaveCount(0);
          if (viewport.width <= viewport.height) {
            const fillsScene = await page
              .locator('[data-art][aria-hidden="false"] picture')
              .evaluate((picture) => {
                const scene = picture.closest("section");
                const art = picture.parentElement;
                if (!scene || !art) return false;
                const a = art.getBoundingClientRect();
                const s = scene.getBoundingClientRect();
                return (
                  Math.abs(a.x - s.x) <= 1 &&
                  Math.abs(a.y - s.y) <= 1 &&
                  Math.abs(a.width - s.width) <= 1 &&
                  Math.abs(a.height - s.height) <= 1
                );
              });
            expect(fillsScene).toBe(true);
            expect(
              await page
                .locator('[data-art][aria-hidden="false"] img')
                .evaluate((img) => (img as HTMLImageElement).currentSrc),
            ).toContain("preparation-mobile-v1.webp");
          }
          await page.clock.runFor(240);
          await expect(page.getByRole("heading", { level: 1 })).toContainText("ГОТОВО");
          await page.clock.runFor(1000);
          await expect(page.getByRole("heading", { level: 1 })).toContainText("ГОТОВО");
        } else {
          await page.getByRole("button", { name: "Погнали", exact: true }).focus();
          await page.keyboard.press("Enter");
          await expect(page).toHaveURL(/\/story\/home$/);
          await expect(page.getByRole("main")).toHaveAttribute("data-persona", companion);
        }
        expect(privateCalls).toEqual([]);
        await page.close();
      }
    });
  }
}
