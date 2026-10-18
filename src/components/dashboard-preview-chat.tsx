"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  ClipboardList,
  CookingPot,
  Dumbbell,
  Send,
  X,
} from "lucide-react";
import type { CompanionId } from "@/shared/contracts";
import { useVoiceInput } from "@/client/use-voice-input";
import { DASHBOARD_INTENTS, type DashboardIntent } from "@/shared/dashboard-preview";
import styles from "./dashboard-chat.module.css";
import { AssistantHistoryToolbar, AssistantMessageMenu } from "./assistant-history-controls";
import chatStyles from "./assistant-chat.module.css";
import { VoiceInputControl, VoiceInputFeedback } from "./voice-input-control";
import type { AccountDashboardRuntime } from "./account-dashboard-runtime";
import { AssistantChatStatus } from "./assistant-chat-status";
import { AssistantChatActions } from "./assistant-chat-actions";
import { isTerminalWorkout } from "@/shared/xp-policy";

export function DashboardAvatar({ companion }: { companion: CompanionId }) {
  return (
    <span className={styles.coachAvatar} data-companion={companion}>
      <Image
        unoptimized
        src={`/characters/${companion}-avatar.webp`}
        alt=""
        width={512}
        height={512}
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
  onWorkouts,
  accountRuntime,
}: {
  companion: CompanionId;
  intent: DashboardIntent | null;
  text: string;
  onTextChange: (text: string) => void;
  onPrepare: (id: DashboardIntent) => void;
  onWorkouts: () => void;
  accountRuntime?: AccountDashboardRuntime;
}) {
  const toName = companion === "max" ? "Максу" : "Лике";
  const [expanded, setExpanded] = useState(false);
  const chat = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!expanded) return;
    const element = chat.current;
    const viewport = window.visualViewport;
    if (!element || !viewport) return;
    let frame = 0;
    function update() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        element?.style.setProperty("--chat-viewport-height", `${viewport?.height}px`);
        element?.style.setProperty("--chat-viewport-top", `${viewport?.offsetTop}px`);
      });
    }
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      element.style.removeProperty("--chat-viewport-height");
      element.style.removeProperty("--chat-viewport-top");
    };
  }, [expanded]);
  return (
    <section
      ref={chat}
      className={styles.chatCard}
      aria-labelledby="chat-title"
      data-chat-expanded={expanded}
    >
      <header className={styles.coachHeader}>
        <span
          className={styles.mobileScene}
          aria-hidden="true"
          data-testid="dashboard-mobile-mascot"
        >
          <picture>
            <source
              media="(min-width: 851px)"
              srcSet={`/visuals/soft-3d/dashboard/${companion}-desktop-v1.webp`}
            />
            <Image
              unoptimized
              src={`/visuals/soft-3d/dashboard/${companion}-mobile-v1.webp`}
              alt=""
              fill
              sizes="(max-width: 850px) 100vw, 1px"
              loading="eager"
            />
          </picture>
        </span>
        <div className={styles.coachIdentity}>
          <DashboardAvatar companion={companion} />
          <div>
            <h2 id="chat-title" tabIndex={-1}>
              Чат с {companion === "max" ? "Максом" : "Ликой"}
            </h2>
            <p>{accountRuntime ? "Твой напарник · ИИ beta" : "Твой напарник"}</p>
          </div>
        </div>
        <button
          type="button"
          className={styles.closeChat}
          aria-label="Свернуть чат"
          onClick={() => {
            setExpanded(false);
            requestAnimationFrame(() =>
              document.getElementById("chat-title")?.focus({ preventScroll: true }),
            );
          }}
        >
          <X size={22} aria-hidden="true" />
        </button>
      </header>
      <div className={styles.conversation}>
        {!accountRuntime?.messages.length ? (
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
        ) : null}
        <ChatComposer
          key={companion}
          companion={companion}
          name={toName}
          intent={intent}
          text={text}
          onTextChange={onTextChange}
          onPrepare={onPrepare}
          onWorkouts={onWorkouts}
          onFocus={() => setExpanded(true)}
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
  onWorkouts,
  onFocus,
  accountRuntime,
}: {
  companion: CompanionId;
  name: string;
  intent: DashboardIntent | null;
  text: string;
  onTextChange: (text: string) => void;
  onPrepare: (id: DashboardIntent) => void;
  onWorkouts: () => void;
  onFocus: () => void;
  accountRuntime?: AccountDashboardRuntime;
}) {
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const lastMessageId = accountRuntime?.messages.at(-1)?.id;
  const isSending = accountRuntime?.isSending ?? false;
  const chatBlocked = Boolean(
    accountRuntime &&
    (!accountRuntime.isOnline ||
      accountRuntime.assistantEnabled !== true ||
      accountRuntime.assistantLoading ||
      accountRuntime.assistantEditing ||
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
  }, [lastMessageId, isSending]);

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
        <button type="button" className={styles.workoutsAction} onClick={onWorkouts}>
          <ClipboardList size={21} aria-hidden="true" />
          Мои тренировки
        </button>
        <details className={styles.moreActions}>
          <summary>
            Ещё <ChevronDown size={16} aria-hidden="true" />
          </summary>
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
            {accountRuntime ? (
              <Link className={styles.manualBuilderLink} href="/workout-builder?from=dashboard">
                Собрать самому
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </details>
        {intent ? <p className={styles.intentHint}>{DASHBOARD_INTENTS[intent].hint}</p> : null}
      </div>
      {accountRuntime ? (
        <div className={styles.historyToolbar}>
          <AssistantHistoryToolbar
            key={companion}
            companion={companion}
            revision={accountRuntime.assistantHistoryRevision ?? 0}
            hasMessages={Boolean(
              accountRuntime.messages.length || accountRuntime.pendingAssistantText,
            )}
            disabled={
              !accountRuntime.isOnline ||
              accountRuntime.isSending ||
              accountRuntime.assistantLoading ||
              accountRuntime.assistantEditing ||
              accountRuntime.assistantHistoryBusy ||
              voice.busy
            }
            onEdit={accountRuntime.onEditAssistantHistory}
          />
        </div>
      ) : null}
      {accountRuntime ? (
        <div
          ref={history}
          className={styles.messageHistory}
          role="log"
          aria-label="История разговора"
          aria-live="polite"
          tabIndex={0}
        >
          {accountRuntime.assistantHasMore ? (
            <button
              type="button"
              className={chatStyles.actionButton}
              disabled={
                !accountRuntime.isOnline ||
                accountRuntime.assistantHistoryBusy ||
                accountRuntime.assistantEditing
              }
              onClick={async () => {
                const previousHeight = history.current?.scrollHeight ?? 0;
                const previousTop = history.current?.scrollTop ?? 0;
                try {
                  await accountRuntime.onLoadOlderAssistant();
                  requestAnimationFrame(() => {
                    if (history.current)
                      history.current.scrollTop =
                        previousTop + history.current.scrollHeight - previousHeight;
                  });
                } catch (cause) {
                  setNotice(
                    cause instanceof Error ? cause.message : "Не удалось загрузить историю.",
                  );
                }
              }}
            >
              {accountRuntime.assistantHistoryBusy ? "Загружаем…" : "Ранние сообщения"}
            </button>
          ) : null}
          {accountRuntime.messages.map((message) => (
            <article key={message.id} data-role={message.role}>
              <span>
                {message.role === "user"
                  ? "Ты"
                  : (message.companion ?? companion) === "max"
                    ? "Макс"
                    : "Лика"}
              </span>
              {message.role === "assistant" ? (
                <DashboardAvatar companion={message.companion ?? companion} />
              ) : null}
              <p>{message.text}</p>
              {message.replyState ? (
                <small role="status">
                  {message.replyState === "pending"
                    ? "Ответ готовится…"
                    : "Ответ не получен. Можно отправить вопрос ещё раз."}
                </small>
              ) : null}
              <time dateTime={message.createdAt}>
                {new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(
                  new Date(message.createdAt),
                )}
              </time>
              <AssistantChatActions
                actions={message.actions}
                confirmedIds={accountRuntime.confirmedAssistantActions}
                online={accountRuntime.isOnline}
                onConfirm={accountRuntime.onConfirmAssistantAction}
              />
              <AssistantMessageMenu
                message={message}
                companion={companion}
                revision={accountRuntime.assistantHistoryRevision ?? 0}
                disabled={
                  !accountRuntime.isOnline ||
                  accountRuntime.isSending ||
                  accountRuntime.assistantLoading ||
                  accountRuntime.assistantEditing ||
                  accountRuntime.assistantHistoryBusy ||
                  voice.busy
                }
                onEdit={accountRuntime.onEditAssistantHistory}
              />
            </article>
          ))}
          {accountRuntime.workout && !isTerminalWorkout(accountRuntime.workout.status) ? (
            <CurrentWorkoutCard runtime={accountRuntime} />
          ) : null}
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
            showContextNote={false}
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
            enterKeyHint="send"
            value={text}
            onFocus={onFocus}
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
        {voice.phase !== "idle" ||
        !voice.online ||
        voice.error ||
        voice.notice ||
        voice.pendingText ||
        !voice.supported ? (
          <VoiceInputFeedback
            voice={voice}
            className={styles.chatNotice}
            offlineId="dashboard-voice-offline"
          />
        ) : null}
      </div>
    </>
  );
}

function CurrentWorkoutCard({ runtime }: { runtime: AccountDashboardRuntime }) {
  const workout = runtime.workout;
  if (!workout) return null;
  const scene =
    runtime.profile.discipline === "yoga"
      ? "yoga"
      : runtime.profile.discipline === "mobility"
        ? "mobility"
        : runtime.profile.location === "gym"
          ? "gym"
          : "home";
  const exercises = workout.exercises.filter(
    (exercise) => exercise.phase !== "warmup" && exercise.phase !== "cooldown",
  );
  return (
    <aside className={styles.workoutCard} aria-label="Текущее занятие">
      <Image src={`/visuals/soft-3d/${scene}.webp`} alt="" width={240} height={240} sizes="140px" />
      <div>
        <span>{workout.status === "active" ? "Занятие начато" : "Твоя тренировка"}</span>
        <h3>{workout.title}</h3>
        <p>
          Около {workout.estimatedMinutes} мин · {exercises.length} упражнений
        </p>
        <ol>
          {exercises.slice(0, 3).map((exercise) => (
            <li key={exercise.id}>{exercise.name}</li>
          ))}
        </ol>
        <Link href="/workout">
          {workout.status === "active" ? "Продолжить занятие" : "Посмотреть план"}
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </aside>
  );
}
