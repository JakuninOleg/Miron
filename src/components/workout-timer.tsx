"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Timer } from "lucide-react";
import { createTimer, transitionTimer, type TimerAction } from "@/client/timer-state";

export function WorkoutTimer({ seconds, kind }: { seconds: number; kind: "work" | "rest" }) {
  const [state, setState] = useState(() => createTimer(seconds));
  const [hidden, setHidden] = useState(false);
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const signalledRun = useRef(0);
  const title = kind === "rest" ? "Отдых" : "Время упражнения";
  const doneText =
    kind === "rest"
      ? "Отдых окончен. Продолжай, когда будешь готов."
      : "Таймер окончен. Подтверди фактически выполненное время отдельно.";
  const remaining = Math.ceil(state.remainingMs / 1000);
  const time = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;

  function primeAudio() {
    if (typeof window.AudioContext !== "function") return;
    try {
      if (!audio.current || audio.current.state === "closed") audio.current = new AudioContext();
      void audio.current.resume().catch(() => undefined);
    } catch {
      /* Audio is optional on unsupported or restricted devices. */
    }
  }

  function act(action: TimerAction) {
    if (action === "start" && sound) primeAudio();
    setState((current) => transitionTimer(current, action, Date.now(), seconds));
  }

  useEffect(() => {
    if (state.phase !== "running") return;
    const update = () =>
      setState((current) => transitionTimer(current, "tick", Date.now(), seconds));
    const interval = window.setInterval(update, 250);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
    };
  }, [state.phase, seconds]);

  useEffect(() => {
    if (state.phase !== "done" || signalledRun.current === state.runId) return;
    signalledRun.current = state.runId;
    const context = audio.current;
    if (!sound || !context || context.state !== "running") return;
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(660, context.currentTime);
      oscillator.frequency.setValueAtTime(880, context.currentTime + 0.12);
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(0.08, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.4);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start();
      oscillator.stop(context.currentTime + 0.42);
    } catch {
      /* The visual completion remains available without audio. */
    }
  }, [state.phase, state.runId, sound]);

  useEffect(
    () => () => {
      const context = audio.current;
      audio.current = null;
      if (context && context.state !== "closed") void context.close().catch(() => undefined);
    },
    [],
  );

  return (
    <section
      className="card workout-timer"
      data-phase={state.phase}
      aria-label={`Таймер: ${title}`}
      style={{ padding: 20 }}
    >
      <p role="status" aria-live="polite" style={{ color: "var(--muted)", margin: "0 0 12px" }}>
        {state.phase === "done" ? (
          <>
            <Check className="timer-completion-check" size={20} aria-hidden="true" /> {doneText}
          </>
        ) : state.phase === "paused" ? (
          "Таймер на паузе"
        ) : state.phase === "idle" ? (
          "Запусти таймер, когда захочешь"
        ) : (
          "Таймер идёт"
        )}
      </p>
      {hidden ? (
        <button className="button secondary" onClick={() => setHidden(false)} aria-expanded={false}>
          <Timer size={18} aria-hidden="true" /> {title} ·{" "}
          {state.phase === "done" ? "Готово ✓" : time} · Открыть
        </button>
      ) : (
        <>
          <div
            className="workout-timer-clock"
            role="timer"
            aria-live="off"
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
            }}
          >
            <strong>{title}</strong>
            <button
              className="button secondary"
              onClick={() => setHidden(true)}
              aria-expanded={true}
            >
              Свернуть
            </button>
          </div>
          <div
            aria-label={`Осталось ${remaining} секунд`}
            style={{
              fontSize: 48,
              fontVariantNumeric: "tabular-nums",
              fontWeight: 700,
              textAlign: "center",
              margin: "12px 0",
            }}
          >
            {time}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              className="button"
              onClick={() => act(state.phase === "running" ? "pause" : "start")}
            >
              {state.phase === "running"
                ? "Пауза"
                : state.phase === "paused"
                  ? "Продолжить"
                  : state.phase === "done"
                    ? "Ещё раз"
                    : "Запустить"}
            </button>
            <button className="button secondary" onClick={() => act("reset")}>
              Сбросить
            </button>
            <button className="button secondary" onClick={() => act("stop")}>
              Остановить
            </button>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
            <input
              type="checkbox"
              checked={sound}
              onChange={(event) => {
                const enabled = event.target.checked;
                if (enabled) primeAudio();
                setSound(enabled);
              }}
            />
            Звук по окончании
          </label>
          <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 0 }}>
            Сворачивание не останавливает отсчёт. В фоне звук может быть недоступен.
          </p>
        </>
      )}
    </section>
  );
}
