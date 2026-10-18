import { expect, test, type Page } from "@playwright/test";

async function beginDemo(page: Page) {
  await page.goto("/demo?legacy=1");
  await page.getByLabel("Как тебя зовут?").fill("Олег");
  for (let step = 0; step < 4; step++)
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.getByRole("checkbox", { name: /Мне исполнилось 18 лет/ }).check();
  await page.getByRole("button", { name: "Начать свой путь" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Начать тренировку", exact: true }).click();
  await expect(page).toHaveURL(/\/workout$/);
}

test("partial activity preserves skipped results and later full activity tops up only to 50", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await beginDemo(page);
  await page.getByRole("button", { name: "Записать подход 1", exact: true }).click();
  await page.getByRole("button", { name: "Пропустить упражнение", exact: true }).click();
  await expect(page.getByRole("button", { name: "Продолжить занятие", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Да, пропустить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Отжимание от стены", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закончить раньше", exact: true }).click();
  await page.getByRole("button", { name: "Сохранить и закончить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Сегодня — столько, сколько получилось" }),
  ).toBeFocused();
  await expect(page.getByText("+25 XP", { exact: true })).toBeVisible();
  await expect(page.getByText("1 подходов", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: /Таймер:/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("+25 XP", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Посмотреть прогресс", exact: true }).click();
  await expect(
    page.getByText("Закончено раньше · результаты сохранены", { exact: true }),
  ).toBeVisible();
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Новое демо-занятие", exact: true }).click();
  await expect(page).toHaveURL(/\/workout$/);
  for (let exercise = 0; exercise < 3; exercise++) {
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
  await expect(page.getByText("+25 XP", { exact: true })).toBeVisible();
  await expect(page.getByText(/Добавили разницу/)).toBeVisible();
  await expect(page.getByText(/50 \/ 50 XP за день/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".local/previews/daily-xp-topup.png", fullPage: true });
});

test("empty early finish is aborted and allows a fresh workout without XP", async ({ page }) => {
  await beginDemo(page);
  await page.getByRole("button", { name: "Закончить раньше", exact: true }).click();
  await page.getByRole("button", { name: "Сохранить и закончить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Занятие закрыто", exact: true })).toBeVisible();
  await expect(page.getByText("+0 XP", { exact: true })).toBeVisible();
  await expect(page.getByText("Без выполненных подходов XP не начисляется.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Как тебе нагрузка?", exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "Вернуться к своему дню", exact: true }).click();
  await page.getByRole("button", { name: "Новое демо-занятие", exact: true }).click();
  await expect(page.getByRole("button", { name: "Записать подход 1", exact: true })).toBeEnabled();
});
