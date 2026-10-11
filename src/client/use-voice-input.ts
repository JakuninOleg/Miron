"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CompanionId } from "@/shared/contracts";
import {
  VOICE_MAX_AUDIO_BYTES,
  VOICE_MAX_SECONDS,
  VOICE_MAX_TEXT_LENGTH,
  type VoiceTranscript,
} from "@/shared/voice";
import { useOnlineStatus } from "./use-online-status";

type VoicePhase = "idle" | "requesting" | "recording" | "processing";
interface VoiceInputOptions {
  companion: CompanionId;
  preview: boolean;
  draft: string;
  onDraftChange: (text: string) => void;
}
interface RecordingOperation {
  id: string;
  companion: CompanionId;
  preview: boolean;
  draft: string;
  controller: AbortController;
  recorder: MediaRecorder | null;
  stream: MediaStream | null;
  chunks: Blob[];
  bytes: number;
  startedAt: number;
  recordingMs: number;
  stopRequested: boolean;
  timer: ReturnType<typeof setInterval> | null;
  timeout: ReturnType<typeof setTimeout> | null;
  removeTrackListeners: () => void;
}

const MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"];
const subscribe = () => () => undefined;
const canRecord = () =>
  typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

function clearOperationTimers(operation: RecordingOperation) {
  if (operation.timer) clearInterval(operation.timer);
  if (operation.timeout) clearTimeout(operation.timeout);
  operation.timer = null;
  operation.timeout = null;
}

function releaseMicrophone(operation: RecordingOperation) {
  operation.removeTrackListeners();
  operation.removeTrackListeners = () => undefined;
  operation.stream?.getTracks().forEach((track) => track.stop());
  operation.stream = null;
}

function discardOperation(operation: RecordingOperation) {
  clearOperationTimers(operation);
  operation.controller.abort();
  const recorder = operation.recorder;
  if (recorder) {
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
    recorder.onpause = null;
    if (recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // A recorder that has already failed still needs its stream released.
      }
    }
  }
  releaseMicrophone(operation);
  operation.chunks = [];
}

function isTranscript(value: unknown): value is VoiceTranscript {
  if (typeof value !== "object" || value === null) return false;
  const transcript = value as Record<string, unknown>;
  return (
    typeof transcript.operationId === "string" &&
    typeof transcript.text === "string" &&
    transcript.text.length <= VOICE_MAX_TEXT_LENGTH &&
    (transcript.provider === "groq" || transcript.provider === "local") &&
    typeof transcript.model === "string" &&
    typeof transcript.durationMs === "number" &&
    Number.isFinite(transcript.durationMs) &&
    transcript.durationMs >= 0
  );
}

async function responseError(response: Response): Promise<Error> {
  const body: unknown = await response.json().catch(() => null);
  if (typeof body === "object" && body !== null) {
    const error = (body as Record<string, unknown>).error;
    if (typeof error === "object" && error !== null) {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === "string") return new Error(message.slice(0, 500));
    }
  }
  return new Error("Сервис распознавания сейчас недоступен. Попробуй снова или введи текст.");
}

function microphoneError(cause: unknown) {
  if (cause instanceof DOMException && cause.name === "NotAllowedError")
    return "Разреши доступ к микрофону в настройках браузера.";
  if (cause instanceof DOMException && cause.name === "NotFoundError")
    return "Микрофон не найден. Подключи его или введи текст.";
  return "Микрофон сейчас недоступен. Попробуй снова или введи текст.";
}

export function useVoiceInput(options: VoiceInputOptions) {
  const online = useOnlineStatus();
  const supported = useSyncExternalStore(subscribe, canRecord, () => false);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const active = useRef<RecordingOperation | null>(null);
  const latest = useRef(options);

  useEffect(() => {
    latest.current = options;
  }, [options]);

  const cancel = useCallback(() => {
    const operation = active.current;
    active.current = null;
    if (operation) discardOperation(operation);
    setPhase("idle");
    setElapsedMs(0);
    setError(null);
    setNotice(null);
    setPendingText(null);
  }, []);

  const fail = useCallback((operation: RecordingOperation, message: string) => {
    if (active.current !== operation) return;
    active.current = null;
    discardOperation(operation);
    setPhase("idle");
    setError(message);
  }, []);

  const appendText = useCallback((transcript: string, expectedDraft?: string) => {
    const current = latest.current;
    const combined = current.draft ? `${current.draft} ${transcript}` : transcript;
    if (expectedDraft !== undefined && current.draft !== expectedDraft) {
      setPendingText(transcript);
      setNotice("Черновик изменился. Расшифровка сохранена ниже — добавь её, когда будешь готов.");
    } else if (combined.length > VOICE_MAX_TEXT_LENGTH) {
      setPendingText(transcript);
      setNotice(
        "В сообщении можно написать до 2000 символов. Сократи черновик или скопируй нужную часть расшифровки ниже.",
      );
    } else {
      current.onDraftChange(combined);
      setPendingText(null);
      setNotice("Текст добавлен в черновик. Проверь его перед отправкой.");
    }
  }, []);

  const transcribe = useCallback(
    async (operation: RecordingOperation) => {
      if (active.current !== operation || !navigator.onLine) return;
      clearOperationTimers(operation);
      releaseMicrophone(operation);
      const mimeType = operation.recorder?.mimeType || operation.chunks[0]?.type;
      const audio = new Blob(operation.chunks, { type: mimeType });
      operation.chunks = [];
      if (!audio.size || audio.size > VOICE_MAX_AUDIO_BYTES) {
        fail(
          operation,
          audio.size
            ? "Запись превышает 5 МБ. Попробуй записать короче."
            : "В записи нет аудио. Попробуй снова или введи текст.",
        );
        return;
      }
      setPhase("processing");
      operation.timeout = setTimeout(() => {
        fail(operation, "Распознавание заняло слишком долго. Попробуй снова или введи текст.");
      }, 100_000);
      try {
        const session = await fetch("/api/voice/session", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preview: operation.preview }),
          signal: operation.controller.signal,
        });
        if (!session.ok) throw await responseError(session);
        if (active.current !== operation || !navigator.onLine) return;
        const extension = mimeType?.includes("mp4")
          ? "mp4"
          : mimeType?.includes("ogg")
            ? "ogg"
            : mimeType?.includes("webm")
              ? "webm"
              : "bin";
        const form = new FormData();
        form.append("audio", audio, `voice.${extension}`);
        form.append("operationId", operation.id);
        form.append("companion", operation.companion);
        form.append("recordingMs", String(operation.recordingMs));
        const response = await fetch("/api/voice/transcribe", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          body: form,
          signal: operation.controller.signal,
        });
        if (!response.ok) throw await responseError(response);
        const transcript: unknown = await response.json();
        if (active.current !== operation || !navigator.onLine) return;
        if (!isTranscript(transcript) || transcript.operationId !== operation.id)
          throw new Error(
            "Сервис вернул некорректную расшифровку. Попробуй снова или введи текст.",
          );
        if (!transcript.text.trim())
          throw new Error("Речь не распознана. Попробуй снова или введи текст.");
        active.current = null;
        clearOperationTimers(operation);
        setPhase("idle");
        appendText(transcript.text.trim(), operation.draft);
      } catch (cause) {
        fail(
          operation,
          cause instanceof Error && cause.name !== "TypeError"
            ? cause.message
            : "Не удалось связаться с сервисом распознавания. Проверь интернет и попробуй снова.",
        );
      }
    },
    [appendText, fail],
  );

  const stop = useCallback(() => {
    const operation = active.current;
    if (!operation?.recorder || operation.stopRequested) return;
    operation.stopRequested = true;
    operation.recordingMs = Math.max(1, Date.now() - operation.startedAt);
    setElapsedMs(operation.recordingMs);
    setPhase("processing");
    clearOperationTimers(operation);
    // onstop follows the final dataavailable event; upload only that complete Blob.
    operation.timeout = setTimeout(
      () => fail(operation, "Не удалось завершить запись. Попробуй снова или введи текст."),
      5000,
    );
    try {
      operation.recorder.stop();
      releaseMicrophone(operation);
    } catch {
      fail(operation, "Не удалось завершить запись. Попробуй снова или введи текст.");
    }
  }, [fail]);

  const start = useCallback(async () => {
    if (active.current) return;
    if (!navigator.onLine) {
      cancel();
      return;
    }
    if (!canRecord()) {
      setError("Голосовой ввод в этом браузере недоступен. Можно написать сообщение.");
      return;
    }
    const current = latest.current;
    const operation: RecordingOperation = {
      id: crypto.randomUUID(),
      companion: current.companion,
      preview: current.preview,
      draft: current.draft,
      controller: new AbortController(),
      recorder: null,
      stream: null,
      chunks: [],
      bytes: 0,
      startedAt: 0,
      recordingMs: 0,
      stopRequested: false,
      timer: null,
      timeout: null,
      removeTrackListeners: () => undefined,
    };
    active.current = operation;
    setError(null);
    setNotice(null);
    setElapsedMs(0);
    setPhase("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (active.current !== operation || !navigator.onLine) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      operation.stream = stream;
      const interrupted = () =>
        fail(operation, "Запись прервана. Аудио удалено — попробуй снова или введи текст.");
      const tracks = stream.getAudioTracks();
      tracks.forEach((track) => {
        track.addEventListener("ended", interrupted);
        track.addEventListener("mute", interrupted);
      });
      operation.removeTrackListeners = () =>
        tracks.forEach((track) => {
          track.removeEventListener("ended", interrupted);
          track.removeEventListener("mute", interrupted);
        });
      let preferred: string | undefined;
      for (const candidate of MIME_TYPES) {
        try {
          if (MediaRecorder.isTypeSupported(candidate) && !preferred) preferred = candidate;
        } catch {
          // Capability probing itself can be missing; browser default remains available.
        }
      }
      function begin(mimeType?: string) {
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
        operation.recorder = recorder;
        recorder.ondataavailable = (event) => {
          if (active.current !== operation || operation.recorder !== recorder || !event.data.size)
            return;
          operation.bytes += event.data.size;
          if (operation.bytes > VOICE_MAX_AUDIO_BYTES) {
            fail(operation, "Запись превышает 5 МБ. Попробуй записать короче.");
            return;
          }
          operation.chunks.push(event.data);
        };
        recorder.onstop = () => {
          if (active.current !== operation || operation.recorder !== recorder) return;
          if (!operation.stopRequested) {
            interrupted();
            return;
          }
          void transcribe(operation);
        };
        recorder.onerror = interrupted;
        recorder.onpause = interrupted;
        operation.startedAt = Date.now();
        recorder.start(1000);
      }
      try {
        begin(preferred);
      } catch (cause) {
        if (!preferred) throw cause;
        const failedRecorder = operation.recorder;
        if (failedRecorder) {
          failedRecorder.ondataavailable = null;
          failedRecorder.onstop = null;
          failedRecorder.onerror = null;
          failedRecorder.onpause = null;
          if (failedRecorder.state !== "inactive") {
            try {
              failedRecorder.stop();
            } catch {
              /* Retry with the same stream and browser default. */
            }
          }
        }
        operation.chunks = [];
        operation.bytes = 0;
        begin();
      }
      if (active.current !== operation) return;
      setPhase("recording");
      operation.timer = setInterval(() => {
        if (active.current !== operation) return;
        const duration = Date.now() - operation.startedAt;
        setElapsedMs(duration);
        if (duration >= VOICE_MAX_SECONDS * 1000) stop();
      }, 250);
    } catch (cause) {
      fail(operation, microphoneError(cause));
    }
  }, [cancel, fail, stop, transcribe]);

  useEffect(() => {
    const offline = () => cancel();
    const hidden = () => {
      if (document.visibilityState === "hidden") cancel();
    };
    window.addEventListener("offline", offline);
    window.addEventListener("pagehide", cancel);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("pagehide", cancel);
      document.removeEventListener("visibilitychange", hidden);
      const operation = active.current;
      active.current = null;
      if (operation) discardOperation(operation);
    };
  }, [cancel]);

  useEffect(() => () => cancel(), [options.companion, options.preview, cancel]);

  return {
    supported,
    online,
    phase,
    elapsedMs,
    error,
    notice,
    pendingText,
    busy: phase !== "idle",
    start,
    stop,
    cancel,
    addPendingText: () => {
      if (pendingText) appendText(pendingText);
    },
  };
}

export type VoiceInputState = ReturnType<typeof useVoiceInput>;
