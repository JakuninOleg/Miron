"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ClipboardList, CookingPot, Dumbbell, Send } from "lucide-react";
import type { CompanionId } from "@/shared/contracts";
import { useVoiceInput } from "@/client/use-voice-input";
import { DASHBOARD_INTENTS, type DashboardIntent } from "@/shared/dashboard-preview";
import styles from "./dashboard-preview.module.css";
import { VoiceInputControl, VoiceInputFeedback } from "./voice-input-control";
import type { AccountDashboardRuntime } from "./account-dashboard-runtime";
import { AssistantChatStatus } from "./assistant-chat-status";
import { AssistantChatActions } from "./assistant-chat-actions";

export function DashboardAvatar({ companion }: { companion: CompanionId }) {
  return (
    <span className={styles.coachAvatar} data-companion={companion}>
      <Image
        src={`/story-choose/${companion}-v1.webp`}
        alt=""
        width={1024}
        height={1536}
        sizes="180px"
        loading="eager"
      />
    </span>
  );
}

export function DashboardChat({
  companion,
  intent,
  text,
  onTextChange,
  onPrepare,
  accountRuntime,
}: {
  companion: CompanionId;
  intent: DashboardIntent | null;
  text: string;
  onTextChange: (text: string) => void;
  onPrepare: (id: DashboardIntent) => void;
  onVoice?: () => void;
  accountRuntime?: AccountDashboardRuntime;
}) {
  const name = companion === "max" ? "Макс" : "Лика";
  const toName = companion === "max" ? "Максу" : "Лике";
  return (
    <section className={`${styles.card} ${styles.chatCard}`} aria-labelledby="chat-title">
      <header className={styles.coachHeader}>
        <DashboardAvatar companion={companion} />
        <div>
          <h2 id="chat-title">{name}</h2>
          <p>Твой напарник{accountRuntime ? " · ИИ beta" : ""}</p>
        </div>
        <span className={styles.chatScribble} aria-hidden="true">
          {companion === "max" ? "Начнём с одного шага." : "Вместе дальше ♡"}
        </span>
      </header>
      <div className={styles.conversation}>
        <div className={styles.welcomeMessage}>
          <h3>С чего начнём?</h3>
          <p>
            {accountRuntime ? (
              <>Обсудим занятие, разберём упражнение или начнём с твоего вопроса.</>
            ) : (
              <>
                Можем собрать разовое занятие
                <br className={styles.desktopBreak} /> или сначала обсудить, что тебе подходит.
              </>
            )}
          </p>
        </div>
        <ChatComposer
          key={companion}
          companion={companion}
          name={toName}
          intent={intent}
          text={text}
          onTextChange={onTextChange}
          onPrepare={onPrepare}
          accountRuntime={accountRuntime}
        />
      </div>
    </section>
  );
}

function ChatComposer({
  companion,
  name,
  intent,
  text,
  onTextChange,
  onPrepare,
  accountRuntime,
}: {
  companion: CompanionId;
  name: string;
  intent: DashboardIntent | null;
  text: string;
  onTextChange: (text: string) => void;
  onPrepare: (id: DashboardIntent) => void;
  accountRuntime?: AccountDashboardRuntime;
}) {
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const messageCount = accountRuntime?.messages.length ?? 0;
  const isSending = accountRuntime?.isSending ?? false;
  const chatBlocked = Boolean(
    accountRuntime &&
    (!accountRuntime.isOnline ||
      accountRuntime.assistantEnabled !== true ||
      accountRuntime.assistantLoading ||
      accountRuntime.pendingAssistantText),
  );
  const voice = useVoiceInput({
    companion,
    preview: !accountRuntime,
    draft: text,
    onDraftChange: onTextChange,
  });
  useEffect(() => {
    if (history.current) history.current.scrollTop = history.current.scrollHeight;
  }, [messageCount, isSending]);

  async function send() {
    if (!text.trim() || voice.busy || isSending || chatBlocked) return;
    if (!accountRuntime) {
      setNotice(
        "Сообщение осталось черновиком: ИИ ещё не подключён к прототипу. Мы ничего не отправляли.",
      );
      return;
    }
    setNotice("");
    try {
      await accountRuntime.onSend(text.trim());
      onTextChange("");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Не удалось отправить сообщение.");
    }
  }

  function prepare(id: DashboardIntent) {
    voice.cancel();
    setNotice("");
    onPrepare(id);
    input.current?.focus();
  }

  return (
    <>
      <div className={styles.intentActions}>
        {accountRuntime ? (
          <Link className={styles.primaryAction} href="/workout-builder?from=dashboard&mode=single">
            <Dumbbell size={24} aria-hidden="true" />
            Просто потренироваться
            <ArrowRight size={21} aria-hidden="true" />
          </Link>
        ) : (
          <button type="button" className={styles.primaryAction} onClick={() => prepare("workout")}>
            <Dumbbell size={24} aria-hidden="true" />
            Просто потренироваться
            <ArrowRight size={21} aria-hidden="true" />
          </button>
        )}
        <div className={styles.secondaryActions}>
          {accountRuntime ? (
            <Link href="/workout-builder?from=dashboard&mode=program">
              <ClipboardList size={23} aria-hidden="true" />
              Хочу программу
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          ) : (
            <button type="button" onClick={() => prepare("program")}>
              <ClipboardList size={23} aria-hidden="true" />
              Хочу программу
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          )}
          <button type="button" onClick={() => prepare("food")}>
            <CookingPot size={23} aria-hidden="true" />
            Что приготовить?
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
        {accountRuntime ? (
          <Link className={styles.manualBuilderLink} href="/workout-builder?from=dashboard">
            Собрать самому
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        ) : null}
        {intent ? <p className={styles.intentHint}>{DASHBOARD_INTENTS[intent].hint}</p> : null}
      </div>
      <div className={styles.chatAtmosphere} aria-hidden="true" />
      {accountRuntime ? (
        <div
          ref={history}
          className={styles.messageHistory}
          role="log"
          aria-label="История разговора"
          aria-live="polite"
          tabIndex={0}
        >
          {accountRuntime.messages.map((message) => (
            <article key={message.id} data-role={message.role}>
              <span>
                {message.role === "user"
                  ? "Ты"
                  : (message.companion ?? companion) === "max"
                    ? "Макс"
                    : "Лика"}
              </span>
              <p>{message.text}</p>
              <AssistantChatActions
                actions={message.actions}
                confirmedIds={accountRuntime.confirmedAssistantActions}
                online={accountRuntime.isOnline}
                onConfirm={accountRuntime.onConfirmAssistantAction}
              />
            </article>
          ))}
          {accountRuntime.isSending ? (
            <p className={styles.intentHint} role="status">
              {companion === "max" ? "Макс" : "Лика"} готовит ответ…
            </p>
          ) : null}
        </div>
      ) : null}
      <div className={styles.composerDock}>
        {accountRuntime ? (
          <AssistantChatStatus
            enabled={accountRuntime.assistantEnabled}
            loading={accountRuntime.assistantLoading}
            online={accountRuntime.isOnline}
            sending={accountRuntime.isSending}
            pendingText={accountRuntime.pendingAssistantText}
            error={notice || accountRuntime.assistantError}
            onRefresh={accountRuntime.onRefreshAssistant}
            onRetry={async () => {
              setNotice("");
              await accountRuntime.onRetryAssistant();
              if (text.trim() === accountRuntime.pendingAssistantText) onTextChange("");
            }}
          />
        ) : null}
        {notice && !accountRuntime ? (
          <p className={styles.chatNotice} role="status">
            {notice}
          </p>
        ) : null}
        <form
          className={styles.composer}
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <VoiceInputControl
            voice={voice}
            disabled={isSending}
            buttonClassName={styles.micButton}
            offlineId="dashboard-voice-offline"
          />
          <label htmlFor="dashboard-message" className={styles.srOnly}>
            Сообщение напарнику
          </label>
          <textarea
            ref={input}
            id="dashboard-message"
            rows={1}
            value={text}
            disabled={voice.busy || accountRuntime?.isSending}
            onChange={(event) => {
              onTextChange(event.target.value);
              setNotice("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder={`Напиши ${name}…`}
            maxLength={2000}
          />
          <button
            type="submit"
            className={styles.sendButton}
            disabled={!text.trim() || voice.busy || accountRuntime?.isSending || chatBlocked}
            aria-label="Отправить сообщение"
          >
            <Send size={22} aria-hidden="true" />
          </button>
        </form>
        <VoiceInputFeedback
          voice={voice}
          className={styles.chatNotice}
          offlineId="dashboard-voice-offline"
        />
      </div>
    </>
  );
}
