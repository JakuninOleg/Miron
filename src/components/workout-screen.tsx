"use client";
import Image from "next/image";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CircleCheck, Dumbbell, Info, Play, Trophy } from "lucide-react";
import { useMiron } from "@/client/use-miron";
import { PageHeading } from "./app-shell";
import { companionNames } from "./companion";
import { WorkoutTimer } from "./workout-timer";
import { WorkoutEnergyCard } from "./workout-energy-card";
import type { Exercise, RecordedSet } from "@/shared/contracts";
import { exerciseWorkSeconds, workoutExecution } from "@/shared/workout-execution";

function SetEntry({
  index,
  exercise,
  completed,
  available,
  savedSet,
  onRecord,
}: {
  index: number;
  exercise: Exercise;
  completed: boolean;
  available: boolean;
  savedSet?: RecordedSet;
  onRecord: (reps: number, weight: number) => Promise<void>;
}) {
  const timed = exercise.metric === "time";
  const [reps, setReps] = useState(timed ? exerciseWorkSeconds(exercise) : exercise.targetReps);
  const [weight, setWeight] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <div className="set-row">
        <span className="muted small">{index + 1}</span>
        <input
          className="input"
          type="number"
          min={1}
          max={timed ? 86400 : 1000}
          value={
            timed ? (savedSet?.durationSeconds ?? savedSet?.reps ?? reps) : (savedSet?.reps ?? reps)
          }
          disabled={completed || saving || !available}
          onChange={(event) => setReps(Number(event.target.value))}
          aria-label={`Подход ${index + 1}, ${exercise.metric === "time" ? "секунды" : "повторения"}`}
        />
        {timed ? (
          <span className="muted small" style={{ textAlign: "center" }}>
            —
          </span>
        ) : (
          <input
            className="input"
            type="number"
            min={0}
            max={500}
            step={0.5}
            value={savedSet?.weightKg ?? weight}
            disabled={completed || saving || !available}
            onChange={(event) => setWeight(Number(event.target.value))}
            aria-label={`Подход ${index + 1}, вес в килограммах`}
          />
        )}
        <button
          className={`set-check ${completed ? "done" : ""}`}
          disabled={
            completed ||
            saving ||
            !available ||
            !Number.isInteger(reps) ||
            reps < 1 ||
            reps > (timed ? 86400 : 1000) ||
            !Number.isFinite(weight) ||
            weight < 0
          }
          aria-label={completed ? `Подход ${index + 1} записан` : `Записать подход ${index + 1}`}
          onClick={async () => {
            setSaving(true);
            setError("");
            try {
              await onRecord(reps, weight);
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : "Подход не сохранён. Повтори запись.",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          <Check size={17} />
        </button>
      </div>
      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}
    </>
  );
}

export function WorkoutScreen() {
  const {
    workout,
    profile,
    isReady,
    isDemo,
    pendingCount,
    startWorkout,
    recordSet,
    recordTimedSet,
    advanceExercise,
    finishWorkout,
    skipExercise,
    endWorkoutEarly,
  } = useMiron();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<"skip" | "end" | null>(null);
  const cancelConfirmationRef = useRef<HTMLButtonElement>(null);
  const confirmationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const nextExerciseRef = useRef<HTMLButtonElement>(null);
  const outcomeHeadingRef = useRef<HTMLHeadingElement>(null);
  const exerciseHeadingRef = useRef<HTMLHeadingElement>(null);
  const status = workout?.status;
  const currentIndex = workout?.currentIndex;
  useEffect(() => {
    if (confirmation) cancelConfirmationRef.current?.focus();
    else if (confirmationTriggerRef.current?.isConnected) confirmationTriggerRef.current.focus();
    else if (confirmationTriggerRef.current) nextExerciseRef.current?.focus();
  }, [confirmation]);
  useEffect(() => {
    if (status && ["completed", "partial", "aborted"].includes(status)) {
      outcomeHeadingRef.current?.focus();
    }
  }, [status]);
  useEffect(() => {
    if (status === "active") exerciseHeadingRef.current?.focus();
  }, [currentIndex, status]);
  if (!isReady || !profile) return <div className="loading-state">Готовим тренировку…</div>;
  if (!workout)
    return (
      <>
        <PageHeading title="Тренировка" />
        <section className="card empty-state">
          <Dumbbell size={37} />
          <h2>Здесь будет твоё занятие</h2>
          <p>Подготовь и подтверди личный план, затем выбери день для занятия.</p>
          <Link href="/workout-builder" className="button">
            Подготовить занятие
          </Link>
        </section>
      </>
    );
  if (["completed", "partial", "aborted"].includes(workout.status)) {
    const aborted = workout.status === "aborted";
    const partial = workout.status === "partial";
    const reward = workout.reward;
    const awaitingSync = !isDemo && pendingCount > 0;
    const message = aborted
      ? "Занятие закрыто без записанных результатов. Можно начать снова, когда будет удобно."
      : partial
        ? profile.companion === "max"
          ? "Пришлось закончить раньше — бывает. Сделанные подходы никуда не делись. Продолжим в следующий раз."
          : "Сегодня получилось короче. Ты всё равно уделил себе время — результаты сохранены."
        : profile.companion === "max"
          ? "План выполнен. Хорошая работа — результаты уже в твоём пути."
          : "Занятие завершено. Ещё один шаг в твоём ритме — всё сохранили.";
    return (
      <section className="card finish-card">
        <div className="finish-icon">{aborted ? <Dumbbell size={35} /> : <Trophy size={35} />}</div>
        <h1 ref={outcomeHeadingRef} tabIndex={-1}>
          {aborted
            ? "Занятие закрыто"
            : partial
              ? "Сегодня — столько, сколько получилось"
              : "План выполнен"}
        </h1>
        <p>{message}</p>
        <div className="stage-progress-label" style={{ gap: 25, fontSize: 15 }}>
          <span>{workout.recordedSets.length} подходов</span>
          {!awaitingSync && reward ? <span className="accent">+{reward.awardedXp} XP</span> : null}
        </div>
        {awaitingSync ? (
          <p role="status">
            Результаты сохранены на устройстве. XP подтвердим после синхронизации.
          </p>
        ) : reward && !aborted ? (
          <p className="field-help">
            {reward.awardedXp === 0
              ? "Результаты сохранены. Сегодня уже начислено столько же или больше XP: повторные занятия не увеличивают награду."
              : reward.awardedXp < reward.eligibleXp
                ? "Сегодня уже была награда. Добавили разницу, чтобы учесть это занятие."
                : "Опыт начислен автоматически."}{" "}
            {reward.dayTotalXp} / 50 XP за день · время Москвы.
          </p>
        ) : aborted ? (
          <p className="field-help">Без выполненных подходов XP не начисляется.</p>
        ) : (
          <p className="field-help">
            Информация о награде появится после подтверждения результата.
          </p>
        )}
        {isDemo ? (
          <p className="field-help">Демонстрация: результаты и XP доступны только в этом демо.</p>
        ) : null}
        {!aborted ? <WorkoutEnergyCard key={workout.id} workout={workout} /> : null}
        <Link href="/progress" className="button full">
          Посмотреть прогресс
          <ArrowRight size={16} />
        </Link>
        <Link href="/dashboard" className="text-link">
          Вернуться к своему дню
        </Link>
      </section>
    );
  }
  const exercise = workout.exercises[workout.currentIndex];
  if (!exercise)
    return (
      <div className="card empty-state">
        <p>В занятии нет упражнений.</p>
        <Link href="/programs" className="button secondary">
          К программе
        </Link>
      </div>
    );
  const logged = workout.recordedSets.filter((set) => set.exerciseId === exercise.id).length;
  const execution = workoutExecution(
    workout.exercises,
    workout.currentIndex,
    workout.recordedSets.map((set) => set.exerciseId),
  );
  const pair = execution.pair;
  const lastExercise = execution.nextIndex === null;
  const totalSets = workout.exercises.reduce((sum, item) => sum + item.sets, 0);
  const pairPartner = pair
    ? workout.exercises[pair.position === "A" ? pair.bIndex : pair.aIndex]
    : undefined;
  const pairRestSeconds =
    pair?.position === "A" ? (exercise.transitionSeconds ?? 15) : exercise.restSeconds;
  const showPairTimer =
    pair &&
    execution.canAdvance &&
    pairRestSeconds > 0 &&
    (pair.position === "A" || execution.nextIndex === pair.aIndex);
  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setConfirmation(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Не удалось сохранить действие. Повтори попытку.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="Твоя тренировка"
        description={workout.title}
        action={<span className="tag">{isDemo ? "Демонстрация" : "По твоему плану"}</span>}
      />
      <div className="workout-toolbar">
        <span>
          {pair
            ? `Пара ${pair.position} · раунд ${pair.round} из ${pair.rounds}`
            : `Упражнение ${workout.currentIndex + 1} из ${workout.exercises.length}`}
        </span>
        <div className="meter">
          <span
            style={{ width: `${totalSets ? (workout.recordedSets.length / totalSets) * 100 : 0}%` }}
          />
        </div>
        <span>{workout.estimatedMinutes} мин</span>
      </div>
      {error ? (
        <p className="error-text" role="alert" style={{ marginBottom: 17 }}>
          {error}
        </p>
      ) : null}
      <div className="workout-layout">
        <section className="card">
          <div className="exercise-title">
            <div>
              {exercise.phase ? (
                <p className="small rose">
                  {exercise.phase === "warmup"
                    ? "Разминка"
                    : exercise.phase === "cooldown"
                      ? "Заминка"
                      : "Основная часть"}
                </p>
              ) : null}
              <h2 ref={exerciseHeadingRef} tabIndex={-1}>
                {exercise.name}
              </h2>
              <p>
                {exercise.sets} подхода ·{" "}
                {exercise.metric === "time"
                  ? (exercise.targetDurationSeconds ?? exercise.targetReps)
                  : exercise.targetReps}{" "}
                {exercise.metric === "time" ? "секунд" : "повторений"}
                {exercise.perSide ? " на каждую сторону" : ""} ·{" "}
                {pair ? "отдых между раундами" : "отдых"} {exercise.restSeconds} сек
              </p>
              {exercise.perSide ? (
                <p className="field-help">
                  Один подход включает обе стороны.{" "}
                  {exercise.metric === "time"
                    ? `Таймер рассчитан на ${exerciseWorkSeconds(exercise)} секунд работы суммарно; смени сторону после ${exercise.targetDurationSeconds ?? exercise.targetReps} секунд. Запиши фактическое время обеих сторон вместе.`
                    : "Записывай повторы на сторону после выполнения обеих сторон."}
                </p>
              ) : null}
              {pair && pairPartner ? (
                <p className="field-help">
                  A — {workout.exercises[pair.aIndex].name}; Б —{" "}
                  {workout.exercises[pair.bIndex].name}. Один подход A, затем один Б. Переход{" "}
                  {workout.exercises[pair.aIndex].transitionSeconds ?? 15} сек; отдых после Б{" "}
                  {workout.exercises[pair.bIndex].restSeconds} сек.
                </p>
              ) : null}
            </div>
            <Dumbbell size={26} className="rose" />
          </div>
          <div className="technique-area">
            <h3>
              <Info size={16} className="rose" />
              Как выполнять
            </h3>
            <ol>
              {exercise.instructions.map((instruction, index) => (
                <li key={index}>{instruction}</li>
              ))}
            </ol>
            <p className="technique-note">
              {exercise.status !== "published"
                ? exercise.status === "draft"
                  ? "Черновая инструкция: экспертная проверка не выполнена. Начни комфортно и остановись, если движение вызывает боль."
                  : "Демонстрационная инструкция. Проверенная техника и изображения появятся после экспертной проверки."
                : "Начни с комфортного варианта. Если движение вызывает боль, остановись."}
            </p>
            <Link href={`/chat?exercise=${encodeURIComponent(exercise.id)}`} className="text-link">
              Спросить напарника об этом упражнении
            </Link>
          </div>
          {workout.status === "ready" ? (
            <div className="empty-state" style={{ padding: "18px 0" }}>
              <p>Начни занятие, чтобы записывать подходы. Пауза и отдых всегда доступны.</p>
              <button
                className="button full"
                disabled={busy}
                onClick={() => void perform(startWorkout)}
              >
                <Play size={16} />
                Начать занятие
              </button>
            </div>
          ) : (
            <>
              <div className="set-head">
                <span>Подход</span>
                <span style={{ textAlign: "center" }}>
                  {exercise.metric === "time" ? "Секунды" : "Повторения"}
                </span>
                <span style={{ textAlign: "center" }}>Вес, кг</span>
                <span className="sr-only">Запись</span>
              </div>
              {Array.from({ length: exercise.sets }, (_, index) => (
                <SetEntry
                  key={`${exercise.id}-${index}`}
                  index={index}
                  exercise={exercise}
                  completed={index < logged}
                  available={index === logged && execution.canRecord && !busy}
                  savedSet={
                    workout.recordedSets.filter((set) => set.exerciseId === exercise.id)[index]
                  }
                  onRecord={async (reps, weight) => {
                    if (exercise.metric === "time") await recordTimedSet(exercise.id, reps);
                    else await recordSet(exercise.id, reps, weight);
                  }}
                />
              ))}
              <div className="workout-next">
                <button
                  className="button"
                  ref={nextExerciseRef}
                  disabled={busy || !execution.canAdvance}
                  onClick={() => void perform(lastExercise ? finishWorkout : advanceExercise)}
                >
                  {busy
                    ? "Сохраняем…"
                    : lastExercise
                      ? "Завершить тренировку"
                      : pair
                        ? pair.position === "A"
                          ? "Перейти к Б"
                          : execution.nextIndex === pair.aIndex
                            ? "Следующий раунд · A"
                            : "Следующее упражнение"
                        : "Следующее упражнение"}
                  {lastExercise ? <CircleCheck size={17} /> : <ArrowRight size={17} />}
                </button>
              </div>
              <p className="field-help" style={{ marginTop: 12 }}>
                {exercise.skipped
                  ? "Упражнение пропущено. Уже записанные подходы сохранены."
                  : pair && execution.canAdvance
                    ? pair.position === "A"
                      ? "Подход A сохранён. Переходи к Б, когда будешь готов."
                      : execution.nextIndex === pair.aIndex
                        ? "Раунд сохранён. Отдохни и начинай следующий с A."
                        : "Пара выполнена. Можно продолжать."
                    : logged < exercise.sets
                      ? "Запиши выполненные подходы, чтобы продолжить."
                      : "Подходы сохранены. Можно двигаться дальше."}
              </p>
              <div className="workout-outcome-actions">
                {!exercise.skipped && logged < exercise.sets ? (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={(event) => {
                      confirmationTriggerRef.current = event.currentTarget;
                      setConfirmation("skip");
                    }}
                  >
                    Пропустить упражнение
                  </button>
                ) : null}
                <button
                  className="text-link"
                  disabled={busy}
                  onClick={(event) => {
                    confirmationTriggerRef.current = event.currentTarget;
                    setConfirmation("end");
                  }}
                >
                  Закончить раньше
                </button>
              </div>
              {confirmation ? (
                <section
                  className="workout-confirmation"
                  aria-labelledby="outcome-confirmation-title"
                >
                  <h3 id="outcome-confirmation-title">
                    {confirmation === "skip"
                      ? "Пропустить это упражнение?"
                      : "Закончить занятие сейчас?"}
                  </h3>
                  <p>
                    {confirmation === "skip"
                      ? "Записанные подходы останутся в истории. Пропуск не считается выполнением."
                      : "Сохраним всё, что получилось. За частичное занятие тоже есть XP — в пределах дневной награды."}
                  </p>
                  <div className="workout-outcome-actions">
                    <button
                      className="button secondary"
                      disabled={busy}
                      ref={cancelConfirmationRef}
                      onClick={() => setConfirmation(null)}
                    >
                      Продолжить занятие
                    </button>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        void perform(
                          confirmation === "skip"
                            ? () => skipExercise(exercise.id)
                            : endWorkoutEarly,
                        )
                      }
                    >
                      {busy
                        ? "Сохраняем…"
                        : confirmation === "skip"
                          ? "Да, пропустить"
                          : "Сохранить и закончить"}
                    </button>
                  </div>
                </section>
              ) : null}
              <p className="field-help">
                {exercise.metric === "time"
                  ? "Запиши фактически выполненные секунды. Окончание таймера ничего не сохраняет автоматически."
                  : "Отмечай подход после выполнения. Время подхода и ожидание тренажёра мы не измеряем."}
              </p>
            </>
          )}
        </section>
        <aside className="workout-side">
          {workout.status === "active" && !exercise.skipped && exercise.metric === "time" ? (
            <WorkoutTimer
              key={`${workout.id}-${exercise.id}-work`}
              kind="work"
              seconds={exerciseWorkSeconds(exercise)}
            />
          ) : null}
          {workout.status === "active" && !exercise.skipped && !pair && exercise.restSeconds > 0 ? (
            <WorkoutTimer
              key={`${workout.id}-${exercise.id}-rest`}
              kind="rest"
              seconds={exercise.restSeconds}
            />
          ) : null}
          {workout.status === "active" && showPairTimer ? (
            <div>
              <p className="field-help">
                {pair.position === "A"
                  ? "Ручной таймер перехода к Б"
                  : "Ручной таймер отдыха между раундами"}
                . Продолжай, когда будешь готов.
              </p>
              <WorkoutTimer
                key={`${workout.id}-${exercise.id}-${logged}-pair-rest`}
                kind="rest"
                seconds={pairRestSeconds}
              />
            </div>
          ) : null}
          <div className="card workout-companion">
            <Image
              unoptimized
              width={768}
              height={1152}
              className="mini-avatar"
              src={`/characters/${profile.companion}-avatar.webp`}
              alt=""
            />
            <div>
              <span className="rose small">{companionNames[profile.companion]}</span>
              <p>Чистое движение важнее скорости. Не спеши.</p>
            </div>
          </div>
          <section className="card">
            <h3>Опыт за твой путь</h3>
            <p className="field-help">
              Это занятие: {workout.rewardKind === "support" ? "короткий комплекс" : "основное"}.
            </p>
            <p className="field-help">
              Основное занятие: 50 XP за полное, 25 за частичное. Короткий аэробный или
              восстановительный комплекс: 20 / 10 XP.
            </p>
            <p className="field-help">
              До 50 XP за день по времени Москвы. Если позже выполнено более полное занятие, добавим
              только разницу. Результаты сохраняются и после достижения лимита.
            </p>
          </section>
          <section className="card workout-upcoming">
            <h3 style={{ marginBottom: 18 }}>План занятия</h3>
            <div className="upcoming-list">
              {workout.exercises.map((item, index) => (
                <div
                  className={`upcoming-item ${index === workout.currentIndex ? "current" : ""}`}
                  key={item.id}
                >
                  {item.skipped ? (
                    <span className="muted small">—</span>
                  ) : workout.recordedSets.filter((set) => set.exerciseId === item.id).length ===
                    item.sets ? (
                    <Check size={16} />
                  ) : (
                    <span className="exercise-preview-number">{index + 1}</span>
                  )}
                  <span>
                    {item.name}
                    {item.pairKey ? <span className="muted small"> · пара</span> : null}
                    {item.skipped ? <span className="muted small"> · пропущено</span> : null}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
