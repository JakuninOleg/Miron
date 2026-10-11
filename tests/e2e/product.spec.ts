import { expect, test, type Page } from "@playwright/test";
import type { CachedState } from "../../src/client/offline-db";
import type { AuthConfig } from "../../src/shared/contracts";

async function onboard(page: Page, companion: "max" | "lika" = "max") {
  await page.goto("/demo?legacy=1");
  await page.getByLabel("Как тебя зовут?").fill("Олег");
  if (companion === "lika") await page.getByRole("button", { name: /Лика Тёплая/ }).click();
  for (let step = 0; step < 4; step++)
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.getByRole("checkbox", { name: /Мне исполнилось 18 лет/ }).check();
  await page.getByRole("button", { name: "Начать свой путь" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Привет, Олег" })).toBeVisible();
}

test("optional rest ends while folded without recording or advancing a strength set", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install();
  await onboard(page);
  await page.getByRole("button", { name: "Начать тренировку", exact: true }).click();
  const timer = page.getByRole("region", { name: "Таймер: Отдых", exact: true });
  await expect(timer.getByText("Запусти таймер, когда захочешь")).toBeVisible();
  await timer.getByRole("button", { name: "Запустить", exact: true }).click();
  await timer.getByRole("button", { name: "Свернуть", exact: true }).click();
  await page.clock.fastForward(61000);
  await expect(timer.getByRole("status")).toContainText("Отдых окончен");
  await expect(timer.getByRole("button", { name: /Готово.*Открыть/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Подход 1 записан", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Следующее упражнение", exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: ".local/previews/max-rest-timer.png", fullPage: true });
});

test("timed exercise and rest use separate timers and require actual seconds confirmation", async ({
  page,
}) => {
  await page.clock.install();
  await onboard(page, "lika");
  await page.getByRole("button", { name: "Начать тренировку", exact: true }).click();
  await expect(page).toHaveURL(/\/workout$/);
  // A timed demo snapshot isolates the runner without publishing draft catalog content.
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("miron-offline-v1");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("states", "readwrite");
        const store = tx.objectStore("states");
        const read = store.get("demo");
        read.onsuccess = () => {
          const state = read.result as CachedState;
          if (!state.workout) {
            tx.abort();
            return;
          }
          state.workout.exercises[0].metric = "time";
          state.workout.exercises[0].targetDurationSeconds = 30;
          store.put(state);
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
  });
  await page.reload();
  const work = page.getByRole("region", { name: "Таймер: Время упражнения", exact: true });
  const rest = page.getByRole("region", { name: "Таймер: Отдых", exact: true });
  await work.getByRole("button", { name: "Запустить", exact: true }).click();
  await page.clock.fastForward(31000);
  await expect(work.getByRole("status")).toContainText("Подтверди фактически выполненное время");
  await expect(rest.getByText("Запусти таймер, когда захочешь")).toBeVisible();
  await page.screenshot({ path: ".local/previews/lika-work-timer.png", fullPage: true });
  await expect(page.getByRole("button", { name: "Подход 1 записан", exact: true })).toHaveCount(0);
  await page.getByRole("spinbutton", { name: "Подход 1, секунды", exact: true }).fill("23");
  await page.getByRole("button", { name: "Записать подход 1", exact: true }).click();
  // Recording persists asynchronously; reload only after the UI confirms it.
  await expect(page.getByRole("button", { name: "Подход 1 записан", exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("spinbutton", { name: "Подход 1, секунды", exact: true }),
  ).toHaveValue("23");
});

test("mobile demo persists offline sets and awards a completed workout once", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await onboard(page);
  await page.getByRole("button", { name: "Начать тренировку", exact: true }).click();
  await expect(page).toHaveURL(/\/workout$/);
  await page.getByRole("spinbutton", { name: "Подход 1, повторения", exact: true }).fill("9");
  await page.getByRole("button", { name: "Записать подход 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Подход 1 записан", exact: true })).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("spinbutton", { name: "Подход 1, повторения", exact: true }),
  ).toHaveValue("9");
  await page.goto("/programs");
  await page.getByRole("button", { name: "Для офлайна", exact: true }).click();
  await expect(
    page.getByText("Занятие сохранено на этом устройстве.", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.goto("/workout");
  await context.setOffline(true);
  await expect(page.getByText("Ты офлайн. Результаты сохраняются на устройстве.")).toBeVisible();
  await page.getByRole("button", { name: "Записать подход 2", exact: true }).click();
  await expect(page.getByRole("button", { name: "Подход 2 записан", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("button", { name: "Подход 2 записан", exact: true })).toBeDisabled();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Привет, Олег" })).toBeVisible();
  await page.getByRole("link", { name: "Программа", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Моя программа", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Открыть тренировку", exact: true }).click();
  await expect(page.getByRole("button", { name: "Подход 2 записан", exact: true })).toBeDisabled();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Следующее упражнение", exact: true }).click();
  for (let exercise = 1; exercise < 3; exercise++) {
    await page.getByRole("button", { name: "Записать подход 1", exact: true }).click();
    await page.getByRole("button", { name: "Записать подход 2", exact: true }).click();
    await page
      .getByRole("button", {
        name: exercise === 2 ? "Завершить тренировку" : "Следующее упражнение",
        exact: true,
      })
      .click();
  }
  await expect(page.getByRole("heading", { name: "План выполнен" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "План выполнен" })).toBeVisible();
  await page.getByRole("link", { name: "Посмотреть прогресс", exact: true }).click();
  await expect(page.getByText("6 подходов", { exact: false })).toBeVisible();
  await expect(page.getByText("+50 XP", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Получено", { exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("companion and theme are independent and typed chat keeps its history", async ({ page }) => {
  await onboard(page, "lika");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Светлая роза", exact: true }).click();
  await page.getByRole("button", { name: "Сохранить изменения", exact: true }).click();
  await expect(page.getByText("Изменения сохранены.", { exact: true })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "rose");
  await page.getByRole("button", { name: "Напарник Лика. Переключить на Макса" }).click();
  await expect(
    page.getByRole("button", { name: "Напарник Макс. Переключить на Лику" }),
  ).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "rose");
  await page.goto("/chat");
  await page
    .getByLabel("Сообщение напарнику", { exact: true })
    .fill("Сегодня есть немного времени");
  await page.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await expect(
    page
      .getByRole("log", { name: "Разговор с напарником" })
      .getByText("Сегодня есть немного времени", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".message.assistant")).toHaveCount(1);
  await page.reload();
  await expect(
    page
      .getByRole("log", { name: "Разговор с напарником" })
      .getByText("Сегодня есть немного времени", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Начать голосовой ввод" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("authentication respects configured methods and password recovery state", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "С возвращением" })).toBeVisible();
  const response = await page.request.get("/api/auth/config");
  const config: AuthConfig = await response.json();
  if (!response.ok() || config.emailPassword === false) {
    await expect(page.getByRole("button", { name: "Яндекс ID", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "VK ID", exact: true })).toBeVisible();
    await expect(page.getByLabel("Пароль", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Забыли пароль?" })).toHaveCount(0);
    if (!config.providers?.vk)
      await expect(page.getByRole("button", { name: "VK ID", exact: true })).toBeDisabled();
    return;
  }
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Показать пароль" }).click();
  await expect(page.getByLabel("Пароль", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("link", { name: "Забыли пароль?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByLabel("Почта", { exact: true })).toBeVisible();
  await page.goto("/reset-password");
  await page.getByLabel("Новый пароль", { exact: true }).fill("new-password-test");
  await page.getByRole("button", { name: "Сохранить пароль", exact: true }).click();
  await expect(page.locator(".error-text[role=alert]")).toHaveText(
    "В ссылке нет ключа восстановления. Запроси новую ссылку.",
  );
});
