"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type {
  AccountState,
  ChatMessage,
  CommandAck,
  CommandEnvelope,
  CompanionId,
  Profile,
  Workout,
  WorkoutEnergyInput,
} from "@/shared/contracts";
import { DEFAULT_PROFILE, buildDemoWorkout } from "@/shared/demo";
import {
  acknowledgeCommand,
  endOfflineSession,
  journalCommand,
  offlineDb,
  ownerCommands,
  persistState,
  queueOwnerMatches,
  type CachedState,
} from "./offline-db";
import { demoProgress, demoReward, reduceWorkout } from "./workout-reducer";
import { isTerminalWorkout } from "@/shared/xp-policy";
import type { CompleteOnboardingInput } from "@/shared/onboarding";
import type {
  AssistantEnergyAction,
  AssistantHistory,
  AssistantReply,
  AssistantChatMessage,
} from "@/shared/assistant";
import {
  mergeAssistantMessages,
  pendingAssistantMessage,
  PENDING_ASSISTANT_KEY,
  readPendingAssistant,
  type PendingAssistantOperation,
} from "./assistant-client-state";

const freshState = (): CachedState => ({
  key: "demo",
  profile: structuredClone(DEFAULT_PROFILE),
  trial: {
    startsAt: "1970-01-01T00:00:00.000Z",
    endsAt: "1970-01-08T00:00:00.000Z",
    replyLimit: 100,
    repliesUsed: 0,
  },
  progress: { xp: 0, completedWorkouts: 0, history: [] },
  workout: null,
  messages: [],
  offlineReady: false,
});
function newDemoState(): CachedState {
  const state = freshState();
  return {
    ...state,
    trial: {
      ...state.trial,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    },
  };
}
class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    signal: AbortSignal.timeout(15000),
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new RequestError(
      body?.error?.message ?? body?.message ?? "Не удалось сохранить. Попробуй ещё раз.",
      response.status,
      body?.error?.code,
    );
  return body as T;
}
interface MironContext extends Omit<CachedState, "key" | "messages"> {
  messages: AssistantChatMessage[];
  ownerId: string | null;
  isReady: boolean;
  isDemo: boolean;
  isOnline: boolean;
  isSending: boolean;
  assistantEnabled: boolean | null;
  assistantLoading: boolean;
  assistantError: string | null;
  pendingAssistantText: string | null;
  error: string | null;
  pendingCount: number;
  downloaded: boolean;
  saveProfile: (profile: Profile) => Promise<void>;
  completeOnboarding: (input: CompleteOnboardingInput) => Promise<void>;
  switchCompanion: (id: CompanionId) => Promise<void>;
  startWorkout: () => Promise<void>;
  recordSet: (exerciseId: string, reps: number, weightKg: number) => Promise<void>;
  recordTimedSet: (exerciseId: string, durationSeconds: number) => Promise<void>;
  advanceExercise: () => Promise<void>;
  finishWorkout: () => Promise<void>;
  skipExercise: (exerciseId: string) => Promise<void>;
  endWorkoutEarly: () => Promise<void>;
  estimateEnergy: (input: WorkoutEnergyInput) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  retryAssistant: () => Promise<void>;
  refreshAssistant: () => Promise<void>;
  confirmAssistantAction: (action: AssistantEnergyAction) => Promise<void>;
  confirmedAssistantActions: string[];
  downloadWorkout: () => Promise<void>;
  syncPending: () => Promise<void>;
  resetDemo: () => Promise<void>;
  logout: () => Promise<void>;
  exportAccount: () => void;
}
const Context = createContext<MironContext | null>(null);
export function MironProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const previousPathRef = useRef(pathname);
  const [state, setState] = useState<CachedState>(freshState);
  const stateRef = useRef(state);
  const [isReady, setReady] = useState(false);
  const [isDemo, setDemo] = useState(false);
  const [isOnline, setOnline] = useState(true);
  const [isSending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [assistantEnabled, setAssistantEnabled] = useState<boolean | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [pendingAssistantText, setPendingAssistantText] = useState<string | null>(null);
  const assistantPendingRef = useRef<PendingAssistantOperation | null>(null);
  const assistantControllerRef = useRef<AbortController | null>(null);
  const assistantHistoryRef = useRef<Promise<void> | null>(null);
  const [confirmedAssistantActions, setConfirmedAssistantActions] = useState<string[]>([]);
  const confirmingAssistantRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [downloaded, setDownloaded] = useState(false);
  const serialRef = useRef<Promise<void>>(Promise.resolve());
  const closedRef = useRef(false);
  const authProbeRef = useRef<Promise<{ user?: { id: string } } | null> | null>(null);
  const blockedRef = useRef<string | null>(null);
  const forgetAssistant = useCallback(() => {
    assistantControllerRef.current?.abort();
    assistantPendingRef.current = null;
    setPendingAssistantText(null);
    setAssistantEnabled(null);
    setAssistantError(null);
    setConfirmedAssistantActions([]);
    try {
      sessionStorage.removeItem(PENDING_ASSISTANT_KEY);
    } catch {
      // This tab still detaches private state if storage is unavailable.
    }
  }, []);
  const enqueue = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    const guarded = async () => {
      if (closedRef.current) throw new Error("Сессия закрыта. Войди в аккаунт снова.");
      return work();
    };
    const task = serialRef.current.then(guarded, guarded);
    serialRef.current = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }, []);
  const publish = useCallback((next: CachedState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  const commit = useCallback(
    async (next: CachedState) => {
      publish(await persistState(next));
    },
    [publish],
  );
  const commitAssistant = useCallback(
    async (next: CachedState, owner: string) => {
      if (closedRef.current || stateRef.current.key !== owner) return;
      const saved = await persistState(next);
      if (!closedRef.current && stateRef.current.key === owner) publish(saved);
    },
    [publish],
  );
  const detachAssistantOwner = useCallback(
    async (owner: string) => {
      if (stateRef.current.key !== owner) return;
      closedRef.current = true;
      forgetAssistant();
      publish(freshState());
      setPendingCount(0);
      setDownloaded(false);
      await endOfflineSession(owner);
      window.location.replace("/sign-in");
    },
    [forgetAssistant, publish],
  );

  // Called only inside the serialized mutation queue, never concurrently with local commands.
  const drain = useCallback(async () => {
    const owner = stateRef.current.key;
    if (owner === "demo") return;
    if (!navigator.onLine) throw new Error("Подключись к интернету для синхронизации.");
    const items = await ownerCommands(owner);
    setPendingCount(items.length);
    if (items.length) {
      let session: { user?: { id: string } } | null;
      try {
        session = await request<{ user?: { id: string } } | null>("/api/auth/get-session", {
          signal: AbortSignal.timeout(5000),
        });
      } catch (cause) {
        setError(
          "Действия сохранены на устройстве. Не удалось проверить сессию — повтори синхронизацию.",
        );
        throw cause;
      }
      if (!queueOwnerMatches(owner, session?.user?.id)) {
        forgetAssistant();
        await endOfflineSession(owner);
        blockedRef.current = "Войди в исходный аккаунт для синхронизации сохранённых подходов.";
        closedRef.current = true;
        publish(freshState());
        setDownloaded(false);
        setPendingCount(0);
        setError(blockedRef.current);
        window.location.replace("/sign-in");
        throw new RequestError(blockedRef.current, 401);
      }
    }
    for (const item of items) {
      if (stateRef.current.key !== owner) return;
      try {
        const ack = await request<CommandAck>(`/api/workouts/${item.workoutId}/commands`, {
          method: "POST",
          body: JSON.stringify(item.envelope),
        });
        if (stateRef.current.key !== owner) return;
        if (
          ack.operationId !== item.id ||
          ack.workout.id !== item.workoutId ||
          ack.workout.revision !== item.envelope.expectedRevision + 1
        )
          throw new Error("Сервер вернул ответ для другого действия.");
        const saved = await acknowledgeCommand(owner, item.id, ack.workout, ack.progress);
        publish(saved.state);
        setPendingCount(saved.pending);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Синхронизация остановилась.";
        if (cause instanceof RequestError && cause.status >= 400 && cause.status < 500)
          blockedRef.current = message;
        setError(
          cause instanceof RequestError
            ? message
            : "Действие сохранено на устройстве. Повтори синхронизацию, когда сеть восстановится.",
        );
        setPendingCount(await offlineDb.pending.where("owner").equals(owner).count());
        throw cause;
      }
    }
    blockedRef.current = null;
    setError(null);
  }, [publish, forgetAssistant]);
  const syncPending = useCallback(() => enqueue(drain), [enqueue, drain]);

  // Next keeps this provider mounted during sign-in navigation. Re-enter with a fresh
  // server principal so a cached null/A session cannot survive authentication as B.
  useEffect(() => {
    const previous = previousPathRef.current;
    previousPathRef.current = pathname;
    if (
      previous &&
      ["/sign-in", "/sign-up", "/reset-password", "/forgot-password"].includes(previous) &&
      pathname &&
      [
        "/dashboard",
        "/onboarding",
        "/workout",
        "/programs",
        "/progress",
        "/settings",
        "/chat",
      ].includes(pathname)
    )
      window.location.reload();
  }, [pathname]);

  useEffect(() => {
    let alive = true;
    async function hydrate() {
      const online = navigator.onLine;
      setOnline(online);
      const requestedDemo = sessionStorage.getItem("miron:demo") === "1";
      const previousOwner = localStorage.getItem("miron:account");
      let owner: string | null = null;
      if (!online) {
        if (!requestedDemo) owner = localStorage.getItem("miron:account");
      } else
        try {
          // The single initial probe is allowed in demo; subsequent actions stay local.
          authProbeRef.current ??= request<{ user?: { id: string } } | null>(
            "/api/auth/get-session",
            { signal: AbortSignal.timeout(5000) },
          );
          const session = await authProbeRef.current;
          if (!alive) return;
          if (!requestedDemo) owner = session?.user?.id ?? null;
          if (owner) {
            if (previousOwner && previousOwner !== owner)
              await endOfflineSession(`user:${previousOwner}`);
            localStorage.setItem("miron:account", owner);
          } else if (!requestedDemo)
            await endOfflineSession(previousOwner ? `user:${previousOwner}` : null);
        } catch {
          if (!requestedDemo && !online) owner = localStorage.getItem("miron:account");
        }
      const demo = requestedDemo;
      const key = owner ? `user:${owner}` : "demo";
      let next = (await offlineDb.states.get(key)) ?? { ...newDemoState(), key };
      let pending = owner ? await ownerCommands(key) : [];
      if (owner && online) {
        try {
          const [account, result] = await Promise.all([
            request<AccountState>("/api/profile"),
            request<{ workout: Workout | null }>("/api/workouts/current"),
          ]);
          next = {
            ...next,
            ...account,
            workout: pending.length ? next.workout : result.workout,
            offlineReady: pending.length
              ? next.offlineReady
              : next.offlineReady && next.workout?.id === result.workout?.id,
          };
        } catch (cause) {
          if (cause instanceof RequestError && (cause.status === 401 || cause.status === 403)) {
            await endOfflineSession(key);
            owner = null;
            pending = [];
            next = freshState();
            closedRef.current = true;
          }
          if (alive)
            setError(cause instanceof Error ? cause.message : "Не удалось загрузить профиль.");
        }
      }
      if (!owner && !demo) next = freshState();
      if (alive) {
        setDemo(demo);
        if (owner || demo) await commit(next);
        else publish(next);
        setPendingCount(pending.length);
        setReady(true);
        setDownloaded(Boolean(next.offlineReady));
        const product = [
          "/dashboard",
          "/onboarding",
          "/workout",
          "/programs",
          "/progress",
          "/settings",
          "/chat",
        ].includes(window.location.pathname);
        if (product && !owner && !demo) window.location.replace("/sign-in");
        else if (
          product &&
          owner &&
          !next.profile.onboardingCompleted &&
          window.location.pathname !== "/onboarding"
        )
          window.location.replace("/onboarding");
      }
    }
    void hydrate().catch((cause) => {
      if (alive) {
        setError(
          cause instanceof Error ? cause.message : "Не удалось открыть локальное хранилище.",
        );
        setDemo(sessionStorage.getItem("miron:demo") === "1");
        setReady(true);
      }
    });
    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    const storageHandler = (event: StorageEvent) => {
      const key = stateRef.current.key;
      if (
        event.key === "miron:account" &&
        key.startsWith("user:") &&
        event.newValue !== key.slice(5)
      ) {
        closedRef.current = true;
        forgetAssistant();
        publish(freshState());
        setPendingCount(0);
        setDownloaded(false);
        void endOfflineSession(key).catch(() => undefined);
        window.location.replace("/sign-in");
      }
    };
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    window.addEventListener("storage", storageHandler);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .register(process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?dev=1")
        .catch(() => undefined);
    return () => {
      alive = false;
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
      window.removeEventListener("storage", storageHandler);
    };
  }, [commit, publish, forgetAssistant]);
  useEffect(() => {
    if (isReady && isOnline && !isDemo && state.key !== "demo")
      void syncPending().catch(() => undefined);
  }, [isReady, isOnline, isDemo, state.key, syncPending]);

  const saveProfile = useCallback(
    (profile: Profile) =>
      enqueue(async () => {
        setError(null);
        try {
          if (stateRef.current.key === "demo") {
            await commit({ ...stateRef.current, profile });
            return;
          }
          if (!navigator.onLine) throw new Error("Для изменения профиля подключись к интернету.");
          const account = await request<AccountState>("/api/profile", {
            method: "PUT",
            body: JSON.stringify(profile),
          });
          await commit({ ...stateRef.current, ...account });
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Не удалось сохранить профиль.");
          throw cause;
        }
      }),
    [enqueue, commit],
  );
  const completeOnboarding = useCallback(
    (input: CompleteOnboardingInput) =>
      enqueue(async () => {
        const owner = stateRef.current.key;
        if (!owner.startsWith("user:") || isDemo)
          throw new Error("Войди в аккаунт для завершения знакомства.");
        if (!navigator.onLine)
          throw new Error("Подключись к интернету, чтобы сохранить знакомство.");
        const account = await request<AccountState>("/api/onboarding", {
          method: "POST",
          headers: { "x-miron-owner": owner.slice(5) },
          body: JSON.stringify(input),
        });
        if (closedRef.current || stateRef.current.key !== owner)
          throw new Error("Аккаунт изменился. Открой знакомство заново.");
        if (!account.profile.onboardingCompleted)
          throw new Error("Сервер не подтвердил завершение знакомства.");
        await commit({ ...stateRef.current, ...account });
      }),
    [enqueue, commit, isDemo],
  );
  const startWorkout = useCallback(
    () =>
      enqueue(async () => {
        const current = stateRef.current;
        if (current.workout?.status === "active") return;
        if (current.key === "demo") {
          if (!current.profile.adultConfirmed)
            throw new Error("Подтверди совершеннолетие в профиле.");
          await commit({
            ...current,
            workout: buildDemoWorkout(current.profile),
            offlineReady: false,
          });
          setDownloaded(false);
          return;
        }
        if (!navigator.onLine) throw new Error("Загрузи занятие перед выходом из сети.");
        await drain();
        const workout = await request<Workout>("/api/workouts", { method: "POST", body: "{}" });
        await commit({ ...stateRef.current, workout, offlineReady: false });
        setDownloaded(false);
      }),
    [enqueue, commit, drain],
  );
  const execute = useCallback(
    (command: CommandEnvelope["command"]) =>
      enqueue(async () => {
        if (blockedRef.current) throw new Error(`Синхронизация остановлена: ${blockedRef.current}`);
        const previous = stateRef.current;
        const workout = previous.workout;
        if (!workout) throw new Error("Сначала начни занятие.");
        const knownWeight = previous.progress.history
          .flatMap((item) =>
            item.energyEstimate?.weightSource === "user_reported" ? [item.energyEstimate] : [],
          )
          .sort((a, b) => Date.parse(b.estimatedAt) - Date.parse(a.estimatedAt))[0]?.bodyWeightKg;
        let nextWorkout = reduceWorkout(workout, command, new Date().toISOString(), knownWeight);
        const demo = previous.key === "demo";
        let progress =
          demo && isTerminalWorkout(nextWorkout.status)
            ? demoProgress(previous.progress, nextWorkout)
            : previous.progress;
        if (!demo && command.type === "estimate_energy") {
          // A terminal estimate is provisional until ACK, just like recorded work.
          // Keep the cached history usable offline without altering confirmed XP.
          progress = {
            ...progress,
            history: progress.history.map((item) =>
              item.id === workout.id
                ? { ...item, energyEstimate: nextWorkout.energyEstimate }
                : item,
            ),
          };
        }
        if (demo && isTerminalWorkout(nextWorkout.status))
          nextWorkout = demoReward(progress, nextWorkout);
        const next: CachedState = {
          ...previous,
          workout: nextWorkout,
          progress,
        };
        if (demo) {
          await commit(next);
          return;
        }
        const envelope: CommandEnvelope = {
          operationId: crypto.randomUUID(),
          expectedRevision: workout.revision,
          command,
        };
        // Journal and provisional state must commit together before any HTTP request.
        await journalCommand(next, {
          id: envelope.operationId,
          owner: previous.key,
          workoutId: workout.id,
          envelope,
          createdAt: Date.now(),
        });
        publish(next);
        setPendingCount(await offlineDb.pending.where("owner").equals(previous.key).count());
        if (navigator.onLine) {
          try {
            await drain();
          } catch (cause) {
            if (cause instanceof RequestError && cause.status >= 400 && cause.status < 500)
              throw cause;
          }
        }
      }),
    [enqueue, commit, publish, drain],
  );
  const recordSet = useCallback(
    (exerciseId: string, reps: number, weightKg: number) =>
      execute({ type: "record_set", exerciseId, reps, weightKg, setId: crypto.randomUUID() }),
    [execute],
  );
  const advanceExercise = useCallback(() => execute({ type: "next_exercise" }), [execute]);
  const recordTimedSet = useCallback(
    (exerciseId: string, durationSeconds: number) =>
      execute({
        type: "record_timed_set",
        exerciseId,
        durationSeconds,
        setId: crypto.randomUUID(),
      }),
    [execute],
  );
  const finishWorkout = useCallback(() => execute({ type: "finish" }), [execute]);
  const estimateEnergy = useCallback(
    (input: WorkoutEnergyInput) => execute({ type: "estimate_energy", ...input }),
    [execute],
  );
  const skipExercise = useCallback(
    (exerciseId: string) => execute({ type: "skip_exercise", exerciseId }),
    [execute],
  );
  const endWorkoutEarly = useCallback(() => execute({ type: "end_early" }), [execute]);
  const switchCompanion = useCallback(
    (companion: CompanionId) => saveProfile({ ...stateRef.current.profile, companion }),
    [saveProfile],
  );
  const downloadWorkout = useCallback(async () => {
    if (!stateRef.current.workout) await startWorkout();
    if (!navigator.onLine) {
      if (stateRef.current.offlineReady) return;
      throw new Error("Для загрузки занятия подключись к интернету.");
    }
    if (!("serviceWorker" in navigator))
      throw new Error("Этот браузер не поддерживает загрузку занятия офлайн.");
    {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error("PWA ещё запускается. Попробуй сохранить снова.");
      if (!registration.active) throw new Error("PWA ещё запускается. Попробуй сохранить снова.");
      await new Promise<void>((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = window.setTimeout(() => {
          channel.port1.close();
          reject(new Error("Загрузка не завершилась. Проверь сеть и попробуй снова."));
        }, 30000);
        channel.port1.onmessage = (event: MessageEvent<{ ok: boolean }>) => {
          window.clearTimeout(timer);
          channel.port1.close();
          if (event.data.ok) resolve();
          else reject(new Error("Не удалось загрузить все карточки. Попробуй снова."));
        };
        registration.active!.postMessage({ type: "PRECACHE_WORKOUT" }, [channel.port2]);
      });
    }
    await enqueue(async () => {
      await commit({ ...stateRef.current, offlineReady: true });
      setDownloaded(true);
    });
  }, [startWorkout, enqueue, commit]);

  const refreshAssistant = useCallback(async () => {
    if (assistantHistoryRef.current) return assistantHistoryRef.current;
    const owner = stateRef.current.key;
    if (!owner.startsWith("user:") || closedRef.current || sendingRef.current) return;
    if (!stateRef.current.profile.onboardingCompleted || !stateRef.current.profile.adultConfirmed)
      return;
    if (!navigator.onLine) return;
    const task = (async () => {
      setAssistantLoading(true);
      setAssistantError(null);
      const controller = new AbortController();
      assistantControllerRef.current = controller;
      try {
        const history = await request<AssistantHistory>("/api/assistant", {
          headers: { "x-miron-owner": owner.slice(5) },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        if (closedRef.current || controller.signal.aborted || stateRef.current.key !== owner)
          return;
        let pending = assistantPendingRef.current ?? readPendingAssistant(sessionStorage, owner);
        if (
          pending &&
          history.messages.some(
            (message) =>
              message.role === "assistant" && message.operationId === pending?.operationId,
          )
        ) {
          pending = null;
          try {
            sessionStorage.removeItem(PENDING_ASSISTANT_KEY);
          } catch {
            /* Server history confirmed the reply. */
          }
        }
        assistantPendingRef.current = pending;
        setPendingAssistantText(pending?.text ?? null);
        await enqueue(async () => {
          if (closedRef.current || controller.signal.aborted || stateRef.current.key !== owner)
            return;
          const messages =
            pending &&
            !history.messages.some(
              (message) => message.role === "user" && message.operationId === pending?.operationId,
            )
              ? mergeAssistantMessages(history.messages, [pendingAssistantMessage(pending)])
              : history.messages;
          await commitAssistant({ ...stateRef.current, messages }, owner);
          if (!closedRef.current && stateRef.current.key === owner)
            setAssistantEnabled(history.enabled);
        });
      } catch (cause) {
        if (
          cause instanceof RequestError &&
          (cause.status === 401 || cause.code === "OWNER_CHANGED")
        ) {
          await detachAssistantOwner(owner);
          return;
        }
        if (!closedRef.current && !controller.signal.aborted && stateRef.current.key === owner)
          setAssistantError(
            cause instanceof RequestError
              ? cause.message
              : "Не удалось загрузить разговор. Проверь сеть и повтори.",
          );
      } finally {
        if (assistantControllerRef.current === controller) assistantControllerRef.current = null;
        setAssistantLoading(false);
      }
    })();
    assistantHistoryRef.current = task;
    try {
      await task;
    } finally {
      if (assistantHistoryRef.current === task) assistantHistoryRef.current = null;
    }
  }, [commitAssistant, enqueue, detachAssistantOwner]);

  useEffect(() => {
    if (
      isReady &&
      isOnline &&
      !isDemo &&
      !isSending &&
      state.key.startsWith("user:") &&
      state.profile.onboardingCompleted &&
      state.profile.adultConfirmed
    )
      void refreshAssistant();
  }, [
    isReady,
    isOnline,
    isDemo,
    isSending,
    state.key,
    state.profile.companion,
    state.profile.onboardingCompleted,
    state.profile.adultConfirmed,
    refreshAssistant,
  ]);

  const sendAssistantOperation = useCallback(
    async (pending: PendingAssistantOperation) => {
      const { owner } = pending;
      if (closedRef.current || stateRef.current.key !== owner)
        throw new Error("Аккаунт изменился. Открой разговор заново.");
      if (!navigator.onLine)
        throw new Error("Ты офлайн. Сообщение останется черновиком до подключения.");
      const controller = new AbortController();
      assistantControllerRef.current = controller;
      try {
        await enqueue(async () => {
          await drain();
          const session = await request<{ user?: { id: string } } | null>("/api/auth/get-session", {
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
          });
          if (!queueOwnerMatches(owner, session?.user?.id)) {
            await detachAssistantOwner(owner);
            throw new Error("Аккаунт изменился. Войди в исходный аккаунт для этого разговора.");
          }
          if (closedRef.current || controller.signal.aborted || stateRef.current.key !== owner)
            throw new Error("Аккаунт изменился. Войди в исходный аккаунт для этого разговора.");
          assistantPendingRef.current = pending;
          setPendingAssistantText(pending.text);
          try {
            sessionStorage.setItem(PENDING_ASSISTANT_KEY, JSON.stringify(pending));
          } catch {
            // Retrying remains safe in this tab; storage may be blocked by the browser.
          }
          await commitAssistant(
            {
              ...stateRef.current,
              messages: mergeAssistantMessages(stateRef.current.messages, [
                pendingAssistantMessage(pending),
              ]),
            },
            owner,
          );
        });
        if (closedRef.current || controller.signal.aborted || stateRef.current.key !== owner)
          throw new Error("Отправка отменена: аккаунт изменился.");
        const response = await request<AssistantReply>("/api/assistant", {
          method: "POST",
          headers: { "x-miron-owner": owner.slice(5) },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
          body: JSON.stringify({ operationId: pending.operationId, text: pending.text }),
        });
        if (closedRef.current || controller.signal.aborted || stateRef.current.key !== owner)
          return;
        if (
          response.operationId !== pending.operationId ||
          !response.messages.some((message) => message.role === "assistant")
        )
          throw new Error("Сервер не подтвердил ответ на это сообщение. Повтори запрос.");
        await enqueue(async () => {
          if (closedRef.current || controller.signal.aborted || stateRef.current.key !== owner)
            return;
          await commitAssistant(
            {
              ...stateRef.current,
              messages: mergeAssistantMessages(
                stateRef.current.messages,
                response.messages,
                pending.operationId,
              ),
            },
            owner,
          );
          assistantPendingRef.current = null;
          setPendingAssistantText(null);
          try {
            sessionStorage.removeItem(PENDING_ASSISTANT_KEY);
          } catch {
            /* In-memory state is already cleared. */
          }
        });
      } catch (cause) {
        if (
          cause instanceof RequestError &&
          (cause.status === 401 || cause.code === "OWNER_CHANGED")
        ) {
          await detachAssistantOwner(owner);
          return;
        }
        if (closedRef.current || controller.signal.aborted || stateRef.current.key !== owner)
          return;
        // A transport timeout is uncertain: retry the same ID. Final server failures are
        // durable; a new explicit send is allowed only after the server identifies one.
        if (cause instanceof RequestError && cause.code && cause.code !== "AI_OPERATION_PENDING") {
          assistantPendingRef.current = null;
          setPendingAssistantText(null);
          try {
            sessionStorage.removeItem(PENDING_ASSISTANT_KEY);
          } catch {
            /* No active retry remains. */
          }
          await enqueue(async () => {
            if (closedRef.current || stateRef.current.key !== owner) return;
            await commitAssistant(
              {
                ...stateRef.current,
                messages: stateRef.current.messages.filter(
                  (message) => message.id !== pending.operationId,
                ),
              },
              owner,
            );
          });
        }
        const message =
          cause instanceof RequestError
            ? cause.message
            : cause instanceof Error && !["TimeoutError", "TypeError"].includes(cause.name)
              ? cause.message
              : "Ответ не получен. Повтори запрос: сообщение не отправится второй раз.";
        if (closedRef.current || stateRef.current.key !== owner) return;
        setAssistantError(message);
        throw new Error(message);
      } finally {
        if (assistantControllerRef.current === controller) assistantControllerRef.current = null;
      }
    },
    [commitAssistant, drain, enqueue, detachAssistantOwner],
  );

  const sendMessage = useCallback(
    async (raw: string) => {
      const text = raw.trim().slice(0, 2000);
      if (!text || sendingRef.current) return;
      sendingRef.current = true;
      setSending(true);
      setAssistantError(null);
      if (stateRef.current.key !== "demo") {
        try {
          if (assistantEnabled !== true)
            throw new Error("Чат сейчас недоступен. Повтори загрузку разговора.");
          const pending = assistantPendingRef.current;
          if (pending && pending.text !== text)
            throw new Error("Сначала повтори предыдущее сообщение, чтобы получить его ответ.");
          await sendAssistantOperation(
            pending ?? {
              owner: stateRef.current.key,
              operationId: crypto.randomUUID(),
              text,
              createdAt: new Date().toISOString(),
            },
          );
        } finally {
          sendingRef.current = false;
          setSending(false);
        }
        return;
      }
      const user: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text,
        createdAt: new Date().toISOString(),
      };
      try {
        await enqueue(() =>
          commit({
            ...stateRef.current,
            messages: [...stateRef.current.messages, user].slice(-100),
          }),
        );
        let reply: string;
        if (/болит|боль|головокруж|травм/i.test(text))
          reply =
            "Остановим занятие. Не продолжай через боль. При сильных или необычных симптомах обратись за медицинской помощью; технику и нагрузку обсуди со специалистом.";
        else if (/следующ|дальше/i.test(text)) {
          await advanceExercise();
          reply = `Дальше — ${stateRef.current.workout?.exercises[stateRef.current.workout.currentIndex]?.name}. Карточка готова.`;
        } else if (/начн|погнали|начать/i.test(text)) {
          await startWorkout();
          reply =
            "Занятие открыто. Выбери знакомые движения и удобный темп. Текущую карточку найдёшь на экране тренировки.";
        } else if (/сделал|сделала|запиши/i.test(text) && /\d/.test(text)) {
          const exercise =
            stateRef.current.workout?.exercises[stateRef.current.workout.currentIndex];
          if (!exercise) throw new Error("Сначала начни занятие.");
          const reps = Number(text.match(/\d+/)?.[0]);
          if (exercise.metric === "time") {
            await recordTimedSet(exercise.id, reps);
            reply = `Записал ${reps} секунд. Можно выдохнуть и отдохнуть.`;
          } else {
            await recordSet(exercise.id, reps, 0);
            reply = `Записал ${reps} повторов без дополнительного веса. Можно выдохнуть и отдохнуть.`;
          }
        } else
          reply =
            stateRef.current.profile.companion === "max"
              ? "Я рядом. В деморежиме могу начать занятие, записать подход и перейти к следующему упражнению. Свободный разговор появится после подключения ИИ."
              : "Давай двигаться в твоём темпе. Пока могу открыть занятие, записать подход или показать следующее упражнение. Свободный диалог подключим чуть позже.";
        const assistant: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: reply,
          createdAt: new Date().toISOString(),
        };
        await enqueue(() =>
          commit({
            ...stateRef.current,
            messages: [...stateRef.current.messages, assistant].slice(-100),
          }),
        );
      } catch (cause) {
        setAssistantError(cause instanceof Error ? cause.message : "Напарник сейчас недоступен.");
        throw cause;
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [
      enqueue,
      commit,
      startWorkout,
      advanceExercise,
      recordSet,
      recordTimedSet,
      assistantEnabled,
      sendAssistantOperation,
    ],
  );
  const retryAssistant = useCallback(async () => {
    const pending = assistantPendingRef.current;
    if (!pending || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setAssistantError(null);
    try {
      await sendAssistantOperation(pending);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [sendAssistantOperation]);
  const confirmAssistantAction = useCallback(
    async (action: AssistantEnergyAction) => {
      const owner = stateRef.current.key;
      if (!owner.startsWith("user:") || closedRef.current)
        throw new Error("Войди в аккаунт для подтверждения.");
      if (!navigator.onLine) throw new Error("Подключись к интернету для пересчёта.");
      if (confirmingAssistantRef.current)
        throw new Error("Подожди подтверждения предыдущего пересчёта.");
      confirmingAssistantRef.current = true;
      try {
        await enqueue(async () => {
          await drain();
          if (closedRef.current || stateRef.current.key !== owner)
            throw new Error("Аккаунт изменился.");
          const ack = await request<CommandAck>("/api/assistant/actions", {
            method: "POST",
            headers: { "x-miron-owner": owner.slice(5) },
            body: JSON.stringify({ proposalId: action.id, operationId: action.operationId }),
          });
          if (closedRef.current || stateRef.current.key !== owner) return;
          if (ack.operationId !== action.operationId || ack.workout.id !== action.workoutId)
            throw new Error("Сервер не подтвердил этот пересчёт. Повтори подтверждение.");
          await commitAssistant(
            {
              ...stateRef.current,
              progress: ack.progress,
              workout:
                stateRef.current.workout?.id === ack.workout.id
                  ? ack.workout
                  : stateRef.current.workout,
            },
            owner,
          );
          if (!closedRef.current && stateRef.current.key === owner)
            setConfirmedAssistantActions((current) => [...new Set([...current, action.id])]);
        });
      } catch (cause) {
        if (
          cause instanceof RequestError &&
          (cause.status === 401 || cause.code === "OWNER_CHANGED")
        )
          await detachAssistantOwner(owner);
        throw cause;
      } finally {
        confirmingAssistantRef.current = false;
      }
    },
    [commitAssistant, drain, enqueue, detachAssistantOwner],
  );
  const logout = useCallback(
    () =>
      enqueue(async () => {
        const owner = stateRef.current.key;
        if (owner !== "demo") {
          const session = await request<{ user?: { id: string } } | null>("/api/auth/get-session", {
            signal: AbortSignal.timeout(5000),
          });
          if (queueOwnerMatches(owner, session?.user?.id))
            await request("/api/auth/sign-out", { method: "POST", body: "{}" });
        }
        closedRef.current = true;
        forgetAssistant();
        await endOfflineSession(owner);
        publish(freshState());
        setPendingCount(0);
        window.location.replace("/sign-in");
      }),
    [enqueue, forgetAssistant, publish],
  );
  const resetDemo = useCallback(
    () =>
      enqueue(async () => {
        if (stateRef.current.key !== "demo") throw new Error("Сброс доступен только в деморежиме.");
        blockedRef.current = null;
        await offlineDb.states.delete("demo");
        await commit(newDemoState());
        setDownloaded(false);
        setPendingCount(0);
      }),
    [enqueue, commit],
  );
  const exportAccount = useCallback(() => {
    const { key, ...data } = stateRef.current;
    void key;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "miron-device-data.json";
    link.click();
    URL.revokeObjectURL(url);
  }, []);
  return (
    <Context.Provider
      value={{
        ...state,
        ownerId: state.key.startsWith("user:") ? state.key.slice(5) : null,
        isReady,
        isDemo,
        isOnline,
        isSending,
        assistantEnabled: isDemo ? true : assistantEnabled,
        assistantLoading,
        assistantError,
        pendingAssistantText,
        error,
        pendingCount,
        downloaded,
        saveProfile,
        completeOnboarding,
        switchCompanion,
        startWorkout,
        recordSet,
        recordTimedSet,
        advanceExercise,
        finishWorkout,
        skipExercise,
        endWorkoutEarly,
        estimateEnergy,
        sendMessage,
        retryAssistant,
        refreshAssistant,
        confirmAssistantAction,
        confirmedAssistantActions,
        downloadWorkout,
        syncPending,
        resetDemo,
        logout,
        exportAccount,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useMiron() {
  const value = useContext(Context);
  if (!value) throw new Error("MironProvider is missing");
  return value;
}
