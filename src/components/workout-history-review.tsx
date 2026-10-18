"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMiron } from "@/client/use-miron";
import type {
  ApiError,
  CommandAck,
  CommandEnvelope,
  SetCorrectionCommand,
  Workout,
} from "@/shared/contracts";
import { WorkoutSetEditor } from "./workout-set-editor";
import { PageHeading } from "./app-shell";

export function WorkoutHistoryReview({ id }: { id: string }) {
  const { ownerId, isReady, isOnline } = useMiron();
  const [loaded, setLoaded] = useState<{ owner: string; value: Workout } | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const owner = useRef(ownerId);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const refresh = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setEditing(null);
        setLoaded(null);
        setReload((value) => value + 1);
      }
    };
    window.addEventListener("pageshow", refresh);
    return () => {
      mounted.current = false;
      window.removeEventListener("pageshow", refresh);
    };
  }, []);
  useLayoutEffect(() => {
    owner.current = ownerId;
  }, [ownerId]);
  const attempt = useRef<{ signature: string; input: CommandEnvelope } | null>(null);
  const workout = loaded?.owner === ownerId ? loaded.value : null;
  useEffect(() => {
    if (!ownerId) return;
    const controller = new AbortController();
    void fetch(`/api/workouts/${id}`, {
      cache: "no-store",
      signal: controller.signal,
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Запись недоступна. Обнови историю или вернись к прогрессу.");
        const value = (await response.json()) as Workout;
        if (!controller.signal.aborted && owner.current === ownerId) {
          setLoaded({ owner: ownerId, value });
          setError("");
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && owner.current === ownerId)
          setError(cause instanceof Error ? cause.message : "Не удалось загрузить запись.");
      });
    return () => controller.abort();
  }, [id, ownerId, reload]);

  async function correct(command: SetCorrectionCommand) {
    if (!workout || !ownerId || !isOnline)
      throw new Error("Для исправления истории подключись к интернету.");
    const principal = ownerId;
    const signature = JSON.stringify({ ownerId, id, revision: workout.revision, command });
    if (attempt.current?.signature !== signature)
      attempt.current = {
        signature,
        input: {
          operationId: crypto.randomUUID(),
          expectedRevision: workout.revision,
          command,
        },
      };
    const response = await fetch(`/api/workouts/${id}/commands`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attempt.current.input),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ApiError | null;
      if (body?.error.code === "REVISION_CONFLICT" && owner.current === principal) {
        setEditing(null);
        setLoaded(null);
        setReload((value) => value + 1);
      }
      throw new Error(
        body?.error.message ?? "Не удалось сохранить. Обнови запись и попробуй снова.",
      );
    }
    const ack = (await response.json()) as CommandAck;
    if (
      owner.current !== principal ||
      ack.workout.id !== id ||
      ack.operationId !== attempt.current.input.operationId
    )
      throw new Error("Аккаунт или запись изменились. Открой историю заново.");
    // A historical ACK must never replace another current workout in the account provider.
    if (mounted.current) {
      setLoaded({ owner: principal, value: ack.workout });
      window.location.assign("/progress");
    }
  }

  if (!isReady) return <p role="status">Загружаем историю…</p>;
  if (!ownerId) return <Link href="/sign-in">Войти в свой аккаунт</Link>;
  if (workout && !["completed", "partial", "aborted"].includes(workout.status))
    return (
      <>
        <PageHeading
          title="Занятие ещё идёт"
          description="Записи текущей тренировки хранятся в её журнале."
        />
        <Link className="button primary" href="/workout">
          Продолжить тренировку
        </Link>
      </>
    );
  if (workout && editing)
    return (
      <WorkoutSetEditor
        key={`${workout.id}:${editing}`}
        workout={workout}
        setId={editing}
        onCommit={correct}
        onClose={() => setEditing(null)}
        isOnline={isOnline}
        offlineAllowed={false}
      />
    );
  return (
    <>
      <PageHeading
        title={workout?.title ?? "Записанные подходы"}
        description="Фактические результаты занятия. Исправление не начисляет XP повторно."
      />
      <Link className="text-link" href="/progress">
        К прогрессу
      </Link>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setLoaded(null);
              setError("");
              setReload((value) => value + 1);
            }}
          >
            Обновить запись
          </button>
        </div>
      ) : null}
      {workout ? (
        <section className="card">
          {workout.recordedSets.map((set, index) => (
            <article className="history-item" key={set.id}>
              <div>
                <h2>
                  {workout.exercises.find((exercise) => exercise.id === set.exerciseId)?.name}
                </h2>
                <p>
                  Подход {index + 1} ·{" "}
                  {set.reps === null
                    ? `${set.durationSeconds} сек`
                    : `${set.weightKg} кг × ${set.reps}`}
                </p>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setEditing(set.id)}
                >
                  Исправить подход {index + 1}
                </button>
              </div>
            </article>
          ))}
          {!workout.recordedSets.length ? <p>В этом занятии нет записанных подходов.</p> : null}
        </section>
      ) : !error ? (
        <p role="status">Загружаем подходы…</p>
      ) : null}
    </>
  );
}
