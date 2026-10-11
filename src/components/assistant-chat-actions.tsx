"use client";

import Link from "next/link";
import { useState } from "react";
import type { AssistantAction, AssistantEnergyAction } from "@/shared/assistant";
import styles from "./assistant-chat.module.css";

export function AssistantChatActions({
  actions,
  confirmedIds,
  online,
  onConfirm,
}: {
  actions?: AssistantAction[];
  confirmedIds: string[];
  online: boolean;
  onConfirm: (action: AssistantEnergyAction) => Promise<void>;
}) {
  if (!actions?.length) return null;
  return (
    <div className={styles.actions}>
      {actions.map((action) =>
        action.type === "planner" ? (
          action.href.startsWith("/workout-builder") && !action.href.startsWith("//") ? (
            <Link key={action.id} href={action.href} className={styles.actionButton}>
              {action.title}
            </Link>
          ) : null
        ) : (
          <EnergyProposal
            key={action.id}
            action={action}
            confirmed={action.confirmed === true || confirmedIds.includes(action.id)}
            online={online}
            onConfirm={onConfirm}
          />
        ),
      )}
    </div>
  );
}

function EnergyProposal({
  action,
  confirmed,
  online,
  onConfirm,
}: {
  action: AssistantEnergyAction;
  confirmed: boolean;
  online: boolean;
  onConfirm: (action: AssistantEnergyAction) => Promise<void>;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (confirmed)
    return (
      <p className={styles.note} role="status">
        Пересчёт подтверждён. Примерный расход обновлён.
      </p>
    );
  return (
    <section className={styles.proposal} aria-label="Предложение пересчитать расход">
      <h4>{action.title}</h4>
      <p>{action.summary}</p>
      {reviewing ? (
        <>
          {action.input.bodyWeightKg !== undefined ? (
            <p>Указанная масса: {action.input.bodyWeightKg} кг.</p>
          ) : null}
          {action.estimate ? (
            <p>Новая примерная оценка: около {Math.round(action.estimate.estimatedKcal)} ккал.</p>
          ) : null}
          <p>Подтверди уточнения для примерного расхода. Журнал подходов и XP сохранятся.</p>
          <div className={styles.confirmationControls}>
            <button
              type="button"
              className={styles.actionButton}
              disabled={busy || !online}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await onConfirm(action);
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Не удалось подтвердить. Повтори с теми же уточнениями.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Подтверждаем…" : "Подтвердить пересчёт"}
            </button>
            <button
              type="button"
              className={styles.actionButton}
              disabled={busy}
              onClick={() => {
                setReviewing(false);
                setError("");
              }}
            >
              Отмена
            </button>
          </div>
        </>
      ) : (
        <button type="button" className={styles.actionButton} onClick={() => setReviewing(true)}>
          Проверить пересчёт
        </button>
      )}
      {error ? <p role="alert">{error}</p> : null}
      {!online ? <p>Для подтверждения нужен интернет.</p> : null}
    </section>
  );
}
