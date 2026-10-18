"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMiron } from "@/client/use-miron";
import { offlineDb, type WorkoutConflictBackup } from "@/client/offline-db";
import type { CommandAck } from "@/shared/contracts";
import { PageHeading } from "./app-shell";
import styles from "./workout-set-editor.module.css";
type ServerRecord = Pick<CommandAck, "workout" | "progress">;
export function WorkoutRecoveryScreen() {
  const { ownerId, isReady } = useMiron();
  if (!isReady) return <p role="status">Загружаем журнал…</p>;
  if (!ownerId) return <Link href="/sign-in">Войти в исходный аккаунт</Link>;
  return <RecoveryContent key={ownerId} ownerId={ownerId} />;
}
function RecoveryContent({ ownerId }: { ownerId: string }) {
  const { workout, pendingCount, isOnline, recoverWorkout, readWorkoutRecovery } = useMiron();
  const [server, setServer] = useState<ServerRecord | null>(null);
  const [backups, setBackups] = useState<WorkoutConflictBackup[]>([]);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const accepting = useRef(false);
  const workoutId = workout?.id;
  useEffect(() => {
    let active = true;
    void offlineDb.workoutBackups
      .where("owner")
      .equals(`user:${ownerId}`)
      .toArray()
      .then((items) => {
        if (active) setBackups(items.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)));
      })
      .catch(() => {
        if (active) setError("Не удалось прочитать локальные копии. Журнал не изменялся.");
      });
    return () => {
      active = false;
    };
  }, [ownerId, reload]);
  useEffect(() => {
    if (!workoutId || !isOnline || !pendingCount) return;
    const controller = new AbortController();
    void readWorkoutRecovery(workoutId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setServer(value);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Сравнение недоступно.");
      });
    return () => controller.abort();
  }, [ownerId, workoutId, isOnline, pendingCount, reload, readWorkoutRecovery]);
  async function accept() {
    if (!workout || !server || accepting.current) return;
    accepting.current = true;
    setBusy(true);
    setError("");
    try {
      await recoverWorkout({
        id: workout.id,
        localRevision: workout.revision,
        serverRevision: server.workout.revision,
      });
      setDone(true);
      setServer(null);
      setReload((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось разобрать расхождение.");
    } finally {
      accepting.current = false;
      setBusy(false);
    }
  }
  function download(backup: WorkoutConflictBackup) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `miron-workout-journal-${backup.createdAt.slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className={styles.editor}>
      <PageHeading
        title="Разобрать синхронизацию"
        description="Записи с разных устройств могут расходиться. Ничего не перезаписываем без твоего выбора."
      />
      <Link href="/workout" className="text-link">
        К тренировке
      </Link>
      {error ? <p role="alert">{error}</p> : null}
      {done ? (
        <p role="status">
          Открыта серверная версия. Локальные действия сохранены отдельной копией на этом
          устройстве.
        </p>
      ) : null}
      {!pendingCount ? (
        <p>В очереди нет неподтверждённых действий.</p>
      ) : workout && server && server.workout.id === workout.id ? (
        <div className="card">
          <h2>{workout.title}</h2>
          <div className={styles.comparison}>
            <div>
              <span>На устройстве</span>
              <strong>
                {workout.recordedSets.length} подходов · версия {workout.revision}
              </strong>
              <p>Неподтверждённых действий: {pendingCount}</p>
            </div>
            <div>
              <span>На сервере</span>
              <strong>
                {server.workout.recordedSets.length} подходов · версия {server.workout.revision}
              </strong>
              <p>{server.workout.status === "active" ? "Занятие идёт" : "Занятие закрыто"}</p>
            </div>
          </div>
          <p>
            При выборе серверной версии локальные действия уйдут в отдельную копию журнала. Они не
            добавятся к результатам автоматически и не начислят XP. Копию можно скачать ниже и
            использовать при ручной проверке записей.
          </p>
          <button
            type="button"
            className="button"
            disabled={busy || !isOnline}
            onClick={() => void accept()}
          >
            Сохранить копию и принять серверную версию
          </button>
        </div>
      ) : (
        <p role="status">
          {isOnline
            ? "Читаем серверный результат…"
            : "Для сравнения подключись к интернету. Локальный журнал остаётся на устройстве."}
        </p>
      )}
      <button
        type="button"
        className="button secondary"
        disabled={busy || !isOnline}
        onClick={() => {
          setServer(null);
          setReload((value) => value + 1);
        }}
      >
        Обновить сравнение
      </button>
      <h2>Копии неподтверждённых действий</h2>
      <p>
        Хранятся только в этом браузере и показываются исходному аккаунту. Выход из аккаунта их не
        удаляет.
      </p>
      {backups.length ? (
        backups.map((backup) => (
          <article className="card" key={backup.id}>
            <h3>{backup.localWorkout.title}</h3>
            <p>
              {new Date(backup.createdAt).toLocaleString("ru-RU")} · {backup.commands.length}{" "}
              действий
            </p>
            <button type="button" className="button secondary" onClick={() => download(backup)}>
              Скачать копию журнала
            </button>
          </article>
        ))
      ) : (
        <p>Копий пока нет.</p>
      )}
    </section>
  );
}
