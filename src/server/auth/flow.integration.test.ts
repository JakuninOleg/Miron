import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { getAuth, requireUser } from "./index";
import { readAuthConfig } from "./config";
import { closeDb, getDb } from "@/server/db";
import { profiles, trials, user } from "@/server/db/schema";

type MailSummary = { ID: string; To: { Address: string }[]; Subject: string };

async function emailLink(email: string, subject: string) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const listing = await fetch("http://127.0.0.1:8025/api/v1/messages");
    if (!listing.ok) throw new Error("Local Mailpit is unavailable.");
    const data = (await listing.json()) as { messages: MailSummary[] };
    const message = data.messages.find(
      (entry) => entry.To.some((to) => to.Address === email) && entry.Subject.includes(subject),
    );
    if (message) {
      const detail = await fetch(`http://127.0.0.1:8025/api/v1/message/${message.ID}`);
      const body = (await detail.json()) as { Text: string };
      const link = body.Text.match(/https?:\/\/[^\s]+/)?.[0];
      if (!link) throw new Error("Auth mail did not contain a link.");
      return new URL(link);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Auth mail was not delivered to local Mailpit.");
}

describe.skipIf(process.env.MIRON_AUTH_INTEGRATION_TESTS !== "1")(
  "real local email authentication",
  () => {
    afterAll(async () => {
      await closeDb();
    });

    it("requires verification, persists a session, resets once and revokes old sessions", async () => {
      const databaseURL = new URL(process.env.DATABASE_URL || "http://missing");
      const config = readAuthConfig();
      if (
        !["localhost", "127.0.0.1"].includes(databaseURL.hostname) ||
        databaseURL.port !== "55432" ||
        !["localhost", "127.0.0.1"].includes(config.smtp.host) ||
        config.smtp.port !== 1025 ||
        config.production
      ) {
        throw new Error(
          "Auth flow test requires isolated local PostgreSQL:55432 and Mailpit SMTP:1025.",
        );
      }
      const email = `auth-integration-${randomUUID()}@example.test`;
      const oldPassword = `Test-before-${randomUUID()}`;
      const newPassword = `Test-after-${randomUUID()}`;
      const auth = getAuth();
      const post = (path: string, body: Record<string, string>, cookie?: string) =>
        auth.handler(
          new Request(`${config.baseURL}/api/auth/${path}`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              origin: config.baseURL,
              ...(cookie ? { cookie } : {}),
            },
            body: JSON.stringify(body),
          }),
        );
      try {
        const signup = await post("sign-up/email", {
          email,
          name: "Auth integration",
          password: oldPassword,
          callbackURL: "/sign-in?verified=1",
        });
        expect(signup.status).toBe(200);
        expect((await post("sign-in/email", { email, password: oldPassword })).status).toBe(403);
        const verification = await emailLink(email, "Подтвердите");
        const verified = await auth.handler(new Request(verification));
        expect(verified.status).toBe(302);

        const signin = await post("sign-in/email", { email, password: oldPassword });
        expect(signin.status).toBe(200);
        const setCookies = signin.headers.getSetCookie();
        expect(
          setCookies.some((value) => /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value)),
        ).toBe(true);
        const cookie = setCookies.map((value) => value.split(";")[0]).join("; ");
        const principal = await requireUser(new Request(config.baseURL, { headers: { cookie } }));
        expect(principal.emailVerified).toBe(true);
        const accountProfiles = await getDb()
          .select({ id: profiles.userId })
          .from(profiles)
          .where(eq(profiles.userId, principal.id));
        expect(accountProfiles).toHaveLength(1);
        const accountTrials = await getDb()
          .select({ limit: trials.limit, startsAt: trials.startsAt, endsAt: trials.endsAt })
          .from(trials)
          .where(eq(trials.userId, principal.id));
        expect(accountTrials).toHaveLength(1);
        expect(accountTrials[0].limit).toBe(100);
        expect(accountTrials[0].endsAt.getTime() - accountTrials[0].startsAt.getTime()).toBe(
          168 * 60 * 60 * 1_000,
        );

        const existingReset = await post("request-password-reset", {
          email,
          redirectTo: "/reset-password",
        });
        const absentReset = await post("request-password-reset", {
          email: `absent-${randomUUID()}@example.test`,
          redirectTo: "/reset-password",
        });
        expect(existingReset.status).toBe(200);
        expect(absentReset.status).toBe(200);
        expect(await existingReset.text()).toBe(await absentReset.text());
        const resetLink = await emailLink(email, "Восстановление");
        const resetRedirect = await auth.handler(new Request(resetLink));
        expect(resetRedirect.status).toBe(302);
        const target = resetRedirect.headers.get("location");
        if (!target) throw new Error("Reset flow did not redirect.");
        const token = new URL(target, config.baseURL).searchParams.get("token");
        if (!token) throw new Error("Reset flow did not issue a token.");
        expect((await post("reset-password", { token, newPassword })).status).toBe(200);
        expect((await post("reset-password", { token, newPassword: oldPassword })).status).not.toBe(
          200,
        );
        await expect(
          requireUser(new Request(config.baseURL, { headers: { cookie } })),
        ).rejects.toMatchObject({ status: 401 });
        expect((await post("sign-in/email", { email, password: oldPassword })).status).toBe(401);
        const newSignin = await post("sign-in/email", { email, password: newPassword });
        expect(newSignin.status).toBe(200);

        const newCookie = newSignin.headers
          .getSetCookie()
          .map((value) => value.split(";")[0])
          .join("; ");
        await getDb().update(user).set({ status: "deleting" }).where(eq(user.id, principal.id));
        await expect(
          requireUser(new Request(config.baseURL, { headers: { cookie: newCookie } })),
        ).rejects.toMatchObject({ status: 403 });
      } finally {
        const [created] = await getDb()
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, email));
        if (created) {
          await getDb().execute(sql`DELETE FROM auth_verifications WHERE value = ${created.id}`);
          await getDb().delete(user).where(eq(user.id, created.id));
        }
      }
    }, 30_000);
  },
);
