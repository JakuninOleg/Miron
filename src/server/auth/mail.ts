import "server-only";
import nodemailer from "nodemailer";
import type { AuthConfig } from "./config";

export function createAuthMailer(config: AuthConfig) {
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    requireTLS: config.smtp.requireTLS,
    auth: config.smtp.auth,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  return async (to: string, url: string, purpose: "verification" | "reset") => {
    // Never emit bearer links/tokens to logs or return them from an API response.
    const link = new URL(url);
    if (link.origin !== config.baseURL) throw new Error("Unexpected auth email origin.");
    const verification = purpose === "verification";
    await transporter.sendMail({
      from: config.smtp.from,
      to,
      subject: verification ? "Подтвердите почту — MIRON" : "Восстановление пароля — MIRON",
      text: verification
        ? `Подтвердите адрес почты для MIRON:\n\n${link.href}\n\nСсылка действует 1 час. Если вы не регистрировались, просто игнорируйте письмо.`
        : `Чтобы задать новый пароль MIRON, откройте ссылку:\n\n${link.href}\n\nСсылка действует 30 минут. Если вы не запрашивали смену пароля, игнорируйте письмо.`,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  };
}
