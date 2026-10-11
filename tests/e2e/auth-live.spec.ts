import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { Pool } from "pg";
import { expect, test, type Page } from "@playwright/test";
import type { AccountState } from "../../src/shared/contracts";

const APP = "http://localhost:3000";
const MAILPIT = "http://127.0.0.1:8025";
const enabled = process.env.MIRON_LIVE_AUTH_E2E === "1";

// These credentials and bearer links are ephemeral and must not enter test traces or logs.
test.use({ baseURL: APP, trace: "off", video: "off" });
test.skip(!enabled, "Opt in with MIRON_LIVE_AUTH_E2E=1; isolated local services only.");

interface MailSummary {
  ID: string;
  To: { Address: string }[];
  Subject: string;
}
interface MailDetail {
  To: { Address: string }[];
  Text: string;
}
interface ProfileRow {
  display_name: string;
  companion: string;
  goal: string;
  experience: string;
  weekly_days: number;
  default_minutes: number;
  timezone: string;
  training_days: number[];
  reminder_time: string;
  onboarding_completed: boolean;
  adult_confirmed: boolean;
  location: string;
  discipline: string;
}

function localDatabaseURL() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("Live auth E2E requires the local DATABASE_URL.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Live auth E2E DATABASE_URL is invalid.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.port !== "55432" ||
    url.pathname !== "/miron" ||
    process.env.NODE_ENV === "production" ||
    process.env.BETTER_AUTH_URL !== APP ||
    !["localhost", "127.0.0.1"].includes(process.env.SMTP_HOST ?? "") ||
    process.env.SMTP_PORT !== "1025"
  )
    throw new Error(
      "Live auth E2E requires localhost:3000, local PostgreSQL:55432/miron and Mailpit SMTP:1025.",
    );
  return raw;
}

async function verificationLink(email: string): Promise<URL> {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    // Search by this test's unique recipient; never fetch another recipient's message body.
    const search = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!search.ok) throw new Error("Local Mailpit search is unavailable.");
    const listing = (await search.json()) as { messages: MailSummary[] };
    const message = listing.messages.find(
      (entry) =>
        entry.To.some((to) => to.Address === email) && entry.Subject.includes("Подтвердите"),
    );
    if (message) {
      const response = await fetch(`${MAILPIT}/api/v1/message/${encodeURIComponent(message.ID)}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error("The own local verification message is unavailable.");
      const detail = (await response.json()) as MailDetail;
      if (!detail.To.some((to) => to.Address === email))
        throw new Error("Mailpit recipient mismatch; message ignored.");
      const raw = detail.Text.match(/https?:\/\/[^\s]+/)?.[0];
      if (!raw) throw new Error("The own verification message contains no link.");
      const link = new URL(raw);
      if (
        link.origin !== APP ||
        link.pathname !== "/api/auth/verify-email" ||
        !link.searchParams.get("token")
      )
        throw new Error("The own verification link does not target local MIRON.");
      return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("The own verification message was not delivered to local Mailpit.");
}

async function fillPassword(page: Page, password: string) {
  try {
    await page.getByLabel("Пароль", { exact: true }).fill(password);
  } catch {
    throw new Error("The password field is unavailable; credential omitted.");
  }
}

async function signIn(page: Page, email: string, password: string) {
  await page.waitForLoadState("load");
  // Logout performs a full navigation. A URL change can precede React hydration;
  // this observable state change proves the controlled form is interactive.
  await page.getByRole("button", { name: "Показать пароль", exact: true }).click();
  await expect(page.getByLabel("Пароль", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Скрыть пароль", exact: true }).click();
  await expect(page.getByLabel("Пароль", { exact: true })).toHaveAttribute("type", "password");
  await page.getByLabel("Почта", { exact: true }).fill(email);
  await fillPassword(page, password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
}

test("real browser email verification, persisted onboarding, logout and re-entry", async ({
  page,
}) => {
  test.setTimeout(120000);
  const databaseURL = localDatabaseURL();
  const pool = new Pool({
    connectionString: databaseURL,
    max: 1,
    connectionTimeoutMillis: 5000,
    query_timeout: 10000,
  });
  const email = `ui-auth-${randomUUID()}@example.test`;
  const password = `E2E-${randomBytes(24).toString("hex")}`;
  let userId: string | null = null;
  let signupAttempted = false;
  try {
    const existing = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    expect(existing.rowCount).toBe(0);
    const config = await page.request.get(`${APP}/api/auth/config`);
    if (!config.ok()) throw new Error(`Local auth config failed with HTTP ${config.status()}.`);
    const methods = (await config.json()) as {
      emailPassword: boolean;
      requireEmailVerification: boolean;
    };
    expect(methods.emailPassword).toBe(true);
    expect(methods.requireEmailVerification).toBe(true);

    await page.goto("/demo");
    await expect(page.getByLabel("Как тебя зовут?", { exact: true })).toBeVisible();
    await page.goto("/sign-up");
    await page.getByLabel("Твоё имя", { exact: true }).fill("E2E Участник");
    await page.getByLabel("Почта", { exact: true }).fill(email);
    await fillPassword(page, password);
    signupAttempted = true;
    await page.getByRole("button", { name: "Создать аккаунт", exact: true }).click();
    await expect(
      page.getByText("Письмо отправлено. Подтверди почту по ссылке, затем войди в MIRON.", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 15000 });
    const created = await pool.query<{ id: string; email_verified: boolean }>(
      "SELECT id, email_verified FROM users WHERE email = $1",
      [email],
    );
    expect(created.rows).toHaveLength(1);
    userId = created.rows[0].id;
    expect(created.rows[0].email_verified).toBe(false);

    const link = await verificationLink(email);
    // A failed navigation must not print the bearer URL through Playwright's call log.
    try {
      await page.goto(link.href);
    } catch {
      throw new Error("The own local verification link did not load; bearer URL omitted.");
    }
    await expect.poll(() => new URL(page.url()).pathname).toBe("/sign-in");
    expect(new URL(page.url()).searchParams.get("verified")).toBe("1");
    await expect(
      page.getByText("Почта подтверждена. Войди в аккаунт.", { exact: true }),
    ).toBeVisible();
    await signIn(page, email, password);
    await expect(page).toHaveURL(`${APP}/onboarding`, { timeout: 15000 });
    await page.getByLabel("Как тебя зовут?", { exact: true }).fill("Участник проверки");
    await page.getByRole("button", { name: /Лика Тёплая/ }).click();
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
    await page.getByRole("button", { name: /^Больше энергии/ }).click();
    await page.getByRole("button", { name: /^Возвращаюсь/ }).click();
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
    await page.getByRole("button", { name: "2", exact: true }).click();
    await page.getByRole("button", { name: "25 мин", exact: true }).click();
    await page.getByLabel("Как хочется заниматься?", { exact: true }).selectOption("calisthenics");
    await page.getByRole("button", { name: "Пн", exact: true }).click();
    await page.getByRole("button", { name: "Вт", exact: true }).click();
    await page.getByLabel("Время для занятия", { exact: true }).fill("19:30");
    await page.getByLabel("Часовой пояс", { exact: true }).selectOption("Asia/Yekaterinburg");
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
    await page.getByRole("button", { name: "Дома", exact: true }).click();
    await page.getByRole("checkbox", { name: "Гантель", exact: true }).check();
    await page.getByRole("spinbutton", { name: "Количество: Гантель", exact: true }).fill("1");
    await page.getByRole("checkbox", { name: /Есть ровная нескользкая поверхность/ }).check();
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
    await page.getByRole("checkbox", { name: /Мне исполнилось 18 лет/ }).check();
    await page.getByRole("button", { name: "Начать свой путь", exact: true }).click();
    await expect(page).toHaveURL(`${APP}/dashboard`, { timeout: 15000 });
    await expect(
      page.getByRole("heading", { name: "Привет, Участник проверки", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Деморежим", { exact: false })).toHaveCount(0);

    const persisted = await pool.query<ProfileRow>(
      "SELECT display_name, companion, goal, experience, weekly_days, default_minutes, timezone, training_days, reminder_time, onboarding_completed, adult_confirmed, location, discipline FROM profiles WHERE user_id = $1",
      [userId],
    );
    expect(persisted.rows).toEqual([
      {
        display_name: "Участник проверки",
        companion: "lika",
        goal: "energy",
        experience: "returning",
        weekly_days: 2,
        default_minutes: 25,
        timezone: "Asia/Yekaterinburg",
        training_days: [0, 4],
        reminder_time: "19:30",
        onboarding_completed: true,
        adult_confirmed: true,
        location: "home",
        discipline: "calisthenics",
      },
    ]);
    const privateProfile = await page.request.get(`${APP}/api/profile`);
    expect(privateProfile.status()).toBe(200);
    const account = (await privateProfile.json()) as AccountState;
    expect(account.profile.equipment).toEqual(
      expect.arrayContaining([
        { code: "dumbbell", quantity: 1 },
        { code: "floor", quantity: 1 },
        { code: "clear_space", quantity: 1 },
      ]),
    );
    expect(account.progress).toEqual({ xp: 0, completedWorkouts: 0, history: [] });

    await page.goto("/settings");
    await page.getByRole("button", { name: "Выйти", exact: true }).click();
    await expect(page).toHaveURL(`${APP}/sign-in`, { timeout: 15000 });
    const ended = await page.request.get(`${APP}/api/auth/get-session`);
    expect(await ended.json()).toBeNull();
    await signIn(page, email, password);
    await expect(page).toHaveURL(`${APP}/dashboard`, { timeout: 15000 });
    await expect(
      page.getByRole("heading", { name: "Привет, Участник проверки", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Привет, Участник проверки", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(`${APP}/dashboard`);
    expect((await page.request.get(`${APP}/api/profile`)).status()).toBe(200);
  } finally {
    try {
      if (signupAttempted) {
        if (!userId)
          userId =
            (await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]))
              .rows[0]?.id ?? null;
        if (userId) {
          await pool.query("DELETE FROM auth_verifications WHERE value = $1", [userId]);
          await pool.query("DELETE FROM users WHERE id = $1 AND email = $2", [userId, email]);
        }
      }
    } finally {
      await pool.end();
    }
  }
});
