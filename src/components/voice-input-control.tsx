"use client";

import { LoaderCircle, Mic, Square, X } from "lucide-react";
import type { VoiceInputState } from "@/client/use-voice-input";
import { VOICE_MAX_SECONDS, VOICE_OFFLINE_NOTICE } from "@/shared/voice";
import styles from "./voice-input-control.module.css";

export function VoiceInputControl({
  voice,
  disabled = false,
  buttonClassName,
  offlineId,
}: {
  voice: VoiceInputState;
  disabled?: boolean;
  buttonClassName: string;
  offlineId: string;
}) {
  const recording = voice.phase === "recording";
  const waiting = voice.phase === "requesting" || voice.phase === "processing";
  const seconds = Math.min(VOICE_MAX_SECONDS, Math.floor(voice.elapsedMs / 1000));
  return (
    <div className={styles.controls}>
      <button
        type="button"
        className={buttonClassName}
        aria-label={
          recording
            ? "Остановить голосовой ввод"
            : waiting
              ? "Распознавание голоса"
              : "Начать голосовой ввод"
        }
        aria-pressed={recording}
        aria-describedby={!voice.online ? offlineId : undefined}
        disabled={!voice.online || !voice.supported || waiting || (disabled && !recording)}
        onClick={() => (recording ? voice.stop() : void voice.start())}
      >
        {recording ? (
          <Square size={18} aria-hidden="true" />
        ) : waiting ? (
          <LoaderCircle size={18} aria-hidden="true" />
        ) : (
          <Mic size={22} aria-hidden="true" />
        )}
      </button>
      {voice.busy ? (
        <button
          type="button"
          className={buttonClassName}
          onClick={voice.cancel}
          aria-label="Отменить голосовой ввод"
        >
          <X size={18} aria-hidden="true" />
        </button>
      ) : null}
      {recording ? (
        <span className={styles.duration} aria-label="Длительность записи">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} / 1:00
        </span>
      ) : null}
    </div>
  );
}

export function VoiceInputFeedback({
  voice,
  className,
  offlineId,
}: {
  voice: VoiceInputState;
  className?: string;
  offlineId: string;
}) {
  const message = !voice.online
    ? VOICE_OFFLINE_NOTICE
    : (voice.error ??
      (voice.phase === "requesting"
        ? "Разреши доступ к микрофону. Запись начнётся после разрешения."
        : voice.phase === "recording"
          ? "Записываю… Нажми остановить, чтобы получить текст, или отменить, чтобы удалить аудио."
          : voice.phase === "processing"
            ? "Распознаю запись… Можно отменить."
            : (voice.notice ??
              (!voice.supported
                ? "Голосовой ввод в этом браузере недоступен. Можно написать сообщение."
                : "Диктовка до 60 секунд и 5 МБ. После записи проверь текст в черновике."))));
  return (
    <div className={styles.feedback}>
      <p
        id={!voice.online ? offlineId : undefined}
        className={className}
        role={voice.error ? "alert" : "status"}
      >
        {message}
      </p>
      {voice.pendingText ? (
        <details className={styles.transcript} open>
          <summary>Расшифровка для черновика</summary>
          <textarea
            aria-label="Сохранённая расшифровка"
            readOnly
            value={voice.pendingText}
            rows={3}
          />
          <button type="button" disabled={voice.busy} onClick={voice.addPendingText}>
            Добавить в черновик
          </button>
        </details>
      ) : null}
    </div>
  );
}
