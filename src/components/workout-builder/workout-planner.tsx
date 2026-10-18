import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, SlidersHorizontal, X } from "lucide-react";
import type { CatalogContext, CatalogDirection } from "@/shared/catalog-taxonomy";
import type { BuilderBootstrap } from "@/shared/workout-builder";
import type { Workout } from "@/shared/contracts";
import { builderDurationLabel } from "@/shared/workout-builder";
import type {
  PlannerConfig,
  PlannerConfirm,
  PlannerDay,
  PlannerPreferences,
  PlannerPreferencesCommand,
  PlannerPreview,
  PlannerProgram,
  PlannerReplacementOption,
  PlannerState,
  PlannerStep,
} from "@/shared/workout-planner";
import { PlannerConfigForm, plannerFrequencyLabel, plannerSplitNames } from "./planner-config";
import { PlannerDays } from "./planner-days";
import { TrainingMethodologyDetails } from "./training-methodology";
import { directions, places } from "./choices";
import styles from "./workout-builder.module.css";

export type PlannerRequest = <T>(path: string, options?: RequestInit) => Promise<T | undefined>;

function sameVariants(left: string[], right: string[]) {
  return left.length === right.length && left.every((id) => right.includes(id));
}

function ReplacementChooser({
  selection,
  busy,
  returnFocus,
  onChoose,
  onOmit,
  onClose,
}: {
  selection: { day: PlannerDay; step: PlannerStep; options: PlannerReplacementOption[] };
  busy: boolean;
  returnFocus: HTMLElement | null;
  onChoose: (variantId: string) => void;
  onOmit: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      if (element?.open) element.close();
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [returnFocus]);
  function close() {
    dialog.current?.close();
    onClose();
  }
  return (
    <dialog
      ref={dialog}
      className={styles.plannerDialog}
      aria-labelledby="replacement-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className={styles.plannerDayHeading}>
        <h2 id="replacement-title">Замена упражнения</h2>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Закрыть замены"
          onClick={close}
          disabled={busy}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <p className={styles.plannerHint}>
        Вместо «{selection.step.exercise.name}» · {selection.day.title}
      </p>
      <p className={styles.plannerHint}>
        Сравниваем движение, роль и доступный инвентарь. Это не подбор по боли или диагнозу. Замена
        действует только в этом подборе.
      </p>
      {selection.options.length ? (
        <ul className={styles.plannerReplacementList}>
          {selection.options.map((option) => (
            <li key={option.variantId}>
              <strong>{option.name}</strong>
              <p className={styles.plannerHint}>{option.explanation}</p>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={() => onChoose(option.variantId)}
              >
                Использовать<span className={styles.srOnly}> {option.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.notice}>
          Для этого движения нет подходящей равнозначной замены при твоих условиях.
        </p>
      )}
      <button type="button" className={styles.plannerTextButton} disabled={busy} onClick={onOmit}>
        Пропустить только в этом подборе
      </button>
    </dialog>
  );
}

export function WorkoutPlanner({
  bootstrap,
  state,
  inventoryRevision,
  place,
  direction,
  busy,
  initialConfirmed,
  initialMode,
  initialAssistantConfig,
  initialAssistantPreview,
  request,
  onPreferences,
  onConfirmed,
  onCopy,
  onInventory,
}: {
  bootstrap: BuilderBootstrap;
  state: PlannerState;
  inventoryRevision: number;
  place: CatalogContext;
  direction: CatalogDirection;
  busy: boolean;
  initialConfirmed: boolean;
  initialMode: PlannerConfig["mode"];
  initialAssistantConfig?: PlannerConfig;
  initialAssistantPreview?: PlannerPreview | null;
  request: PlannerRequest;
  onPreferences: (
    preferences: PlannerPreferences,
    named?: { variantId: string; name: string },
  ) => void;
  onConfirmed: (program: PlannerProgram, mode: PlannerConfig["mode"]) => void;
  onCopy: (day: PlannerDay, config: PlannerConfig) => void;
  onInventory: () => void;
}) {
  const router = useRouter();
  const [screen, setScreen] = useState<"config" | "preview" | "confirmed">(
    initialConfirmed ? "confirmed" : initialAssistantPreview ? "preview" : "config",
  );
  const [confirmedMode, setConfirmedMode] = useState(initialMode);
  const [config, setConfig] = useState<PlannerConfig>(() => {
    if (initialAssistantConfig && !initialConfirmed) return initialAssistantConfig;
    const saved = (initialMode === "single" ? state.single : state.program)?.draft.config;
    const supportsSplit = direction === "strength" || direction === "calisthenics";
    return {
      ...saved,
      mode: initialMode,
      place,
      direction,
      split: supportsSplit ? (saved?.split ?? "fullbody") : "fullbody",
      daysPerWeek: saved?.daysPerWeek ?? 3,
      intent: saved?.intent ?? "start",
      durationMinutes: saved?.durationMinutes ?? 30,
      execution: supportsSplit ? (saved?.execution ?? "straight") : "straight",
      dropSets: direction === "strength" ? saved?.dropSets : undefined,
      variety: "familiar",
      preferredTemplateId: initialConfirmed ? saved?.preferredTemplateId : undefined,
      replacements: undefined,
      excludeVariantIds: undefined,
    };
  });
  const [preview, setPreview] = useState<PlannerPreview | null>(initialAssistantPreview ?? null);
  const [replacement, setReplacement] = useState<{
    day: PlannerDay;
    step: PlannerStep;
    options: PlannerReplacementOption[];
    returnFocus: HTMLElement | null;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const confirmAttempt = useRef<{ signature: string; input: PlannerConfirm } | null>(null);
  const preferenceAttempt = useRef<{ signature: string; input: PlannerPreferencesCommand } | null>(
    null,
  );
  const startAttempt = useRef<{
    signature: string;
    input: { operationId: string; expectedProgramRevision: number; dayKey: string };
  } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmed = confirmedMode === "single" ? state.single : state.program;
  const previewStale = Boolean(
    preview &&
    (preview.expectedProgramRevision <
      Math.max(state.program?.revision ?? 0, state.single?.revision ?? 0) ||
      preview.preferencesRevision < state.preferences.revision ||
      preview.inventoryRevision < inventoryRevision),
  );
  const effectiveScreen = screen === "preview" && previewStale ? "config" : screen;
  const shown =
    effectiveScreen === "preview"
      ? preview
      : effectiveScreen === "confirmed"
        ? confirmed?.draft
        : null;

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [effectiveScreen]);

  async function makePreview(next = config) {
    const value = await request<PlannerPreview>("/planner/preview", {
      method: "POST",
      body: JSON.stringify(next),
    });
    if (!value) return;
    setConfig(value.config);
    setPreview(value);
    setReplacement(null);
    setScreen("preview");
    confirmAttempt.current = null;
  }

  async function confirm() {
    if (!preview || previewStale) return;
    const payload = {
      expectedProgramRevision: preview.expectedProgramRevision,
      fingerprint: preview.fingerprint,
      config: preview.config,
    };
    const signature = JSON.stringify(payload);
    if (confirmAttempt.current?.signature !== signature)
      confirmAttempt.current = {
        signature,
        input: { ...payload, operationId: crypto.randomUUID() },
      };
    const value = await request<PlannerProgram>("/planner/confirm", {
      method: "POST",
      body: JSON.stringify(confirmAttempt.current.input),
    });
    if (!value) return;
    onConfirmed(value, preview.config.mode);
    setConfirmedMode(preview.config.mode);
    setScreen("confirmed");
    setNotice(
      preview.config.mode === "single"
        ? "Разовое занятие подтверждено. Оно сохранено отдельно от недельной программы."
        : "Программа подтверждена. Можно начать любой из её дней.",
    );
    confirmAttempt.current = null;
  }

  async function changeExclusion(variantId: string, exclude: boolean, name?: string) {
    const excludedVariantIds = exclude
      ? [...new Set([...state.preferences.excludedVariantIds, variantId])]
      : state.preferences.excludedVariantIds.filter((id) => id !== variantId);
    const payload = {
      expectedRevision: state.preferences.revision,
      excludedVariantIds,
      favoriteVariantIds: state.preferences.favoriteVariantIds.filter(
        (id) => !excludedVariantIds.includes(id),
      ),
    };
    const alreadyApplied =
      sameVariants(payload.excludedVariantIds, state.preferences.excludedVariantIds) &&
      sameVariants(payload.favoriteVariantIds, state.preferences.favoriteVariantIds);
    let value = state.preferences;
    if (!alreadyApplied) {
      const signature = JSON.stringify(payload);
      if (preferenceAttempt.current?.signature !== signature)
        preferenceAttempt.current = {
          signature,
          input: { ...payload, operationId: crypto.randomUUID() },
        };
      const updated = await request<PlannerPreferences>("/planner/preferences", {
        method: "PUT",
        body: JSON.stringify(preferenceAttempt.current.input),
      });
      if (!updated) return;
      value = updated;
    }
    onPreferences(value, name ? { variantId, name } : undefined);
    preferenceAttempt.current = null;
    setNotice(
      exclude
        ? `«${name ?? "Упражнение"}» больше не попадёт в новый подбор. Исключение можно отменить ниже.`
        : "Исключение отменено. Упражнение снова доступно для нового подбора.",
    );
    if (effectiveScreen === "preview") {
      setPreview(null);
      setScreen("config");
      await makePreview({
        ...config,
        replacements: config.replacements?.filter((item) => item.variantId !== variantId),
      });
    }
  }

  async function replacements(day: PlannerDay, step: PlannerStep) {
    if (effectiveScreen === "config") return;
    const returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let source = preview;
    if (effectiveScreen === "confirmed" && confirmed) {
      const rebuilt = await request<PlannerPreview>("/planner/preview", {
        method: "POST",
        body: JSON.stringify(confirmed.draft.config),
      });
      if (!rebuilt) return;
      source = rebuilt;
      setConfig(rebuilt.config);
      setPreview(rebuilt);
      setScreen("preview");
      confirmAttempt.current = null;
      setNotice("Правим новый подбор. Подтверждённый состав изменится после твоего подтверждения.");
      const currentDay = rebuilt.days.find((item) => item.key === day.key);
      const currentStep = currentDay?.steps.find((item) => item.slotKey === step.slotKey);
      if (!currentDay || !currentStep) return;
      day = currentDay;
      step = currentStep;
    }
    if (!source) return;
    const value = await request<{ options: PlannerReplacementOption[] }>("/planner/replacements", {
      method: "POST",
      body: JSON.stringify({ config: source.config, dayKey: day.key, slotKey: step.slotKey }),
    });
    if (value) setReplacement({ day, step, options: value.options, returnFocus });
  }

  async function replace(variantId: string) {
    if (!replacement || !preview || previewStale) return;
    const { day, step } = replacement;
    await makePreview({
      ...preview.config,
      replacements: [
        ...(preview.config.replacements ?? []).filter(
          (item) => item.dayKey !== day.key || item.slotKey !== step.slotKey,
        ),
        { dayKey: day.key, slotKey: step.slotKey, variantId },
      ],
    });
  }

  async function omit() {
    if (!replacement || !preview || previewStale) return;
    await makePreview({
      ...preview.config,
      excludeVariantIds: [
        ...new Set([
          ...(preview.config.excludeVariantIds ?? []),
          replacement.step.exercise.variantId,
        ]),
      ],
      replacements: preview.config.replacements?.filter(
        (item) => item.variantId !== replacement.step.exercise.variantId,
      ),
    });
  }

  async function start(day: PlannerDay) {
    if (!confirmed) return;
    const payload = { expectedProgramRevision: confirmed.revision, dayKey: day.key };
    const signature = JSON.stringify(payload);
    if (startAttempt.current?.signature !== signature)
      startAttempt.current = { signature, input: { ...payload, operationId: crypto.randomUUID() } };
    const workout = await request<Workout>("/planner/start", {
      method: "POST",
      body: JSON.stringify(startAttempt.current.input),
    });
    if (workout) {
      sessionStorage.removeItem("miron:demo");
      router.push("/workout");
    }
  }

  return (
    <section className={styles.scene} aria-labelledby="planner-title">
      <div className={styles.composeHeading}>
        <div>
          <p className={styles.eyebrow}>
            {effectiveScreen === "config"
              ? "03 / Подбор под твои условия"
              : effectiveScreen === "preview"
                ? "Проверь перед подтверждением"
                : "Твой подтверждённый состав"}
          </p>
          <h1 id="planner-title" ref={heading} tabIndex={-1}>
            {effectiveScreen === "config" ? (
              <>
                Подберём <span>твой ритм.</span>
              </>
            ) : (effectiveScreen === "preview" ? preview?.config.mode : confirmedMode) ===
              "single" ? (
              <>
                Просто <span>потренироваться.</span>
              </>
            ) : (
              <>
                Твоя <span>программа.</span>
              </>
            )}
          </h1>
          <p className={styles.lead}>
            {places.find((item) => item.id === place)?.name} ·{" "}
            {directions.find((item) => item.id === direction)?.name} ·{" "}
            {state.experience === "beginner"
              ? "начальный уровень"
              : state.experience === "returning"
                ? "возвращение к занятиям"
                : "регулярные занятия"}
          </p>
        </div>
        {place !== "gym" ? (
          <button type="button" className={styles.secondary} disabled={busy} onClick={onInventory}>
            <SlidersHorizontal size={18} aria-hidden="true" />
            Изменить инвентарь
          </button>
        ) : (
          <p className={styles.muted}>Стандартное оснащение зала</p>
        )}
      </div>
      {screen === "preview" && previewStale ? (
        <p role="alert" className={styles.notice}>
          Программа, предпочтения или инвентарь изменились. Пересобери подбор, чтобы проверить
          актуальный состав перед подтверждением.
        </p>
      ) : notice ? (
        <p role="status" className={styles.success}>
          <Check size={18} aria-hidden="true" />
          {notice}
        </p>
      ) : null}
      {effectiveScreen === "config" ? (
        <PlannerConfigForm
          config={config}
          busy={busy}
          hasProgram={Boolean(state.program)}
          onChange={(next) => {
            setConfig(next);
            setPreview(null);
            setScreen("config");
          }}
          onPreview={() => void makePreview()}
        />
      ) : null}
      {shown ? (
        <>
          <div className={styles.plannerSummary}>
            <div>
              <strong>
                {shown.config.mode === "single"
                  ? "Одно занятие"
                  : `${plannerSplitNames[shown.config.split]} · ${plannerFrequencyLabel(shown.config.daysPerWeek)}`}
              </strong>
              <p className={styles.plannerHint}>
                Пожелание: {shown.config.durationMinutes} мин ·{" "}
                {shown.config.execution === "pairs" ? "пары A/B" : "обычные подходы"}
              </p>
            </div>
            <button
              type="button"
              className={styles.secondary}
              disabled={busy}
              onClick={() => {
                setConfig(shown.config);
                setScreen("config");
                setNotice("");
              }}
            >
              Изменить пожелания
            </button>
          </div>
          <p className={styles.notice}>{shown.disclosure}</p>
          {shown.methodology ? (
            <TrainingMethodologyDetails methodology={shown.methodology} />
          ) : null}
          {shown.notes.length ? (
            <ul className={styles.plannerNotes}>
              {shown.notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          ) : null}
          {shown.weeklyPrimarySets.length && shown.config.mode === "program" ? (
            <details className={styles.plannerExclusions}>
              <summary>Распределение основных подходов за неделю</summary>
              <ul className={styles.plannerVolume}>
                {shown.weeklyPrimarySets.map((item) => (
                  <li key={item.muscle}>
                    <span>
                      {bootstrap.muscles.find((muscle) => muscle.code === item.muscle)?.name ??
                        item.muscle}
                    </span>
                    <span>{item.sets} подходов</span>
                  </li>
                ))}
              </ul>
              <p className={styles.plannerHint}>
                Считаются основные мышцы упражнений. Вспомогательная работа здесь не сложена
                повторно.
              </p>
            </details>
          ) : null}
          <PlannerDays
            days={shown.days}
            busy={busy}
            confirmed={effectiveScreen === "confirmed"}
            onCopy={(day) => onCopy(day, shown.config)}
            onStart={(day) => void start(day)}
            onReplace={(day, step) => void replacements(day, step)}
            onExclude={(step) =>
              void changeExclusion(step.exercise.variantId, true, step.exercise.name)
            }
          />
          {effectiveScreen === "preview" ? (
            <section className={styles.plannerComparison} aria-labelledby="planner-changes-title">
              <h2 id="planner-changes-title">Что изменится</h2>
              {shown.changes.length ? (
                <div className={styles.plannerChangeList}>
                  {shown.changes.map((change, index) => (
                    <div key={index}>
                      <strong>{change.label}</strong>
                      <span>
                        <small>До</small>
                        {change.before}
                      </span>
                      <span>
                        <small>После</small>
                        {change.after}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.plannerHint}>
                  {shown.config.mode === "single"
                    ? "Разовое занятие сохранится отдельно. Твоя недельная программа останется прежней."
                    : state.program
                      ? "Пожелания остались прежними. Проверь состав дней перед новым подтверждением."
                      : "Это твоя первая программа. После подтверждения состав сохранится в личной библиотеке."}
                </p>
              )}
              <p className={styles.plannerHint}>
                Время по дням:{" "}
                {shown.days
                  .map((day) => `${day.title} — ${builderDurationLabel(day.estimate)}`)
                  .join("; ")}
                . Оценка включает работу, отдых и переходы.
              </p>
              <div className={styles.actionRow}>
                <p className={styles.muted}>
                  {shown.config.mode === "program" && state.program
                    ? "Подтверждение заменит текущую программу. Проведённые занятия останутся в истории."
                    : "Подтверждение сохраняет состав. Занятие начнётся отдельным действием."}
                </p>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy}
                  onClick={() => void confirm()}
                >
                  {busy
                    ? "Сохраняем…"
                    : shown.config.mode === "single"
                      ? "Подтвердить разовое занятие"
                      : "Подтвердить программу"}
                  <ArrowRight size={20} aria-hidden="true" />
                </button>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
      <details className={styles.plannerExclusions}>
        <summary>Не предлагать упражнения · {state.preferences.excludedVariantIds.length}</summary>
        <p className={styles.plannerHint}>
          Исключения учитываются в новых подборах. Уже подтверждённый состав меняется только после
          нового просмотра и подтверждения.
        </p>
        {state.preferences.excludedVariantIds.length ? (
          <ul>
            {state.preferences.excludedVariantIds.map((variantId) => (
              <li key={variantId}>
                <span>
                  {state.excludedExercises.find((exercise) => exercise.variantId === variantId)
                    ?.name ?? "Недоступное упражнение"}
                </span>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={busy}
                  onClick={() => void changeExclusion(variantId, false)}
                >
                  Снова предлагать
                  <span className={styles.srOnly}>
                    {" "}
                    {
                      state.excludedExercises.find((exercise) => exercise.variantId === variantId)
                        ?.name
                    }
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.plannerHint}>
            Список пуст. «Больше не предлагать» добавит сюда выбранное упражнение.
          </p>
        )}
      </details>
      <p className={styles.disclosure}>
        Подбор учитывает библиотеку MIRON, твои условия и подтверждённую историю. Черновики не
        прошли профессиональную проверку техники; вес автоматически не назначается.
      </p>
      {replacement && effectiveScreen === "preview" ? (
        <ReplacementChooser
          selection={replacement}
          busy={busy}
          returnFocus={replacement.returnFocus}
          onChoose={(variantId) => void replace(variantId)}
          onOmit={() => void omit()}
          onClose={() => setReplacement(null)}
        />
      ) : null}
    </section>
  );
}
