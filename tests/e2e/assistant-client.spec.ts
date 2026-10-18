import { expect, test, type Page, type Route } from "@playwright/test";
import type { AccountState, CommandAck } from "../../src/shared/contracts";
import type {
  AssistantChatMessage,
  AssistantEnergyAction,
  AssistantRequest,
} from "../../src/shared/assistant";
import { buildDemoWorkout, DEFAULT_PROFILE } from "../../src/shared/demo";
import type { BuilderBootstrap, BuilderExercise } from "../../src/shared/workout-builder";
import type { PlannerConfig, PlannerPreview, PlannerState } from "../../src/shared/workout-planner";
import type { CachedState, PendingCommand } from "../../src/client/offline-db";

const owner = "assistant-client-alice";
const account: AccountState = {
  profile: { ...DEFAULT_PROFILE, name: "Ира", adultConfirmed: true, onboardingCompleted: true },
  trial: {
    startsAt: "2026-10-12T00:00:00.000Z",
    endsAt: "2030-01-01T00:00:00.000Z",
    replyLimit: 100,
    repliesUsed: 0,
  },
  progress: { xp: 0, completedWorkouts: 0, history: [] },
};
function reply(operation: AssistantRequest): AssistantChatMessage[] {
  return [
    {
      id: `user-${operation.operationId}`,
      operationId: operation.operationId,
      role: "user",
      text: operation.text,
      createdAt: "2026-10-12T12:00:00.000Z",
    },
    {
      id: `reply-${operation.operationId}`,
      operationId: operation.operationId,
      companion: "max",
      role: "assistant",
      text: "Ответ тестовой модели: восстанови дыхание перед следующим подходом.",
      createdAt: "2026-10-12T12:00:01.000Z",
    },
  ];
}
async function fixture(
  page: Page,
  onPost: (route: Route) => Promise<void>,
  history: () => AssistantChatMessage[] = () => [],
) {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ json: { user: { id: owner } } }),
  );
  await page.route("**/api/profile", (route) => route.fulfill({ json: account }));
  await page.route("**/api/workouts/current", (route) =>
    route.fulfill({ json: { workout: null } }),
  );
  await page.route(/\/api\/assistant(?:\?.*)?$/, async (route) => {
    expect(route.request().headers()["x-miron-owner"]).toBe(owner);
    if (route.request().method() === "GET")
      await route.fulfill({
        json: {
          enabled: true,
          companion: "max",
          revision: 0,
          resetRevision: 0,
          nextCursor: null,
          messages: history(),
        },
      });
    else await onPost(route);
  });
  await page.goto("/chat");
  await expect(page.getByRole("button", { name: "Повторить загрузку чата" })).toHaveCount(0);
  await expect(
    page.getByText("ИИ · beta. Напарник видит подтверждённый план и записанные результаты."),
  ).toBeVisible();
}

test("first acquaintance loads chat only after the server confirms completion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let completed = false;
  const historyReadiness: boolean[] = [];
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ json: { user: { id: owner } } }),
  );
  await page.route("**/api/profile", (route) =>
    route.fulfill({
      json: {
        ...account,
        profile: { ...account.profile, adultConfirmed: completed, onboardingCompleted: completed },
      },
    }),
  );
  await page.route("**/api/workouts/current", (route) =>
    route.fulfill({ json: { workout: null } }),
  );
  await page.route("**/api/onboarding", async (route) => {
    expect(route.request().postDataJSON().adultConfirmed).toBe(true);
    completed = true;
    await route.fulfill({ json: account });
  });
  await page.route(/\/api\/assistant(?:\?.*)?$/, async (route) => {
    historyReadiness.push(completed);
    await route.fulfill({
      status: completed ? 200 : 403,
      json: completed
        ? {
            enabled: true,
            companion: "max",
            revision: 0,
            resetRevision: 0,
            nextCursor: null,
            messages: [],
          }
        : { error: { code: "ADULT_CONFIRMATION_REQUIRED", message: "Заверши знакомство." } },
    });
  });
  await page.goto("/onboarding");
  for (const name of ["Давай знакомиться", "Круто, дальше", "Давай дальше", "Дальше"]) {
    await expect(page.locator('[aria-label="История знакомства"]')).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await page.getByRole("button", { name, exact: true }).click();
  }
  await page.getByRole("button", { name: /^МАКС Энергия/ }).click();
  await page.getByRole("button", { name: "Начать с Максом", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Готово/i })).toBeVisible();
  expect(historyReadiness).toEqual([]);
  await page.getByRole("checkbox", { name: "Мне уже исполнилось 18 лет" }).check();
  await page.getByRole("button", { name: "Погнали", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Твой напарник · ИИ beta", { exact: true })).toBeVisible();
  expect(historyReadiness.length).toBeGreaterThan(0);
  expect(historyReadiness.every(Boolean)).toBe(true);
  await expect(page.getByRole("button", { name: "Повторить загрузку чата" })).toHaveCount(0);
});

test("a lost response retries the same operation after reload and shares one turn with dashboard", async ({
  page,
}) => {
  const operations: AssistantRequest[] = [];
  let messages: AssistantChatMessage[] = [];
  await fixture(
    page,
    async (route) => {
      const operation = route.request().postDataJSON() as AssistantRequest;
      operations.push(operation);
      if (operations.length === 1) await route.abort("failed");
      else {
        messages = reply(operation);
        await route.fulfill({ json: { operationId: operation.operationId, messages } });
      }
    },
    () => messages,
  );
  await page.getByLabel("Сообщение напарнику", { exact: true }).fill("Сколько отдыхать?");
  await page.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await expect(page.getByRole("button", { name: "Повторить запрос", exact: true })).toBeVisible();
  await page.reload();
  const log = page.getByRole("log", { name: "Разговор с напарником" });
  await expect(log.getByText("Сколько отдыхать?", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Повторить запрос", exact: true }).click();
  await expect(
    log.getByText("Ответ тестовой модели: восстанови дыхание перед следующим подходом."),
  ).toBeVisible();
  expect(operations).toHaveLength(2);
  expect(operations[1]).toEqual(operations[0]);
  await expect(log.getByText("Сколько отдыхать?", { exact: true })).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".local/previews/assistant-chat-mobile.png", fullPage: true });
  await page.goto("/dashboard");
  await expect(
    page
      .getByRole("log", { name: "История разговора" })
      .getByText("Сколько отдыхать?", { exact: true }),
  ).toHaveCount(1);
  await expect(
    page
      .getByRole("log", { name: "История разговора" })
      .getByText("Ответ тестовой модели: восстанови дыхание перед следующим подходом."),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".local/previews/assistant-dashboard-mobile.png", fullPage: true });
});

test("offline chat keeps the editable draft and sends nothing", async ({ page, context }) => {
  let posts = 0;
  await fixture(page, async (route) => {
    posts++;
    await route.abort();
  });
  await context.setOffline(true);
  await page.getByLabel("Сообщение напарнику", { exact: true }).fill("Вопрос из зала");
  await expect(
    page.getByText("Ты офлайн. Вопрос останется черновиком. Для ответа напарника нужен интернет."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Отправить сообщение", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Сообщение напарнику", { exact: true }).press("Enter");
  expect(posts).toBe(0);
  await expect(page.getByLabel("Сообщение напарнику", { exact: true })).toHaveValue(
    "Вопрос из зала",
  );
});

test("a changed authenticated owner detaches cached chat before any message is sent", async ({
  page,
}) => {
  let posts = 0;
  await fixture(
    page,
    async (route) => {
      posts++;
      await route.abort("failed");
    },
    () => [
      {
        id: "alice-private",
        role: "assistant",
        text: "Личный разговор Иры",
        createdAt: "2026-10-12T12:00:00.000Z",
      },
    ],
  );
  await expect(page.getByRole("log").getByText("Личный разговор Иры")).toBeVisible();
  await page.unroute("**/api/auth/get-session");
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ json: { user: { id: "assistant-client-bob" } } }),
  );
  await page.getByLabel("Сообщение напарнику", { exact: true }).fill("Новый вопрос");
  await page.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(posts).toBe(0);
  await expect(page.getByText("Личный разговор Иры")).toHaveCount(0);
  expect(
    await page.evaluate(() => sessionStorage.getItem("miron:assistant:pending:v1")),
  ).toBeNull();
});

test("saved workout commands are acknowledged before chat can send confirmed training context", async ({
  page,
}) => {
  const events: string[] = [];
  let confirmedMessages: AssistantChatMessage[] = [];
  const workout = { ...buildDemoWorkout(DEFAULT_PROFILE), revision: 1 };
  const command: PendingCommand = {
    id: "e688ef6f-67e8-4a5f-bd05-376658d9246d",
    owner: `user:${owner}`,
    workoutId: workout.id,
    createdAt: Date.now(),
    envelope: {
      operationId: "e688ef6f-67e8-4a5f-bd05-376658d9246d",
      expectedRevision: 0,
      command: { type: "next_exercise" },
    },
  };
  await page.route(`**/api/workouts/${workout.id}/commands`, async (route) => {
    events.push("workout");
    await route.fulfill({
      json: { operationId: command.id, workout, progress: account.progress } satisfies CommandAck,
    });
  });
  await fixture(
    page,
    async (route) => {
      events.push("assistant");
      const operation = route.request().postDataJSON() as AssistantRequest;
      confirmedMessages = reply(operation);
      await route.fulfill({
        json: { operationId: operation.operationId, messages: confirmedMessages },
      });
    },
    () => confirmedMessages,
  );
  await page.evaluate(
    async ({ currentWorkout, pending, key }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("miron-offline-v1");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(["states", "pending"], "readwrite");
          const store = tx.objectStore("states");
          const read = store.get(key);
          read.onsuccess = () => {
            const state = read.result as CachedState;
            state.workout = currentWorkout;
            store.put(state);
            tx.objectStore("pending").put(pending);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      });
    },
    { currentWorkout: workout, pending: command, key: `user:${owner}` },
  );
  await page.getByLabel("Сообщение напарнику", { exact: true }).fill("Разберём моё занятие");
  await page.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await expect(
    page
      .getByRole("log")
      .getByText("Ответ тестовой модели: восстанови дыхание перед следующим подходом."),
  ).toBeVisible();
  expect(events).toEqual(["workout", "assistant"]);
});

test("a durable provider failure leaves a draft and a new explicit send uses a new operation", async ({
  page,
}) => {
  const operations: AssistantRequest[] = [];
  let confirmedMessages: AssistantChatMessage[] = [];
  await fixture(
    page,
    async (route) => {
      const operation = route.request().postDataJSON() as AssistantRequest;
      operations.push(operation);
      if (operations.length === 1)
        await route.fulfill({
          status: 502,
          json: {
            error: { code: "AI_PROVIDER_FAILED", message: "Модель недоступна. Попробуй снова." },
          },
        });
      else {
        confirmedMessages = reply(operation);
        await route.fulfill({
          json: { operationId: operation.operationId, messages: confirmedMessages },
        });
      }
    },
    () => confirmedMessages,
  );
  await page.getByLabel("Сообщение напарнику", { exact: true }).fill("Разберём отдых");
  await page.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Модель недоступна" })).toBeVisible();
  await expect(page.getByRole("log").getByText("Разберём отдых", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Сообщение напарнику", { exact: true })).toHaveValue(
    "Разберём отдых",
  );
  await page.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await expect(page.getByRole("log").getByText("Разберём отдых", { exact: true })).toHaveCount(1);
  expect(operations[1].operationId).not.toBe(operations[0].operationId);
});

test("energy correction requires review and repeats the server proposal ID after a lost ACK", async ({
  page,
}) => {
  const workout = {
    ...buildDemoWorkout(DEFAULT_PROFILE),
    status: "completed" as const,
    revision: 4,
  };
  const action: AssistantEnergyAction = {
    id: "proposal-fixture",
    type: "energy_estimate",
    title: "Уточнить примерный расход",
    workoutId: workout.id,
    expectedRevision: 4,
    input: { bodyWeightKg: 80 },
    operationId: "36669788-cf6c-4379-938a-76f695cab707",
    summary: "Пересчитать завершённое занятие с указанной массой 80 кг.",
  };
  const messages: AssistantChatMessage[] = [
    {
      id: "energy-reply",
      role: "assistant",
      text: "Проверь уточнения перед пересчётом.",
      createdAt: "2026-10-12T12:00:00.000Z",
      actions: [action],
    },
  ];
  const confirmations: unknown[] = [];
  const ack: CommandAck = {
    operationId: action.operationId,
    workout: { ...workout, revision: 5 },
    progress: account.progress,
  };
  await page.route("**/api/assistant/actions", async (route) => {
    expect(route.request().headers()["x-miron-owner"]).toBe(owner);
    confirmations.push(route.request().postDataJSON());
    if (confirmations.length === 1) await route.abort("failed");
    else await route.fulfill({ json: ack });
  });
  await fixture(
    page,
    async (route) => route.abort(),
    () => messages,
  );
  expect(confirmations).toHaveLength(0);
  await page.getByRole("button", { name: "Проверить пересчёт", exact: true }).click();
  expect(confirmations).toHaveLength(0);
  await expect(page.getByText("Указанная масса: 80 кг.")).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить пересчёт", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Предложение пересчитать расход" }).getByRole("alert"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить пересчёт", exact: true }).click();
  await expect(page.getByText("Пересчёт подтверждён. Примерный расход обновлён.")).toBeVisible();
  expect(confirmations).toEqual([
    { proposalId: action.id, operationId: action.operationId },
    { proposalId: action.id, operationId: action.operationId },
  ]);
});

const plannerConfig: PlannerConfig = {
  mode: "single",
  place: "gym",
  direction: "strength",
  split: "fullbody",
  daysPerWeek: 2,
  intent: "maintain",
  durationMinutes: 45,
  execution: "straight",
  variety: "familiar",
};
async function plannerFixture(page: Page) {
  const bootstrap: BuilderBootstrap = {
    ownerId: owner,
    theme: "dark",
    resources: [],
    inventories: [
      { place: "gym", revision: 1, confirmedAt: "2026-10-12T12:00:00.000Z", resources: [] },
    ],
    muscles: [],
  };
  const state: PlannerState = {
    preferences: { revision: 0, excludedVariantIds: [], favoriteVariantIds: [] },
    program: null,
    single: null,
    excludedExercises: [],
    experience: "beginner",
    historySummary: {
      confirmedSets: 0,
      lastWorkoutAt: null,
      recentPrimaryMuscles: [],
      returningAfterPause: false,
    },
  };
  const exercise: BuilderExercise = {
    variantId: "exercise-fixture",
    revisionId: "revision-fixture",
    name: "Тяга для проверки черновика",
    metric: "reps",
    resistanceMode: "machine_load",
    difficulty: "beginner",
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: [],
    instructions: [],
    status: "draft",
    timing: {
      secondsPerRep: { min: 2, max: 3 },
      setupSeconds: { min: 5, max: 10 },
      sideSwitchSeconds: { min: 0, max: 0 },
      perSide: false,
    },
  };
  const preview: PlannerPreview = {
    policyVersion: "planner-v1",
    config: plannerConfig,
    days: [
      {
        key: "day-fixture",
        title: "Черновик из текущего каталога",
        sourceTemplateId: "template-fixture",
        steps: [
          {
            exercise,
            revisionId: exercise.revisionId,
            slotKey: "slot",
            phase: "main",
            sourceVariantId: exercise.variantId,
            sets: 3,
            target: 10,
            restSeconds: 60,
          },
        ],
        estimate: { minSeconds: 150, maxSeconds: 240, version: "planning-v1" },
        warnings: [],
      },
    ],
    notes: [],
    changes: [],
    weeklyPrimarySets: [],
    historySummary: state.historySummary,
    disclosure: "Черновик: экспертная проверка не выполнена.",
    fingerprint: "a".repeat(64),
    expectedProgramRevision: 0,
    preferencesRevision: 0,
    inventoryRevision: 1,
  };
  const previews: unknown[] = [];
  const writes: string[] = [];
  await page.route("**/api/workout-builder", (route) => route.fulfill({ json: bootstrap }));
  await page.route("**/api/workout-builder/templates", (route) =>
    route.fulfill({ json: { templates: [] } }),
  );
  await page.route("**/api/workout-builder/planner/**", async (route) => {
    if (route.request().url().endsWith("/state")) await route.fulfill({ json: state });
    else if (route.request().url().endsWith("/preview")) {
      previews.push(route.request().postDataJSON());
      await route.fulfill({ json: preview });
    } else {
      writes.push(route.request().url());
      await route.abort("failed");
    }
  });
  return { previews, writes };
}

test("a planner chat action opens a fresh draft from the validated configuration without saving or starting", async ({
  page,
}) => {
  const query = new URLSearchParams({
    from: "assistant",
    mode: "single",
    assistantConfig: JSON.stringify(plannerConfig),
  });
  const messages: AssistantChatMessage[] = [
    {
      id: "planner-chat",
      role: "assistant",
      text: "Проверь состав в подборе.",
      createdAt: "2026-10-12T12:00:00.000Z",
      actions: [
        {
          id: "planner-link",
          type: "planner",
          title: "Посмотреть черновик в подборе",
          href: `/workout-builder?${query}`,
        },
      ],
    },
  ];
  const planning = await plannerFixture(page);
  await fixture(
    page,
    async (route) => route.abort("failed"),
    () => messages,
  );
  await page.getByRole("link", { name: "Посмотреть черновик в подборе", exact: true }).click();
  await expect(
    page
      .getByRole("article", { name: "Черновик из текущего каталога" })
      .locator("strong")
      .filter({ hasText: "Тяга для проверки черновика" }),
  ).toBeVisible();
  await expect(page.getByText("Пожелание: 45 мин · обычные подходы")).toBeVisible();
  expect(planning.previews).toEqual([plannerConfig]);
  expect(planning.writes).toEqual([]);
  await expect(page.getByRole("link", { name: "MIRON, вернуться" })).toHaveAttribute(
    "href",
    "/chat",
  );
});

test("an unvalidated planner query cannot initialize a draft", async ({ page }) => {
  const planning = await plannerFixture(page);
  await fixture(page, async (route) => route.abort("failed"));
  const query = new URLSearchParams({
    mode: "single",
    assistantConfig: JSON.stringify({ ...plannerConfig, durationMinutes: 999, autoConfirm: true }),
  });
  await page.goto(`/workout-builder?${query}`);
  await expect(
    page.getByText("Не удалось прочитать условия из разговора. Выбери условия занятия заново."),
  ).toBeVisible();
  expect(planning.previews).toEqual([]);
  expect(planning.writes).toEqual([]);
});
