import { expect, test } from "@playwright/test";

const viewports = [
  { name: "SE", width: 320, height: 568 },
  { name: "iPhone", width: 390, height: 844 },
  { name: "large phone", width: 440, height: 956 },
  { name: "portrait tablet", width: 1032, height: 1376 },
  { name: "landscape tablet", width: 1376, height: 1032 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "desktop", width: 1672, height: 941 },
  { name: "wide desktop", width: 2560, height: 1440 },
  { name: "landscape phone", width: 667, height: 375 },
  { name: "narrow landscape", width: 412, height: 375 },
];

for (const viewport of viewports) {
  test(`header geometry stays identical on seven scenes: ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    const measurements = [];
    for (const route of ["first", "max", "lika", "interests", "choose", "prepare", "finish"]) {
      if (route === "prepare" || route === "finish") {
        await page.evaluate((kind) => {
          localStorage.setItem(
            "miron:story-preview:v2",
            JSON.stringify({
              flowVersion: 3,
              step: kind === "prepare" ? 5 : 6,
              interests: [],
              locations: [],
              companion: "max",
              completed: false,
            }),
          );
        }, route);
        await page.goto("/story");
      } else {
        await page.goto(`/story/${route}`);
      }
      await page.locator("main > header").waitFor();
      await page.evaluate(() => document.fonts.ready);
      measurements.push(
        await page.locator("main > header").evaluate((header) => {
          const rect = (element: Element | null) => {
            if (!element) throw new Error("Missing header element");
            const { x, y, width, height } = element.getBoundingClientRect();
            return [x, y, width, height].map((value) => Math.round(value * 100) / 100);
          };
          const logo = header.querySelector('img[alt="MIRON"]');
          const number = header.querySelector('[class*="number"]');
          if (!number) throw new Error("Missing counter");
          return {
            header: rect(header),
            logo: rect(logo),
            counter: rect(number),
            current: rect(number.querySelector('[class*="current"]')),
            total: rect(number.querySelector('[class*="total"]')),
            fontSize: getComputedStyle(number).fontSize,
            lineHeight: getComputedStyle(number).lineHeight,
            fits: header.scrollWidth <= header.clientWidth,
          };
        }),
      );
    }
    expect(measurements[0].fits).toBe(true);
    for (const measurement of measurements.slice(1)) expect(measurement).toEqual(measurements[0]);
  });
}
