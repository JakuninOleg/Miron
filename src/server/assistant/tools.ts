import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AssistantAction } from "../../shared/assistant";
import { estimateWorkoutEnergy } from "../../shared/workout-energy";
import { DomainError } from "../domain/errors";
import { plannerConfigInput, previewPlanner } from "../domain/workout-planner";
import { getWorkout, workoutCommandInput } from "../domain/workouts";
import {
  authorizeAssistant,
  readAssistantProfile,
  readCurrentWorkout,
  readExerciseCards,
  readRecentWorkouts,
} from "./context";
import type { ToolOutcome } from "./engine";
import type { ProviderTool, ToolCall } from "./provider";

const empty = z.strictObject({});
const energyInput = z
  .strictObject({
    workoutId: z.uuid(),
    bodyWeightKg: z.number().min(25).max(400).multipleOf(0.1).optional(),
    workload: z
      .array(
        z.strictObject({
          exerciseId: z.uuid(),
          sets: z.number().int().min(0).max(30),
          repsPerSet: z.number().int().min(1).max(1000).optional(),
          durationSecondsPerSet: z.number().int().min(1).max(86400).optional(),
        }),
      )
      .min(1)
      .max(12)
      .optional(),
  })
  .refine((input) => input.bodyWeightKg !== undefined || input.workload !== undefined);
const schemas = {
  read_profile: empty,
  read_current_workout: empty,
  read_recent_workouts: empty,
  read_exercise_cards: z.strictObject({ exerciseIds: z.array(z.uuid()).min(1).max(3) }),
  preview_workout: plannerConfigInput,
  preview_energy: energyInput,
};
type ToolName = keyof typeof schemas;
const descriptions: Record<ToolName, string> = {
  read_profile:
    "Прочитать опыт, цель, условия и инвентарь текущего пользователя; без контактов и без изменений.",
  read_current_workout:
    "Прочитать текущее занятие и ограниченный список его фактических подходов. Не записывает и не завершает занятие.",
  read_recent_workouts:
    "Прочитать шесть последних результатов текущего пользователя, включая ID для оценки энергии. Отсутствие истории не доказывает отсутствие offline queue.",
  read_exercise_cards:
    "Прочитать до трёх карточек упражнения из текущего занятия; использовать выданные exerciseIds. Черновик не экспертная проверка техники.",
  preview_workout:
    "Подготовить неподтверждённый черновик существующим подбором по сохранённому инвентарю. Не сохраняет программу и не запускает занятие; пользователь просматривает и подтверждает её в подборе.",
  preview_energy:
    "Предложить уточнение приблизительной энергии завершённого занятия. Только явно сообщённые пользователем масса тела в кг и фактическая поправка подходов. Никакой записи: отдельная кнопка подтверждения. XP и журнал не изменяются.",
};
export const ASSISTANT_TOOLS: ProviderTool[] = Object.entries(schemas).map(([name, schema]) => {
  const parameters = z.toJSONSchema(schema);
  delete parameters.$schema;
  return {
    type: "function",
    function: { name, description: descriptions[name as ToolName], parameters },
  };
});

function reportedNumbers(text: string): number[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((value) => Number(value.replace(",", ".")));
}
export function validateReportedEnergy(text: string, input: z.infer<typeof energyInput>) {
  const numbers = reportedNumbers(text);
  if (input.bodyWeightKg !== undefined) {
    const masses = [
      ...text
        .toLowerCase()
        .matchAll(
          /(?:моя масса|масса тела|мой вес|вес тела|вешу|я)[\s:—-]*(?:примерно\s*)?(\d+(?:[.,]\d+)?)\s*(?:кг|килограмм)/g,
        ),
    ].map((match) => Number(match[1].replace(",", ".")));
    if (!masses.includes(input.bodyWeightKg))
      throw new DomainError(
        "ENERGY_CONFIRM_DETAILS",
        422,
        "Укажи свою массу тела в килограммах, чтобы уточнить оценку.",
      );
  }
  for (const row of input.workload ?? []) {
    if (
      [row.sets, row.repsPerSet, row.durationSecondsPerSet].some(
        (value) => value !== undefined && !numbers.includes(value),
      )
    )
      throw new DomainError(
        "ENERGY_CONFIRM_DETAILS",
        422,
        "Уточни фактически выполненные подходы и нагрузку числами.",
      );
  }
}

export async function executeAssistantTool(
  ownerId: string,
  text: string,
  call: ToolCall,
): Promise<ToolOutcome<AssistantAction>> {
  await authorizeAssistant(ownerId);
  if (!Object.hasOwn(schemas, call.function.name))
    throw new DomainError("AI_TOOL_FORBIDDEN", 422, "Это действие из чата пока недоступно.");
  let raw: unknown;
  try {
    raw = JSON.parse(call.function.arguments) as unknown;
  } catch {
    throw new DomainError("AI_TOOL_INVALID", 422, "Не удалось разобрать действие.");
  }
  const name = call.function.name as ToolName;
  if (name === "read_profile") {
    schemas.read_profile.parse(raw);
    return { evidence: await readAssistantProfile(ownerId) };
  }
  if (name === "read_current_workout") {
    schemas.read_current_workout.parse(raw);
    return { evidence: await readCurrentWorkout(ownerId) };
  }
  if (name === "read_recent_workouts") {
    schemas.read_recent_workouts.parse(raw);
    return { evidence: await readRecentWorkouts(ownerId) };
  }
  if (name === "read_exercise_cards") {
    const input = schemas.read_exercise_cards.parse(raw);
    return { evidence: await readExerciseCards(ownerId, input.exerciseIds) };
  }
  if (name === "preview_workout") {
    const input = schemas.preview_workout.parse(raw);
    const preview = await previewPlanner(ownerId, input);
    const params = new URLSearchParams({
      from: "assistant",
      mode: input.mode,
      assistantConfig: JSON.stringify(input),
    });
    return {
      evidence: {
        status: "draft_preview",
        saved: false,
        config: preview.config,
        disclosure: preview.disclosure,
        notes: preview.notes,
        days: preview.days.slice(0, 4).map((day) => ({
          key: day.key,
          title: day.title,
          estimate: day.estimate,
          warnings: day.warnings,
          steps: day.steps.slice(0, 15).map((step) => ({
            name: step.exercise.name,
            metric: step.exercise.metric,
            sets: step.sets,
            ...(step.exercise.metric === "reps"
              ? { reps: step.target }
              : { durationSeconds: step.target }),
            restSeconds: step.restSeconds,
            status: step.exercise.status,
          })),
        })),
      },
      action: {
        id: randomUUID(),
        type: "planner",
        title: "Посмотреть черновик в подборе",
        href: `/workout-builder?${params.toString()}`,
      },
    };
  }
  const input = schemas.preview_energy.parse(raw);
  validateReportedEnergy(text, input);
  const workout = await getWorkout(ownerId, input.workoutId);
  const proposed = {
    ...(input.bodyWeightKg !== undefined ? { bodyWeightKg: input.bodyWeightKg } : {}),
    ...(input.workload ? { workload: input.workload } : {}),
  };
  const command = workoutCommandInput.parse({
    operationId: randomUUID(),
    expectedRevision: workout.revision,
    command: { type: "estimate_energy", ...proposed },
  });
  let estimate;
  try {
    estimate = estimateWorkoutEnergy(workout, proposed, new Date().toISOString());
  } catch (error) {
    throw new DomainError(
      "ENERGY_ESTIMATE_UNAVAILABLE",
      409,
      error instanceof Error ? error.message : "Оценка пока недоступна.",
    );
  }
  const summary = [
    input.bodyWeightKg !== undefined ? `Масса тела: ${input.bodyWeightKg} кг` : null,
    ...(input.workload ?? []).map((row) => {
      const exercise = workout.exercises.find((item) => item.id === row.exerciseId);
      return `${exercise?.name ?? "Упражнение"}: ${row.sets} подходов${row.repsPerSet !== undefined ? ` × ${row.repsPerSet} повторов` : ""}${row.durationSecondsPerSet !== undefined ? ` × ${row.durationSecondsPerSet} сек.` : ""}`;
    }),
    "Приблизительная оценка; журнал подходов и XP не меняются.",
  ]
    .filter(Boolean)
    .join(". ");
  return {
    evidence: { status: "preview_only", saved: false, input: proposed, estimate, summary },
    action: {
      id: randomUUID(),
      type: "energy_estimate",
      title: "Уточнить оценку расхода",
      workoutId: workout.id,
      expectedRevision: workout.revision,
      operationId: command.operationId,
      input: proposed,
      summary,
      estimate,
    },
  };
}
