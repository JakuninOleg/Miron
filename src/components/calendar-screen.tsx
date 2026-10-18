"use client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useMiron } from "@/client/use-miron";
import { builderRequest, BuilderRequestError } from "@/client/workout-builder-api";
import type { CalendarEntry } from "@/shared/calendar";
import type { CustomWorkoutSummary } from "@/shared/workout-builder";
import type { PlannerState } from "@/shared/workout-planner";
import { calendarMonth, dateKey, shiftMonth, WEEKDAY_LABELS } from "@/shared/dashboard-preview";
import styles from "./calendar-screen.module.css";

export function CalendarScreen() {
  const { ownerId, profile, isReady } = useMiron();
  if (!isReady) return <p role="status">Загружаем расписание…</p>;
  if (!ownerId) return <Link href="/sign-in">Войти в аккаунт</Link>;
  return <CalendarContent key={`${ownerId}:${profile.timezone}`} />;
}

function CalendarContent() {
  const { ownerId, profile, isReady, isOnline } = useMiron();
  const [today] = useState(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: profile.timezone || "Europe/Moscow" }).format(
      new Date(),
    ),
  );
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [loaded, setLoaded] = useState<{
    owner: string;
    month: string;
    entries: CalendarEntry[];
    templates: CustomWorkoutSummary[];
    program: PlannerState["program"];
  } | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState("");
  const [move, setMove] = useState<{ id: string; date: string } | null>(null);
  const owner = useRef(ownerId);
  useLayoutEffect(() => {
    owner.current = ownerId;
  }, [ownerId]);
  const attempt = useRef<{ signature: string; payload: object } | null>(null);
  const createAttempt = useRef<{ signature: string; id: string } | null>(null);
  const data = loaded?.owner === ownerId && loaded.month === month ? loaded : null;
  useEffect(() => {
    if (!ownerId) return;
    const controller = new AbortController();
    const dates = calendarMonth(month).filter((date) => date !== null);
    void Promise.all([
      builderRequest<{ entries: CalendarEntry[] }>(
        `/calendar?from=${dateKey(dates[0])}&to=${dateKey(dates[dates.length - 1])}`,
        { signal: controller.signal },
        ownerId,
      ),
      builderRequest<{ templates: CustomWorkoutSummary[] }>(
        "/templates",
        { signal: controller.signal },
        ownerId,
      ),
      builderRequest<PlannerState>("/planner", { signal: controller.signal }, ownerId),
    ])
      .then(([calendar, library, planner]) => {
        if (!controller.signal.aborted && owner.current === ownerId) {
          setLoaded({
            owner: ownerId,
            month,
            entries: calendar.entries,
            templates: library.templates,
            program: planner.program,
          });
          setError("");
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && owner.current === ownerId)
          setError(cause instanceof Error ? cause.message : "Не удалось загрузить календарь.");
      });
    return () => controller.abort();
  }, [ownerId, month, reload]);

  async function command(payload: object) {
    if (!ownerId || !isOnline || busy) return;
    const principal = ownerId;
    setBusy(true);
    setError("");
    const signature = JSON.stringify({ principal, payload });
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, payload: { ...payload, operationId: crypto.randomUUID() } };
    try {
      await builderRequest(
        "/calendar",
        { method: "POST", body: JSON.stringify(attempt.current.payload) },
        principal,
      );
      if (owner.current === principal) {
        attempt.current = null;
        createAttempt.current = null;
        setMove(null);
        setChoice("");
        setLoaded(null);
        setReload((value) => value + 1);
      }
    } catch (cause) {
      if (owner.current === principal) {
        setError(cause instanceof Error ? cause.message : "Не удалось сохранить расписание.");
        if (cause instanceof BuilderRequestError && cause.code === "REVISION_CONFLICT") {
          setLoaded(null);
          setReload((value) => value + 1);
        }
      }
    } finally {
      setBusy(false);
    }
  }
  function add() {
    if (!data) return;
    const template = data.templates.find((item) => `template:${item.id}` === choice);
    const day = data.program?.draft.days.find((item) => `planner:${item.key}` === choice);
    const selection = template
      ? { source: "template", id: template.id, revision: template.revision }
      : day && data.program
        ? { source: "planner", dayKey: day.key, revision: data.program.revision }
        : null;
    if (!selection) return;
    // Keep the entity ID in the attempt too, so a lost response cannot create a second entry.
    const signature = JSON.stringify({ principal: ownerId, date: selected, selection });
    if (createAttempt.current?.signature !== signature)
      createAttempt.current = { signature, id: crypto.randomUUID() };
    void command({ type: "create", id: createAttempt.current.id, date: selected, selection });
  }
  if (!isReady) return <p role="status">Загружаем расписание…</p>;
  if (!ownerId) return <Link href="/sign-in">Войти в аккаунт</Link>;
  const entries = data?.entries.filter((item) => item.date === selected) ?? [];
  const monthLabel = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00Z`));
  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <h1>Твой календарь</h1>
        <Link className="text-link" href="/dashboard">
          <ArrowLeft size={18} /> Сегодня
        </Link>
      </header>
      <p className={styles.lead}>
        Выбирай удобные дни. Перенос и пропуск не влияют на опыт. Состав занятия сохранится таким,
        каким ты его запланировал.
      </p>
      {!isOnline ? (
        <p role="status">
          Без интернета расписание недоступно. Начатая тренировка остаётся в журнале устройства.
        </p>
      ) : null}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="button secondary"
            onClick={() => setReload((value) => value + 1)}
          >
            Обновить календарь
          </button>
        </div>
      ) : null}
      <div className={styles.layout}>
        <div>
          <div className={styles.month}>
            <button aria-label="Предыдущий месяц" onClick={() => setMonth(shiftMonth(month, -1))}>
              <ChevronLeft />
            </button>
            <h2>{monthLabel}</h2>
            <button aria-label="Следующий месяц" onClick={() => setMonth(shiftMonth(month, 1))}>
              <ChevronRight />
            </button>
          </div>
          <div className={styles.grid} role="group" aria-label="Дни месяца">
            {WEEKDAY_LABELS.map((day) => (
              <span key={day}>{day}</span>
            ))}
            {calendarMonth(month).map((date, index) =>
              date ? (
                <button
                  key={dateKey(date)}
                  type="button"
                  aria-label={dateKey(date)}
                  aria-pressed={selected === dateKey(date)}
                  aria-current={dateKey(date) === today ? "date" : undefined}
                  onClick={() => {
                    setSelected(dateKey(date));
                    setMove(null);
                  }}
                >
                  {date.getUTCDate()}
                  <small>
                    {data?.entries.some(
                      (item) => item.date === dateKey(date) && item.status === "planned",
                    )
                      ? "●"
                      : " "}
                  </small>
                </button>
              ) : (
                <span key={index} />
              ),
            )}
          </div>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <h2>Добавить занятие</h2>
            <label>
              День
              <input
                type="date"
                value={selected}
                min="2020-01-01"
                max="2100-12-31"
                required
                onChange={(event) => {
                  if (event.target.value) {
                    setSelected(event.target.value);
                    setMonth(event.target.value.slice(0, 7));
                  }
                }}
              />
            </label>
            <label>
              Тренировка
              <select
                aria-label="Тренировка"
                value={choice}
                required
                onChange={(event) => setChoice(event.target.value)}
              >
                <option value="">Из библиотеки или программы</option>
                {data?.templates.map((item) => (
                  <option key={item.id} value={`template:${item.id}`}>
                    {item.name}
                  </option>
                ))}
                {data?.program?.draft.days.map((day) => (
                  <option key={day.key} value={`planner:${day.key}`}>
                    {day.title} · программа
                  </option>
                ))}
              </select>
            </label>
            <button className="button" disabled={!data || !choice || !isOnline || busy}>
              {busy ? "Сохраняем…" : "Добавить в календарь"}
            </button>
            <Link className="text-link" href="/workout-builder">
              Собрать новую тренировку
            </Link>
          </form>
        </div>
        <div>
          <h2>{selected}</h2>
          {!data ? (
            <p role="status">Загружаем занятия…</p>
          ) : !entries.length ? (
            <p className={styles.lead}>
              День свободен. Можно запланировать занятие или оставить время на отдых.
            </p>
          ) : (
            entries.map((entry) => (
              <article className={styles.entry} key={entry.id}>
                <h3>{entry.title}</h3>
                <p>
                  {entry.status === "planned"
                    ? "В планах"
                    : entry.status === "skipped"
                      ? "Пропущено"
                      : "Занятие начато"}{" "}
                  · {entry.timezone}
                </p>
                {entry.status === "planned" ? (
                  <>
                    <div className={styles.actions}>
                      <Link
                        className="button"
                        href={`/workout-builder/start?source=schedule&id=${entry.id}`}
                      >
                        Посмотреть и начать
                      </Link>
                      <button
                        className="button secondary"
                        disabled={busy || !isOnline}
                        onClick={() => setMove({ id: entry.id, date: entry.date })}
                      >
                        Перенести
                      </button>
                      <button
                        className="button secondary"
                        disabled={busy || !isOnline}
                        onClick={() =>
                          void command({
                            type: "skip",
                            id: entry.id,
                            expectedRevision: entry.revision,
                          })
                        }
                      >
                        Пропустить
                      </button>
                      <button
                        className="button secondary"
                        disabled={busy || !isOnline}
                        onClick={() =>
                          void command({
                            type: "cancel",
                            id: entry.id,
                            expectedRevision: entry.revision,
                          })
                        }
                      >
                        Убрать из расписания
                      </button>
                    </div>
                    {move?.id === entry.id ? (
                      <form
                        className={styles.form}
                        onSubmit={(event) => {
                          event.preventDefault();
                          void command({
                            type: "move",
                            id: entry.id,
                            expectedRevision: entry.revision,
                            date: move.date,
                          });
                        }}
                      >
                        <label>
                          Новая дата
                          <input
                            type="date"
                            required
                            value={move.date}
                            onChange={(event) =>
                              setMove({ id: entry.id, date: event.target.value })
                            }
                          />
                        </label>
                        <button className="button secondary" disabled={busy || !isOnline}>
                          Подтвердить перенос
                        </button>
                      </form>
                    ) : null}
                  </>
                ) : entry.workoutId ? (
                  <Link className="text-link" href={`/workout/${entry.workoutId}`}>
                    Открыть занятие
                  </Link>
                ) : null}
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
