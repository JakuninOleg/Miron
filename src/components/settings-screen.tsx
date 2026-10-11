"use client";

import { useState } from "react";
import { Download, LogOut, Moon, Sun, UserRound } from "lucide-react";
import { useMiron } from "@/client/use-miron";
import { PageHeading } from "./app-shell";
import { CompanionOptions } from "./companion";
import type { Profile } from "@/shared/contracts";

export function SettingsScreen() {
  const { profile, isReady, isDemo, saveProfile, logout, exportAccount, resetDemo } = useMiron();
  const [draft, setDraft] = useState<Profile | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const current = draft ?? profile;
  if (!isReady || !current) return <div className="loading-state">Загружаем профиль…</div>;
  function update(changes: Partial<Profile>) {
    if (current) {
      setDraft({ ...current, ...changes });
      setStatus("");
    }
  }
  async function save() {
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      await saveProfile(current);
      setDraft(null);
      setStatus("Изменения сохранены.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить изменения.");
    } finally {
      setBusy(false);
    }
  }
  async function exportData() {
    try {
      await exportAccount();
      setStatus("Файл с твоими данными готов к скачиванию.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось скачать данные.");
    }
  }
  return (
    <>
      <PageHeading title="Твой профиль" description="Здесь всё можно настроить под себя." />
      <div className="settings-grid">
        <section className="card settings-section">
          <div className="profile-summary">
            <span className="avatar-chip">
              <UserRound size={23} />
            </span>
            <div>
              <h3>{current.name || "Твой профиль"}</h3>
              <p className="muted small">
                {isDemo ? "Демонстрационный аккаунт" : "Участник MIRON"}
              </p>
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="profile-name">Имя</label>
            <input
              className="input"
              id="profile-name"
              value={current.name}
              onChange={(event) => update({ name: event.target.value })}
              maxLength={60}
              autoComplete="given-name"
            />
          </div>
          <hr />
          <div>
            <h2 style={{ marginBottom: 18 }}>Твой напарник</h2>
            <CompanionOptions
              value={current.companion}
              onChange={(companion) => update({ companion })}
            />
            <p className="field-help" style={{ marginTop: 12 }}>
              Оба напарника помогают с любым направлением. История и опыт сохраняются.
            </p>
          </div>
          <hr />
          <div>
            <h2 style={{ marginBottom: 17 }}>Оформление</h2>
            <div className="theme-choice">
              <button
                className={`button ${current.theme === "dark" ? "" : "secondary"}`}
                aria-pressed={current.theme === "dark"}
                onClick={() => update({ theme: "dark" })}
              >
                <Moon size={17} />
                Графит
              </button>
              <button
                className={`button ${current.theme === "rose" ? "rose-button" : "secondary"}`}
                aria-pressed={current.theme === "rose"}
                onClick={() => update({ theme: "rose" })}
              >
                <Sun size={17} />
                Светлая роза
              </button>
            </div>
          </div>
          <button className="button" disabled={busy || !current.name.trim()} onClick={save}>
            {busy ? "Сохраняем…" : "Сохранить изменения"}
          </button>
          {status ? (
            <p className="success-text" role="status">
              {status}
            </p>
          ) : null}
          {error ? (
            <p className="error-text" role="alert">
              {error}
            </p>
          ) : null}
        </section>
        <div className="settings-section">
          <section className="card settings-section">
            <h2>Мой ритм</h2>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="profile-time">Время занятия</label>
                <input
                  className="input"
                  id="profile-time"
                  type="time"
                  value={current.reminderTime}
                  onChange={(event) => update({ reminderTime: event.target.value })}
                />
              </div>
              <div className="form-field">
                <label htmlFor="profile-minutes">Минут на занятие</label>
                <select
                  className="input"
                  id="profile-minutes"
                  value={current.durationMinutes}
                  onChange={(event) => update({ durationMinutes: Number(event.target.value) })}
                >
                  {[...new Set([15, 25, 30, 35, 45, current.durationMinutes])]
                    .sort((a, b) => a - b)
                    .map((value) => (
                      <option key={value} value={value}>
                        {value} минут
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <label className="agreement" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={current.remindersEnabled}
                onChange={(event) => update({ remindersEnabled: event.target.checked })}
              />
              <span>Напоминать о занятиях внутри приложения</span>
            </label>
            <p className="field-help">
              Push-уведомления пока не подключены. Можно сохранить предпочтение для будущих
              напоминаний.
            </p>
            <a className="text-link" href="/onboarding">
              Изменить цель, дни и инвентарь
            </a>
          </section>
          <section className="card settings-section">
            <h2>Помощник</h2>
            <p className="muted">
              Сейчас доступно знакомство с демо-напарником. Постоянный ИИ-диалог и проба на 7 дней
              появятся после подключения Qwen.
            </p>
            <p className="field-help">
              Базовая тренировка, история и персонажи останутся доступными бесплатно.
            </p>
          </section>
          <section className="card settings-section">
            <h2>Расход энергии</h2>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={current.showWorkoutEnergy !== false}
                onChange={(event) => update({ showWorkoutEnergy: event.target.checked })}
              />
              <span>Показывать примерный расход калорий от тренировок</span>
            </label>
            <p className="field-help">
              В итогах и истории. Оценки сохраняются, даже когда показатель скрыт.
            </p>
          </section>
          <section className="card settings-section">
            <h2>Аккаунт и данные</h2>
            <button className="button secondary full" onClick={exportData}>
              <Download size={16} />
              Скачать данные с устройства
            </button>
            {isDemo ? (
              <button
                className="button secondary full"
                onClick={async () => {
                  try {
                    await resetDemo();
                    setDraft(null);
                    setStatus("Демоверсия сброшена. Можно начать заново.");
                  } catch (cause) {
                    setError(
                      cause instanceof Error ? cause.message : "Не удалось сбросить демоверсию.",
                    );
                  }
                }}
              >
                Начать демоверсию заново
              </button>
            ) : null}
            <button
              className="button secondary full"
              onClick={() =>
                void logout().catch((cause) =>
                  setError(
                    cause instanceof Error ? cause.message : "Не удалось выйти. Попробуй снова.",
                  ),
                )
              }
            >
              <LogOut size={16} />
              Выйти
            </button>
          </section>
        </div>
      </div>
    </>
  );
}
