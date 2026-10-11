import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";
import { expect, test, type Page } from "@playwright/test";
import type {
  BuilderCatalog,
  BuilderBootstrap,
  SaveBuilderInventory,
} from "../../src/shared/workout-builder";

const APP = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const enabled = process.env.MIRON_BUILDER_E2E === "1";
test.use({ baseURL: APP, trace: "off", video: "off" });
test.skip(!enabled, "Opt in with MIRON_BUILDER_E2E=1; verified local database only.");
test.setTimeout(60000);

const accounts = ["dark", "rose", "dark"].map((theme) => ({
  id: randomUUID(),
  email: `builder-${randomUUID()}@miron.local`,
  password: randomBytes(24).toString("hex"),
  theme,
}));
let pool: Pool;

test.beforeAll(async () => {
  if (!enabled) return;
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.port !== "55432" ||
    url.pathname !== "/miron" ||
    process.env.BETTER_AUTH_URL !== APP ||
    process.env.NODE_ENV === "production"
  )
    throw new Error(
      "Builder live tests require isolated local PostgreSQL:55432/miron and localhost:3000.",
    );
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  for (const account of accounts) {
    await pool.query("INSERT INTO users (id,name,email,email_verified) VALUES ($1,$2,$3,true)", [
      account.id,
      "Конструктор E2E",
      account.email,
    ]);
    await pool.query(
      "INSERT INTO auth_accounts (id,user_id,account_id,provider_id,password) VALUES ($1,$2,$3,'credential',$4)",
      [randomUUID(), account.id, account.id, await hashPassword(account.password)],
    );
    await pool.query(
      "INSERT INTO profiles (user_id,display_name,theme,adult_confirmed,onboarding_completed) VALUES ($1,$2,$3,true,true)",
      [account.id, "Конструктор E2E", account.theme],
    );
  }
});

test("lost inventory response replays the same operation after background refresh", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Собрать самому", exact: true }).click();
  await page.getByRole("button", { name: /^На улице/ }).click();
  const operations: string[] = [];
  await page.route("**/api/workout-builder/inventory", async (route) => {
    const payload = route.request().postDataJSON() as SaveBuilderInventory;
    operations.push(payload.operationId);
    if (operations.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Выбрать упражнения", exact: true }).click();
  await expect(
    page.locator("#builder-main").getByRole("alert").filter({ hasText: "Нет связи с сервером" }),
  ).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect
    .poll(async () => {
      const response = await page.request.get(`${APP}/api/workout-builder`);
      const bootstrap = (await response.json()) as BuilderBootstrap;
      return bootstrap.inventories.find((item) => item.place === "outdoor")?.revision;
    })
    .toBe(1);
  await page.getByRole("button", { name: "Выбрать упражнения", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Добавь свои упражнения." })).toBeVisible();
  expect(operations).toHaveLength(2);
  expect(operations[1]).toBe(operations[0]);
  const result = await pool.query<{ revision: number }>(
    "SELECT revision FROM workout_builder_inventories WHERE user_id=$1 AND place='outdoor'",
    [accounts[0].id],
  );
  expect(result.rows).toEqual([{ revision: 1 }]);
});

test.afterAll(async () => {
  if (!pool) return;
  // Only these exact ephemeral test principals; cascades remove their own sessions/templates.
  await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [
    accounts.map((account) => account.id),
  ]);
  await pool.end();
});

async function login(page: Page, account = accounts[0]) {
  const response = await page.request.post(`${APP}/api/auth/sign-in/email`, {
    headers: { Origin: APP },
    data: { email: account.email, password: account.password },
  });
  expect(response.status()).toBe(200);
  await page.goto("/workout-builder");
  await expect(page.getByRole("button", { name: "Собрать самому", exact: true })).toBeVisible();
}

async function selectHomeStrength(page: Page) {
  await page.getByRole("button", { name: "Собрать самому", exact: true }).click();
  await page.getByRole("button", { name: /^Силовая дома/ }).click();
  await page.getByRole("button", { name: "Выбрать упражнения", exact: true }).click();
}

async function noHorizontalOverflow(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
}

async function capture(page: Page, path: string) {
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    );
    await Promise.all(
      Array.from(document.images, (image) => image.decode().catch(() => undefined)),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page.screenshot({ path, fullPage: true });
}

test("one training choice, contextual illustrated inventory, exclusive pairs and standard gym", async ({
  page,
}) => {
  await login(page, accounts[2]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Собрать самому", exact: true }).click();
  await expect(page.getByRole("group", { name: "Направление тренировки" })).toHaveCount(0);
  await capture(page, ".local/previews/builder-context-desktop-v2.png");
  await page.getByRole("button", { name: /^Зал/ }).click();
  await page.getByRole("button", { name: "Выбрать упражнения", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Добавь свои упражнения." })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Твой инвентарь/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Изменить инвентарь", exact: true })).toHaveCount(
    0,
  );
  const gymResponse = await page.request.get(`${APP}/api/workout-builder`);
  const gym = ((await gymResponse.json()) as BuilderBootstrap).inventories.find(
    (item) => item.place === "gym",
  );
  expect(gym?.resources).toEqual(
    expect.arrayContaining([
      { code: "dumbbell", quantity: 2, isStable: null },
      { code: "leg_press_machine", quantity: 1, isStable: null },
    ]),
  );

  await page.getByRole("button", { name: "Твои условия", exact: true }).click();
  await page.getByRole("button", { name: /^Силовая дома/ }).click();
  await page.getByRole("button", { name: "Выбрать упражнения", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Твой инвентарь дома" })).toBeVisible();
  await expect(page.getByRole("spinbutton")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Гантель", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Гантели", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Гантель", exact: true }).click();
  await expect(page.getByRole("button", { name: "Гантели", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Гантель", exact: true }).click();
  await page.getByRole("button", { name: "Гантели", exact: true }).click();
  await expect(page.getByRole("button", { name: "Гантель", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Гиря", exact: true }).click();
  await expect(page.getByRole("button", { name: "Гири", exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 568 });
  await noHorizontalOverflow(page);
  await capture(page, ".local/previews/builder-inventory-mobile-v2.png");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture(page, ".local/previews/builder-inventory-desktop-v2.png");
  await page.getByRole("button", { name: "Инвентарь выбран", exact: true }).click();
  await page.getByRole("button", { name: "Твои условия", exact: true }).click();
  await page.getByRole("button", { name: /^Йога/ }).click();
  await page.getByRole("button", { name: "Выбрать упражнения", exact: true }).click();
  await page.getByRole("button", { name: "Изменить инвентарь", exact: true }).click();
  await expect(page.getByRole("button", { name: "Гантели", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ремень для йоги", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Блоки для йоги", exact: true }).click();
  await page.setViewportSize({ width: 1032, height: 1376 });
  await noHorizontalOverflow(page);
  await capture(page, ".local/previews/builder-yoga-tablet-v2.png");
  await page.getByRole("button", { name: "Инвентарь выбран", exact: true }).click();
  const homeResponse = await page.request.get(`${APP}/api/workout-builder`);
  const home = ((await homeResponse.json()) as BuilderBootstrap).inventories.find(
    (item) => item.place === "home",
  );
  expect(home?.resources).toEqual(
    expect.arrayContaining([
      { code: "dumbbell", quantity: 2, isStable: null },
      { code: "kettlebell", quantity: 1, isStable: null },
      { code: "yoga_block", quantity: 2, isStable: null },
    ]),
  );
  await page.getByRole("button", { name: "Твои условия", exact: true }).click();
  await page.getByRole("button", { name: /^Калистеника/ }).click();
  await page.getByRole("button", { name: "Выбрать упражнения", exact: true }).click();
  await expect(page.getByRole("button", { name: "Жилет-утяжелитель", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Пояс для отягощений", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Блоки для йоги", exact: true })).toHaveCount(0);
});

test("real catalog, inventory, named save/edit/copy/delete and reload persistence", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await selectHomeStrength(page);
  await expect(page.getByRole("heading", { name: "Твой инвентарь дома" })).toBeVisible();
  await page.getByRole("button", { name: "Гантели", exact: true }).click();
  await page.getByRole("button", { name: "Инвентарь выбран", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Добавь свои упражнения." })).toBeVisible();
  const bootstrapResponse = await page.request.get(`${APP}/api/workout-builder`);
  const bootstrap = (await bootstrapResponse.json()) as BuilderBootstrap;
  expect(
    bootstrap.inventories
      .find((item) => item.place === "home")
      ?.resources.find((item) => item.code === "dumbbell")?.quantity,
  ).toBe(2);
  await page.getByRole("button", { name: "Свободные веса", exact: true }).click();
  await page.getByRole("combobox", { name: "Мышечная группа" }).selectOption("biceps");
  const catalogResponse = await page.request.get(
    `${APP}/api/workout-builder/catalog?place=home&direction=strength&equipment=free_weights&muscle=biceps`,
    { headers: { "x-miron-owner": accounts[0].id } },
  );
  const catalog = (await catalogResponse.json()) as BuilderCatalog;
  expect(catalog.total).toBeGreaterThan(0);
  const exercise = catalog.exercises[0];
  await page.getByRole("button", { name: `Добавить ${exercise.name}`, exact: true }).click();
  await page.getByLabel("Название тренировки").fill("Мой верх дома");
  await noHorizontalOverflow(page);
  await capture(page, ".local/previews/builder-desktop.png");
  await page.getByRole("button", { name: "Сохранить тренировку", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("«Мой верх дома» сохранена");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Мой верх дома", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Открыть Мой верх дома", exact: true }).click();
  await page.getByLabel("Название тренировки").fill("Верх дома — обновлено");
  await page.getByRole("spinbutton", { name: "Отдых, сек", exact: true }).fill("120");
  await page.getByRole("button", { name: "Сохранить тренировку", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Верх дома — обновлено", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Скопировать Верх дома — обновлено", exact: true })
    .click();
  await page.getByRole("button", { name: "Сохранить тренировку", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Верх дома — обновлено — копия", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Удалить Верх дома — обновлено — копия", exact: true })
    .click();
  await page.getByRole("button", { name: "Удалить тренировку", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Верх дома — обновлено — копия", exact: true }),
  ).toHaveCount(0);
  const rows = await pool.query<{ name: string; revision: number }>(
    "SELECT name,revision FROM custom_workout_templates WHERE user_id=$1",
    [accounts[0].id],
  );
  expect(rows.rows).toEqual([{ name: "Верх дома — обновлено", revision: 2 }]);
  await selectHomeStrength(page);
  await expect(page.getByRole("heading", { name: "Добавь свои упражнения." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Твой инвентарь дома" })).toHaveCount(0);
});

test("rose layout fits small phone/tablet, confirmed empty inventory remembered", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page, accounts[1]);
  await expect(
    page.getByRole("heading", { name: "Верх дома — обновлено", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Собрать самому", exact: true }).click();
  await noHorizontalOverflow(page);
  await capture(page, ".local/previews/builder-mobile-choices.png");
  await page.getByRole("button", { name: /^Свой вес дома/ }).click();
  await page.getByRole("button", { name: "Выбрать упражнения", exact: true }).click();
  await page.getByRole("button", { name: "Без инвентаря", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Добавить / }).first()).toBeVisible();
  await noHorizontalOverflow(page);
  await page
    .getByRole("button", { name: /^Добавить / })
    .first()
    .click();
  await page.getByRole("button", { name: "Твоя сборка · 1", exact: true }).click();
  await page.getByLabel("Название тренировки").fill("Движение дома");
  await noHorizontalOverflow(page);
  await capture(page, ".local/previews/builder-mobile-selection.png");
  await page.getByRole("button", { name: "Сохранить тренировку", exact: true }).click();
  await page.setViewportSize({ width: 1032, height: 1376 });
  await page.getByRole("button", { name: "Открыть Движение дома", exact: true }).click();
  await noHorizontalOverflow(page);
  await capture(page, ".local/previews/builder-tablet.png");
  await page.getByRole("button", { name: "Сохранить тренировку", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Собрать самому", exact: true }).click();
  await page.getByRole("button", { name: /^Свой вес дома/ }).click();
  await page.getByRole("button", { name: "Выбрать упражнения", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Добавь свои упражнения." })).toBeVisible();
});

test("HTTP authentication, owner fencing and no false offline success", async ({ page }) => {
  await page.goto("/workout-builder");
  await expect(page.getByRole("link", { name: "Войти и собрать тренировку" })).toBeVisible();
  const anonymous = await page.request.get(`${APP}/api/workout-builder`);
  expect(anonymous.status()).toBe(401);
  expect(anonymous.headers()["cache-control"]).toBe("no-store");
  await page.getByRole("link", { name: "Войти и собрать тренировку" }).click();
  await page.getByLabel("Почта", { exact: true }).fill(accounts[0].email);
  await page.getByLabel("Пароль", { exact: true }).fill(accounts[0].password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(`${APP}/workout-builder`);
  await expect(page.getByRole("button", { name: "Собрать самому", exact: true })).toBeVisible();
  const staleOwner = await page.request.get(`${APP}/api/workout-builder/templates`, {
    headers: { "x-miron-owner": accounts[1].id },
  });
  expect(staleOwner.status()).toBe(409);
  const list = await page.request.get(`${APP}/api/workout-builder/templates`, {
    headers: { "x-miron-owner": accounts[0].id },
  });
  const { templates } = (await list.json()) as { templates: { id: string }[] };
  if (!templates.length) {
    const bootstrapResponse = await page.request.get(`${APP}/api/workout-builder`);
    const bootstrap = (await bootstrapResponse.json()) as BuilderBootstrap;
    let inventory = bootstrap.inventories.find((item) => item.place === "home");
    if (!inventory) {
      const response = await page.request.put(`${APP}/api/workout-builder/inventory`, {
        headers: { Origin: APP, "x-miron-owner": accounts[0].id },
        data: { operationId: randomUUID(), place: "home", expectedRevision: 0, resources: [] },
      });
      expect(response.status()).toBe(200);
      inventory = await response.json();
    }
    const response = await page.request.get(
      `${APP}/api/workout-builder/catalog?place=home&direction=strength`,
      { headers: { "x-miron-owner": accounts[0].id } },
    );
    const catalog = (await response.json()) as BuilderCatalog;
    expect(catalog.total).toBeGreaterThan(0);
    const saved = await page.request.post(`${APP}/api/workout-builder/templates`, {
      headers: { Origin: APP, "x-miron-owner": accounts[0].id },
      data: {
        operationId: randomUUID(),
        id: randomUUID(),
        expectedRevision: 0,
        name: "Проверка офлайна",
        place: "home",
        direction: "strength",
        inventoryRevision: inventory?.revision,
        steps: [
          { revisionId: catalog.exercises[0].revisionId, sets: 1, target: 8, restSeconds: 60 },
        ],
      },
    });
    expect(saved.status()).toBe(201);
    await page.reload();
  }
  await page
    .getByRole("button", { name: /^Открыть / })
    .first()
    .click();
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Сохранить тренировку", exact: true }).click();
  await expect(
    page
      .locator("#builder-main")
      .getByRole("alert")
      .filter({ hasText: "Нет связи с сервером" })
      .first(),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Добавь свои упражнения." })).toBeVisible();
  await page.context().setOffline(false);
  const switchResponse = await page.request.post(`${APP}/api/auth/sign-in/email`, {
    headers: { Origin: APP },
    data: { email: accounts[1].email, password: accounts[1].password },
  });
  expect(switchResponse.status()).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("link", { name: "Войти и собрать тренировку" })).toBeVisible();
  await expect(page.getByLabel("Название тренировки")).toHaveCount(0);
});
