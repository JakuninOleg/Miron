import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";
import type {
  CommandAck,
  CommandEnvelope,
  Workout,
  WorkoutCommand,
} from "../../src/shared/contracts";
import type {
  PlannerConfig,
  PlannerPreview,
  PlannerProgram,
} from "../../src/shared/workout-planner";

const APP = process.env.E2E_BASE_URL ?? "http://localhost:3080";
const enabled = process.env.MIRON_METHODS_E2E === "1";
test.use({ baseURL: APP, reducedMotion: "reduce", trace: "off", video: "off" });
test.skip(!enabled, "MIRON_METHODS_E2E=1 and a local test auth server are required.");
test.setTimeout(90000);
const account = {
  id: randomUUID(),
  email: `methods-${randomUUID()}@example.test`,
  password: randomBytes(24).toString("hex"),
};
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
      "Methods E2E requires local PostgreSQL:55432/miron and a matching development auth URL.",
    );
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  await pool.query("INSERT INTO users (id,name,email,email_verified) VALUES ($1,$2,$3,true)", [
    account.id,
    "Методы E2E",
    account.email,
  ]);
  await pool.query(
    "INSERT INTO auth_accounts (id,user_id,account_id,provider_id,password) VALUES ($1,$2,$3,'credential',$4)",
    [randomUUID(), account.id, account.id, await hashPassword(account.password)],
  );
  await pool.query(
    "INSERT INTO profiles (user_id,display_name,theme,experience,adult_confirmed,onboarding_completed) VALUES ($1,$2,'rose','regular',true,true)",
    [account.id, "Методы E2E"],
  );
});
test.afterAll(async () => {
  if (!pool) return;
  await pool.query("DELETE FROM users WHERE id=$1", [account.id]);
  await pool.end();
});

test("method selection, pinned preview and atomic last-set entry on mobile and desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const login = await page.request.post(`${APP}/api/auth/sign-in/email`, {
    headers: { Origin: APP },
    data: { email: account.email, password: account.password },
  });
  expect(login.status(), await login.text()).toBe(200);
  const headers = { "x-miron-owner": account.id };
  const inventory = await page.request.put(`${APP}/api/workout-builder/inventory`, {
    headers,
    data: { operationId: randomUUID(), expectedRevision: 0, place: "gym", resources: [] },
  });
  expect(inventory.status(), await inventory.text()).toBe(200);
  await page.goto("/workout-builder");
  await page.getByRole("button", { name: "Подобрать тренировку", exact: true }).click();
  await page.getByRole("button", { name: /^Тренажёрный зал|^Зал/ }).click();
  await page.getByRole("button", { name: "Настроить подбор", exact: true }).click();
  await expect(page.getByLabel("Добавить дропсет, если подходит", { exact: false })).toBeVisible();
  await page.getByLabel("Распределение нагрузки", { exact: true }).selectOption("push_pull_legs");
  await page.getByLabel("Время на занятие", { exact: true }).selectOption("90");
  await page.getByLabel("Поддерживать форму", { exact: false }).check();
  await page.getByLabel("Добавить дропсет, если подходит", { exact: false }).check();
  await expect(page.getByRole("option", { name: "Суперсеты А–Б", exact: true })).toHaveCount(1);
  const pending = page.waitForResponse(
    (response) =>
      response.url().endsWith("/planner/preview") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Показать подбор", exact: true }).click();
  const response = await pending;
  expect(response.status(), await response.text()).toBe(200);
  const preview = (await response.json()) as PlannerPreview;
  const day = preview.days.find((entry) => entry.steps.some((step) => step.dropSet));
  expect(day).toBeDefined();
  await expect(page.getByText(/^Дропсет: в последнем подходе/).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  const config: PlannerConfig = preview.config;
  const confirmed = await page.request.post(`${APP}/api/workout-builder/planner/confirm`, {
    headers,
    data: {
      operationId: randomUUID(),
      expectedProgramRevision: preview.expectedProgramRevision,
      fingerprint: preview.fingerprint,
      config,
    },
  });
  expect(confirmed.status(), await confirmed.text()).toBe(200);
  const program = (await confirmed.json()) as PlannerProgram;
  const start = await page.request.post(`${APP}/api/workout-builder/planner/start`, {
    headers,
    data: {
      operationId: randomUUID(),
      expectedProgramRevision: program.revision,
      dayKey: day!.key,
    },
  });
  expect(start.status(), await start.text()).toBe(200);
  let workout = (await start.json()) as Workout;
  const send = async (command: WorkoutCommand) => {
    const result = await page.request.post(`${APP}/api/workouts/${workout.id}/commands`, {
      data: { operationId: randomUUID(), expectedRevision: workout.revision, command },
    });
    expect(result.status(), await result.text()).toBe(200);
    workout = ((await result.json()) as CommandAck).workout;
  };
  while (true) {
    const exercise = workout.exercises[workout.currentIndex];
    const count = workout.recordedSets.filter((set) => set.exerciseId === exercise.id).length;
    if (exercise.dropSet && count === exercise.sets - 1) break;
    if (count === exercise.sets) {
      await send({ type: "next_exercise" });
      continue;
    }
    await send(
      exercise.metric === "time"
        ? {
            type: "record_timed_set",
            exerciseId: exercise.id,
            setId: randomUUID(),
            durationSeconds: 20,
          }
        : {
            type: "record_set",
            exerciseId: exercise.id,
            setId: randomUUID(),
            reps: exercise.targetReps,
            weightKg: 10,
          },
    );
  }
  await page.goto("/workout");
  const method = page.getByRole("group", { name: "Последний подход · дропсет", exact: true });
  await expect(method).toBeVisible();
  await page.getByLabel("Снижение веса выполнено", { exact: true }).check();
  await page.getByLabel("Сниженный вес, кг", { exact: true }).fill("7.5");
  const exercise = workout.exercises[workout.currentIndex];
  await page.getByLabel(`Подход ${exercise.sets}, вес в килограммах`, { exact: true }).fill("10");
  await expect(
    page.getByRole("button", { name: `Записать подход ${exercise.sets}`, exact: true }),
  ).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await method.screenshot({ path: ".local/previews/drop-set-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await method.screenshot({ path: ".local/previews/drop-set-desktop.png" });
  const saved = page.waitForResponse(
    (result) =>
      result.url().endsWith(`/api/workouts/${workout.id}/commands`) &&
      result.request().method() === "POST",
  );
  await page.getByRole("button", { name: `Записать подход ${exercise.sets}`, exact: true }).click();
  const savedResponse = await saved;
  expect(savedResponse.status(), await savedResponse.text()).toBe(200);
  const ack = (await savedResponse.json()) as CommandAck;
  const envelope = savedResponse.request().postDataJSON() as CommandEnvelope;
  expect(ack.workout.recordedSets.filter((set) => set.exerciseId === exercise.id)).toHaveLength(
    exercise.sets,
  );
  expect(ack.workout.recordedSets.at(-1)?.drop).toEqual({ reps: 8, weightKg: 7.5 });
  await expect(method).toContainText("Снижение: 8 повт. × 7.5 кг");
  const retry = await page.request.post(`${APP}/api/workouts/${workout.id}/commands`, {
    data: envelope,
  });
  expect(await retry.json()).toEqual(ack);
  const stored = await pool.query<{ drop_result: { reps: number; weightKg: number } }>(
    "SELECT drop_result FROM recorded_sets WHERE user_id=$1 AND id=$2",
    [account.id, envelope.command.type === "record_set" ? envelope.command.setId : null],
  );
  expect(stored.rows[0].drop_result).toEqual({ reps: 8, weightKg: 7.5 });
  await page.reload();
  await expect(
    page.getByRole("group", { name: "Последний подход · дропсет", exact: true }),
  ).toContainText("Снижение: 8 повт. × 7.5 кг");
});
