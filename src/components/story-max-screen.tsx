"use client";

import { ChartNoAxesColumnIncreasing, Dumbbell, Target, Zap } from "lucide-react";
import {
  StoryCoachScreen,
  type CoachIntroDefinition,
  type StoryCoachScreenProps,
} from "./story-coach-screen";

const maxIntro = {
  id: "max",
  name: "МАКС",
  step: 2,
  character: ["ПРЯМОЙ. ЭНЕРГИЧНЫЙ.", "ВСЕГДА ЗА ДВИЖЕНИЕ."],
  description:
    "Макс помогает ставить реальные цели и подбирает тренировки под твой стиль жизни. Без лишней теории — больше дела.",
  speech: "Тренировки — это не про идеальность. Это про то, чтобы становиться лучше. Погнали?",
  benefits: [
    { Icon: Zap, title: "Мотивирует", detail: "Когда сложно — подбодрит" },
    { Icon: Dumbbell, title: "Подбирает тренировки", detail: "Под твой уровень и возможности" },
    { Icon: Target, title: "Объясняет просто", detail: "Без скучной теории" },
    {
      Icon: ChartNoAxesColumnIncreasing,
      title: "Помогает видеть прогресс",
      detail: "Замечает даже маленькие победы",
    },
  ],
  art: {
    description:
      "Макс сидит в зале с полотенцем на плече, улыбается и протягивает руку для знакомства.",
    desktop: "/story-max/desktop-v1.webp",
    portrait: "/story-max/portrait-v1.webp",
  },
  panels: [
    { src: "/story-max/pullup-v1.webp", alt: "Макс на турнике среди стоек спортзала" },
    { src: "/story-max/towel-v1.webp", alt: "Макс с полотенцем после занятия у окон" },
    {
      src: "/story-max/peace-v1.webp",
      alt: "Макс приветствует тебя у кирпичной стены с гантелями",
    },
  ],
  wallNote: ["СИЛЬНЕЕ", "ЧЕМ ВЧЕРА"],
  kneeNote: ["ДЕЙСТВИЕ МЕНЯЕТ", "БОЛЬШЕ, ЧЕМ КАЖЕТСЯ."],
  quote: ["Лучшее время начать — сейчас.", "Остальное приложится."],
  cta: "Круто, дальше",
} satisfies CoachIntroDefinition;

export function StoryMaxScreen(props: StoryCoachScreenProps) {
  return <StoryCoachScreen {...props} coach={maxIntro} />;
}
