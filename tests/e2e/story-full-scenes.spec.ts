import { expect, test } from "@playwright/test";

const sizes = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 1032, height: 1376 },
  { name: "wide desktop", width: 2560, height: 1290 },
];

for (const viewport of sizes) {
  for (const scene of ["interests", "choose", "prepare", "finish"] as const) {
    test(`full scene ${scene} at ${viewport.name} preserves the complete frame`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      if (scene === "prepare" || scene === "finish") {
        await page.addInitScript(
          (step) => {
            localStorage.setItem(
              "miron:story-preview:v2",
              JSON.stringify({
                flowVersion: 3,
                step,
                interests: ["home"],
                locations: [],
                companion: "lika",
                completed: false,
              }),
            );
          },
          scene === "prepare" ? 5 : 6,
        );
        await page.clock.install();
        await page.clock.pauseAt(new Date());
      }
      await page.goto(scene === "prepare" || scene === "finish" ? "/story" : `/story/${scene}`);
      const picture = page.locator(`picture[data-art="${scene}"]`);
      await expect(picture).toBeVisible();
      await picture.locator("img").evaluate((node) => (node as HTMLImageElement).decode());
      const frame = await picture.evaluate((node) => {
        const image = node.querySelector("img");
        const stage = node.closest("section");
        const header = document.querySelector("main > header");
        if (!image || !stage || !header) throw new Error("Incomplete scene");
        const a = node.getBoundingClientRect();
        const s = stage.getBoundingClientRect();
        return {
          complete: [a.x - s.x, a.y - s.y, a.width - s.width, a.height - s.height].every(
            (difference) => Math.abs(difference) <= 1,
          ),
          fit: getComputedStyle(image).objectFit,
          transform: getComputedStyle(image).transform,
          borderRadius: getComputedStyle(node).borderRadius,
          source: image.currentSrc,
          headerTransparent: getComputedStyle(header).backgroundColor === "rgba(0, 0, 0, 0)",
          noScroll:
            document.documentElement.scrollHeight <= innerHeight + 1 &&
            document.documentElement.scrollWidth <= innerWidth + 1,
        };
      });
      expect(frame.complete).toBe(true);
      expect(frame.fit).toBe("contain");
      expect(frame.transform).toBe("none");
      expect(frame.borderRadius).toBe("0px");
      expect(frame.headerTransparent).toBe(true);
      expect(frame.noScroll).toBe(true);
      expect(frame.source).toContain(
        `${scene}${viewport.width < viewport.height ? "-mobile" : ""}-v2.webp`,
      );
      if (scene === "prepare") {
        await expect(page.getByRole("button")).toHaveCount(0);
        await expect(page.getByText("Всё можно будет изменить.", { exact: true })).toHaveCount(0);
      }
    });
  }
}

test("a slow next background leaves the current scene visible and advances only once", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release = () => {};
  let requested = false;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/max-mobile-v2.webp", async (route) => {
    requested = true;
    await blocked;
    await route.continue();
  });
  try {
    await page.goto("/story", { waitUntil: "domcontentloaded" });
    await expect.poll(() => requested).toBe(true);
    const next = page.getByRole("button", { name: "Давай знакомиться", exact: true });
    await next.click();
    await next.click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Привет!");
    const visible = await page.locator('[aria-label="История знакомства"]').evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        opacity: style.opacity,
        animation: style.animationName,
        visibility: style.visibility,
      };
    });
    expect(visible).toEqual({ opacity: "1", animation: "none", visibility: "visible" });
    release();
    await expect(page.getByRole("heading", { name: "Макс.", exact: true })).toBeFocused();
    await expect(page.locator('[aria-label="История знакомства"]')).toHaveAttribute(
      "aria-busy",
      "false",
    );
  } finally {
    release();
  }
});

test("a failed scene image does not trap the user on the previous screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/max-mobile-v2.webp", (route) => route.abort("failed"));
  await page.goto("/story");
  await page.getByRole("button", { name: "Давай знакомиться", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Макс.", exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "Круто, дальше", exact: true })).toBeEnabled();
});
