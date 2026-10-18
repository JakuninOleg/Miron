import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock3, Copy, Dumbbell, Pencil, Plus, Trash2 } from "lucide-react";
import type { CustomWorkoutSummary } from "@/shared/workout-builder";
import { builderDurationLabel } from "@/shared/workout-builder";
import type { PlannerConfig, PlannerProgram, PlannerState } from "@/shared/workout-planner";
import { plannerFrequencyLabel, plannerSplitNames } from "./planner-config";
import { directions, places } from "./choices";
import styles from "./workout-builder.module.css";

export function WorkoutLibrary({
  templates,
  busy,
  onCreate,
  planner,
  onPick,
  onOpenProgram,
  onEdit,
  onCopy,
  onDelete,
}: {
  templates: CustomWorkoutSummary[];
  busy: boolean;
  onCreate: () => void;
  planner: PlannerState | null;
  onPick: () => void;
  onOpenProgram: (mode: PlannerConfig["mode"]) => void;
  onEdit: (id: string) => void;
  onCopy: (id: string) => void;
  onDelete: (template: CustomWorkoutSummary) => void;
}) {
  return (
    <section className={styles.scene} aria-labelledby="library-title">
      <div className={styles.libraryIntro}>
        <div>
          <p className={styles.eyebrow}>Твоя личная библиотека</p>
          <h1 id="library-title">
            Собери тренировку <span>под себя.</span>
          </h1>
          <p className={styles.lead}>
            Подбери программу под свои условия или выбери упражнения самостоятельно. Сохрани состав
            — чтобы вернуться к нему позже.
          </p>
          <div className={styles.libraryActions}>
            <button
              type="button"
              className={styles.primary}
              onClick={onPick}
              disabled={busy || !planner}
            >
              <Dumbbell size={20} aria-hidden="true" />
              Подобрать тренировку
              <ArrowRight size={20} aria-hidden="true" />
            </button>
            <button type="button" className={styles.secondary} onClick={onCreate} disabled={busy}>
              <Plus size={20} aria-hidden="true" />
              Собрать самому
            </button>
          </div>
        </div>
        <div className={styles.libraryArt} aria-hidden="true">
          <Image
            src="/story-finale/preparation-v1.webp"
            alt=""
            fill
            sizes="(max-width: 700px) 90vw, 420px"
          />
          <span>
            Твой темп.
            <br />
            Твой состав.
          </span>
        </div>
      </div>
      {planner?.program || planner?.single ? (
        <>
          <div className={styles.libraryHeading}>
            <h2>Подобранные занятия</h2>
          </div>
          <div className={styles.plannerLibraryGrid}>
            {planner.program ? (
              <PlannerLibraryCard
                program={planner.program}
                mode="program"
                busy={busy}
                onOpen={onOpenProgram}
              />
            ) : null}
            {planner.single ? (
              <PlannerLibraryCard
                program={planner.single}
                mode="single"
                busy={busy}
                onOpen={onOpenProgram}
              />
            ) : null}
          </div>
        </>
      ) : null}
      <div className={styles.libraryHeading}>
        <h2>Сохранённые тренировки</h2>
        <span>{templates.length}</span>
      </div>
      {templates.length ? (
        <div className={styles.libraryGrid}>
          {templates.map((template) => (
            <article key={template.id} className={styles.templateCard}>
              <div className={styles.templateArt}>
                <Image
                  src={
                    directions.find((item) => item.id === template.direction)?.image ??
                    "/story-v2/gym.webp"
                  }
                  alt=""
                  fill
                  sizes="(max-width: 600px) 90vw, 360px"
                />
                <span>
                  {places.find((item) => item.id === template.place)?.name} ·{" "}
                  {directions.find((item) => item.id === template.direction)?.name}
                </span>
              </div>
              <div className={styles.templateBody}>
                <h3>{template.name}</h3>
                <p className={styles.templateStats}>
                  <span>
                    <Dumbbell size={16} aria-hidden="true" />
                    {template.exerciseCount} упражнений
                  </span>
                  <span>
                    <Clock3 size={16} aria-hidden="true" />
                    {builderDurationLabel(template.estimate)}
                  </span>
                </p>
                <div className={styles.templateActions}>
                  <Link
                    className={styles.primary}
                    href={`/workout-builder/start?source=template&id=${template.id}`}
                  >
                    Начать<span className={styles.srOnly}> {template.name}</span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </Link>
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={busy}
                    onClick={() => onEdit(template.id)}
                  >
                    <Pencil size={16} aria-hidden="true" />
                    Открыть<span className={styles.srOnly}> {template.name}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    disabled={busy}
                    aria-label={`Скопировать ${template.name}`}
                    onClick={() => onCopy(template.id)}
                  >
                    <Copy size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    disabled={busy}
                    aria-label={`Удалить ${template.name}`}
                    onClick={() => onDelete(template)}
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <Dumbbell size={28} aria-hidden="true" />
          <h3>Здесь появится твоя первая сборка</h3>
          <p>Можно начать с пары упражнений. Состав и название всегда можно изменить.</p>
        </div>
      )}
    </section>
  );
}

function PlannerLibraryCard({
  program,
  mode,
  busy,
  onOpen,
}: {
  program: PlannerProgram;
  mode: PlannerConfig["mode"];
  busy: boolean;
  onOpen: (mode: PlannerConfig["mode"]) => void;
}) {
  return (
    <article className={styles.templateCard}>
      <div className={styles.templateBody}>
        <p className={styles.eyebrow}>Подтверждённый состав</p>
        <h3>{mode === "program" ? "Моя программа" : "Разовое занятие"}</h3>
        <p className={styles.plannerHint}>
          {places.find((item) => item.id === program.draft.config.place)?.name} ·{" "}
          {directions.find((item) => item.id === program.draft.config.direction)?.name}
          {mode === "program"
            ? ` · ${plannerSplitNames[program.draft.config.split]} · ${plannerFrequencyLabel(program.draft.config.daysPerWeek)}`
            : " · отдельно от программы"}
        </p>
        <ul className={styles.plannerLibraryDays}>
          {program.draft.days.map((day) => (
            <li key={day.key}>
              <span>{day.title}</span>
              <span>{builderDurationLabel(day.estimate)}</span>
            </li>
          ))}
        </ul>
        <p className={styles.disclosure}>Библиотечный черновик без профессиональной проверки.</p>
        <button
          type="button"
          className={styles.secondary}
          disabled={busy}
          onClick={() => onOpen(mode)}
        >
          Открыть {mode === "program" ? "программу" : "разовое занятие"}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}
