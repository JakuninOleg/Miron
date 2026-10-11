"use client";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/shared/auth-policy";
import Image from "next/image";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Mail } from "lucide-react";
import { authClient, signInWithProvider } from "@/client/auth-client";
import type { AuthConfig } from "@/shared/contracts";
import { Brand } from "./app-shell";

export type AuthMode =
  "sign-in" | "sign-up" | "forgot-password" | "reset-password" | "verify-email";
const titles: Record<AuthMode, string> = {
  "sign-in": "С возвращением",
  "sign-up": "Начнём твой путь",
  "forgot-password": "Восстановить пароль",
  "reset-password": "Новый пароль",
  "verify-email": "Подтверди почту",
};
const descriptions: Record<AuthMode, string> = {
  "sign-in": "Твой план и напарник ждут тебя.",
  "sign-up": "Создай аккаунт. Сначала познакомимся, потом начнём занятие.",
  "forgot-password": "Отправим ссылку для смены пароля на твою почту.",
  "reset-password": "Выбери пароль, который используешь только здесь.",
  "verify-email": "Открой письмо от MIRON и перейди по ссылке.",
};

function explainError(code?: string, message?: string) {
  const known: Record<string, string> = {
    INVALID_EMAIL_OR_PASSWORD: "Проверь почту и пароль.",
    EMAIL_NOT_VERIFIED: "Сначала подтверди почту по ссылке из письма.",
    USER_ALREADY_EXISTS: "Аккаунт с этой почтой уже существует. Войди или восстанови пароль.",
    PASSWORD_TOO_SHORT: `Пароль должен содержать хотя бы ${MIN_PASSWORD_LENGTH} символов.`,
    INVALID_TOKEN: "Ссылка недействительна или устарела. Запроси новую.",
    TOO_MANY_REQUESTS: "Слишком много попыток. Подожди немного и попробуй снова.",
    ACCOUNT_NOT_LINKED:
      "Эта почта уже связана с другим способом входа. Используй его: автоматически объединять аккаунты мы не будем.",
    EMAIL_NOT_FOUND:
      "Сервис не передал почту. Разреши доступ к почте в выбранном сервисе и повтори вход.",
    UNABLE_TO_GET_USER_INFO:
      "Сервис не передал данные для входа. Проверь доступ к имени и почте и повтори попытку.",
  };
  return code && known[code.toUpperCase()]
    ? known[code.toUpperCase()]
    : message && /[а-я]/i.test(message)
      ? message
      : "Не получилось выполнить действие. Проверь данные и попробуй ещё раз.";
}

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const params = useSearchParams();
  // Only this explicit internal destination is accepted; no arbitrary callback URL.
  const destination = params.get("next") === "/workout-builder" ? "/workout-builder" : "/dashboard";
  const nextQuery = destination === "/workout-builder" ? "?next=/workout-builder" : "";
  const verificationCallback = `/sign-in?verified=1${nextQuery ? "&next=/workout-builder" : ""}`;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/auth/config")
      .then((response) => (response.ok ? (response.json() as Promise<AuthConfig>) : null))
      .then((value) => {
        if (active) {
          setConfig(value);
          setConfigLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setConfig(null);
          setConfigLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  const oauthError = params.get("error");
  async function submit() {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      if (mode === "sign-in") {
        const result = await authClient.signIn.email({
          email,
          password,
          callbackURL: destination,
        });
        if (result.error) {
          setError(explainError(result.error.code, result.error.message));
          return;
        }
        sessionStorage.removeItem("miron:demo");
        router.push(destination);
        router.refresh();
      } else if (mode === "sign-up") {
        const result = await authClient.signUp.email({
          name: name.trim(),
          email,
          password,
          callbackURL: verificationCallback,
        });
        if (result.error) {
          setError(explainError(result.error.code, result.error.message));
          return;
        }
        setSuccess("Письмо отправлено. Подтверди почту по ссылке, затем войди в MIRON.");
      } else if (mode === "forgot-password") {
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: "/reset-password",
        });
        if (result.error) {
          setError(explainError(result.error.code, result.error.message));
          return;
        }
        setSuccess(
          "Если аккаунт с этой почтой существует, письмо со ссылкой уже отправлено. Проверь входящие и спам.",
        );
      } else if (mode === "reset-password") {
        const token = params.get("token");
        if (!token) {
          setError("В ссылке нет ключа восстановления. Запроси новую ссылку.");
          return;
        }
        const result = await authClient.resetPassword({ token, newPassword: password });
        if (result.error) {
          setError(explainError(result.error.code, result.error.message));
          return;
        }
        setSuccess("Пароль изменён. Теперь можно войти в аккаунт.");
      } else {
        const result = await authClient.sendVerificationEmail({
          email,
          callbackURL: verificationCallback,
        });
        if (result.error) {
          setError(explainError(result.error.code, result.error.message));
          return;
        }
        setSuccess("Письмо с подтверждением отправлено. Проверь входящие и спам.");
      }
    } catch {
      setError("Нет связи с сервером. Проверь подключение и повтори попытку.");
    } finally {
      setBusy(false);
    }
  }
  async function social(provider: "yandex" | "vk") {
    setBusy(true);
    setError("");
    try {
      // The callback returns to a real account, independent of an earlier demo.
      sessionStorage.removeItem("miron:demo");
      const result = await signInWithProvider(provider, destination);
      if (result.error) setError(explainError(result.error.code, result.error.message));
    } catch {
      setError("Не удалось открыть вход. Попробуй ещё раз.");
    } finally {
      setBusy(false);
    }
  }
  const hasPassword = mode === "sign-in" || mode === "sign-up" || mode === "reset-password";
  const showSocial = mode === "sign-in" || mode === "sign-up";
  const emailEnabled = config?.emailPassword === true;
  return (
    <div className="auth-page">
      <aside className="auth-art">
        <Link href="/sign-in">
          <Brand />
        </Link>
        <h2>
          Больше,
          <br />
          чем тренировки.
          <br />
          Рядом.
        </h2>
        <Image
          unoptimized
          width={768}
          height={1152}
          className="auth-character"
          src="/characters/max.webp"
          alt=""
        />
        <p>
          Твой темп.
          <br />
          Твой следующий шаг.
          <span className="auth-stroke" />
        </p>
      </aside>
      <main className="auth-content">
        <div className="auth-card">
          <Link href="/sign-in">
            <Brand />
          </Link>
          {mode !== "sign-in" && mode !== "sign-up" ? (
            <Link className="auth-back" href="/sign-in">
              <ArrowLeft size={14} />
              Ко входу
            </Link>
          ) : null}
          <h1>{titles[mode]}</h1>
          <p className="auth-description">
            {showSocial && config && !emailEnabled
              ? "Продолжи через свой аккаунт. Если ты впервые здесь, создадим профиль MIRON."
              : descriptions[mode]}
          </p>
          {params.get("verified") === "1" ? (
            <p className="auth-status success-text" role="status">
              <Mail size={17} style={{ display: "inline", marginRight: 9 }} />
              Почта подтверждена. Войди в аккаунт.
            </p>
          ) : null}
          {oauthError ? (
            <p className="auth-status" role="alert">
              {explainError(oauthError)}
            </p>
          ) : null}
          {error ? (
            <p className="error-text" role="alert">
              {error}
            </p>
          ) : null}
          {!configLoaded ? (
            <p className="provider-hint" role="status">
              Загружаем способы входа…
            </p>
          ) : !config ? (
            <p className="error-text" role="alert">
              Не удалось загрузить способы входа. Обнови страницу.
            </p>
          ) : null}
          {showSocial && !success ? (
            <>
              <div className="oauth-row">
                <button
                  className="button"
                  type="button"
                  disabled={busy || !config?.providers.yandex}
                  onClick={() => void social("yandex")}
                >
                  Яндекс ID
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={busy || !config?.providers.vk}
                  onClick={() => void social("vk")}
                >
                  VK ID
                </button>
              </div>
              {config && (!config.providers.yandex || !config.providers.vk) ? (
                <p className="provider-hint">Недоступные способы входа ещё не подключены.</p>
              ) : null}
              {emailEnabled ? <div className="auth-divider">Или по почте</div> : null}
            </>
          ) : null}
          {success ? (
            <div className="auth-status" role="status">
              <Mail size={21} className="rose" style={{ marginBottom: 12 }} />
              <p>{success}</p>
              <Link className="text-link" href={`/sign-in${nextQuery}`} style={{ marginTop: 16 }}>
                Перейти ко входу
                <ArrowRight size={14} />
              </Link>
            </div>
          ) : emailEnabled ? (
            <form
              className="auth-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              {mode === "sign-up" ? (
                <div className="form-field">
                  <label htmlFor="auth-name">Твоё имя</label>
                  <input
                    className="input"
                    id="auth-name"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={60}
                    placeholder="Как к тебе обращаться"
                  />
                </div>
              ) : null}
              {mode !== "reset-password" ? (
                <div className="form-field">
                  <label htmlFor="auth-email">Почта</label>
                  <input
                    className="input"
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.ru"
                    maxLength={254}
                  />
                </div>
              ) : null}
              {hasPassword ? (
                <div className="form-field">
                  <label htmlFor="auth-password">
                    {mode === "reset-password" ? "Новый пароль" : "Пароль"}
                  </label>
                  <div className="password-wrap">
                    <input
                      className="input"
                      id="auth-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      maxLength={MAX_PASSWORD_LENGTH}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={
                        mode === "sign-in"
                          ? "Твой пароль"
                          : `Не меньше ${MIN_PASSWORD_LENGTH} символов`
                      }
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              ) : null}
              {mode === "sign-in" ? (
                <div className="auth-links">
                  <Link className="text-link" href="/forgot-password">
                    Забыли пароль?
                  </Link>
                  <Link className="muted" href="/verify-email">
                    Подтвердить почту
                  </Link>
                </div>
              ) : null}
              <button className="button full" disabled={busy}>
                {busy
                  ? "Подожди немного…"
                  : mode === "sign-in"
                    ? "Войти"
                    : mode === "sign-up"
                      ? "Создать аккаунт"
                      : mode === "forgot-password"
                        ? "Отправить ссылку"
                        : mode === "reset-password"
                          ? "Сохранить пароль"
                          : "Отправить письмо"}
                <ArrowRight size={16} />
              </button>
            </form>
          ) : config && !showSocial ? (
            <p className="auth-status">
              Вход по почте сейчас отключён. Используй Яндекс ID или VK ID.
            </p>
          ) : null}
          {showSocial && !success ? (
            <>
              {emailEnabled ? (
                <p className="auth-bottom">
                  {mode === "sign-in" ? "Первый раз здесь? " : "Уже есть аккаунт? "}
                  <Link href={`${mode === "sign-in" ? "/sign-up" : "/sign-in"}${nextQuery}`}>
                    {mode === "sign-in" ? "Создать аккаунт" : "Войти"}
                  </Link>
                </p>
              ) : null}
              <p className="auth-bottom small">
                <Link href="/demo">Посмотреть демоверсию</Link>
              </p>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
