"use client";
import Image from "next/image";
import Link from "next/link";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useMiron } from "@/client/use-miron";
import { useVoiceInput } from "@/client/use-voice-input";
import { PageHeading } from "./app-shell";
import { CompanionStage, CompanionSwitch, companionNames } from "./companion";
import { VoiceInputControl, VoiceInputFeedback } from "./voice-input-control";
import { AssistantChatStatus } from "./assistant-chat-status";
import { AssistantChatActions } from "./assistant-chat-actions";
import chatStyles from "./assistant-chat.module.css";

export function ChatScreen() {
  const {
    profile,
    progress,
    workout,
    messages,
    isSending,
    isReady,
    isDemo,
    isOnline,
    assistantEnabled,
    assistantLoading,
    assistantError,
    pendingAssistantText,
    confirmedAssistantActions,
    sendMessage,
    retryAssistant,
    refreshAssistant,
    confirmAssistantAction,
    switchCompanion,
  } = useMiron();
  const [text, setText] = useState(() => {
    if (typeof window === "undefined") return "";
    const exerciseId = new URLSearchParams(window.location.search).get("exercise");
    const exercise = workout?.exercises.find((item) => item.id === exerciseId);
    return exercise ? `Подскажи, как выполнять «${exercise.name}» и на что обратить внимание?` : "";
  });
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const chatBlocked =
    !isDemo &&
    (!isOnline || assistantEnabled !== true || assistantLoading || Boolean(pendingAssistantText));
  const voice = useVoiceInput({
    companion: profile?.companion ?? "max",
    preview: isDemo,
    draft: text,
    onDraftChange: setText,
  });
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "instant", block: "nearest" });
  }, [messages.length, isSending]);
  async function send(value = text) {
    if (!value.trim() || isSending || voice.busy || chatBlocked) return;
    setError("");
    try {
      await sendMessage(value.trim());
      setText("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Сообщение не отправлено. Попробуй ещё раз.",
      );
    }
  }
  if (!isReady || !profile) return <div className="loading-state">Напарник скоро будет рядом…</div>;
  const companion = companionNames[profile.companion];
  const currentExercise =
    workout && ["ready", "active"].includes(workout.status)
      ? workout.exercises[workout.currentIndex]
      : undefined;
  return (
    <>
      <PageHeading
        title="Напарник рядом"
        description="Можно начать с простого вопроса."
        action={<CompanionSwitch companion={profile.companion} onChange={switchCompanion} />}
      />
      <div className="chat-layout">
        <section className="card chat-panel">
          <header className="chat-panel-header">
            <Image
              unoptimized
              width={768}
              height={1152}
              className="mini-avatar"
              src={`/characters/${profile.companion}-avatar.webp`}
              alt=""
            />
            <div>
              <h3>{companion}</h3>
              <p>
                <span className="status-dot" />
                {isDemo ? "Демонстрация" : "ИИ · beta"} · Поддержка в твоём темпе
              </p>
            </div>
          </header>
          {currentExercise ? (
            <Link href="/workout" className={chatStyles.contextLink}>
              Вернуться к занятию · {currentExercise.name}
            </Link>
          ) : null}
          <div
            className="chat-messages"
            role="log"
            aria-label="Разговор с напарником"
            aria-live="polite"
          >
            {!messages.length ? (
              <div className="message">
                <p className="chat-bubble">
                  {profile.companion === "max"
                    ? "Я рядом. Что сегодня поможет начать: разобрать план или просто собраться на тренировку?"
                    : "Привет! Давай найдём комфортный первый шаг. Как ты сейчас настроен?"}
                </p>
              </div>
            ) : null}
            {messages.map((message) => (
              <div className={`message ${message.role}`} key={message.id}>
                {message.role === "assistant" ? (
                  <>
                    <Image
                      unoptimized
                      width={768}
                      height={1152}
                      className="mini-avatar"
                      src={`/characters/${message.companion ?? profile.companion}-avatar.webp`}
                      alt=""
                    />
                  </>
                ) : null}
                <div>
                  <p className="chat-bubble" style={{ whiteSpace: "pre-wrap" }}>
                    {message.text}
                  </p>
                  <AssistantChatActions
                    actions={message.actions}
                    confirmedIds={confirmedAssistantActions}
                    online={isOnline}
                    onConfirm={confirmAssistantAction}
                  />
                  <p className="message-meta">
                    {message.role === "assistant"
                      ? companionNames[message.companion ?? profile.companion]
                      : "Ты"}{" "}
                    ·{" "}
                    {new Intl.DateTimeFormat("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(message.createdAt))}
                  </p>
                </div>
              </div>
            ))}
            {isSending ? <p className="typing-indicator">{companion} готовит ответ…</p> : null}
            <div ref={endRef} />
          </div>
          <div className="quick-prompts">
            <button
              className="quick-prompt"
              disabled={isSending || voice.busy || chatBlocked}
              onClick={() => void send("Как подготовиться к первой тренировке?")}
            >
              Как начать?
            </button>
            <button
              className="quick-prompt"
              disabled={isSending || voice.busy || chatBlocked}
              onClick={() => void send("Сегодня мало времени. Что можно сделать?")}
            >
              Есть 15 минут
            </button>
            <button
              className="quick-prompt"
              disabled={isSending || voice.busy || chatBlocked}
              onClick={() => void send("Как правильно отдыхать между подходами?")}
            >
              Про отдых
            </button>
          </div>
          <AssistantChatStatus
            enabled={assistantEnabled}
            loading={assistantLoading}
            online={isOnline}
            sending={isSending}
            pendingText={pendingAssistantText}
            error={error || assistantError}
            demo={isDemo}
            onRefresh={refreshAssistant}
            onRetry={async () => {
              setError("");
              await retryAssistant();
              if (text.trim() === pendingAssistantText) setText("");
            }}
          />
          <form
            className="chat-input-bar"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <label className="sr-only" htmlFor="chat-message">
              Сообщение напарнику
            </label>
            <textarea
              className="input"
              id="chat-message"
              rows={1}
              placeholder="Напиши напарнику…"
              value={text}
              disabled={voice.busy || isSending}
              maxLength={2000}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <VoiceInputControl
              voice={voice}
              disabled={isSending}
              buttonClassName="icon-button"
              offlineId="chat-voice-offline"
            />
            <button
              className="icon-button send-button"
              aria-label="Отправить сообщение"
              disabled={!text.trim() || isSending || voice.busy || chatBlocked}
            >
              <Send size={18} />
            </button>
          </form>
          <VoiceInputFeedback voice={voice} className="field-help" offlineId="chat-voice-offline" />
        </section>
        <aside className="chat-info">
          <CompanionStage companion={profile.companion} progress={progress} />
          <section className="card">
            <h3>О чём можно поговорить</h3>
            <div className="chat-info-list" style={{ marginTop: 18 }}>
              <div>
                <strong className="small">Твой план</strong>
                <p>Разобраться с порядком упражнений и временем.</p>
              </div>
              <div>
                <strong className="small">Настрой на занятие</strong>
                <p>Найти небольшой шаг, если трудно начать.</p>
              </div>
              <div>
                <strong className="small">Отдых</strong>
                <p>Напомнить, что восстановление — часть процесса.</p>
              </div>
            </div>
          </section>
          <p className="chat-disclaimer">
            Напарник не заменяет врача. Если есть боль или недомогание, останови занятие и обратись
            за медицинской помощью.
          </p>
        </aside>
      </div>
    </>
  );
}
