import { expect, test, type Page } from "@playwright/test";
import type { AuthConfig } from "../../src/shared/contracts";

const config: AuthConfig = {
  emailPassword: false,
  requireEmailVerification: true,
  providers: { yandex: true, vk: false },
};
async function configure(page: Page, value = config) {
  await page.route("**/api/auth/config", (route) => route.fulfill({ json: value }));
}

test("sign-in fills the viewport with a continuous room, complete characters and accessible controls", async ({
  page,
}) => {
  await configure(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/sign-in");
  await page.evaluate(() => document.fonts.ready);
  const yandex = page.getByRole("button", { name: "Продолжить с Яндекс ID", exact: true });
  const vk = page.getByRole("button", { name: "VK ID · скоро", exact: true });
  await expect(yandex).toBeEnabled();
  await expect(yandex.locator("span").first()).toHaveCSS("background-color", "rgb(241, 58, 34)");
  await expect(yandex.locator("span").first()).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(vk).toBeDisabled();
  await expect(page.getByLabel("Пароль", { exact: true })).toHaveCount(0);
  const title = page.getByRole("heading", { name: "Войти в MIRON", exact: true });
  expect(await title.evaluate((node) => getComputedStyle(node).fontFamily)).not.toMatch(
    /oswald|impact/i,
  );
  await expect(page.getByText("Больше,", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("img", { name: "MIRON", exact: true })).toHaveAttribute(
    "src",
    "/brand/wordmark-light.svg",
  );
  await expect(page.getByTestId("auth-scene").locator("img")).toHaveAttribute(
    "src",
    "/visuals/soft-3d/auth/companions-anatomy-v4.webp",
  );
  for (const [width, height] of [
    [2560, 1286],
    [2560, 1440],
    [1536, 1024],
    [1366, 768],
    [1920, 1080],
    [1024, 768],
    [810, 1240],
    [1032, 1376],
    [768, 1024],
    [440, 956],
    [402, 874],
    [390, 844],
    [375, 667],
    [375, 553],
    [320, 568],
    [667, 375],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    const backdrop = await page.getByTestId("auth-backdrop").boundingBox();
    expect(backdrop).toEqual({ x: 0, y: 0, width, height });
    await expect(page.getByTestId("auth-backdrop").locator("img")).toHaveCSS("object-fit", "cover");
    {
      const art = await page.getByTestId("auth-scene").boundingBox();
      const image = page.getByTestId("auth-scene").locator("img");
      await image.evaluate((node: HTMLImageElement) => node.decode());
      const imageBounds = await image.boundingBox();
      const ratio = await image.evaluate(
        (node: HTMLImageElement) => node.naturalHeight / node.naturalWidth,
      );
      const form = await page.getByRole("main").boundingBox();
      const logo = await page.getByRole("link", { name: "MIRON, вход", exact: true }).boundingBox();
      if (width > 1100 || (width >= 600 && width > height)) {
        expect(form!.x + form!.width).toBeLessThanOrEqual(art!.x);
        expect(art!.x - (form!.x + form!.width)).toBeLessThanOrEqual(100);
      } else {
        expect(form!.y).toBeGreaterThanOrEqual(art!.y + art!.height);
      }
      expect(Math.abs(imageBounds!.height - imageBounds!.width * ratio)).toBeLessThan(1);
      expect(imageBounds!.y + imageBounds!.height).toBeLessThanOrEqual(art!.y + art!.height + 1);
      expect(imageBounds!.y).toBeGreaterThanOrEqual(art!.y);
      expect(imageBounds!.x).toBeGreaterThanOrEqual(art!.x);
      expect(imageBounds!.x + imageBounds!.width).toBeLessThanOrEqual(art!.x + art!.width + 1);
      expect(imageBounds!.height).toBeGreaterThan(150);
      if (width <= 1100 && width <= height) {
        expect(logo!.y + logo!.height).toBeLessThanOrEqual(art!.y);
      }
    }
    expect((await yandex.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await vk.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const demo = await page
      .getByRole("link", { name: "Посмотреть демоверсию", exact: true })
      .boundingBox();
    expect(demo!.y + demo!.height).toBeLessThanOrEqual(height);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      height + 1,
    );
    if ([2560, 1536, 375, 440, 402, 810, 1024, 1032].includes(width))
      await page.screenshot({
        path: `.local/previews/sign-in-${width}x${height}-v6.png`,
        fullPage: true,
        animations: "disabled",
      });
  }
  await page.setViewportSize({ width: 375, height: 667 });
  const smallScene = (await page.getByTestId("auth-scene").locator("img").boundingBox())!;
  const smallButton = (await yandex.boundingBox())!;
  await page.setViewportSize({ width: 402, height: 874 });
  const largeScene = (await page.getByTestId("auth-scene").locator("img").boundingBox())!;
  expect(largeScene.height).toBeGreaterThan(smallScene.height);
  expect((await yandex.boundingBox())!.height).toBeGreaterThan(smallButton.height);
});

test("Yandex retains the allowed continuation and recovers from provider errors without losing UI", async ({
  page,
}) => {
  await configure(page);
  const requests: unknown[] = [];
  await page.route("**/api/auth/sign-in/social", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 400,
      json: { code: "ACCOUNT_NOT_LINKED", message: "Account not linked" },
    });
  });
  await page.goto("/sign-in?next=/workout-builder");
  await page.getByRole("button", { name: "Продолжить с Яндекс ID", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Эта почта уже связана с другим способом входа",
  );
  expect(requests).toEqual([
    expect.objectContaining({
      provider: "yandex",
      callbackURL: "/auth/continue?next=/workout-builder",
      errorCallbackURL: "/sign-in?next=/workout-builder",
    }),
  ]);
  await expect(
    page.getByRole("button", { name: "Продолжить с Яндекс ID", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("button", { name: "VK ID · скоро", exact: true })).toBeDisabled();
});

test("configuration and OAuth callback errors remain visible and do not enable unavailable providers", async ({
  page,
}) => {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.goto("/sign-in?error=EMAIL_NOT_FOUND");
  await expect(
    page.getByRole("alert").filter({ hasText: "Сервис не передал почту" }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "Не удалось загрузить способы входа" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Продолжить с Яндекс ID", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "VK ID", exact: true })).toBeDisabled();
});

test("email forms retain validation, password visibility and missing-token recovery when enabled", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await configure(page, { ...config, emailPassword: true });
  await page.goto("/sign-up");
  await expect(page.getByRole("heading", { name: "Создать аккаунт", exact: true })).toBeVisible();
  await page.getByLabel("Твоё имя", { exact: true }).fill("Проверка");
  await page.getByLabel("Почта", { exact: true }).fill("auth-ui@example.test");
  const password = page.getByLabel("Пароль", { exact: true });
  await password.fill("local-preview-password");
  await page.getByRole("button", { name: "Показать пароль", exact: true }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Скрыть пароль", exact: true }).click();
  await expect(password).toHaveAttribute("type", "password");
  await page.goto("/reset-password");
  await page.getByLabel("Новый пароль", { exact: true }).fill("local-new-password");
  await page.getByRole("button", { name: "Сохранить пароль", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "В ссылке нет ключа восстановления. Запроси новую ссылку.",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
