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
import { AssistantHistoryToolbar, AssistantMessageMenu } from "./assistant-history-controls";

export function ChatScreen({ compact = false }: { compact?: boolean }) {
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
    assistantHasMore,
    assistantHistoryBusy,
    assistantEditing,
    assistantHistoryRevision,
    assistantError,
    pendingAssistantText,
    confirmedAssistantActions,
    sendMessage,
    retryAssistant,
    refreshAssistant,
    loadOlderAssistant,
    editAssistantHistory,
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
  const historyRef = useRef<HTMLDivElement>(null);
  const lastMessageId = messages.at(-1)?.id;
  const chatBlocked =
    !isDemo &&
    (!isOnline ||
      assistantEnabled !== true ||
      assistantLoading ||
      assistantEditing ||
      Boolean(pendingAssistantText));
  const voice = useVoiceInput({
    companion: profile?.companion ?? "max",
    preview: isDemo,
    draft: text,
    onDraftChange: setText,
  });
  useEffect(() => {
    if (compact && historyRef.current)
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    else endRef.current?.scrollIntoView({ behavior: "instant", block: "nearest" });
  }, [lastMessageId, isSending, compact]);
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
      {!compact ? (
        <PageHeading
          title="Напарник рядом"
          description="Можно начать с простого вопроса."
          action={<CompanionSwitch companion={profile.companion} onChange={switchCompanion} />}
        />
      ) : null}
      <div className={compact ? chatStyles.compact : "chat-layout"}>
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
                {isDemo ? "Демонстрация" : "ИИ · beta"} ·{" "}
                {compact ? "Во время занятия" : "Поддержка в твоём темпе"}
              </p>
            </div>
          </header>
          {compact && currentExercise ? (
            <p className={chatStyles.note}>
              Сейчас: {currentExercise.name}. Чат не отмечает подходы и не меняет план без твоего
              подтверждения.
            </p>
          ) : null}
          {!isDemo ? (
            <AssistantHistoryToolbar
              key={profile.companion}
              companion={profile.companion}
              revision={assistantHistoryRevision ?? 0}
              hasMessages={Boolean(messages.length || pendingAssistantText)}
              disabled={
                !isOnline ||
                isSending ||
                assistantLoading ||
                assistantEditing ||
                assistantHistoryBusy ||
                voice.busy
              }
              onEdit={editAssistantHistory}
            />
          ) : null}
          {!compact && currentExercise ? (
            <Link href="/workout" className={chatStyles.contextLink}>
              Вернуться к занятию · {currentExercise.name}
            </Link>
          ) : null}
          <div
            ref={historyRef}
            className="chat-messages"
            role="log"
            tabIndex={0}
            aria-label="Разговор с напарником"
            aria-live="polite"
          >
            {!isDemo && assistantHasMore ? (
              <button
                type="button"
                className={chatStyles.actionButton}
                disabled={!isOnline || assistantHistoryBusy || assistantEditing}
                onClick={async () => {
                  const previousHeight = historyRef.current?.scrollHeight ?? 0;
                  const previousTop = historyRef.current?.scrollTop ?? 0;
                  try {
                    await loadOlderAssistant();
                    requestAnimationFrame(() => {
                      if (historyRef.current)
                        historyRef.current.scrollTop =
                          previousTop + historyRef.current.scrollHeight - previousHeight;
                    });
                  } catch (cause) {
                    setError(
                      cause instanceof Error ? cause.message : "Не удалось загрузить историю.",
                    );
                  }
                }}
              >
                {assistantHistoryBusy ? "Загружаем…" : "Ранние сообщения"}
              </button>
            ) : null}
            {!messages.length ? (
              <div className="message">
                <p className="chat-bubble">
                  {!isDemo
                    ? "Чат пуст. Напиши напарнику, чтобы начать разговор."
                    : profile.companion === "max"
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
                  {message.replyState ? (
                    <small role="status">
                      {message.replyState === "pending"
                        ? "Ответ готовится…"
                        : "Ответ не получен. Можно отправить вопрос ещё раз."}
                    </small>
                  ) : null}
                  <AssistantChatActions
                    actions={message.actions}
                    confirmedIds={confirmedAssistantActions}
                    online={isOnline}
                    onConfirm={confirmAssistantAction}
                  />
                  {!isDemo ? (
                    <AssistantMessageMenu
                      message={message}
                      companion={profile.companion}
                      revision={assistantHistoryRevision ?? 0}
                      disabled={
                        !isOnline ||
                        isSending ||
                        assistantLoading ||
                        assistantEditing ||
                        assistantHistoryBusy ||
                        voice.busy
                      }
                      onEdit={editAssistantHistory}
                    />
                  ) : null}
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
              onClick={() =>
                void send(
                  compact && currentExercise
                    ? `Подскажи, как выполнять «${currentExercise.name}» и на что обратить внимание?`
                    : "Как подготовиться к первой тренировке?",
                )
              }
            >
              {compact ? "Подскажи технику" : "Как начать?"}
            </button>
            <button
              className="quick-prompt"
              disabled={isSending || voice.busy || chatBlocked}
              onClick={() =>
                void send(
                  compact
                    ? "Поддержи меня во время тренировки — без давления и требований рекорда."
                    : "Сегодня мало времени. Что можно сделать?",
                )
              }
            >
              {compact ? "Поддержи меня" : "Есть 15 минут"}
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
        {!compact ? (
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
              Напарник не заменяет врача. Если есть боль или недомогание, останови занятие и
              обратись за медицинской помощью.
            </p>
          </aside>
        ) : null}
      </div>
    </>
  );
}
