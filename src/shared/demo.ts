import type { Exercise, Profile, Workout } from "./contracts";
import { rewardDay } from "./xp-policy";
export const DEFAULT_PROFILE: Profile = {
  name: "",
  companion: "max",
  theme: "dark",
  goal: "habit",
  experience: "beginner",
  discipline: "strength",
  daysPerWeek: 3,
  durationMinutes: 30,
  location: "home",
  equipment: [
    { code: "floor", quantity: 1 },
    { code: "clear_space", quantity: 1 },
  ],
  timezone: "Europe/Moscow",
  trainingDays: [1, 3, 5],
  reminderTime: "19:00",
  onboardingCompleted: false,
  adultConfirmed: false,
  remindersEnabled: false,
};
export const DEMO_EXERCISES: Exercise[] = [
  {
    id: "strength.squat.bodyweight",
    name: "Приседание без веса",
    description: "Демонстрационная карточка движения",
    equipment: [],
    sets: 2,
    targetReps: 8,
    restSeconds: 60,
    metric: "reps",
    status: "demo",
    instructions: [
      "Выбери устойчивое положение и удобную постановку стоп.",
      "Двигайся плавно в комфортной амплитуде.",
      "Если появляется боль, остановись.",
    ],
  },
  {
    id: "strength.pushup.wall",
    name: "Отжимание от стены",
    description: "Вариант с устойчивой опорой",
    equipment: [],
    sets: 2,
    targetReps: 8,
    restSeconds: 60,
    metric: "reps",
    status: "demo",
    instructions: [
      "Проверь устойчивость стены и нескользкий пол.",
      "Сохраняй ровное положение корпуса.",
      "Выбери расстояние, на котором движение комфортно.",
    ],
  },
  {
    id: "strength.glute_bridge.bodyweight",
    name: "Ягодичный мост",
    description: "Движение на подходящей поверхности",
    equipment: [],
    sets: 2,
    targetReps: 10,
    restSeconds: 60,
    metric: "reps",
    status: "demo",
    instructions: [
      "Выбери ровную комфортную поверхность.",
      "Двигайся плавно, без рывков.",
      "Остановись при боли или неудобстве.",
    ],
  },
  {
    id: "strength.row.dumbbell_single",
    name: "Тяга одной гантели",
    description: "Демонстрационный вариант с гантелью",
    equipment: ["dumbbell"],
    sets: 2,
    targetReps: 8,
    restSeconds: 60,
    metric: "reps",
    status: "demo",
    instructions: [
      "Выбери знакомое движение и комфортный вес.",
      "Не используй непроверенную мебель как опору.",
      "В этом прототипе технику уточни у тренера.",
    ],
  },
];
export function buildDemoWorkout(profile: Profile): Workout {
  const admittedAt = new Date();
  const dumbbell = profile.equipment.some((item) => item.code === "dumbbell" && item.quantity > 0);
  const exercises = dumbbell
    ? [...DEMO_EXERCISES.slice(0, 3), DEMO_EXERCISES[3]]
    : DEMO_EXERCISES.slice(0, 3);
  return {
    id: crypto.randomUUID(),
    title: "Первый шаг",
    energyActivity: "strength",
    subtitle: "Демонстрационное занятие • Full body A",
    estimatedMinutes: profile.durationMinutes,
    exercises,
    currentIndex: 0,
    status: "active",
    revision: 1,
    recordedSets: [],
    startedAt: admittedAt.toISOString(),
    rewardDay: rewardDay(admittedAt),
    rewardKind: "main",
    completedAt: null,
  };
}
