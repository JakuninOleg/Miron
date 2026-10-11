/** Public design-preview content. Never represents account progress or a training prescription. */
export type DashboardPanel =
  "workouts" | "calendar" | "path" | "achievements" | "companions" | "profile" | "voice";

export const DASHBOARD_ACHIEVEMENTS = [
  {
    id: "first",
    title: "Первое занятие",
    description: "Сделай своё первое занятие.",
    condition: "Заверши первое занятие. Достижение появится после сохранения результата.",
  },
  {
    id: "rhythm",
    title: "Свой ритм",
    description: "Постепенно найди свой ритм.",
    condition:
      "За регулярные занятия в своём ритме. Это пример будущего достижения; точное условие ещё согласовываем.",
  },
  {
    id: "return",
    title: "Возвращение",
    description: "Снова вернись к тренировкам.",
    condition:
      "Вернись к занятиям после перерыва. Всё, что ты сделал раньше, остаётся в твоей истории. Точный порог перерыва ещё согласовываем.",
  },
] as const;

export const DASHBOARD_CHAPTERS = [
  "Начало положено",
  "Знакомый маршрут",
  "Свои условия",
  "Мой ритм",
  "На дистанции",
  "История продолжается",
] as const;

export const DASHBOARD_INTENTS = {
  workout: {
    text: "Хочу потренироваться сейчас.",
    hint: "Расскажи, где ты сейчас, что есть под рукой и сколько времени на занятие.",
  },
  program: {
    text: "Хочу составить программу тренировок.",
    hint: "Расскажи, чего хочешь добиться и какие занятия тебе нравятся.",
  },
  food: {
    text: "Что приготовить из того, что у меня есть?",
    hint: "Перечисли продукты и напиши, есть ли аллергии или ограничения в питании.",
  },
} as const;
export type DashboardIntent = keyof typeof DASHBOARD_INTENTS;

export const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function calendarWeek(today: string): Date[] {
  const start = new Date(`${today}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date;
  });
}

export function calendarMonth(monthKey: string): (Date | null)[] {
  const start = new Date(`${monthKey}-01T12:00:00Z`);
  const last = new Date(start);
  last.setUTCMonth(start.getUTCMonth() + 1, 0);
  const offset = (start.getUTCDay() + 6) % 7;
  const cells: (Date | null)[] = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= last.getUTCDate(); day++) {
    const date = new Date(start);
    date.setUTCDate(day);
    cells.push(date);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function shiftMonth(monthKey: string, amount: number): string {
  const date = new Date(`${monthKey}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return dateKey(date).slice(0, 7);
}
