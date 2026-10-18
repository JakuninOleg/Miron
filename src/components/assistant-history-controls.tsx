"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import type { AssistantChatMessage, AssistantHistoryAction } from "@/shared/assistant";
import type { CompanionId } from "@/shared/contracts";
import styles from "./assistant-history-controls.module.css";

export type EditChatHistory = (
  companion: CompanionId,
  action: AssistantHistoryAction,
  expectedRevision?: number,
) => Promise<void>;

function HistoryConfirmation({
  companion,
  action,
  revision,
  onEdit,
  onClose,
  triggerRef,
}: {
  companion: CompanionId;
  action: AssistantHistoryAction;
  revision: number;
  onEdit: EditChatHistory;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmedRevision] = useState(revision);
  const changed = revision !== confirmedRevision;
  useEffect(() => {
    const previous = document.activeElement;
    const trigger = triggerRef.current;
    const modal = dialog.current;
    modal?.showModal();
    cancel.current?.focus();
    return () => {
      modal?.close();
      const target = trigger ?? previous;
      if (
        target instanceof HTMLElement &&
        target !== document.body &&
        target.isConnected &&
        target.getClientRects().length &&
        !(target instanceof HTMLButtonElement && target.disabled)
      )
        target.focus();
      else document.querySelector<HTMLElement>('[role="log"]')?.focus();
    };
  }, [triggerRef]);
  const title =
    action.type === "clear"
      ? "Очистить чат?"
      : action.type === "delete_turn"
        ? "Удалить запрос и ответ?"
        : "Удалить сообщение?";
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={id}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id={id}>{title}</h2>
      <p id={`${id}-description`} className={styles.description}>
        {changed
          ? "Разговор изменился, пока это окно было открыто. Закрой его и проверь историю перед удалением."
          : action.type === "clear"
            ? `Вся переписка с ${companion === "max" ? "Максом" : "Ликой"} будет удалена, незавершённый ответ отменится. Сохранённые тренировки и прогресс останутся.`
            : action.type === "delete_turn"
              ? "Обе части исчезнут из истории после синхронизации устройств. Сохранённые тренировки останутся."
              : "Сообщение исчезнет из истории после синхронизации устройств. Эта пара запроса и ответа больше не будет использоваться как контекст ИИ."}
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.dialogActions}>
        <button ref={cancel} type="button" disabled={busy} onClick={onClose}>
          Отмена
        </button>
        <button
          type="button"
          className={styles.confirm}
          disabled={busy || changed}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onEdit(companion, action, confirmedRevision);
              onClose();
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Удаление не подтверждено. Попробуй ещё раз.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Удаляем…" : action.type === "clear" ? "Очистить чат" : "Удалить"}
        </button>
      </div>
    </dialog>
  );
}

export function AssistantHistoryToolbar({
  companion,
  hasMessages,
  disabled,
  onEdit,
  revision,
}: {
  companion: CompanionId;
  hasMessages: boolean;
  disabled: boolean;
  onEdit: EditChatHistory;
  revision: number;
}) {
  const [confirm, setConfirm] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div className={styles.toolbar}>
      <p>История сохраняется в аккаунте</p>
      <button
        ref={trigger}
        type="button"
        disabled={disabled || !hasMessages}
        onClick={() => setConfirm(true)}
      >
        <Trash2 size={16} aria-hidden="true" />
        Очистить чат
      </button>
      {confirm ? (
        <HistoryConfirmation
          companion={companion}
          action={{ type: "clear" }}
          revision={revision}
          onEdit={onEdit}
          onClose={() => setConfirm(false)}
          triggerRef={trigger}
        />
      ) : null}
    </div>
  );
}

export function AssistantMessageMenu({
  message,
  companion,
  disabled,
  onEdit,
  revision,
}: {
  message: AssistantChatMessage;
  companion: CompanionId;
  disabled: boolean;
  onEdit: EditChatHistory;
  revision: number;
}) {
  const [action, setAction] = useState<AssistantHistoryAction | null>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  if (!message.operationId) return null;
  const turnId = message.operationId;
  return (
    <div className={styles.messageControls}>
      <details ref={menu} className={styles.messageMenu}>
        <summary
          ref={trigger}
          aria-label={message.role === "user" ? "Действия с запросом" : "Действия с ответом"}
        >
          <MoreHorizontal size={20} aria-hidden="true" />
        </summary>
        <div className={styles.menuItems}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              menu.current?.removeAttribute("open");
              setAction({ type: "delete_message", turnId, role: message.role });
            }}
          >
            Удалить сообщение
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              menu.current?.removeAttribute("open");
              setAction({ type: "delete_turn", turnId });
            }}
          >
            Удалить запрос и ответ
          </button>
        </div>
      </details>
      {action ? (
        <HistoryConfirmation
          companion={companion}
          action={action}
          revision={revision}
          onEdit={onEdit}
          onClose={() => setAction(null)}
          triggerRef={trigger}
        />
      ) : null}
    </div>
  );
}
