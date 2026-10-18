import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { serializeSignedCookie } from "better-call";
import { Pool } from "pg";
import { expect, test, type Page } from "@playwright/test";
import type { AccountState } from "../../src/shared/contracts";
import type { CompleteOnboardingInput } from "../../src/shared/onboarding";

const APP = "http://localhost:3000";
const enabled = process.env.MIRON_ACCOUNT_E2E === "1";
// Signed session fixtures are credentials. Never record requests/cookies in traces or video.
test.use({
  baseURL: APP,
  trace: "off",
  video: "off",
  reducedMotion: "reduce",
  actionTimeout: 15000,
});
test.skip(!enabled, "Opt in with MIRON_ACCOUNT_E2E=1; isolated local database and app only.");
test.setTimeout(90000);

interface Fixture {
  id: string;
  name: string;
  sessionCookie: string;
}
interface ProfileRow {
  onboarding_completed: boolean;
  adult_confirmed: boolean;
  companion: string;
  theme: string;
  onboarding_interests: string[];
  onboarding_operation_id: string | null;
  revision: number;
}
let pool: Pool;
const fixtureIds: string[] = [];

test.beforeAll(async () => {
  if (!enabled) return;
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  let database: URL;
  try {
    database = new URL(process.env.DATABASE_URL ?? "");
  } catch {
    throw new Error("Account journey tests require a valid local DATABASE_URL.");
  }
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !["localhost", "127.0.0.1"].includes(database.hostname) ||
    database.port !== "55432" ||
    database.pathname !== "/miron" ||
    process.env.BETTER_AUTH_URL !== APP ||
    (process.env.E2E_BASE_URL !== undefined && process.env.E2E_BASE_URL !== APP) ||
    process.env.NODE_ENV === "production" ||
    !process.env.BETTER_AUTH_SECRET
  )
    throw new Error(
      "Account journey tests require localhost:3000 and local PostgreSQL:55432/miron.",
    );
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
});

test.afterAll(async () => {
  if (!pool) return;
  // Only this process's exact ephemeral principals; cascades remove only their own rows.
  await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [fixtureIds]);
  await pool.end();
});

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});

async function createFixture(completed = false, history = false): Promise<Fixture> {
  const id = randomUUID();
  fixtureIds.push(id);
  const name = completed ? "Марина E2E" : "Полина E2E";
  const token = randomBytes(32).toString("hex");
  // Explicit local social identity fixture, not an external OAuth exchange.
  const subject = BigInt(`0x${id.replaceAll("-", "")}`).toString();
  await pool.query("INSERT INTO users (id,name,email,email_verified) VALUES ($1,$2,$3,false)", [
    id,
    name,
    `account-journey-${id}@miron.local`,
  ]);
  await pool.query(
    "INSERT INTO auth_accounts (id,user_id,account_id,provider_id) VALUES ($1,$2,$3,'yandex')",
    [randomUUID(), id, subject],
  );
  await pool.query(
    `INSERT INTO profiles
      (user_id,display_name,companion,theme,adult_confirmed,onboarding_completed,onboarding_interests)
      VALUES ($1,$2,$3,'dark',$4,$4,$5::text[])`,
    [id, name, completed ? "lika" : "max", completed, completed ? ["mobility"] : []],
  );
  await pool.query(
    "INSERT INTO ai_trials (user_id,starts_at,ends_at,used) VALUES ($1,now()-interval '1 hour',now()+interval '167 hours',$2)",
    [id, completed ? 9 : 0],
  );
  await pool.query(
    "INSERT INTO auth_sessions (id,user_id,token,expires_at) VALUES ($1,$2,$3,now()+interval '1 hour')",
    [randomUUID(), id, token],
  );
  if (history) {
    const planId = randomUUID();
    const workoutId = randomUUID();
    await pool.query("INSERT INTO plans (id,user_id,name) VALUES ($1,$2,'История E2E')", [
      planId,
      id,
    ]);
    await pool.query(
      `INSERT INTO workouts
        (id,user_id,plan_id,name,status,place,available_seconds,source_profile_revision,started_at,completed_at)
        VALUES ($1,$2,$3,'Часть занятия E2E','partial','home',1200,1,now()-interval '1 day',now()-interval '23 hours')`,
      [workoutId, id, planId],
    );
    await pool.query(
      "INSERT INTO xp_events (id,user_id,workout_id,event,amount) VALUES ($1,$2,$3,'partial',25)",
      [randomUUID(), id, workoutId],
    );
  }
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("Local account fixture signing is unavailable.");
  const signed = await serializeSignedCookie("miron.session_token", token, secret);
  return {
    id,
    name,
    sessionCookie: decodeURIComponent(signed.slice(signed.indexOf("=") + 1).split(";")[0]),
  };
}

async function authenticate(page: Page, fixture: Fixture) {
  await page.context().addCookies([
    {
      name: "miron.session_token",
      value: fixture.sessionCookie,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

async function profileRow(fixture: Fixture) {
  const result = await pool.query<ProfileRow>(
    `SELECT onboarding_completed,adult_confirmed,companion,theme,onboarding_interests,
      onboarding_operation_id,revision FROM profiles WHERE user_id=$1`,
    [fixture.id],
  );
  return result.rows[0];
}

async function accountState(page: Page): Promise<AccountState> {
  const response = await page.request.get(`${APP}/api/profile`).catch(() => {
    throw new Error("Local account request failed; credentials omitted.");
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as AccountState;
}

async function advance(
  page: Page,
  name: string | RegExp = /^(Дальше|Круто, дальше|Давай дальше)$/,
) {
  await expect(page.locator('[aria-label="История знакомства"]')).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.getByRole("button", { name, exact: true }).click();
}

async function reachInterests(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Привет");
  await advance(page, "Давай знакомиться");
  await advance(page);
  await advance(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Что тебе\s*ближе\?/i);
}

async function reachFinish(page: Page, companion: "max" | "lika") {
  await advance(page);
  await page
    .getByRole("button", { name: companion === "lika" ? /^ЛИКА Внимание/ : /^МАКС Энергия/ })
    .click();
  await advance(page, companion === "lika" ? "Начать с Ликой" : "Начать с Максом");
  await expect(page.getByRole("heading", { name: /^Готово/ })).toBeVisible();
}

async function capture(page: Page, path: string) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
}

test("new account saves actual comic choices; lost ACK retries the same operation before dashboard and single builder", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await createFixture();
  await authenticate(page, fixture);
  const operations: CompleteOnboardingInput[] = [];
  let firstSaveStatus: number | null = null;
  await page.route("**/api/onboarding", async (route) => {
    operations.push(route.request().postDataJSON() as CompleteOnboardingInput);
    if (operations.length === 1) {
      try {
        const response = await route.fetch({ timeout: 10000 });
        firstSaveStatus = response.status();
      } catch {
        // Playwright's raw network exception can include Cookie; expose only a status sentinel.
        firstSaveStatus = -1;
      }
      await route.abort("failed");
    } else await route.continue();
  });
  await page.goto("/auth/continue");
  await expect(page).toHaveURL(`${APP}/onboarding`);
  await reachInterests(page);
  await page.getByRole("button", { name: "Йога", exact: true }).click();
  await page.getByRole("button", { name: "Силовые дома", exact: true }).click();
  await reachFinish(page, "lika");
  await expect(page.getByRole("button", { name: "Погнали", exact: true })).toBeDisabled();
  expect(operations).toHaveLength(0);
  expect((await profileRow(fixture)).onboarding_completed).toBe(false);
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("checkbox", { name: "Мне уже исполнилось 18 лет" })).toBeInViewport(
      { ratio: 1 },
    );
    await expect(page.getByRole("button", { name: "Погнали", exact: true })).toBeInViewport({
      ratio: 1,
    });
    const title = await page.getByRole("heading", { level: 1 }).boundingBox();
    const header = await page.locator("main > header").boundingBox();
    const consent = await page
      .getByRole("checkbox", { name: "Мне уже исполнилось 18 лет" })
      .boundingBox();
    expect(
      title !== null &&
        consent !== null &&
        header !== null &&
        title.y >= header.y + header.height &&
        title.y + title.height <= consent.y,
    ).toBe(true);
    await capture(page, `.local/previews/account-onboarding-${viewport.width}.png`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("checkbox", { name: "Мне уже исполнилось 18 лет" }).check();
  await capture(page, ".local/previews/account-onboarding-mobile.png");
  await page.getByRole("button", { name: "Погнали", exact: true }).click();
  await expect(page.locator("#onboarding-save-error")).toBeVisible();
  expect(firstSaveStatus).toBe(200);
  await expect(page).toHaveURL(`${APP}/onboarding`);
  const saved = await profileRow(fixture);
  expect(saved).toMatchObject({
    onboarding_completed: true,
    adult_confirmed: true,
    companion: "lika",
    theme: "rose",
    onboarding_interests: ["yoga", "home"],
    revision: 2,
  });
  expect(saved.onboarding_operation_id).toBe(operations[0].operationId);
  await page.getByRole("button", { name: "Попробовать ещё раз", exact: true }).click();
  await expect(page).toHaveURL(`${APP}/dashboard`);
  expect(operations).toHaveLength(2);
  expect(operations[1]).toEqual(operations[0]);
  expect((await profileRow(fixture)).revision).toBe(2);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(fixture.name);
  await expect(page.locator('[data-account="true"][data-theme="rose"]')).toBeVisible();
  await expect(
    page.locator('img[src="/visuals/soft-3d/dashboard/lika-mobile-v1.webp"]'),
  ).toBeVisible();
  const confirmed = await accountState(page);
  expect(confirmed.profile.interests).toEqual(["yoga", "home"]);
  expect(confirmed.progress).toMatchObject({ xp: 0, completedWorkouts: 0, history: [] });
  await capture(page, ".local/previews/account-dashboard-lika-mobile.png");
  await page.getByRole("link", { name: "Просто потренироваться", exact: true }).click();
  await expect(page).toHaveURL(/\/workout-builder\?from=dashboard&mode=single$/);
  await expect(page.getByRole("heading", { name: /Как сегодня\s*занимаемся\?/ })).toBeVisible();
  await page.getByRole("button", { name: /^Силовая дома/ }).click();
  await page.getByRole("button", { name: "Настроить подбор", exact: true }).click();
  await page.getByRole("button", { name: "Без инвентаря", exact: true }).click();
  await expect(page.getByRole("radio", { name: /^Просто потренироваться/ })).toBeChecked();
});

test("returning account skips acquaintance, next is allowlisted, and developer replay preserves history and trial", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const fixture = await createFixture(true, true);
  await authenticate(page, fixture);
  const before = await accountState(page);
  expect(before.progress.history[0].status).toBe("partial");
  expect(before.trial.repliesUsed).toBe(9);
  await page.goto("/auth/continue?next=https%3A%2F%2Fexample.com%2Fevil");
  await expect(page).toHaveURL(`${APP}/dashboard`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(fixture.name);
  await expect(
    page.locator('[data-account="true"][data-theme="dark"][data-persona="lika"]'),
  ).toBeVisible();
  await page.goto("/auth/continue?next=/workout-builder");
  await expect(page).toHaveURL(`${APP}/workout-builder`);
  await page.goto("/onboarding?next=https%3A%2F%2Fexample.com%2Fevil");
  await expect(page).toHaveURL(`${APP}/dashboard`);
  let completions = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/onboarding") completions++;
  });
  await page.goto("/onboarding?replay=1");
  await reachInterests(page);
  await page.getByRole("button", { name: "Зал", exact: true }).click();
  await reachFinish(page, "max");
  await expect(page.getByRole("checkbox", { name: "Мне уже исполнилось 18 лет" })).toHaveCount(0);
  await page.getByRole("button", { name: "Погнали", exact: true }).click();
  await expect(page).toHaveURL(`${APP}/dashboard`);
  await expect(
    page.locator('[data-account="true"][data-theme="dark"][data-persona="lika"]'),
  ).toBeVisible();
  expect(completions).toBe(0);
  expect(await accountState(page)).toEqual(before);
  await capture(page, ".local/previews/account-dashboard-returning-desktop.png");
});

test("partial choices stay owner scoped; public or another owner's draft and stale owner commands cannot complete an account", async ({
  page,
}) => {
  const alice = await createFixture();
  const bob = await createFixture();
  await authenticate(page, alice);
  await page.goto("/auth/continue");
  await reachInterests(page);
  await page.getByRole("button", { name: "Йога", exact: true }).click();
  const aliceDraft = await page.evaluate(
    (id) => localStorage.getItem(`miron:account-onboarding:v1:${id}`),
    alice.id,
  );
  expect(aliceDraft).not.toBeNull();
  await page.evaluate(
    ({ id, raw }) => {
      localStorage.setItem(`miron:account-onboarding:v1:${id}`, raw ?? "");
      localStorage.setItem(
        "miron:story-preview:v2",
        JSON.stringify({
          flowVersion: 3,
          step: 6,
          companion: "lika",
          interests: ["yoga"],
          completed: true,
        }),
      );
    },
    { id: bob.id, raw: aliceDraft },
  );
  await authenticate(page, bob);
  await page.goto("/auth/continue");
  await reachInterests(page);
  await expect(page.getByRole("button", { name: "Йога", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  const payload: CompleteOnboardingInput = {
    operationId: randomUUID(),
    companion: "lika",
    interests: ["yoga"],
    adultConfirmed: true,
  };
  const mismatch = await page.request
    .post(`${APP}/api/onboarding`, {
      headers: { Origin: APP, "x-miron-owner": alice.id },
      data: payload,
    })
    .catch(() => {
      throw new Error("Local owner-mismatch request failed; credentials omitted.");
    });
  expect(mismatch.status()).toBe(409);
  const partial = await page.request
    .post(`${APP}/api/onboarding`, {
      headers: { Origin: APP, "x-miron-owner": bob.id },
      data: { ...payload, adultConfirmed: false },
    })
    .catch(() => {
      throw new Error("Local partial-onboarding request failed; credentials omitted.");
    });
  expect(partial.status()).toBe(400);
  for (const owner of [alice, bob])
    expect(await profileRow(owner)).toMatchObject({
      onboarding_completed: false,
      adult_confirmed: false,
      companion: "max",
      onboarding_interests: [],
      revision: 1,
    });
});

test("private hydration rejection detaches a cached account even while the auth session succeeds", async ({
  page,
}) => {
  const fixture = await createFixture(true);
  await authenticate(page, fixture);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(fixture.name);
  expect(await cachedOwnerExists(page, fixture.id)).toBe(true);
  const observedKey = `miron:e2e-rejected-view:${fixture.id}`;
  await page.addInitScript(
    ({ name, key }) => {
      const observer = new MutationObserver(() => {
        const account = document.querySelector('[data-account="true"]');
        if (account?.textContent?.includes(name)) sessionStorage.setItem(key, "displayed");
      });
      observer.observe(document, { childList: true, subtree: true, characterData: true });
    },
    { name: fixture.name, key: observedKey },
  );
  await page.route("**/api/profile", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "ACCOUNT_UNAVAILABLE", message: "Аккаунт недоступен." },
      }),
    }),
  );
  const authProbe = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/auth/get-session" && response.status() === 200,
  );
  await page.reload();
  await authProbe;
  await expect(page).toHaveURL(`${APP}/sign-in`);
  await expect(page.getByRole("heading", { name: "Войти в MIRON", exact: true })).toBeVisible();
  await expect(page.locator('[data-account="true"]')).toHaveCount(0);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), observedKey)).toBeNull();
  expect(await cachedOwnerExists(page, fixture.id)).toBe(false);
});

async function cachedOwnerExists(page: Page, ownerId: string) {
  return page.evaluate(
    (key) =>
      new Promise<boolean>((resolve, reject) => {
        const opened = indexedDB.open("miron-offline-v1");
        opened.onerror = () => reject(new Error("Fixture cache could not be inspected."));
        opened.onsuccess = () => {
          const database = opened.result;
          const request = database.transaction("states").objectStore("states").get(key);
          request.onerror = () => {
            database.close();
            reject(new Error("Fixture cache lookup failed."));
          };
          request.onsuccess = () => {
            const exists = request.result !== undefined;
            database.close();
            resolve(exists);
          };
        };
      }),
    `user:${ownerId}`,
  );
}

test("own template can be reviewed, started, recorded and repeated from its saved result", async ({
  page,
  browser,
}) => {
  const fixture = await createFixture(true);
  await authenticate(page, fixture);
  const headers = { "x-miron-owner": fixture.id, Origin: APP };
  const inventory = await page.request.put(`${APP}/api/workout-builder/inventory`, {
    headers,
    data: { operationId: randomUUID(), expectedRevision: 0, place: "home", resources: [] },
  });
  expect(inventory.status()).toBe(200);
  const savedInventory = (await inventory.json()) as { revision: number };
  const catalogResponse = await page.request.get(
    `${APP}/api/workout-builder/catalog?place=home&direction=strength&equipment=bodyweight`,
    { headers },
  );
  expect(catalogResponse.status()).toBe(200);
  const catalog = (await catalogResponse.json()) as {
    exercises: { revisionId: string; metric: string }[];
  };
  const exercise = catalog.exercises.find((item) => item.metric === "reps");
  if (!exercise) throw new Error("Seed an available home bodyweight exercise for the live test.");
  const result = await page.request.post(`${APP}/api/workout-builder/templates`, {
    headers,
    data: {
      operationId: randomUUID(),
      id: randomUUID(),
      expectedRevision: 0,
      name: "Моя первая сборка",
      place: "home",
      direction: "strength",
      inventoryRevision: savedInventory.revision,
      steps: [{ revisionId: exercise.revisionId, sets: 1, target: 8, restSeconds: 30 }],
    },
  });
  expect(result.status()).toBe(201);
  await page.goto("/workout-builder");
  await page.getByRole("link", { name: /Начать Моя первая сборка/ }).click();
  await expect(page.getByRole("heading", { name: "Моя первая сборка", exact: true })).toBeVisible();
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: `.local/previews/saved-start-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Начать тренировку", exact: true }).click();
  const workoutChat = page.getByText("Спросить напарника во время занятия", { exact: true });
  await workoutChat.click();
  await page
    .getByRole("textbox", { name: "Сообщение напарнику", exact: true })
    .fill("Черновик вопроса во время занятия");
  await workoutChat.click();
  await workoutChat.click();
  await expect(page.getByRole("textbox", { name: "Сообщение напарнику", exact: true })).toHaveValue(
    "Черновик вопроса во время занятия",
  );
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({
      path: `.local/previews/workout-active-${width}.png`,
      fullPage: width < 1000,
    });
  }
  await expect(page).toHaveURL(`${APP}/workout`);
  await page.getByRole("button", { name: "Записать подход 1", exact: true }).click();
  await page.getByRole("button", { name: "Исправить подход 1", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Исправить подход", exact: true })).toBeFocused();
  await page.getByRole("spinbutton", { name: "Вес, кг", exact: true }).fill("30");
  await page.getByRole("button", { name: "Сохранить исправление", exact: true }).click();
  await page.getByRole("button", { name: "Исправить подход 1", exact: true }).click();
  await page.context().setOffline(true);
  await page.getByRole("spinbutton", { name: "Вес, кг", exact: true }).fill("25");
  await page.getByRole("button", { name: "Сохранить исправление", exact: true }).click();
  await expect(page.getByText(/Ждут подключения/).first()).toBeVisible();
  await page.context().setOffline(false);
  await expect
    .poll(async () => {
      const response = await page.request.get(`${APP}/api/workouts/current`);
      const state = (await response.json()) as {
        workout: { recordedSets: { weightKg: number }[] };
      };
      return state.workout.recordedSets[0]?.weightKg;
    })
    .toBe(25);
  await page.getByRole("button", { name: "Исправить подход 1", exact: true }).click();
  await page.getByRole("button", { name: "Отменить последнюю запись", exact: true }).click();
  await page.getByRole("button", { name: "Да, отменить запись", exact: true }).click();
  await page.getByRole("button", { name: "Записать подход 1", exact: true }).click();
  await page.getByRole("button", { name: "Завершить тренировку", exact: true }).click();
  await expect(page.getByRole("heading", { name: "План выполнен", exact: true })).toBeVisible();
  await expect(page.getByText("Первый шаг", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Новая глава твоей истории/ })).toBeVisible();
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "В самый раз", exact: true }).click();
  await expect(page.getByText("Первый шаг", { exact: true })).toBeVisible();
  await expect(page.getByText("+20 XP", { exact: true })).toBeVisible();
  await page.context().setOffline(false);
  await expect(
    page.getByText("Оценка записана на устройстве. Отправим при синхронизации.", { exact: true }),
  ).toHaveCount(0);
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: `.local/previews/workout-summary-${width}.png`, fullPage: true });
  }
  await page.getByRole("link", { name: "Сохранить как шаблон", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Название тренировки", exact: true })
    .fill("Повторю через неделю");
  await page.getByRole("button", { name: "Сохранить в библиотеку", exact: true }).click();
  await expect(
    page.getByText("«Повторю через неделю» теперь в твоей библиотеке.", { exact: true }),
  ).toBeVisible();
  await page.goto("/calendar");
  await page
    .getByLabel("Тренировка", { exact: true })
    .selectOption({ label: "Повторю через неделю" });
  await page.getByRole("button", { name: "Добавить в календарь", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Повторю через неделю", exact: true }),
  ).toBeVisible();
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: `.local/previews/calendar-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Перенести", exact: true }).click();
  await page.getByLabel("Новая дата", { exact: true }).fill("2026-10-24");
  await page.getByRole("button", { name: "Подтвердить перенос", exact: true }).click();
  await page.getByLabel("День", { exact: true }).fill("2026-10-24");
  await expect(
    page.getByRole("heading", { name: "Повторю через неделю", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Пропустить", exact: true }).click();
  await expect(page.getByText(/Пропущено ·/)).toBeVisible();
  await page.goto("/progress");
  const xpBefore = (await accountState(page)).progress.xp;
  await page.getByRole("link", { name: "Записанные подходы", exact: true }).click();
  await page.getByRole("button", { name: "Исправить подход 1", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Вес, кг", exact: true }).fill("12");
  await page.getByRole("button", { name: "Сохранить исправление", exact: true }).click();
  await expect(page).toHaveURL(`${APP}/progress`);
  expect((await accountState(page)).progress.xp).toBe(xpBefore);
  await page.getByRole("link", { name: "Повторить тренировку", exact: true }).click();
  await page.getByRole("button", { name: "Начать тренировку", exact: true }).click();
  await expect(page).toHaveURL(`${APP}/workout`);
  await expect(page.getByRole("button", { name: "Записать подход 1", exact: true })).toBeEnabled();
  const current = await page.request.get(`${APP}/api/workouts/current`);
  const repeated = (await current.json()) as { workout: { recordedSets: unknown[] } | null };
  expect(repeated.workout?.recordedSets).toEqual([]);
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Записать подход 1", exact: true }).click();
  const other = await browser.newContext();
  try {
    const second = await other.newPage();
    await authenticate(second, fixture);
    const response = await other.request.get(`${APP}/api/workouts/current`);
    const server = (await response.json()) as {
      workout: { id: string; revision: number; exercises: { id: string }[] };
    };
    const remoteSetId = randomUUID();
    const remote = await other.request.post(`${APP}/api/workouts/${server.workout.id}/commands`, {
      headers,
      data: {
        operationId: randomUUID(),
        expectedRevision: server.workout.revision,
        command: {
          type: "record_set",
          exerciseId: server.workout.exercises[0].id,
          setId: remoteSetId,
          reps: 8,
          weightKg: 5,
        },
      },
    });
    expect(remote.status()).toBe(200);
    await page.context().setOffline(false);
    await expect(
      page.getByText(/Тренировка изменилась на другом устройстве/).first(),
    ).toBeVisible();
    await page.goto("/workout/recovery");
    await page
      .getByRole("button", { name: "Сохранить копию и принять серверную версию", exact: true })
      .click();
    await expect(
      page.getByText(/Открыта серверная версия\. Локальные действия сохранены отдельной копией/),
    ).toBeVisible();
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "Скачать копию журнала", exact: true }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toMatch(/^miron-workout-journal-/);
    const confirmed = await other.request.get(`${APP}/api/workouts/current`);
    const actual = (await confirmed.json()) as { workout: { recordedSets: { id: string }[] } };
    expect(actual.workout.recordedSets.map((set) => set.id)).toEqual([remoteSetId]);
    await expect(
      page.getByText("В очереди нет неподтверждённых действий.", { exact: true }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});

test("account export is complete, direct deletion is fenced and deletion requires fresh confirmation", async ({
  page,
}) => {
  const alice = await createFixture(true),
    bob = await createFixture(true);
  await authenticate(page, alice);
  const headers = { Origin: APP, "x-miron-owner": alice.id };
  const dish = await page.request.post(`${APP}/api/workout-builder/nutrition`, {
    headers,
    data: {
      type: "save_dish",
      operationId: randomUUID(),
      expectedRevision: 0,
      name: "Суп для экспорта",
      ingredients: "Свои продукты",
      portionGrams: 250,
      per100g: null,
      vegetarian: true,
    },
  });
  expect(dish.status()).toBe(200);
  const direct = await page.request.post(`${APP}/api/auth/delete-user`, { headers, data: {} });
  expect(direct.status()).toBe(404);
  const foreign = await page.request.post(`${APP}/api/account/delete`, {
    headers: { ...headers, "x-miron-owner": bob.id },
    data: { confirmation: "УДАЛИТЬ" },
  });
  expect(foreign.status()).toBe(409);
  const missing = await page.request.post(`${APP}/api/account/delete`, { headers, data: {} });
  expect(missing.status()).toBe(400);
  await pool.query(
    "UPDATE auth_sessions SET created_at=now()-interval '20 minutes' WHERE user_id=$1",
    [alice.id],
  );
  const old = await page.request.post(`${APP}/api/account/delete`, {
    headers,
    data: { confirmation: "УДАЛИТЬ" },
  });
  expect(old.status()).toBe(409);
  expect((await old.json()).error.code).toBe("REAUTH_REQUIRED");
  await pool.query("UPDATE auth_sessions SET created_at=now() WHERE user_id=$1", [alice.id]);
  const exported = await page.request.get(`${APP}/api/account/export`, { headers });
  expect(exported.status()).toBe(200);
  const data = (await exported.json()) as {
    account: { id: string };
    data: { nutrition_profiles: { dishes: { name: string }[] }[] };
  };
  expect(data.account.id).toBe(alice.id);
  expect(data.data.nutrition_profiles[0].dishes[0].name).toBe("Суп для экспорта");
  expect(data).not.toHaveProperty("sessions");
  expect(data.data).not.toHaveProperty("auth_accounts");
  await page.goto("/settings/account");
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать архив аккаунта", exact: true }).click();
  expect((await event).suggestedFilename()).toBe("miron-account-data.json");
  await page.getByText("Перейти к удалению", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Удалить аккаунт и мои данные", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Для подтверждения напиши УДАЛИТЬ", { exact: true }).fill("УДАЛИТЬ");
  await page
    .getByRole("checkbox", { name: "Понимаю, что история и прогресс удалятся", exact: true })
    .check();
  await page.getByRole("button", { name: "Удалить аккаунт и мои данные", exact: true }).click();
  await expect(page).toHaveURL(`${APP}/sign-in?deleted=1`);
  for (const table of [
    "users",
    "profiles",
    "ai_trials",
    "nutrition_profiles",
    "auth_sessions",
    "auth_accounts",
  ]) {
    const column = table === "users" ? "id" : "user_id";
    const count = await pool.query<{ count: string }>(
      `SELECT count(*) FROM ${table} WHERE ${column}=$1`,
      [alice.id],
    );
    expect(Number(count.rows[0].count)).toBe(0);
  }
  expect((await pool.query("SELECT id FROM users WHERE id=$1", [bob.id])).rowCount).toBe(1);
});

test("archive keeps data accessible and lost deletion ACK never leaves the owner's local copies", async ({
  page,
}) => {
  const fixture = await createFixture(true);
  await authenticate(page, fixture);
  await pool.query(
    "UPDATE ai_trials SET starts_at=now()-interval '8 days',ends_at=now()-interval '1 day' WHERE user_id=$1",
    [fixture.id],
  );
  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "Архив аккаунта" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Посмотреть прогресс", exact: true })).toBeVisible();
  await page.goto("/settings/account");
  await page.getByText("Перейти к удалению", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Для подтверждения напиши УДАЛИТЬ", exact: true })
    .fill("УДАЛИТЬ");
  await page.getByRole("checkbox").check();
  await page.route("**/api/account/delete", async (route) => {
    const result = await route.fetch();
    expect(result.ok()).toBe(true);
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Удалить аккаунт и мои данные", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in\?deletion=unconfirmed$/);
  await expect(page.getByText(/удаление на сервере не подтверждено/)).toBeVisible();
  expect((await pool.query("SELECT id FROM users WHERE id=$1", [fixture.id])).rowCount).toBe(0);
  const residue = await page.evaluate(async (owner) => {
    const request = indexedDB.open("miron-offline-v1");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await Promise.all(
        ["states", "pending", "workoutBackups"]
          .filter((name) => db.objectStoreNames.contains(name))
          .map(
            (name) =>
              new Promise<number>((resolve, reject) => {
                const rows = db.transaction(name).objectStore(name).getAll();
                rows.onsuccess = () =>
                  resolve(
                    (rows.result as { key?: string; owner?: string }[]).filter(
                      (row) => row.owner === owner || row.key === owner,
                    ).length,
                  );
                rows.onerror = () => reject(rows.error);
              }),
          ),
      );
    } finally {
      db.close();
    }
  }, `user:${fixture.id}`);
  expect(residue).toHaveLength(3);
  expect(residue.every((count) => count === 0)).toBe(true);
});

test("nutrition separates meal ideas, actual portions and custom dishes across devices", async ({
  page,
  browser,
}) => {
  const fixture = await createFixture(true);
  await pool.query("UPDATE profiles SET theme='rose',companion='lika' WHERE user_id=$1", [
    fixture.id,
  ]);
  await authenticate(page, fixture);
  await page.goto("/nutrition");
  await expect(
    page.getByRole("heading", { name: "Еда без крайностей", exact: true }),
  ).toBeVisible();
  await page.getByText("Твои предпочтения", { exact: true }).click();
  await page
    .getByLabel("Предпочтение: Овсяные хлопья, сухие", { exact: true })
    .selectOption("exclude");
  await page.getByRole("checkbox", { name: "Без мяса и рыбы", exact: true }).check();
  await page.getByRole("button", { name: "Сохранить предпочтения", exact: true }).click();
  await expect(page.getByText("Сохранено в аккаунте.", { exact: true })).toBeVisible();
  await page.getByText("Предложить идеи меню", { exact: true }).click();
  await page.getByLabel("Ограничения перед идеями меню", { exact: true }).selectOption("medical");
  await expect(
    page.getByRole("button", { name: "Заменить план идеями на день", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Ограничения перед идеями меню", { exact: true }).selectOption("general");
  await page.getByRole("button", { name: "Заменить план идеями на день", exact: true }).click();
  const day = await page.getByLabel("День питания", { exact: true }).inputValue();
  const read = async () => {
    const response = await page.request.get(`${APP}/api/workout-builder/nutrition?date=${day}`, {
      headers: { "x-miron-owner": fixture.id },
    });
    expect(response.status()).toBe(200);
    return response.json() as Promise<{
      preferences: { mode: string };
      day: {
        planned: { dish: { foodIds: string[] } }[];
        entries: { dish: { name: string }; mode: string; grams: number; nutrients: unknown }[];
      };
    }>;
  };
  await expect.poll(async () => (await read()).day.planned.length).toBeGreaterThan(0);
  expect((await read()).day.entries).toEqual([]);
  expect(
    (await read()).day.planned.every(
      (item) => !item.dish.foodIds.some((id) => ["porridge", "chicken", "salmon"].includes(id)),
    ),
  ).toBe(true);
  await page
    .getByRole("article")
    .first()
    .getByRole("button", { name: "Съел", exact: true })
    .click();
  await page.getByLabel("Примерно порций", { exact: true }).selectOption("1.5");
  await page.getByRole("button", { name: "Записать еду", exact: true }).click();
  await expect.poll(async () => (await read()).day.entries.length).toBe(1);
  const original = (await read()).day.entries[0];
  await page.getByLabel("Подсчёт", { exact: true }).selectOption("precise");
  await expect.poll(async () => (await read()).preferences.mode).toBe("precise");
  expect((await read()).day.entries[0]).toEqual(original);
  await page.getByRole("button", { name: "Библиотека блюд", exact: true }).click();
  await page.getByRole("button", { name: "Своё блюдо", exact: true }).click();
  await page.getByLabel("Название блюда", { exact: true }).fill("Мой суп");
  await page.getByLabel("Состав", { exact: true }).fill("Картофель, чечевица, морковь, вода");
  await page.getByRole("button", { name: "Сохранить блюдо", exact: true }).click();
  const own = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Мой суп", exact: true }) });
  await own.getByRole("button", { name: "Съел", exact: true }).click();
  await page.getByLabel("Сколько съедено, г", { exact: true }).fill("350");
  await page.getByRole("button", { name: "Записать еду", exact: true }).click();
  await expect.poll(async () => (await read()).day.entries.length).toBe(2);
  expect((await read()).day.entries[1]).toMatchObject({
    grams: 350,
    mode: "precise",
    nutrients: null,
  });
  await page.getByRole("button", { name: "Мой день", exact: true }).click();
  await expect(
    page.getByText("Без оценки калорий: 1. Они не включены в сумму.", { exact: true }),
  ).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: `.local/previews/nutrition-${width}.png`, fullPage: true });
  }
  const secondContext = await browser.newContext();
  try {
    const second = await secondContext.newPage();
    await authenticate(second, fixture);
    await second.goto("/nutrition");
    await expect(second.getByRole("heading", { name: "Мой суп", exact: true })).toBeVisible();
    await expect(
      second.getByText("Без оценки калорий: 1. Они не включены в сумму.", { exact: true }),
    ).toBeVisible();
  } finally {
    await secondContext.close();
  }
});

test("story chapters use confirmed account days across devices without changing XP", async ({
  page,
  browser,
}) => {
  const fixture = await createFixture(true);
  await pool.query("UPDATE profiles SET theme='rose' WHERE user_id=$1", [fixture.id]);
  const planId = randomUUID();
  await pool.query("INSERT INTO plans (id,user_id,name) VALUES ($1,$2,'Story E2E')", [
    planId,
    fixture.id,
  ]);
  const revision = await pool.query<{ id: string }>("SELECT id FROM variant_revisions LIMIT 1");
  if (!revision.rows[0]) throw new Error("Seed the local exercise catalog first.");
  for (let index = 0; index < 4; index++) {
    const workoutId = randomUUID();
    const stepId = randomUUID();
    await pool.query(
      `INSERT INTO workouts (id,user_id,plan_id,name,status,place,available_seconds,source_profile_revision,reward_day,completed_at)
       VALUES ($1,$2,$3,'Story E2E','partial','home',1200,1,$4,now())`,
      [workoutId, fixture.id, planId, `2026-10-${String(index + 10).padStart(2, "0")}`],
    );
    await pool.query(
      `INSERT INTO workout_steps (id,user_id,workout_id,variant_revision_id,ordinal,name,sets,reps,instructions,metric)
       VALUES ($1,$2,$3,$4,0,'Story E2E',1,8,'Fixture','reps')`,
      [stepId, fixture.id, workoutId, revision.rows[0].id],
    );
    await pool.query(
      "INSERT INTO recorded_sets (user_id,workout_id,step_id,set_index,reps) VALUES ($1,$2,$3,0,8)",
      [fixture.id, workoutId, stepId],
    );
  }
  await authenticate(page, fixture);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Уровень 1. Открыть прогресс", exact: true }).click();
  await page.getByRole("button", { name: "Твоя история", exact: true }).click();
  await expect(page.getByText("Открыто 3 из 4 глав", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Дальше вместе/ })).toBeDisabled();
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [768, 1024],
    [1440, 1000],
    [2560, 1440],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.locator("img").evaluateAll(async (images) => {
      await Promise.all(
        images.map((image) => {
          if (!(image instanceof HTMLImageElement)) return;
          image.loading = "eager";
          return image.decode().catch(() => undefined);
        }),
      );
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `.local/previews/journey-collection-${width}.png`,
      fullPage: true,
    });
    if (width === 390)
      await page.screenshot({ path: ".local/previews/journey-mobile-viewport.png" });
  }
  await page.getByRole("button", { name: "Читать главу", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Своя тропа", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Отметить прочитанной", exact: true }).click();
  await expect(page.getByText("Глава прочитана", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: ".local/previews/journey-reader-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "К списку глав", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Твоя история", exact: true })).toBeFocused();
  await page.getByRole("button", { name: /00\. Знакомство\. Читать главу/ }).click();
  await page.getByRole("button", { name: "К главам", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Твоя история", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Опыт и достижения", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Уровень 1", exact: true })).toBeFocused();
  await pool.query("UPDATE profiles SET theme='dark' WHERE user_id=$1", [fixture.id]);
  await page.reload();
  await page.getByRole("button", { name: "Уровень 1. Открыть прогресс", exact: true }).click();
  await page.getByRole("button", { name: "Твоя история", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Твоя история", exact: true })).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: ".local/previews/journey-collection-dark.png", fullPage: true });
  await page.goto("/progress");
  await page.getByRole("button", { name: "Твоя история", exact: true }).click();
  await expect(page.getByText("Открыто 3 из 4 глав", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Твоя история", exact: true })).toBeFocused();
  await expect
    .poll(async () => {
      const bounds = await page
        .getByRole("heading", { name: "Твоя история", exact: true })
        .boundingBox();
      return Boolean(bounds && bounds.y >= -1 && bounds.y + bounds.height < 1000);
    })
    .toBe(true);

  const secondDevice = await browser.newContext({ reducedMotion: "reduce" });
  try {
    const secondPage = await secondDevice.newPage();
    await authenticate(secondPage, fixture);
    await secondPage.goto("/dashboard");
    await secondPage
      .getByRole("button", { name: "Уровень 1. Открыть прогресс", exact: true })
      .click();
    await secondPage.getByRole("button", { name: "Твоя история", exact: true }).click();
    await expect(secondPage.getByText("Открыто 3 из 4 глав", { exact: true })).toBeVisible();
    expect((await accountState(secondPage)).progress.xp).toBe(0);
    const other = await createFixture(true);
    await authenticate(secondPage, other);
    await secondPage.goto("/dashboard");
    await secondPage
      .getByRole("button", { name: "Уровень 1. Открыть прогресс", exact: true })
      .click();
    await secondPage.getByRole("button", { name: "Твоя история", exact: true }).click();
    await expect(secondPage.getByText("Открыто 1 из 4 глав", { exact: true })).toBeVisible();
  } finally {
    await secondDevice.close();
  }
});

test("public story and default demo stay in the polished design preview without private writes", async ({
  page,
}) => {
  const privateWrites: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/") && request.method() !== "GET")
      privateWrites.push(new URL(request.url()).pathname);
  });
  await page.goto("/demo");
  await expect(page).toHaveURL(`${APP}/story`);
  await reachInterests(page);
  await reachFinish(page, "lika");
  await expect(page.getByRole("checkbox", { name: "Мне уже исполнилось 18 лет" })).toHaveCount(0);
  await page.getByRole("button", { name: "Погнали", exact: true }).click();
  await expect(page).toHaveURL(`${APP}/story/home`);
  await expect(page.getByText("Дизайн-прототип", { exact: false }).first()).toBeVisible();
  await page.goto("/story");
  await expect(page).toHaveURL(`${APP}/story/home`);
  expect(privateWrites).toEqual([]);
});
