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
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ПРИВЕТ");
  await advance(page, "Давай знакомиться");
  await advance(page);
  await advance(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/ЧТО ТЕБЕ\s*БЛИЖЕ\?/);
}

async function reachFinish(page: Page, companion: "max" | "lika") {
  await advance(page);
  await page
    .getByRole("button", { name: companion === "lika" ? /^ЛИКА Внимание/ : /^МАКС Энергия/ })
    .click();
  await advance(page, companion === "lika" ? "Начать с Ликой" : "Начать с Максом");
  await expect(page.getByRole("heading", { name: /^ГОТОВО/ })).toBeVisible();
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
  await page.getByRole("button", { name: "Дома", exact: true }).click();
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
  await expect(page.getByRole("heading", { name: "Лика", exact: true })).toBeVisible();
  const confirmed = await accountState(page);
  expect(confirmed.profile.interests).toEqual(["yoga", "home"]);
  expect(confirmed.progress).toEqual({ xp: 0, completedWorkouts: 0, history: [] });
  await capture(page, ".local/previews/account-dashboard-lika-mobile.png");
  await page.getByRole("link", { name: "Просто потренироваться", exact: true }).click();
  await expect(page).toHaveURL(/\/workout-builder\?from=dashboard&mode=single$/);
  await expect(page.getByRole("heading", { name: "Где сегодня занимаемся?" })).toBeVisible();
  await page.getByRole("button", { name: /^Дома/ }).click();
  await page.getByRole("button", { name: "Силовая", exact: true }).click();
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
  await page.getByRole("button", { name: "Силовые", exact: true }).click();
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
  await expect(page.getByRole("heading", { name: "С возвращением", exact: true })).toBeVisible();
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
