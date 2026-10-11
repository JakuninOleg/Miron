import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";
import { expect, test, type Cookie, type Page, type Response } from "@playwright/test";
import type { CommandAck, CommandEnvelope, Workout } from "../../src/shared/contracts";
import type { BuilderBootstrap, SaveBuilderInventory } from "../../src/shared/workout-builder";
import type {
  PlannerConfirm,
  PlannerPreferences,
  PlannerPreferencesCommand,
  PlannerPreview,
  PlannerReplacementOption,
  PlannerState,
} from "../../src/shared/workout-planner";

const APP = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const enabled = process.env.MIRON_PLANNER_E2E === "1";
test.use({
  baseURL: APP,
  trace: "off",
  video: "off",
  reducedMotion: "reduce",
  actionTimeout: 15000,
});
test.skip(!enabled, "Opt in with MIRON_PLANNER_E2E=1; verified local database only.");
test.setTimeout(90000);

const accounts = ["dark", "rose"].map((theme) => ({
  id: randomUUID(),
  email: `planner-${randomUUID()}@miron.local`,
  password: randomBytes(24).toString("hex"),
  theme,
}));
let pool: Pool;
const sessions = new Map<string, Cookie[]>();

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
      "Planner live tests require isolated local PostgreSQL:55432/miron and localhost:3000.",
    );
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  for (const account of accounts) {
    await pool.query("INSERT INTO users (id,name,email,email_verified) VALUES ($1,$2,$3,true)", [
      account.id,
      "Подбор E2E",
      account.email,
    ]);
    await pool.query(
      "INSERT INTO auth_accounts (id,user_id,account_id,provider_id,password) VALUES ($1,$2,$3,'credential',$4)",
      [randomUUID(), account.id, account.id, await hashPassword(account.password)],
    );
    await pool.query(
      "INSERT INTO profiles (user_id,display_name,theme,adult_confirmed,onboarding_completed) VALUES ($1,$2,$3,true,true)",
      [account.id, "Подбор E2E", account.theme],
    );
  }
});

test.afterAll(async () => {
  if (!pool) return;
  await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [
    accounts.map((account) => account.id),
  ]);
  await pool.end();
});

async function login(page: Page, account = accounts[0]) {
  const cookies = sessions.get(account.id);
  if (cookies) await page.context().addCookies(cookies);
  else {
    const response = await page.request.post(`${APP}/api/auth/sign-in/email`, {
      headers: { Origin: APP },
      data: { email: account.email, password: account.password },
    });
    expect(response.status()).toBe(200);
    sessions.set(account.id, await page.context().cookies(APP));
  }
  await page.goto("/workout-builder");
  await expect(
    page.getByRole("button", { name: "Подобрать тренировку", exact: true }),
  ).toBeVisible();
}

async function configure(page: Page) {
  await page.getByRole("button", { name: "Подобрать тренировку", exact: true }).click();
  await page.getByRole("button", { name: /^Силовая дома/ }).click();
  await page.getByRole("button", { name: "Настроить подбор", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Подберём твой ритм|Твой инвентарь дома/ }).first(),
  ).toBeVisible();
  if (await page.getByRole("heading", { name: "Твой инвентарь дома", exact: true }).isVisible()) {
    await page.getByRole("button", { name: "Гантели", exact: true }).click();
    await page.getByRole("button", { name: "Инвентарь выбран", exact: true }).click();
  }
  await expect(
    page.getByRole("heading", { name: "Подберём твой ритм.", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Время на занятие", { exact: true }).selectOption("60");
}

function plannerResponse(response: Response, action: string) {
  return (
    response.url().endsWith(`/api/workout-builder/planner/${action}`) &&
    response.request().method() === "POST"
  );
}

async function preview(page: Page): Promise<PlannerPreview> {
  const result = page.waitForResponse((response) => plannerResponse(response, "preview"));
  await page.getByRole("button", { name: "Показать подбор", exact: true }).click();
  const response = await result;
  expect(response.status(), await response.text()).toBe(200);
  const draft = (await response.json()) as PlannerPreview;
  await expect(page.getByRole("heading", { name: "Что изменится", exact: true })).toBeVisible();
  return draft;
}

async function state(page: Page, account = accounts[0]): Promise<PlannerState> {
  const response = await page.request.get(`${APP}/api/workout-builder/planner/state`, {
    headers: { "x-miron-owner": account.id },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as PlannerState;
}

async function refresh(page: Page) {
  const refreshed = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/workout-builder/planner/state") &&
      response.request().method() === "GET",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect((await refreshed).status()).toBe(200);
}

async function writePreferences(page: Page, preferences: PlannerPreferences) {
  const response = await page.request.put(`${APP}/api/workout-builder/planner/preferences`, {
    headers: { "x-miron-owner": accounts[0].id },
    data: {
      operationId: randomUUID(),
      expectedRevision: preferences.revision,
      excludedVariantIds: preferences.excludedVariantIds,
      favoriteVariantIds: preferences.favoriteVariantIds,
    } satisfies PlannerPreferencesCommand,
  });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as PlannerPreferences;
}

async function noOverflow(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
}

test("program, equivalent replacement, exclusions with undo and separate named copy persist", async ({
  page,
}) => {
  await login(page);
  await configure(page);
  await page.getByLabel("Распределение нагрузки", { exact: true }).selectOption("fullbody");
  await page.getByLabel("Занятий в неделю", { exact: true }).selectOption("2");
  await page.getByLabel("Порядок подходов", { exact: true }).selectOption("pairs");
  let draft = await preview(page);
  expect(draft.days).toHaveLength(2);
  let candidate: {
    dayKey: string;
    slotKey: string;
    originalName: string;
    option: PlannerReplacementOption;
  } | null = null;
  for (const day of draft.days) {
    for (const step of day.steps) {
      const response = await page.request.post(`${APP}/api/workout-builder/planner/replacements`, {
        headers: { "x-miron-owner": accounts[0].id },
        data: { config: draft.config, dayKey: day.key, slotKey: step.slotKey },
      });
      expect(response.status()).toBe(200);
      const result = (await response.json()) as { options: PlannerReplacementOption[] };
      if (result.options.length) {
        candidate = {
          dayKey: day.key,
          slotKey: step.slotKey,
          originalName: step.exercise.name,
          option: result.options[0],
        };
        break;
      }
    }
    if (candidate) break;
  }
  expect(candidate).not.toBeNull();
  if (!candidate) throw new Error("Local planner fixture must include an equivalent replacement.");
  const day = draft.days.find((item) => item.key === candidate.dayKey)!;
  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: day.title, exact: true }) });
  await card
    .getByRole("button", { name: `Заменить ${candidate.originalName}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Замена упражнения", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(candidate.option.explanation);
  const replaced = page.waitForResponse((response) => plannerResponse(response, "preview"));
  await dialog
    .getByRole("button", { name: `Использовать ${candidate.option.name}`, exact: true })
    .click();
  draft = (await (await replaced).json()) as PlannerPreview;
  expect(
    draft.days
      .find((item) => item.key === candidate.dayKey)
      ?.steps.find((step) => step.slotKey === candidate.slotKey)?.exercise.variantId,
  ).toBe(candidate.option.variantId);
  await expect(dialog).toHaveCount(0);
  const preferenceResult = page.waitForResponse(
    (response) =>
      response.url().endsWith("/planner/preferences") && response.request().method() === "PUT",
  );
  await page
    .getByRole("button", { name: `Больше не предлагать ${candidate.option.name}`, exact: true })
    .first()
    .click();
  expect((await preferenceResult).status()).toBe(200);
  await expect(
    page.getByRole("button", { name: "Подтвердить программу", exact: true }),
  ).toBeEnabled();
  await page.getByText(/^Не предлагать упражнения ·/).click();
  await page
    .getByRole("button", { name: `Снова предлагать ${candidate.option.name}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Подтвердить программу", exact: true }),
  ).toBeEnabled();
  expect((await state(page)).preferences.excludedVariantIds).not.toContain(
    candidate.option.variantId,
  );
  await page.getByRole("button", { name: "Подтвердить программу", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Начать занятие —/ }).first()).toBeVisible();
  const saved = (await state(page)).program;
  expect(saved).not.toBeNull();
  await page.reload();
  await page.getByRole("button", { name: "Открыть программу", exact: true }).click();
  await page
    .getByRole("button", { name: /^Открыть в конструкторе —/ })
    .first()
    .click();
  await expect(page.getByText(/Отдельная копия/)).toBeVisible();
  await page.getByLabel("Название тренировки", { exact: true }).fill("Моя отдельная тренировка");
  await page.getByRole("button", { name: "Сохранить тренировку", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Моя отдельная тренировка", exact: true }),
  ).toBeVisible();
  expect((await state(page)).program).toEqual(saved);
});

test("single confirmation replays after a lost ACK and preserves the weekly program", async ({
  page,
}) => {
  await login(page);
  const weekly = (await state(page)).program;
  await configure(page);
  await page.getByRole("radio", { name: /^Просто потренироваться/ }).check();
  const draft = await preview(page);
  expect(draft.config.mode).toBe("single");
  expect(draft.days).toHaveLength(1);
  const operations: string[] = [];
  await page.route("**/api/workout-builder/planner/confirm", async (route) => {
    const input = route.request().postDataJSON() as PlannerConfirm;
    operations.push(input.operationId);
    if (operations.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Подтвердить разовое занятие", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Нет связи с сервером" })).toBeVisible();
  await expect.poll(async () => (await state(page)).single?.revision).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Подтвердить разовое занятие", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Начать занятие —/ })).toBeVisible();
  expect(operations).toHaveLength(2);
  expect(operations[1]).toBe(operations[0]);
  expect((await state(page)).program).toEqual(weekly);
  await page.evaluate(() => sessionStorage.setItem("miron:demo", "1"));
  const startResponse = page.waitForResponse((response) => plannerResponse(response, "start"));
  await page.getByRole("button", { name: /^Начать занятие —/ }).click();
  const result = await startResponse;
  expect(result.status(), await result.text()).toBe(200);
  const workout = (await result.json()) as Workout;
  await expect(page).toHaveURL(`${APP}/workout`);
  await expect(
    page.getByRole("heading", { name: workout.exercises[0].name, exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Демонстрация", { exact: true })).toHaveCount(0);
  const current = await page.request.get(`${APP}/api/workouts/current`);
  const active = ((await current.json()) as { workout: Workout }).workout;
  expect(active.id).toBe(workout.id);
  const ended = await page.request.post(`${APP}/api/workouts/${active.id}/commands`, {
    data: {
      operationId: randomUUID(),
      expectedRevision: active.revision,
      command: { type: "end_early" },
    } satisfies CommandEnvelope,
  });
  expect(ended.status(), await ended.text()).toBe(200);
  expect(((await ended.json()) as CommandAck).workout.status).toBe("aborted");
});

test("planner fits 320px phone, tablet and desktop with keyboard and reduced motion", async ({
  page,
}) => {
  await login(page, accounts[1]);
  await page.setViewportSize({ width: 320, height: 568 });
  await configure(page);
  await noOverflow(page);
  await page.getByRole("radio", { name: /^Начать спокойно/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /^Поддерживать форму/ })).toBeChecked();
  await preview(page);
  for (const viewport of [
    { width: 320, height: 568, label: "phone" },
    { width: 1032, height: 1376, label: "tablet" },
    { width: 1440, height: 1000, label: "desktop" },
  ]) {
    await page.setViewportSize(viewport);
    await noOverflow(page);
    await page.screenshot({
      path: `.local/previews/planner-${viewport.label}.png`,
      fullPage: false,
    });
    await page.screenshot({
      path: `.local/previews/planner-${viewport.label}-full.png`,
      fullPage: true,
    });
  }
  const firstReplace = page.getByRole("button", { name: /^Заменить / }).first();
  await firstReplace.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(firstReplace).toBeFocused();
});

test("owner change detaches planner and blocks the old account form", async ({ page }) => {
  await login(page);
  await configure(page);
  await preview(page);
  const response = await page.request.post(`${APP}/api/auth/sign-in/email`, {
    headers: { Origin: APP },
    data: { email: accounts[1].email, password: accounts[1].password },
  });
  expect(response.status()).toBe(200);
  await page.getByRole("button", { name: "Подтвердить программу", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Твои тренировки останутся с тобой.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Подтвердить программу", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Моя отдельная тренировка", exact: true }),
  ).toHaveCount(0);
});

test("no inventory shows its limited coverage without inventing a pulling replacement", async ({
  page,
}) => {
  await login(page, accounts[1]);
  await configure(page);
  await page.getByRole("button", { name: "Изменить инвентарь", exact: true }).click();
  await page.getByRole("button", { name: "Гантели", exact: true }).click();
  await page.getByRole("button", { name: "Без инвентаря", exact: true }).click();
  await page.getByLabel("Время на занятие", { exact: true }).selectOption("60");
  await page.getByLabel("Занятий в неделю", { exact: true }).selectOption("2");
  const draft = await preview(page);
  expect(draft.days).toHaveLength(2);
  expect(draft.days.every((day) => day.title.includes("Ноги, жим и корпус"))).toBe(true);
  expect(
    draft.days.every((day) => day.warnings.some((warning) => warning.includes("Нет тяги"))),
  ).toBe(true);
  expect(draft.weeklyPrimarySets.some((entry) => entry.muscle === "back")).toBe(false);
  await expect(page.getByText(/Нет тяги и основной работы для спины/).first()).toBeVisible();
  await page.setViewportSize({ width: 320, height: 568 });
  await noOverflow(page);
  await page.screenshot({
    path: ".local/previews/planner-no-inventory-phone-full.png",
    fullPage: true,
  });
});

test("preference retry advances after a conflict and avoids a duplicate after lost ACK refresh", async ({
  page,
}) => {
  await login(page);
  await configure(page);
  const draft = await preview(page);
  await page.getByRole("button", { name: "Подтвердить программу", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Начать занятие —/ }).first()).toBeVisible();
  const target = draft.days[0].steps[0].exercise;
  const exclude = page
    .getByRole("button", { name: `Больше не предлагать ${target.name}`, exact: true })
    .first();
  const original = (await state(page)).preferences;
  const externallyUpdated = await writePreferences(page, original);
  expect(externallyUpdated.revision).toBe(original.revision + 1);
  const commands: PlannerPreferencesCommand[] = [];
  let loseNextAck = false;
  await page.route("**/api/workout-builder/planner/preferences", async (route) => {
    commands.push(route.request().postDataJSON() as PlannerPreferencesCommand);
    if (loseNextAck) {
      loseNextAck = false;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });

  const conflict = page.waitForResponse(
    (response) => response.url().endsWith("/planner/preferences") && response.status() === 409,
  );
  await exclude.click();
  expect((await conflict).status()).toBe(409);
  const conflictAlert = page.getByRole("alert").filter({ hasText: "Предпочтения уже изменились" });
  await expect(conflictAlert).toBeVisible();
  await refresh(page);
  await expect(conflictAlert).toHaveCount(0);
  const retried = page.waitForResponse(
    (response) => response.url().endsWith("/planner/preferences") && response.status() === 200,
  );
  await exclude.click();
  expect((await retried).status()).toBe(200);
  await expect(page.getByRole("status")).toContainText("больше не попадёт");
  expect(commands).toHaveLength(2);
  expect(commands[0].expectedRevision).toBe(original.revision);
  expect(commands[1].expectedRevision).toBe(externallyUpdated.revision);
  expect(commands[1].operationId).not.toBe(commands[0].operationId);

  await page.getByText(/^Не предлагать упражнения ·/).click();
  const undo = page.getByRole("button", { name: `Снова предлагать ${target.name}`, exact: true });
  await undo.click();
  await expect(undo).toHaveCount(0);
  loseNextAck = true;
  await exclude.click();
  const lostAckAlert = page.getByRole("alert").filter({ hasText: "Нет связи с сервером" });
  await expect(lostAckAlert).toBeVisible();
  const applied = (await state(page)).preferences;
  expect(applied.excludedVariantIds).toContain(target.variantId);
  const commandCount = commands.length;
  await refresh(page);
  await expect(lostAckAlert).toHaveCount(0);
  await exclude.click();
  await expect(page.getByRole("status")).toContainText("больше не попадёт");
  expect(commands).toHaveLength(commandCount);
  expect((await state(page)).preferences).toEqual(applied);
  await undo.click();
  await expect(undo).toHaveCount(0);
  expect((await state(page)).preferences.excludedVariantIds).toEqual(original.excludedVariantIds);
});

test("focus refresh blocks stale previews after programme, preferences and inventory changes", async ({
  page,
}) => {
  await login(page);
  await configure(page);
  let draft = await preview(page);
  const confirmations: PlannerConfirm[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/planner/confirm") && request.method() === "POST")
      confirmations.push(request.postDataJSON() as PlannerConfirm);
  });
  const stale = page.getByRole("alert").filter({ hasText: "Пересобери подбор" });
  async function expectRebuild() {
    await refresh(page);
    await expect(stale).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Подтвердить программу", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Показать подбор", exact: true })).toBeEnabled();
    expect(confirmations).toHaveLength(0);
  }

  const confirmedElsewhere = await page.request.post(`${APP}/api/workout-builder/planner/confirm`, {
    headers: { "x-miron-owner": accounts[0].id },
    data: {
      operationId: randomUUID(),
      expectedProgramRevision: draft.expectedProgramRevision,
      fingerprint: draft.fingerprint,
      config: draft.config,
    } satisfies PlannerConfirm,
  });
  expect(confirmedElsewhere.status(), await confirmedElsewhere.text()).toBe(200);
  await expectRebuild();
  await page.getByLabel("Время на занятие", { exact: true }).selectOption("45");
  await expect(page.getByRole("button", { name: "Показать подбор", exact: true })).toBeEnabled();
  draft = await preview(page);
  expect(draft.config.durationMinutes).toBe(45);
  await expect(stale).toHaveCount(0);
  const current = await state(page);
  expect(draft.expectedProgramRevision).toBe(
    Math.max(current.program?.revision ?? 0, current.single?.revision ?? 0),
  );

  const newPreferences = await writePreferences(page, current.preferences);
  await expectRebuild();
  draft = await preview(page);
  expect(draft.preferencesRevision).toBe(newPreferences.revision);
  await expect(stale).toHaveCount(0);

  const bootstrapResponse = await page.request.get(`${APP}/api/workout-builder`, {
    headers: { "x-miron-owner": accounts[0].id },
  });
  expect(bootstrapResponse.status()).toBe(200);
  const bootstrap = (await bootstrapResponse.json()) as BuilderBootstrap;
  const inventory = bootstrap.inventories.find((item) => item.place === draft.config.place);
  expect(inventory).toBeDefined();
  if (!inventory) throw new Error("Preview must have a confirmed inventory.");
  const updatedInventory = await page.request.put(`${APP}/api/workout-builder/inventory`, {
    headers: { "x-miron-owner": accounts[0].id },
    data: {
      operationId: randomUUID(),
      place: inventory.place,
      expectedRevision: inventory.revision,
      resources: inventory.resources,
    } satisfies SaveBuilderInventory,
  });
  expect(updatedInventory.status(), await updatedInventory.text()).toBe(200);
  await expectRebuild();
  draft = await preview(page);
  expect(draft.inventoryRevision).toBe(inventory.revision + 1);
  await expect(stale).toHaveCount(0);
  expect(confirmations).toHaveLength(0);
});
