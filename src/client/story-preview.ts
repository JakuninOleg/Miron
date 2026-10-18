"use client";

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { STORY_INTERESTS, STORY_LOCATIONS, STORY_PANELS } from "@/shared/story-content";
import type { CompanionId } from "@/shared/contracts";
import type { CompleteOnboardingInput } from "@/shared/onboarding";

export const STORY_PREVIEW_KEY = "miron:story-preview:v2";
const STORY_FLOW_VERSION = 3;
const ACCOUNT_STORY_VERSION = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type StoryPreviewState = {
  step: number;
  interests: string[];
  locations: string[];
  companion: "max" | "lika" | null;
  completed: boolean;
};
const initial: StoryPreviewState = {
  step: 0,
  interests: [],
  locations: [],
  companion: null,
  completed: false,
};

export function parseStoryPreview(raw: string | null): StoryPreviewState {
  if (!raw) return { ...initial, interests: [] };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return { ...initial, interests: [] };
    const input = value as Record<string, unknown>;
    const companion =
      input.companion === "max" || input.companion === "lika" ? input.companion : null;
    const allowed = new Set<string>(STORY_INTERESTS.map((item) => item.id));
    allowed.add("explore");
    // Retain older saved preferences while the new UI offers five directions.
    allowed.add("fitness");
    const allowedLocations = new Set<string>(STORY_LOCATIONS.map((item) => item.id));
    const chooseStep = STORY_PANELS.findIndex((panel) => panel.kind === "choose");
    const storedStep =
      typeof input.step === "number" && Number.isInteger(input.step) ? Math.max(0, input.step) : 0;
    // The removed location scene was index 4 in the previous eight-scene flow.
    const requestedStep = Math.min(
      STORY_PANELS.length - 1,
      input.flowVersion !== STORY_FLOW_VERSION && storedStep > 4 ? storedStep - 1 : storedStep,
    );
    return {
      step: !companion && requestedStep > chooseStep ? chooseStep : requestedStep,
      interests: Array.isArray(input.interests)
        ? [
            ...new Set(
              input.interests.filter(
                (id): id is string => typeof id === "string" && allowed.has(id),
              ),
            ),
          ]
        : [],
      companion,
      locations: Array.isArray(input.locations)
        ? [
            ...new Set(
              input.locations.filter(
                (id): id is string => typeof id === "string" && allowedLocations.has(id),
              ),
            ),
          ]
        : [],
      completed: input.completed === true && companion !== null,
    };
  } catch {
    return { ...initial, interests: [] };
  }
}

type StoryPreferences = { companion: CompanionId; interests?: readonly string[] };
type StorySession =
  | {
      mode: "account";
      ownerId: string;
      preferences: StoryPreferences;
      onComplete: (input: CompleteOnboardingInput) => Promise<void>;
    }
  | { mode: "replay"; ownerId: string; preferences: StoryPreferences };
type AccountStoryDraft = {
  state: StoryPreviewState;
  pendingCompletion: CompleteOnboardingInput | null;
};

/** Account drafts never read or write the public design-preview key. */
export function accountStoryStorageKey(ownerId: string) {
  return `miron:account-onboarding:v1:${encodeURIComponent(ownerId)}`;
}

function preferenceState(preferences?: StoryPreferences): StoryPreviewState {
  return parseStoryPreview(
    JSON.stringify({
      ...initial,
      companion: preferences?.companion ?? null,
      interests: preferences?.interests ?? [],
      flowVersion: STORY_FLOW_VERSION,
    }),
  );
}

export function parseAccountStoryDraft(
  raw: string | null,
  ownerId: string,
  preferences: StoryPreferences,
): AccountStoryDraft {
  const fresh = () => ({ state: preferenceState(preferences), pendingCompletion: null });
  if (!raw) return fresh();
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return fresh();
    const input = value as Record<string, unknown>;
    if (input.ownerId !== ownerId || input.version !== ACCOUNT_STORY_VERSION) return fresh();
    const state = { ...parseStoryPreview(raw), completed: false };
    const pending = input.pendingCompletion;
    if (!pending || typeof pending !== "object") return { state, pendingCompletion: null };
    const candidate = pending as Record<string, unknown>;
    const validInterests = new Set<string>([
      ...STORY_INTERESTS.map((item) => item.id),
      "explore",
      "fitness",
    ]);
    if (
      typeof candidate.operationId !== "string" ||
      !UUID.test(candidate.operationId) ||
      (candidate.companion !== "max" && candidate.companion !== "lika") ||
      candidate.adultConfirmed !== true ||
      !Array.isArray(candidate.interests) ||
      candidate.interests.length > validInterests.size ||
      !candidate.interests.every((id) => typeof id === "string" && validInterests.has(id)) ||
      new Set(candidate.interests).size !== candidate.interests.length
    )
      return { state, pendingCompletion: null };
    const pendingCompletion: CompleteOnboardingInput = {
      operationId: candidate.operationId,
      companion: candidate.companion,
      interests: candidate.interests as string[],
      adultConfirmed: true,
    };
    // A request with an uncertain outcome resumes with the exact same payload and ID.
    return {
      state: {
        ...state,
        step: STORY_PANELS.length - 1,
        companion: pendingCompletion.companion,
        interests: [...pendingCompletion.interests],
      },
      pendingCompletion,
    };
  } catch {
    return fresh();
  }
}

export function serializeAccountStoryDraft(
  ownerId: string,
  state: StoryPreviewState,
  pendingCompletion: CompleteOnboardingInput | null,
) {
  return JSON.stringify({
    ...state,
    completed: false,
    ownerId,
    version: ACCOUNT_STORY_VERSION,
    flowVersion: STORY_FLOW_VERSION,
    pendingCompletion,
  });
}

function useStoryPreviewState(session?: StorySession) {
  const [state, setState] = useState<StoryPreviewState>(() =>
    preferenceState(session?.preferences),
  );
  const [ready, setReady] = useState(false);
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const currentState = useRef(state);
  const pendingCompletion = useRef<CompleteOnboardingInput | null>(null);
  const completingRef = useRef(false);
  const alive = useRef(true);
  const sessionRef = useRef(session);
  useEffect(() => {
    alive.current = true;
    const scope = sessionRef.current;
    let saved = preferenceState(scope?.preferences);
    try {
      if (!scope) saved = parseStoryPreview(localStorage.getItem(STORY_PREVIEW_KEY));
      else if (scope.mode === "account") {
        const draft = parseAccountStoryDraft(
          localStorage.getItem(accountStoryStorageKey(scope.ownerId)),
          scope.ownerId,
          scope.preferences,
        );
        saved = draft.state;
        pendingCompletion.current = draft.pendingCompletion;
      }
    } catch {
      /* Storage may be disabled. */
    }
    // Hydration reads only the route's public or owner-scoped staging preferences.
    setState(saved);
    currentState.current = saved;
    setAdultConfirmed(pendingCompletion.current?.adultConfirmed === true);
    setReady(true);
    return () => {
      alive.current = false;
    };
  }, []);
  function persist(next: StoryPreviewState) {
    const scope = sessionRef.current;
    if (scope?.mode === "replay") return;
    try {
      localStorage.setItem(
        scope ? accountStoryStorageKey(scope.ownerId) : STORY_PREVIEW_KEY,
        scope
          ? serializeAccountStoryDraft(scope.ownerId, next, pendingCompletion.current)
          : JSON.stringify({ ...next, flowVersion: STORY_FLOW_VERSION }),
      );
    } catch {
      /* The story still works without persistence. */
    }
  }
  function update(change: (previous: StoryPreviewState) => StoryPreviewState) {
    if (completingRef.current) return;
    const next = change(currentState.current);
    currentState.current = next;
    setState(next);
    persist(next);
  }
  async function complete(): Promise<boolean> {
    const scope = sessionRef.current;
    const current = currentState.current;
    if (!current.companion || completingRef.current) return false;
    if (scope?.mode !== "account") {
      update((previous) => ({ ...previous, completed: true }));
      return true;
    }
    if (!adultConfirmed) {
      setCompletionError("Подтверди, что тебе уже исполнилось 18 лет.");
      return false;
    }
    completingRef.current = true;
    setCompleting(true);
    setCompletionError(null);
    try {
      pendingCompletion.current ??= {
        operationId: crypto.randomUUID(),
        companion: current.companion,
        interests: [...current.interests],
        adultConfirmed: true,
      };
      persist(current);
      await scope.onComplete(pendingCompletion.current);
      try {
        localStorage.removeItem(accountStoryStorageKey(scope.ownerId));
      } catch {
        /* The confirmed server profile is authoritative on the next visit. */
      }
      if (!alive.current) return false;
      const completed = { ...current, completed: true };
      currentState.current = completed;
      setState(completed);
      return true;
    } catch (cause) {
      if (alive.current)
        setCompletionError(
          cause instanceof Error
            ? cause.message
            : "Не удалось сохранить знакомство. Попробуй ещё раз.",
        );
      return false;
    } finally {
      completingRef.current = false;
      if (alive.current) setCompleting(false);
    }
  }
  return {
    ready,
    state,
    mode: session?.mode ?? "preview",
    adultConfirmed,
    setAdultConfirmed,
    completing,
    completionError,
    goToStep: (step: number) =>
      update((previous) => ({
        ...previous,
        step: Math.max(0, Math.min(STORY_PANELS.length - 1, step)),
      })),
    toggleInterest: (id: string) =>
      update((previous) =>
        id === "explore" || STORY_INTERESTS.some((item) => item.id === id)
          ? {
              ...previous,
              interests: previous.interests.includes(id)
                ? previous.interests.filter((item) => item !== id)
                : [...previous.interests, id],
            }
          : previous,
      ),
    selectCompanion: (companion: "max" | "lika") =>
      update((previous) => ({ ...previous, companion })),
    complete,
    replay: () => update(() => ({ ...initial, interests: [], locations: [] })),
  };
}

const StoryPreviewContext = createContext<ReturnType<typeof useStoryPreviewState> | null>(null);

/** Route-scoped state survives navigation even when browser storage is unavailable. */
export function StoryPreviewProvider({
  children,
  session,
}: {
  children: ReactNode;
  session?: StorySession;
}) {
  return createElement(
    StoryStateProvider,
    { key: session ? `${session.mode}:${session.ownerId}` : "preview", session },
    children,
  );
}

function StoryStateProvider({
  children,
  session,
}: {
  children?: ReactNode;
  session?: StorySession;
}) {
  const story = useStoryPreviewState(session);
  return createElement(StoryPreviewContext.Provider, { value: story }, children);
}

export function useStoryPreview() {
  const story = useContext(StoryPreviewContext);
  if (!story) throw new Error("Story preview requires its route-scoped provider");
  return story;
}
