"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Dumbbell, SlidersHorizontal } from "lucide-react";
import type { CatalogContext, CatalogDirection } from "@/shared/catalog-taxonomy";
import type {
  BuilderBootstrap,
  BuilderInventory,
  BuilderSelectedStep,
  CustomWorkoutSummary,
  CustomWorkoutTemplate,
  SaveBuilderInventory,
  SaveCustomWorkout,
} from "@/shared/workout-builder";
import { BuilderRequestError, builderRequest } from "@/client/workout-builder-api";
import { asksForInventory, standardGymResources } from "@/shared/workout-inventory";
import type {
  PlannerConfig,
  PlannerDay,
  PlannerPreferences,
  PlannerProgram,
  PlannerState,
  PlannerPreview,
} from "@/shared/workout-planner";
import { ContextChoice } from "./context-choice";
import { InventoryChoice } from "./inventory-choice";
import { ExerciseCatalog } from "./exercise-catalog";
import { SelectedWorkout } from "./selected-workout";
import { WorkoutLibrary } from "./workout-library";
import { WorkoutPlanner } from "./workout-planner";
import { directions, places } from "./choices";
import styles from "./workout-builder.module.css";

type View = "library" | "context" | "inventory" | "compose" | "planner";

export function WorkoutBuilder({
  initialTheme = "dark",
  backHref = "/programs",
  initialMode,
  initialAssistantConfig,
  assistantConfigInvalid = false,
}: {
  initialTheme?: "dark" | "rose";
  backHref?: string;
  initialMode?: "single" | "program";
  initialAssistantConfig?: PlannerConfig;
  assistantConfigInvalid?: boolean;
}) {
  const [bootstrap, setBootstrap] = useState<BuilderBootstrap | null>(null);
  const [templates, setTemplates] = useState<CustomWorkoutSummary[]>([]);
  const [planner, setPlanner] = useState<PlannerState | null>(null);
  const [assistantPreview, setAssistantPreview] = useState<PlannerPreview | null>(null);
  const [assistantConfig, setAssistantConfig] = useState(initialAssistantConfig);
  const assistantApplied = useRef(false);
  const [workflow, setWorkflow] = useState<"manual" | "planner">(
    initialMode ? "planner" : "manual",
  );
  const [plannerInitialConfirmed, setPlannerInitialConfirmed] = useState(false);
  const [plannerInitialMode, setPlannerInitialMode] = useState<PlannerConfig["mode"]>(
    initialMode ?? "program",
  );
  const [copySource, setCopySource] = useState("");
  const [view, setView] = useState<View>(initialMode ? "context" : "library");
  const [place, setPlace] = useState<CatalogContext | null>(null);
  const [direction, setDirection] = useState<CatalogDirection | null>(null);
  const [inventory, setInventory] = useState<BuilderInventory | null>(null);
  const [identity, setIdentity] = useState<{ id: string; revision: number } | null>(null);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<BuilderSelectedStep[]>([]);
  const [mobileTab, setMobileTab] = useState<"catalog" | "selected">("catalog");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CustomWorkoutSummary | null>(null);
  const requestGuard = useRef(false);
  const saveAttempt = useRef<{ signature: string; input: SaveCustomWorkout } | null>(null);
  const inventoryAttempt = useRef<{ signature: string; input: SaveBuilderInventory } | null>(null);
  const deleteAttempt = useRef<{ id: string; revision: number; operationId: string } | null>(null);
  const owner = useRef<string | null>(null);
  const loadVersion = useRef(0);
  const main = useRef<HTMLElement>(null);
  const requireAuth = useCallback(() => {
    owner.current = null;
    loadVersion.current += 1;
    setBootstrap(null);
    setTemplates([]);
    setPlanner(null);
    setAssistantPreview(null);
    setAssistantConfig(undefined);
    setCopySource("");
    setWorkflow("manual");
    setSteps([]);
    setName("");
    setIdentity(null);
    setInventory(null);
    setAuthRequired(true);
    setLoading(false);
    setDeleteTarget(null);
    setNotice("");
    setError("");
    setPlace(null);
    setDirection(null);
    setView("library");
    saveAttempt.current = null;
    inventoryAttempt.current = null;
    deleteAttempt.current = null;
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const version = ++loadVersion.current;
      try {
        const value = await builderRequest<BuilderBootstrap>("", { signal });
        if (signal?.aborted || version !== loadVersion.current) return;
        if (owner.current && owner.current !== value.ownerId) {
          requireAuth();
          return;
        }
        owner.current = value.ownerId;
        const assistantInventory =
          initialAssistantConfig && !assistantApplied.current
            ? value.inventories.find((item) => item.place === initialAssistantConfig.place)
            : undefined;
        const [library, planning, proposed] = await Promise.all([
          builderRequest<{ templates: CustomWorkoutSummary[] }>(
            "/templates",
            { signal },
            value.ownerId,
          ),
          builderRequest<PlannerState>("/planner/state", { signal }, value.ownerId),
          initialAssistantConfig && assistantInventory
            ? builderRequest<PlannerPreview>(
                "/planner/preview",
                { method: "POST", signal, body: JSON.stringify(initialAssistantConfig) },
                value.ownerId,
              )
            : Promise.resolve(null),
        ]);
        if (signal?.aborted || version !== loadVersion.current || owner.current !== value.ownerId)
          return;
        setBootstrap(value);
        setInventory((previous) =>
          previous
            ? (value.inventories.find((item) => item.place === previous.place) ?? previous)
            : null,
        );
        setTemplates(library.templates);
        setPlanner((previous) => {
          if (!previous) return planning;
          const keepPreferences = previous.preferences.revision > planning.preferences.revision;
          return {
            ...planning,
            preferences: keepPreferences ? previous.preferences : planning.preferences,
            excludedExercises: keepPreferences
              ? previous.excludedExercises
              : planning.excludedExercises,
            program:
              (previous.program?.revision ?? 0) > (planning.program?.revision ?? 0)
                ? previous.program
                : planning.program,
            single:
              (previous.single?.revision ?? 0) > (planning.single?.revision ?? 0)
                ? previous.single
                : planning.single,
          };
        });
        setAuthRequired(false);
        setError("");
        if (initialAssistantConfig && !assistantApplied.current) {
          assistantApplied.current = true;
          setPlace(initialAssistantConfig.place);
          setDirection(initialAssistantConfig.direction);
          setWorkflow("planner");
          setPlannerInitialMode(initialAssistantConfig.mode);
          setPlannerInitialConfirmed(false);
          setInventory(assistantInventory ?? null);
          setAssistantPreview(proposed);
          setView(proposed && assistantInventory ? "planner" : "context");
          setNotice(
            proposed
              ? "Черновик из разговора пересобран по текущим данным. Проверь состав перед подтверждением."
              : "Условия из разговора подготовлены. Проверь их и свой инвентарь, затем открой подбор.",
          );
        }
      } catch (cause) {
        if (signal?.aborted || version !== loadVersion.current) return;
        if (
          cause instanceof BuilderRequestError &&
          (cause.status === 401 || cause.status === 403 || cause.code === "OWNER_CHANGED")
        )
          requireAuth();
        else setError(cause instanceof Error ? cause.message : "Не удалось загрузить библиотеку.");
      } finally {
        if (!signal?.aborted && version === loadVersion.current) setLoading(false);
      }
    },
    [requireAuth, initialAssistantConfig],
  );
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) return load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    const controller = new AbortController();
    const recheck = () => {
      if (document.visibilityState === "visible" && owner.current) void load(controller.signal);
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      controller.abort();
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [load]);
  useEffect(() => {
    const title = main.current?.querySelector("h1");
    if (title) {
      title.tabIndex = -1;
      title.focus({ preventScroll: true });
    }
  }, [view, loading, authRequired]);
  useEffect(() => {
    if (view === "library" || !steps.length) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [view, steps.length]);

  function changeView(next: View) {
    setError("");
    setNotice("");
    setView(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (requestGuard.current) return;
    requestGuard.current = true;
    setBusy(true);
    setError("");
    try {
      return await work();
    } catch (cause) {
      if (
        cause instanceof BuilderRequestError &&
        (cause.status === 401 || cause.status === 403 || cause.code === "OWNER_CHANGED")
      )
        requireAuth();
      else setError(cause instanceof Error ? cause.message : "Не получилось. Повтори попытку.");
    } finally {
      requestGuard.current = false;
      setBusy(false);
    }
  }
  function create() {
    setAssistantPreview(null);
    setAssistantConfig(undefined);
    setWorkflow("manual");
    setCopySource("");
    setIdentity({ id: crypto.randomUUID(), revision: 0 });
    setName("");
    setSteps([]);
    setPlace(null);
    setDirection(null);
    setInventory(null);
    saveAttempt.current = null;
    inventoryAttempt.current = null;
    setMobileTab("catalog");
    changeView("context");
  }
  function pickPlanner(mode: PlannerConfig["mode"] = "program", confirmed = false) {
    setAssistantPreview(null);
    setAssistantConfig(undefined);
    if (!bootstrap || !planner) return;
    setWorkflow("planner");
    setPlannerInitialConfirmed(confirmed);
    setPlannerInitialMode(mode);
    setSteps([]);
    setName("");
    setIdentity(null);
    setCopySource("");
    const saved = mode === "single" ? planner.single : planner.program;
    if (confirmed && saved) {
      setPlace(saved.draft.config.place);
      setDirection(saved.draft.config.direction);
      const known = bootstrap.inventories.find((item) => item.place === saved.draft.config.place);
      setInventory(known ?? null);
      changeView(known ? "planner" : "inventory");
    } else {
      setPlace(null);
      setDirection(null);
      setInventory(null);
      changeView("context");
    }
  }
  function copyPlannerDay(day: PlannerDay, config: PlannerConfig) {
    setAssistantPreview(null);
    setAssistantConfig(undefined);
    if (!bootstrap) return;
    const known = bootstrap.inventories.find((item) => item.place === config.place);
    setWorkflow("manual");
    setIdentity({ id: crypto.randomUUID(), revision: 0 });
    setName(`${day.title.slice(0, 62)} — моя копия`);
    setSteps(
      day.steps.map(
        ({
          exercise,
          revisionId,
          sets,
          target,
          restSeconds,
          pairKey,
          transitionSeconds,
          dropSet,
          phase,
        }) => ({
          exercise,
          revisionId,
          sets,
          target,
          restSeconds,
          pairKey,
          transitionSeconds,
          dropSet,
          phase,
        }),
      ),
    );
    setPlace(config.place);
    setDirection(config.direction);
    setInventory(known ?? null);
    setCopySource(day.title);
    setMobileTab("selected");
    saveAttempt.current = null;
    changeView(known ? "compose" : "inventory");
  }
  async function plannerRequest<T>(path: string, options?: RequestInit): Promise<T | undefined> {
    if (!bootstrap) return;
    const currentOwner = bootstrap.ownerId;
    const result = await run(() => builderRequest<T>(path, options, currentOwner));
    return owner.current === currentOwner ? result : undefined;
  }
  function plannerPreferences(
    preferences: PlannerPreferences,
    named?: { variantId: string; name: string },
  ) {
    setPlanner((previous) =>
      previous
        ? {
            ...previous,
            preferences,
            excludedExercises: [
              ...previous.excludedExercises.filter(
                (item) =>
                  preferences.excludedVariantIds.includes(item.variantId) &&
                  item.variantId !== named?.variantId,
              ),
              ...(named && preferences.excludedVariantIds.includes(named.variantId) ? [named] : []),
            ],
          }
        : null,
    );
  }
  function plannerConfirmed(program: PlannerProgram, mode: PlannerConfig["mode"]) {
    setPlanner((previous) =>
      previous ? { ...previous, [mode === "single" ? "single" : "program"]: program } : null,
    );
  }
  async function saveInventory(resources: BuilderInventory["resources"]) {
    if (!place || !bootstrap) return;
    const currentOwner = bootstrap.ownerId;
    const expectedRevision =
      bootstrap.inventories.find((item) => item.place === place)?.revision ?? 0;
    // Keep the original operation after a lost ACK even if a background read sees its revision.
    const signature = JSON.stringify({ place, resources });
    if (inventoryAttempt.current?.signature !== signature)
      inventoryAttempt.current = {
        signature,
        input: { operationId: crypto.randomUUID(), place, expectedRevision, resources },
      };
    const value = await run(() =>
      builderRequest<BuilderInventory>(
        "/inventory",
        { method: "PUT", body: JSON.stringify(inventoryAttempt.current?.input) },
        currentOwner,
      ),
    );
    if (!value || owner.current !== currentOwner) return;
    const newer = bootstrap.inventories.find(
      (item) => item.place === value.place && item.revision > value.revision,
    );
    const confirmed = newer ?? value;
    setBootstrap((previous) =>
      previous &&
      !previous.inventories.some(
        (item) => item.place === value.place && item.revision > confirmed.revision,
      )
        ? {
            ...previous,
            inventories: [
              ...previous.inventories.filter((item) => item.place !== confirmed.place),
              confirmed,
            ],
          }
        : previous,
    );
    setInventory((previous) =>
      previous?.place === confirmed.place && previous.revision > confirmed.revision
        ? previous
        : confirmed,
    );
    inventoryAttempt.current = null;
    changeView(workflow === "planner" ? "planner" : "compose");
  }
  async function continueContext() {
    if (!place || !direction || !bootstrap) return;
    // A refresh after a lost ACK must not bypass the original command's replay.
    if (inventoryAttempt.current?.input.place === place) {
      await saveInventory(inventoryAttempt.current.input.resources);
      return;
    }
    const known = bootstrap.inventories.find((item) => item.place === place);
    if (place === "gym") {
      const standard = standardGymResources(bootstrap.resources);
      if (
        !known ||
        standard.some(
          (resource) =>
            !known.resources.some(
              (item) =>
                item.code === resource.code &&
                item.quantity >= resource.quantity &&
                item.isStable === resource.isStable,
            ),
        )
      ) {
        await saveInventory([
          ...(known?.resources.filter(
            (item) => !standard.some((resource) => resource.code === item.code),
          ) ?? []),
          ...standard,
        ]);
        return;
      }
    }
    if (known) {
      setInventory(known);
      changeView(workflow === "planner" ? "planner" : "compose");
      return;
    }
    const previous = bootstrap.previousInventories?.find(
      (item) => item.place === place && item.supportsConfirmed,
    );
    if (previous) {
      await saveInventory(previous.resources);
      return;
    }
    if (!asksForInventory(place, direction)) {
      await saveInventory([]);
      return;
    }
    changeView("inventory");
  }
  async function edit(id: string, copy = false) {
    setAssistantPreview(null);
    setAssistantConfig(undefined);
    if (!bootstrap) return;
    const currentOwner = bootstrap.ownerId;
    const template = await run(() =>
      builderRequest<CustomWorkoutTemplate>(`/templates/${id}`, undefined, currentOwner),
    );
    if (!template || owner.current !== currentOwner) return;
    setWorkflow("manual");
    setCopySource("");
    setIdentity({
      id: copy ? crypto.randomUUID() : template.id,
      revision: copy ? 0 : template.revision,
    });
    setName(copy ? `${template.name.slice(0, 70)} — копия` : template.name);
    setSteps(template.steps);
    setPlace(template.place);
    setDirection(template.direction);
    setMobileTab("selected");
    saveAttempt.current = null;
    const known = bootstrap.inventories.find((item) => item.place === template.place);
    setInventory(known ?? null);
    changeView(known ? "compose" : "inventory");
  }
  async function save() {
    if (!identity || !bootstrap || !place || !direction || !inventory) return;
    const currentOwner = bootstrap.ownerId;
    const payload = {
      id: identity.id,
      expectedRevision: identity.revision,
      name: name.trim(),
      place,
      direction,
      inventoryRevision: inventory.revision,
      steps: steps.map(
        ({
          revisionId,
          sets,
          target,
          restSeconds,
          pairKey,
          transitionSeconds,
          dropSet,
          phase,
        }) => ({
          revisionId,
          sets,
          target,
          restSeconds,
          ...(phase ? { phase } : {}),
          ...(pairKey ? { pairKey, transitionSeconds: transitionSeconds ?? 30 } : {}),
          ...(dropSet ? { dropSet } : {}),
        }),
      ),
    };
    const signature = JSON.stringify(payload);
    if (saveAttempt.current?.signature !== signature)
      saveAttempt.current = { signature, input: { ...payload, operationId: crypto.randomUUID() } };
    const value = await run(() =>
      builderRequest<CustomWorkoutTemplate>(
        "/templates",
        { method: "POST", body: JSON.stringify(saveAttempt.current?.input) },
        currentOwner,
      ),
    );
    if (!value || owner.current !== currentOwner) return;
    setTemplates((previous) => [value, ...previous.filter((item) => item.id !== value.id)]);
    setIdentity({ id: value.id, revision: value.revision });
    saveAttempt.current = null;
    changeView("library");
    setNotice(`«${value.name}» сохранена в твоей библиотеке.`);
  }
  async function remove() {
    if (!deleteTarget || !bootstrap) return;
    const currentOwner = bootstrap.ownerId;
    if (
      deleteAttempt.current?.id !== deleteTarget.id ||
      deleteAttempt.current?.revision !== deleteTarget.revision
    )
      deleteAttempt.current = {
        id: deleteTarget.id,
        revision: deleteTarget.revision,
        operationId: crypto.randomUUID(),
      };
    const value = await run(() =>
      builderRequest<{ deleted: true }>(
        `/templates/${deleteTarget.id}`,
        {
          method: "DELETE",
          body: JSON.stringify({
            operationId: deleteAttempt.current?.operationId,
            expectedRevision: deleteTarget.revision,
          }),
        },
        currentOwner,
      ),
    );
    if (!value || owner.current !== currentOwner) return;
    setTemplates((previous) => previous.filter((item) => item.id !== deleteTarget.id));
    setDeleteTarget(null);
    deleteAttempt.current = null;
    setNotice("Тренировка удалена из библиотеки.");
  }
  function back() {
    setAssistantPreview(null);
    if (view === "compose" || view === "planner") {
      setInventory(null);
      changeView("context");
    } else if (view === "inventory") changeView("context");
    else {
      changeView("library");
      setSteps([]);
    }
  }
  return (
    <div className={styles.shell} data-theme={bootstrap?.theme ?? initialTheme}>
      <a href="#builder-main" className={styles.skipLink}>
        К конструктору
      </a>
      <header className={styles.header}>
        <Link href={backHref} aria-label="MIRON, вернуться">
          <Image
            className={styles.wordmark}
            src="/brand/wordmark.webp"
            alt="MIRON"
            width={500}
            height={69}
            sizes="155px"
            priority
          />
        </Link>
        <span className={styles.headerCaption}>Свой темп. Своя сборка.</span>
        <Link className={styles.backLink} href={backHref}>
          <ArrowLeft size={18} aria-hidden="true" />
          <span>В MIRON</span>
        </Link>
      </header>
      <main ref={main} id="builder-main" className={styles.main}>
        <div className={styles.viewHeading}>
          {!loading && !authRequired && view !== "library" ? (
            <button type="button" className={styles.backLink} onClick={back} disabled={busy}>
              <ArrowLeft size={18} aria-hidden="true" />
              {view === "context" ? "К библиотеке" : "Твои условия"}
            </button>
          ) : null}
        </div>
        {notice ? (
          <p className={styles.success} role="status">
            <Check size={19} aria-hidden="true" />
            {notice}
          </p>
        ) : null}
        {error ? (
          <div className={styles.notice} role="alert">
            <p>{error}</p>
            <button
              type="button"
              className={styles.secondary}
              disabled={busy}
              onClick={() => void load()}
            >
              Обновить данные
            </button>
          </div>
        ) : null}
        {assistantConfigInvalid && !loading && !authRequired ? (
          <p className={styles.notice} role="alert">
            Не удалось прочитать условия из разговора. Выбери условия занятия заново.
          </p>
        ) : null}
        {loading ? (
          <p className={styles.loading} role="status">
            Загружаем твою библиотеку…
          </p>
        ) : authRequired ? (
          <section className={styles.authGate}>
            <Dumbbell size={36} aria-hidden="true" />
            <p className={styles.eyebrow}>Личная библиотека</p>
            <h1>
              Твои тренировки <span>останутся с тобой.</span>
            </h1>
            <p className={styles.lead}>
              Войди в аккаунт, чтобы сохранить инвентарь и собственные тренировки и открывать их на
              разных устройствах.
            </p>
            <Link href="/sign-in?next=/workout-builder" className={styles.primary}>
              Войти и собрать тренировку
              <ArrowRight size={20} aria-hidden="true" />
            </Link>
          </section>
        ) : bootstrap ? (
          <>
            {view === "library" ? (
              <WorkoutLibrary
                templates={templates}
                busy={busy}
                onCreate={create}
                planner={planner}
                onPick={() => pickPlanner()}
                onOpenProgram={(mode) => pickPlanner(mode, true)}
                onEdit={(id) => void edit(id)}
                onCopy={(id) => void edit(id, true)}
                onDelete={setDeleteTarget}
              />
            ) : null}
            {deleteTarget ? (
              <section className={styles.notice} aria-label="Подтверждение удаления">
                <p>Удалить «{deleteTarget.name}» из личной библиотеки?</p>
                <div className={styles.inlineActions}>
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={busy}
                    onClick={() => setDeleteTarget(null)}
                  >
                    Оставить
                  </button>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={busy}
                    onClick={() => void remove()}
                  >
                    Удалить тренировку
                  </button>
                </div>
              </section>
            ) : null}
            {view === "context" ? (
              <ContextChoice
                place={place}
                direction={direction}
                busy={busy}
                planning={workflow === "planner"}
                onSelect={(nextPlace, nextDirection) => {
                  if (nextPlace !== place || nextDirection !== direction) {
                    setAssistantPreview(null);
                    setSteps([]);
                    setInventory(null);
                  }
                  setPlace(nextPlace);
                  setDirection(nextDirection);
                }}
                onContinue={() => void continueContext()}
              />
            ) : null}
            {view === "inventory" && place && direction ? (
              <InventoryChoice
                key={`${place}:${direction}`}
                place={place}
                direction={direction}
                placeName={places.find((item) => item.id === place)?.name ?? ""}
                options={bootstrap.resources}
                initial={
                  inventory?.resources ??
                  bootstrap.inventories.find((item) => item.place === place)?.resources ??
                  bootstrap.previousInventories?.find((item) => item.place === place)?.resources ??
                  []
                }
                busy={busy}
                onSave={(resources) => void saveInventory(resources)}
              />
            ) : null}
            {view === "planner" && planner && place && direction && inventory ? (
              <WorkoutPlanner
                key={`${bootstrap.ownerId}:${place}:${direction}`}
                bootstrap={bootstrap}
                state={planner}
                inventoryRevision={inventory.revision}
                place={place}
                direction={direction}
                busy={busy}
                initialConfirmed={plannerInitialConfirmed}
                initialMode={plannerInitialMode}
                initialAssistantConfig={
                  assistantConfig?.place === place && assistantConfig.direction === direction
                    ? assistantConfig
                    : undefined
                }
                initialAssistantPreview={assistantPreview}
                request={plannerRequest}
                onPreferences={plannerPreferences}
                onConfirmed={plannerConfirmed}
                onCopy={copyPlannerDay}
                onInventory={() => changeView("inventory")}
              />
            ) : null}
            {view === "compose" && place && direction && inventory ? (
              <div className={styles.scene}>
                {copySource ? (
                  <p className={styles.notice}>
                    Отдельная копия «{copySource}». Дай ей своё название и сохрани в личную
                    библиотеку. Правки копии не меняют подтверждённую программу.
                  </p>
                ) : null}
                <div className={styles.composeHeading}>
                  <div>
                    <p className={styles.eyebrow}>03 / Твоя тренировка</p>
                    <h1>
                      Добавь <span>свои упражнения.</span>
                    </h1>
                    <p className={styles.lead}>
                      {places.find((item) => item.id === place)?.name} ·{" "}
                      {directions.find((item) => item.id === direction)?.name} · только доступный
                      инвентарь
                    </p>
                  </div>
                  {place !== "gym" ? (
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={busy}
                      onClick={() => changeView("inventory")}
                    >
                      <SlidersHorizontal size={18} aria-hidden="true" />
                      Изменить инвентарь
                    </button>
                  ) : (
                    <p className={styles.muted}>Стандартное оснащение зала</p>
                  )}
                </div>
                <div className={styles.mobileTabs} role="group" aria-label="Раздел конструктора">
                  <button
                    type="button"
                    aria-pressed={mobileTab === "catalog"}
                    onClick={() => setMobileTab("catalog")}
                  >
                    Каталог
                  </button>
                  <button
                    type="button"
                    aria-pressed={mobileTab === "selected"}
                    onClick={() => setMobileTab("selected")}
                  >
                    Твоя сборка · {steps.length}
                  </button>
                </div>
                <div className={styles.composer}>
                  <div className={styles.catalogPane} data-active={mobileTab === "catalog"}>
                    <ExerciseCatalog
                      ownerId={bootstrap.ownerId}
                      busy={busy}
                      place={place}
                      direction={direction}
                      inventoryRevision={inventory.revision}
                      muscles={bootstrap.muscles}
                      selected={steps.map((step) => step.revisionId)}
                      onUnauthorized={requireAuth}
                      onAdd={(exercise) => {
                        if (
                          steps.length >= 40 ||
                          steps.some((step) => step.revisionId === exercise.revisionId)
                        )
                          return;
                        setSteps((previous) => [
                          ...previous,
                          {
                            exercise,
                            revisionId: exercise.revisionId,
                            sets: exercise.metric === "time" ? 1 : 3,
                            target: exercise.metric === "time" ? 30 : 10,
                            restSeconds: exercise.metric === "time" ? 30 : 90,
                          },
                        ]);
                      }}
                    />
                  </div>
                  <div className={styles.selectionPane} data-active={mobileTab === "selected"}>
                    <SelectedWorkout
                      name={name}
                      steps={steps}
                      busy={busy}
                      onName={setName}
                      onChange={(index, field, value) =>
                        setSteps((previous) =>
                          previous.map((step, position) =>
                            position === index ||
                            (previous[index].pairKey &&
                              step.pairKey === previous[index].pairKey &&
                              field !== "target")
                              ? { ...step, [field]: value }
                              : step,
                          ),
                        )
                      }
                      onMove={(index, delta) =>
                        setSteps((previous) => {
                          const next = [...previous];
                          [next[index], next[index + delta]] = [next[index + delta], next[index]];
                          return next;
                        })
                      }
                      onRemove={(index) =>
                        setSteps((previous) =>
                          previous
                            .filter((_, position) => position !== index)
                            .map((step) => {
                              if (
                                !previous[index].pairKey ||
                                step.pairKey !== previous[index].pairKey
                              )
                                return step;
                              const {
                                pairKey: removedPair,
                                transitionSeconds: removedTransition,
                                ...unpaired
                              } = step;
                              void removedPair;
                              void removedTransition;
                              return unpaired;
                            }),
                        )
                      }
                      onUnpair={(pairKey) =>
                        setSteps((previous) =>
                          previous.map((step) => {
                            if (step.pairKey !== pairKey) return step;
                            const {
                              pairKey: removedPair,
                              transitionSeconds: removedTransition,
                              ...unpaired
                            } = step;
                            void removedPair;
                            void removedTransition;
                            return unpaired;
                          }),
                        )
                      }
                      allowDropSets={
                        direction === "strength" && bootstrap?.dropSetsAvailable === true
                      }
                      onDropSet={(index, enabled) =>
                        setSteps((previous) =>
                          previous.map((step, position) => ({
                            ...step,
                            dropSet:
                              position === index && enabled
                                ? { kind: "last_set_drop", targetReps: 8 }
                                : enabled
                                  ? undefined
                                  : position === index
                                    ? undefined
                                    : step.dropSet,
                          })),
                        )
                      }
                      onSave={() => void save()}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </main>
      <footer className={styles.footer}>Свой темп. Своя история.</footer>
    </div>
  );
}
