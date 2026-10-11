import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";
import type { CommandAck, CommandEnvelope } from "../../src/shared/contracts";
import { formatWorkoutEnergy } from "../../src/shared/workout-energy";

const APP = process.env.E2E_BASE_URL ?? "http://localhost:3080";
const enabled = process.env.MIRON_ENERGY_E2E === "1";
test.use({ baseURL: APP, reducedMotion: "reduce", trace: "off", video: "off" });
test.skip(!enabled, "Opt in with MIRON_ENERGY_E2E=1; isolated local fixtures only.");
test.setTimeout(90000);
const accounts = ["dark", "rose"].map((theme) => ({
  id: randomUUID(),
  email: `energy-${randomUUID()}@example.test`,
  password: randomBytes(24).toString("hex"),
  theme,
  workoutId: randomUUID(),
  stepIds: [] as string[],
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
      "Energy live tests require local PostgreSQL:55432/miron and a matching development auth URL.",
    );
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const revision = (await pool.query<{ id: string }>("SELECT id FROM variant_revisions LIMIT 1"))
    .rows[0];
  if (!revision) throw new Error("Seed the local catalog first.");
  for (const account of accounts) {
    await pool.query("INSERT INTO users (id,name,email,email_verified) VALUES ($1,$2,$3,true)", [
      account.id,
      "Калории E2E",
      account.email,
    ]);
    await pool.query(
      "INSERT INTO auth_accounts (id,user_id,account_id,provider_id,password) VALUES ($1,$2,$3,'credential',$4)",
      [randomUUID(), account.id, account.id, await hashPassword(account.password)],
    );
    await pool.query(
      "INSERT INTO profiles (user_id,display_name,theme,companion,adult_confirmed,onboarding_completed) VALUES ($1,$2,$3,$4,true,true)",
      [account.id, "Калории E2E", account.theme, account.theme === "rose" ? "lika" : "max"],
    );
    const planId = randomUUID();
    await pool.query("INSERT INTO plans (id,user_id,name) VALUES ($1,$2,$3)", [
      planId,
      account.id,
      "Калории E2E",
    ]);
    await pool.query(
      "INSERT INTO workouts (id,user_id,plan_id,name,status,place,available_seconds,source_profile_revision,current_index,energy_activity,started_at) VALUES ($1,$2,$3,$4,'active','home',1800,1,2,'strength',now())",
      [account.workoutId, account.id, planId, "Энергия E2E"],
    );
    for (let index = 0; index < 3; index++) {
      const stepId = randomUUID();
      account.stepIds.push(stepId);
      await pool.query(
        "INSERT INTO workout_steps (id,user_id,workout_id,variant_revision_id,ordinal,name,sets,reps,instructions) VALUES ($1,$2,$3,$4,$5,$6,3,10,$7)",
        [
          stepId,
          account.id,
          account.workoutId,
          revision.id,
          index,
          `Упражнение ${index + 1}`,
          "Fixture instructions",
        ],
      );
      for (let set = 0; set < 3; set++)
        await pool.query(
          "INSERT INTO recorded_sets (id,user_id,workout_id,step_id,set_index,reps) VALUES ($1,$2,$3,$4,$5,10)",
          [randomUUID(), account.id, account.workoutId, stepId, set],
        );
    }
  }
});
test.afterAll(async () => {
  if (!pool) return;
  await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    accounts.map((account) => account.id),
  ]);
  await pool.end();
});

for (const account of accounts) {
  test(`automatic result, reported revision, history and visibility · ${account.theme}`, async ({
    page,
  }) => {
    await page.setViewportSize(
      account.theme === "rose" ? { width: 320, height: 568 } : { width: 1440, height: 1000 },
    );
    const login = await page.request.post(`${APP}/api/auth/sign-in/email`, {
      headers: { Origin: APP },
      data: { email: account.email, password: account.password },
    });
    expect(login.status(), await login.text()).toBe(200);
    await page.goto("/workout");
    const completed = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/workouts/${account.workoutId}/commands`) &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Завершить тренировку", exact: true }).click();
    const response = await completed;
    expect(response.status()).toBe(200);
    const ack = (await response.json()) as CommandAck;
    expect(ack.workout.energyEstimate).toBeDefined();
    expect(ack.workout.reward?.awardedXp).toBe(50);
    await expect(
      page.getByRole("heading", { name: "Примерный расход", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(formatWorkoutEnergy(ack.workout.energyEstimate!), { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Время занятия, мин")).toHaveCount(0);
    await page.getByText("Как считается", { exact: true }).click();
    await expect(page.getByText(/Длительность оценивается по подходам/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.getByText("Как считается", { exact: true }).click();
    await page
      .getByText("По выполненным подходам, обычному темпу и отдыху.", { exact: true })
      .click();
    await page.screenshot({
      path: `.local/previews/workout-energy-${account.theme}.png`,
      fullPage: true,
    });
    const correction: CommandEnvelope = {
      operationId: randomUUID(),
      expectedRevision: ack.workout.revision,
      command: {
        type: "estimate_energy",
        bodyWeightKg: 80,
        workload: [{ exerciseId: account.stepIds[0], sets: 4, repsPerSet: 12 }],
      },
    };
    const correctedResponse = await page.request.post(
      `${APP}/api/workouts/${account.workoutId}/commands`,
      { data: correction },
    );
    expect(correctedResponse.status(), await correctedResponse.text()).toBe(200);
    const revised = (await correctedResponse.json()) as CommandAck;
    expect(revised.progress.xp).toBe(50);
    expect(revised.workout.recordedSets).toHaveLength(9);
    await page.goto("/progress");
    const energy = formatWorkoutEnergy(revised.workout.energyEstimate!);
    await expect(
      page.getByText(new RegExp(energy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).first(),
    ).toBeVisible();
    await page.goto("/settings");
    await page.getByLabel("Показывать примерный расход калорий от тренировок").uncheck();
    const saved = page.waitForResponse(
      (result) => result.url().endsWith("/api/profile") && result.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Сохранить изменения", exact: true }).click();
    expect((await saved).status()).toBe(200);
    await page.goto("/progress");
    await expect(page.getByText(/ккал от занятия/)).toHaveCount(0);
    const stored = (
      await pool.query<{ energy_estimate: unknown }>(
        "SELECT energy_estimate FROM workouts WHERE id=$1 AND user_id=$2",
        [account.workoutId, account.id],
      )
    ).rows[0];
    expect(stored.energy_estimate).toEqual(revised.workout.energyEstimate);
  });
}
