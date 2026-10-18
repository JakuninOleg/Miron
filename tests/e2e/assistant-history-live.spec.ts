import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";
import { expect, test, type Page } from "@playwright/test";
import type {
  AssistantHistory,
  AssistantHistoryMutation,
  AssistantReply,
} from "../../src/shared/assistant";

const APP = process.env.E2E_BASE_URL ?? "http://localhost:3080";
const enabled = process.env.MIRON_CHAT_HISTORY_E2E === "1";
test.use({ baseURL: APP, reducedMotion: "reduce", trace: "off", video: "off" });
test.skip(!enabled, "Opt in with MIRON_CHAT_HISTORY_E2E=1 and local test auth.");
test.setTimeout(90000);
const accounts = ["dark", "rose", "other"].map((theme) => ({
  id: randomUUID(),
  email: `history-${randomUUID()}@example.test`,
  password: randomBytes(24).toString("hex"),
  theme,
  companion: theme === "rose" ? ("lika" as const) : ("max" as const),
  ids: [] as string[],
}));
let pool: Pool;
function messages(id: string, companion: "max" | "lika", text: string, at: Date): AssistantReply {
  return {
    operationId: id,
    messages: [
      {
        id: `${id}:user`,
        operationId: id,
        companion,
        role: "user",
        text,
        createdAt: at.toISOString(),
      },
      {
        id: `${id}:assistant`,
        operationId: id,
        companion,
        role: "assistant",
        text: `Ответ на ${text}`,
        createdAt: new Date(at.getTime() + 1000).toISOString(),
        source: "prepared",
      },
    ],
  };
}
async function seedTurn(
  account: (typeof accounts)[number],
  companion: "max" | "lika",
  text: string,
  at = new Date(),
) {
  const id = randomUUID();
  await pool.query(
    "INSERT INTO assistant_turns (user_id,operation_id,payload_hash,companion,text,provider_admitted,status,lease_expires_at,result,created_at,finished_at) VALUES ($1,$2,$3,$4,$5,false,'completed',$6,$7,$6,$6)",
    [
      account.id,
      id,
      createHash("sha256").update(JSON.stringify({ text })).digest("hex"),
      companion,
      text,
      at,
      JSON.stringify(messages(id, companion, text, at)),
    ],
  );
  return id;
}
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
      "Chat history tests require local PostgreSQL:55432/miron and a matching development auth URL.",
    );
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  for (const account of accounts) {
    await pool.query("INSERT INTO users (id,name,email,email_verified) VALUES ($1,$2,$3,true)", [
      account.id,
      "История E2E",
      account.email,
    ]);
    await pool.query(
      "INSERT INTO auth_accounts (id,user_id,account_id,provider_id,password) VALUES ($1,$2,$3,'credential',$4)",
      [randomUUID(), account.id, account.id, await hashPassword(account.password)],
    );
    await pool.query(
      "INSERT INTO profiles (user_id,display_name,theme,companion,adult_confirmed,onboarding_completed) VALUES ($1,$2,$3,$4,true,true)",
      [account.id, "История E2E", account.theme === "rose" ? "rose" : "dark", account.companion],
    );
    if (account.theme === "other") continue;
    for (let index = 1; index <= 31; index++)
      account.ids.push(
        await seedTurn(
          account,
          account.companion,
          `Вопрос ${String(index).padStart(2, "0")}`,
          new Date(Date.now() - (32 - index) * 60000),
        ),
      );
    await seedTurn(account, account.companion === "max" ? "lika" : "max", "Другой напарник");
  }
});
test.afterAll(async () => {
  if (!pool) return;
  await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [
    accounts.map((account) => account.id),
  ]);
  await pool.end();
});
async function login(page: Page, account: (typeof accounts)[number]) {
  const response = await page.request.post(`${APP}/api/auth/sign-in/email`, {
    headers: { Origin: APP },
    data: { email: account.email, password: account.password },
  });
  expect(response.status(), await response.text()).toBe(200);
}
async function refresh(page: Page) {
  const loaded = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/assistant" &&
      response.request().method() === "GET",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect((await loaded).status()).toBe(200);
}
for (const account of accounts.filter((item) => item.theme !== "other")) {
  test(`two devices, earlier pages, individual and paired deletion, clear conflict and reload · ${account.theme}`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize(
      account.theme === "rose" ? { width: 320, height: 700 } : { width: 1440, height: 1000 },
    );
    await login(page, account);
    await page.goto("/dashboard");
    const log = page.getByRole("log", { name: "История разговора", exact: true });
    await expect(log.getByText("Вопрос 31", { exact: true })).toBeVisible();
    if (account.theme === "rose") {
      const scene = await page.getByTestId("dashboard-mobile-mascot").boundingBox();
      const conversation = await log.boundingBox();
      expect(conversation!.y).toBeGreaterThanOrEqual(scene!.y + scene!.height);
      const draft = page.getByRole("textbox", { name: "Сообщение напарнику" });
      await draft.fill("Черновик на другом устройстве");
      await expect(page.getByTestId("dashboard-mobile-mascot")).toBeHidden();
      await page.setViewportSize({ width: 320, height: 430 });
      await expect
        .poll(async () => {
          const bounds = await draft.boundingBox();
          return Boolean(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 430);
        })
        .toBe(true);
      await page.screenshot({
        path: ".local/previews/dashboard-live-typing-v2.png",
        animations: "disabled",
      });
      await page.getByRole("button", { name: "Свернуть чат", exact: true }).click();
      await page.setViewportSize({ width: 320, height: 700 });
      await expect(draft).toHaveValue("Черновик на другом устройстве");
    }
    await page.screenshot({
      path: `.local/previews/dashboard-live-${account.theme}-v2.png`,
      fullPage: true,
      animations: "disabled",
    });
    await expect(log.getByText("Вопрос 01", { exact: true })).toHaveCount(0);
    await log.getByRole("button", { name: "Ранние сообщения", exact: true }).click();
    await expect(log.getByText("Вопрос 01", { exact: true })).toBeVisible();
    const second = await browser.newContext({
      baseURL: APP,
      reducedMotion: "reduce",
      viewport: { width: 390, height: 844 },
    });
    const device = await second.newPage();
    try {
      await login(device, account);
      await device.goto("/dashboard");
      const otherLog = device.getByRole("log", { name: "История разговора", exact: true });
      await expect(otherLog.getByText("Ответ на Вопрос 31", { exact: true })).toBeVisible();
      const answer = log
        .locator("article")
        .filter({ has: page.getByText("Ответ на Вопрос 31", { exact: true }) });
      await answer.getByLabel("Действия с ответом", { exact: true }).click();
      await answer.getByRole("button", { name: "Удалить сообщение", exact: true }).click();
      let dialog = page.getByRole("dialog", { name: "Удалить сообщение?", exact: true });
      await expect(dialog.getByRole("button", { name: "Отмена", exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(answer.getByLabel("Действия с ответом", { exact: true })).toBeFocused();
      await expect(answer).toHaveCount(1);
      await answer.getByLabel("Действия с ответом", { exact: true }).click();
      await answer.getByRole("button", { name: "Удалить сообщение", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Удалить сообщение?", exact: true });
      const deleted = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/assistant" &&
          response.request().method() === "DELETE",
      );
      await dialog.getByRole("button", { name: "Удалить", exact: true }).click();
      expect((await deleted).status()).toBe(200);
      await expect(answer).toHaveCount(0);
      await expect(log.getByText("Вопрос 31", { exact: true })).toHaveCount(1);
      await refresh(device);
      await expect(otherLog.getByText("Ответ на Вопрос 31", { exact: true })).toHaveCount(0);
      await expect(otherLog.getByText("Вопрос 31", { exact: true })).toHaveCount(1);
      const question = log
        .locator("article")
        .filter({ has: page.getByText("Вопрос 30", { exact: true }) });
      await question.getByLabel("Действия с запросом", { exact: true }).click();
      await question.getByRole("button", { name: "Удалить запрос и ответ", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Удалить запрос и ответ?", exact: true })
        .getByRole("button", { name: "Удалить", exact: true })
        .click();
      await expect(log.getByText("Вопрос 30", { exact: true })).toHaveCount(0);
      await expect(log.getByText("Ответ на Вопрос 30", { exact: true })).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await page.getByRole("button", { name: "Очистить чат", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Очистить чат?", exact: true });
      await dialog.screenshot({ path: `.local/previews/chat-clear-${account.theme}.png` });
      await expect(dialog.getByRole("button", { name: "Отмена", exact: true })).toBeFocused();
      const remoteId = await seedTurn(account, account.companion, "Новое с другого устройства");
      await pool.query(
        "UPDATE assistant_turns SET status='failed',result=null,error_code='AI_REQUEST_FAILED',error_status=503 WHERE user_id=$1 AND operation_id=$2",
        [account.id, remoteId],
      );
      await pool.query(
        "UPDATE assistant_conversations SET revision=revision+1,updated_at=now() WHERE user_id=$1 AND companion=$2",
        [account.id, account.companion],
      );
      await refresh(page);
      await expect(
        dialog.getByRole("button", { name: "Очистить чат", exact: true }),
      ).toBeDisabled();
      await expect(dialog).toContainText("Разговор изменился");
      await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
      await expect(log.getByText("Новое с другого устройства", { exact: true })).toHaveCount(1);
      await expect(
        log.getByText("Ответ не получен. Можно отправить вопрос ещё раз.", { exact: true }),
      ).toHaveCount(1);
      await page.getByRole("button", { name: "Очистить чат", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Очистить чат?", exact: true });
      await dialog.getByRole("button", { name: "Очистить чат", exact: true }).click();
      await expect(log.locator("article")).toHaveCount(0);
      await refresh(device);
      await expect(otherLog.locator("article")).toHaveCount(0);
      await device.reload();
      await expect(
        device.getByRole("button", { name: "Очистить чат", exact: true }),
      ).toBeDisabled();
      await expect(
        device.getByRole("log", { name: "История разговора", exact: true }).locator("article"),
      ).toHaveCount(0);
      const inactive = await page.request.get(
        `${APP}/api/assistant?companion=${account.companion === "max" ? "lika" : "max"}`,
        { headers: { "x-miron-owner": account.id } },
      );
      expect(((await inactive.json()) as AssistantHistory).messages).toHaveLength(2);
      const outsider = await browser.newContext({ baseURL: APP });
      try {
        const bob = await outsider.newPage();
        await login(bob, accounts[2]);
        const request: AssistantHistoryMutation = {
          operationId: randomUUID(),
          companion: account.companion,
          expectedRevision: 0,
          action: { type: "delete_turn", turnId: account.ids[0] },
        };
        const response = await bob.request.delete(`${APP}/api/assistant`, {
          headers: { "x-miron-owner": accounts[2].id },
          data: request,
        });
        expect(response.status()).toBe(404);
        expect(response.headers()["cache-control"]).toBe("no-store");
      } finally {
        await outsider.close();
      }
    } finally {
      await second.close();
    }
  });
}
