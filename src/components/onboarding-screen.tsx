"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Battery,
  Dumbbell,
  Flame,
  Heart,
  Home,
  MapPin,
  Sparkles,
  TreePine,
} from "lucide-react";
import { useMiron } from "@/client/use-miron";
import { PageHeading } from "./app-shell";
import { CompanionOptions, companionNames } from "./companion";
import type { Profile } from "@/shared/contracts";

export const equipmentOptions = [
  { code: "mat", name: "Коврик" },
  { code: "dumbbell", name: "Гантель" },
  { code: "resistance_band", name: "Резинка" },
  { code: "kettlebell", name: "Гиря" },
  { code: "pull_up_bar", name: "Турник" },
  { code: "parallel_bars", name: "Брусья" },
  { code: "low_horizontal_exercise_bar", name: "Низкая перекладина" },
  { code: "bench", name: "Скамья" },
  { code: "barbell", name: "Штанга" },
  { code: "yoga_block", name: "Блок для йоги" },
  { code: "yoga_strap", name: "Ремень для йоги" },
  { code: "cable_machine", name: "Блочный тренажёр" },
];
export const goalNames = {
  strength: "Стать сильнее",
  energy: "Больше энергии",
  habit: "Войти в ритм",
};
export const experienceNames = {
  beginner: "Начинаю",
  returning: "Возвращаюсь",
  regular: "Занимаюсь регулярно",
};
export const locationNames = {
  home: "Дома",
  gym: "В зале",
  outdoor: "На улице / природе",
  workout_park: "На воркаут-площадке",
};

export function OnboardingScreen() {
  const { profile, isReady, saveProfile } = useMiron();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const current = draft ?? profile;
  function update(changes: Partial<Profile>) {
    if (current) setDraft({ ...current, ...changes });
  }
  async function next() {
    if (!current) return;
    setError("");
    if (step === 0 && !current.name.trim()) {
      setError("Как к тебе обращаться? Введи имя.");
      return;
    }
    if (step === 2 && !current.trainingDays.length) {
      setError("Выбери хотя бы один удобный день.");
      return;
    }
    if (step < 4) {
      setStep((value) => value + 1);
      return;
    }
    if (!current.adultConfirmed) {
      setError("Подтверди, что тебе исполнилось 18 лет.");
      return;
    }
    setSaving(true);
    try {
      await saveProfile({ ...current, name: current.name.trim(), onboardingCompleted: true });
      router.push("/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить. Попробуй ещё раз.");
    } finally {
      setSaving(false);
    }
  }
  if (!isReady || !current) return <div className="loading-state">Готовим знакомство…</div>;
  return (
    <div className="onboarding-layout">
      <PageHeading title="Давай знакомиться" description="Несколько ответов — и можно начинать." />
      <div className="step-progress" aria-label={`Шаг ${step + 1} из 5`}>
        {[0, 1, 2, 3, 4].map((item) => (
          <span key={item} className={item <= step ? "done" : ""} />
        ))}
      </div>
      <section className="card onboarding-card">
        {step === 0 ? (
          <>
            <h2>Кто будет рядом?</h2>
            <p className="onboarding-description">
              Выбирай по настроению. Напарника и оформление можно поменять в любой момент.
            </p>
            <div className="form-field" style={{ marginBottom: 22 }}>
              <label htmlFor="onboarding-name">Как тебя зовут?</label>
              <input
                className="input"
                id="onboarding-name"
                value={current.name}
                onChange={(event) => update({ name: event.target.value })}
                placeholder="Твоё имя"
                autoComplete="given-name"
                maxLength={60}
              />
            </div>
            <CompanionOptions
              value={current.companion}
              onChange={(companion) => update({ companion })}
            />
          </>
        ) : null}
        {step === 1 ? (
          <>
            <h2>Что хочется изменить?</h2>
            <p className="onboarding-description">
              Не нужно ставить рекорд. Выбери цель, которая сейчас ближе.
            </p>
            <div className="choice-grid">
              {(
                [
                  { id: "strength", icon: Dumbbell, help: "Постепенно увеличить силу" },
                  { id: "energy", icon: Battery, help: "Больше движения в обычном дне" },
                  { id: "habit", icon: Heart, help: "Сделать занятия частью недели" },
                ] as const
              ).map(({ id, icon: Icon, help }) => (
                <button
                  key={id}
                  className={`choice-button ${current.goal === id ? "selected" : ""}`}
                  aria-pressed={current.goal === id}
                  onClick={() => update({ goal: id })}
                >
                  <Icon size={24} />
                  <span>
                    <strong>{goalNames[id]}</strong>
                    <small>{help}</small>
                  </span>
                </button>
              ))}
            </div>
            <h3 style={{ margin: "28px 0 15px" }}>А как с опытом?</h3>
            <div className="choice-grid">
              {(
                [
                  { id: "beginner", help: "Хочу разобраться с основами", icon: Sparkles },
                  { id: "returning", help: "Был перерыв, начинаю снова", icon: ArrowRight },
                  { id: "regular", help: "Уже есть привычка тренироваться", icon: Flame },
                ] as const
              ).map(({ id, help, icon: Icon }) => (
                <button
                  key={id}
                  className={`choice-button ${current.experience === id ? "selected" : ""}`}
                  aria-pressed={current.experience === id}
                  onClick={() => update({ experience: id })}
                >
                  <Icon size={24} />
                  <span>
                    <strong>{experienceNames[id]}</strong>
                    <small>{help}</small>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <h2>Впишем в твою неделю</h2>
            <p className="onboarding-description">
              Выбирай время, которое удобно выделять. План можно скорректировать позже.
            </p>
            <span className="field-label">Сколько занятий в неделю?</span>
            <div className="day-choice-row">
              {[2, 3, 4].map((days) => (
                <button
                  key={days}
                  className={`day-choice ${current.daysPerWeek === days ? "selected" : ""}`}
                  aria-pressed={current.daysPerWeek === days}
                  onClick={() =>
                    update({
                      daysPerWeek: days,
                      trainingDays: days === 2 ? [1, 4] : days === 4 ? [0, 2, 4, 6] : [1, 3, 5],
                    })
                  }
                >
                  {days}
                </button>
              ))}
            </div>
            <span className="field-label">Продолжительность занятия</span>
            <div className="day-choice-row">
              {[...new Set([15, 25, 30, 35, 45, current.durationMinutes])]
                .sort((a, b) => a - b)
                .map((minutes) => (
                  <button
                    key={minutes}
                    style={{ width: 74 }}
                    className={`day-choice ${current.durationMinutes === minutes ? "selected" : ""}`}
                    aria-pressed={current.durationMinutes === minutes}
                    onClick={() => update({ durationMinutes: minutes })}
                  >
                    {minutes} мин
                  </button>
                ))}
            </div>
            <div className="form-field">
              <label htmlFor="discipline">Как хочется заниматься?</label>
              <select
                className="input"
                id="discipline"
                value={current.discipline}
                onChange={(event) =>
                  update({ discipline: event.target.value as Profile["discipline"] })
                }
              >
                <option value="strength">Силовые упражнения</option>
                <option value="calisthenics">С собственным весом</option>
                <option value="mobility">Подвижность</option>
                <option value="yoga">Йога</option>
              </select>
              <p className="field-help">
                Это направление занятия. Full body и split — варианты организации недели.
              </p>
            </div>
          </>
        ) : null}
        {step === 3 ? (
          <>
            <h2>Где будем заниматься?</h2>
            <p className="onboarding-description">
              Место и инвентарь выбираются отдельно. На улице можно заниматься без снарядов.
            </p>
            <div className="choice-grid">
              {(
                [
                  { id: "home", icon: Home },
                  { id: "gym", icon: Dumbbell },
                  { id: "outdoor", icon: TreePine },
                  { id: "workout_park", icon: MapPin },
                ] as const
              ).map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  className={`choice-button ${current.location === id ? "selected" : ""}`}
                  aria-pressed={current.location === id}
                  onClick={() => update({ location: id })}
                >
                  <Icon size={24} />
                  <strong>{locationNames[id]}</strong>
                </button>
              ))}
            </div>
            <h3 style={{ margin: "28px 0 6px" }}>Что есть под рукой?</h3>
            <p className="field-help">
              Укажи только то, что доступно сейчас: даже на площадке турник и брусья есть не всегда.
              Без инвентаря оставь выбор пустым.
            </p>
            <div className="equipment-grid">
              {equipmentOptions.map((item) => {
                const existing = current.equipment.find((value) => value.code === item.code);
                return (
                  <div key={item.code} className={`equipment-choice ${existing ? "selected" : ""}`}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(existing)}
                        onChange={() =>
                          update({
                            equipment: existing
                              ? current.equipment.filter((value) => value.code !== item.code)
                              : [
                                  ...current.equipment,
                                  { code: item.code, quantity: item.code === "dumbbell" ? 2 : 1 },
                                ],
                          })
                        }
                      />
                      {item.name}
                    </label>
                    {existing ? (
                      <input
                        className="input"
                        style={{ width: 49, padding: 6, minHeight: 31 }}
                        type="number"
                        min={1}
                        max={10}
                        value={existing.quantity}
                        aria-label={`Количество: ${item.name}`}
                        onChange={(event) =>
                          update({
                            equipment: current.equipment.map((value) =>
                              value.code === item.code
                                ? {
                                    ...value,
                                    quantity: Math.max(1, Math.min(10, Number(event.target.value))),
                                  }
                                : value,
                            ),
                          })
                        }
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
        {step === 4 ? (
          <>
            <h2>Твой старт</h2>
            <p className="onboarding-description">
              {companionNames[current.companion]} уже рядом. Проверь условия перед первым занятием.
            </p>
            <dl className="review-list">
              <div>
                <dt>Цель</dt>
                <dd>{goalNames[current.goal]}</dd>
              </div>
              <div>
                <dt>Опыт</dt>
                <dd>{experienceNames[current.experience]}</dd>
              </div>
              <div>
                <dt>Ритм</dt>
                <dd>
                  {current.daysPerWeek} занятия · {current.durationMinutes} минут
                </dd>
              </div>
              <div>
                <dt>Место</dt>
                <dd>{locationNames[current.location]}</dd>
              </div>
              <div>
                <dt>Инвентарь</dt>
                <dd>
                  {current.equipment.some(
                    (item) => item.code !== "floor" && item.code !== "clear_space",
                  )
                    ? current.equipment
                        .filter((item) => item.code !== "floor" && item.code !== "clear_space")
                        .map(
                          (item) =>
                            `${equipmentOptions.find((value) => value.code === item.code)?.name ?? item.code} × ${item.quantity}`,
                        )
                        .join(", ")
                    : "Без инвентаря"}
                </dd>
              </div>
            </dl>
            <label className="agreement">
              <input
                type="checkbox"
                checked={current.adultConfirmed}
                onChange={(event) => update({ adultConfirmed: event.target.checked })}
              />
              <span>
                Мне исполнилось 18 лет. Начну с комфортной нагрузки и остановлюсь, если почувствую
                боль или недомогание.
              </span>
            </label>
            <p className="field-help" style={{ marginTop: 15 }}>
              Первая версия содержит демонстрационные упражнения. Программа будет доступна после
              проверки каталога специалистом.
            </p>
          </>
        ) : null}
        {step === 2 ? (
          <div style={{ marginTop: 25 }}>
            <span className="field-label">В какие дни удобно?</span>
            <div className="day-choice-row">
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day, index) => (
                <button
                  key={day}
                  className={`day-choice ${current.trainingDays.includes(index) ? "selected" : ""}`}
                  aria-pressed={current.trainingDays.includes(index)}
                  onClick={() => {
                    const trainingDays = current.trainingDays.includes(index)
                      ? current.trainingDays.filter((value) => value !== index)
                      : [...current.trainingDays, index].sort();
                    update({ trainingDays, daysPerWeek: Math.max(1, trainingDays.length) });
                  }}
                >
                  {day}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="reminder-time">Время для занятия</label>
                <input
                  type="time"
                  className="input"
                  id="reminder-time"
                  value={current.reminderTime}
                  onChange={(event) => update({ reminderTime: event.target.value })}
                />
              </div>
              <div className="form-field">
                <label htmlFor="timezone">Часовой пояс</label>
                <select
                  id="timezone"
                  className="input"
                  value={current.timezone}
                  onChange={(event) => update({ timezone: event.target.value })}
                >
                  <option value="Europe/Moscow">Москва (UTC+3)</option>
                  <option value="Europe/Kaliningrad">Калининград (UTC+2)</option>
                  <option value="Asia/Yekaterinburg">Екатеринбург (UTC+5)</option>
                  <option value="Asia/Novosibirsk">Новосибирск (UTC+7)</option>
                  <option value="Asia/Vladivostok">Владивосток (UTC+10)</option>
                </select>
              </div>
            </div>
          </div>
        ) : null}
        {step === 3 ? (
          <label className="agreement">
            <input
              type="checkbox"
              checked={
                current.equipment.some((item) => item.code === "floor") &&
                current.equipment.some((item) => item.code === "clear_space")
              }
              onChange={(event) =>
                update({
                  equipment: [
                    ...current.equipment.filter(
                      (item) => item.code !== "floor" && item.code !== "clear_space",
                    ),
                    ...(event.target.checked
                      ? [
                          { code: "floor", quantity: 1 },
                          { code: "clear_space", quantity: 1 },
                        ]
                      : []),
                  ],
                })
              }
            />
            <span>Есть ровная нескользкая поверхность и свободное место для движения.</span>
          </label>
        ) : null}
        {error ? (
          <p className="error-text" role="alert" style={{ marginTop: 18 }}>
            {error}
          </p>
        ) : null}
        <footer className="onboarding-footer">
          {step > 0 ? (
            <button className="button secondary" onClick={() => setStep((value) => value - 1)}>
              <ArrowLeft size={16} />
              Назад
            </button>
          ) : (
            <span className="muted small">Шаг 1 из 5</span>
          )}
          <button className="button" onClick={next} disabled={saving}>
            {saving ? "Сохраняем…" : step === 4 ? "Начать свой путь" : "Продолжить"}
            <ArrowRight size={16} />
          </button>
        </footer>
      </section>
    </div>
  );
}
