"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { builderRequest, BuilderRequestError } from "@/client/workout-builder-api";
import type { BuilderBootstrap, SaveCustomWorkout } from "@/shared/workout-builder";
import type { SavedWorkoutPreview } from "@/shared/workout-sources";
import styles from "./workout-builder.module.css";

export function SaveHistoryTemplate({
  preview,
  ownerId,
  initialOpen = false,
}: {
  preview: SavedWorkoutPreview;
  ownerId: string;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [name, setName] = useState(preview.day.title.slice(0, 80));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{ owner: string; name: string } | null>(null);
  const owner = useRef(ownerId);
  useLayoutEffect(() => {
    owner.current = ownerId;
  }, [ownerId]);
  const attempt = useRef<{ signature: string; input: SaveCustomWorkout } | null>(null);

  async function save() {
    const principal = ownerId;
    setBusy(true);
    setError("");
    try {
      const signature = JSON.stringify([principal, preview.id, preview.revision, name.trim()]);
      if (attempt.current?.signature !== signature) {
        const bootstrap = await builderRequest<BuilderBootstrap>("", undefined, principal);
        const inventory = bootstrap.inventories.find((item) => item.place === preview.place);
        if (!inventory)
          throw new Error("Сначала подтверди инвентарь для этого места в конструкторе.");
        if (owner.current !== principal) return;
        attempt.current = {
          signature,
          input: {
            operationId: crypto.randomUUID(),
            id: crypto.randomUUID(),
            expectedRevision: 0,
            name: name.trim(),
            place: preview.place,
            direction: preview.direction,
            inventoryRevision: inventory.revision,
            steps: preview.day.steps.map((step) => ({
              revisionId: step.revisionId,
              sets: step.sets,
              target: step.target,
              restSeconds: step.restSeconds,
              phase: step.phase,
              ...(step.pairKey
                ? { pairKey: step.pairKey, transitionSeconds: step.transitionSeconds }
                : {}),
              ...(step.dropSet ? { dropSet: step.dropSet } : {}),
            })),
          },
        };
      }
      await builderRequest(
        "/templates",
        {
          method: "POST",
          body: JSON.stringify(attempt.current.input),
        },
        principal,
      );
      if (owner.current === principal) setReceipt({ owner: principal, name: name.trim() });
    } catch (cause) {
      if (cause instanceof BuilderRequestError && cause.code === "INVENTORY_CONFLICT")
        attempt.current = null;
      if (owner.current === principal)
        setError(cause instanceof Error ? cause.message : "Не удалось сохранить шаблон.");
    } finally {
      setBusy(false);
    }
  }

  if (receipt?.owner === ownerId)
    return (
      <div className={styles.saveFromHistory} role="status">
        <p>«{receipt.name}» теперь в твоей библиотеке.</p>
        <Link className={styles.secondary} href="/workout-builder">
          Открыть библиотеку
        </Link>
      </div>
    );
  if (!open)
    return (
      <button className={styles.secondary} type="button" onClick={() => setOpen(true)}>
        Сохранить как шаблон
      </button>
    );
  return (
    <form
      className={styles.saveFromHistory}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2>Оставим эту тренировку в библиотеке?</h2>
      <p className={styles.muted}>
        Сохраним состав и подходы плана. Результаты и рабочие веса останутся в истории занятия.
      </p>
      <label>
        Название тренировки
        <input
          value={name}
          maxLength={80}
          minLength={1}
          required
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {error ? (
        <p role="alert">
          {error} <Link href="/workout-builder">Открыть конструктор</Link>
        </p>
      ) : null}
      <button className={styles.secondary} type="submit" disabled={busy || !name.trim()}>
        {busy ? "Сохраняем…" : "Сохранить в библиотеку"}
      </button>
    </form>
  );
}
