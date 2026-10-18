"use client";

import { ChartNoAxesColumnIncreasing, Dumbbell, Heart, MessageCircle } from "lucide-react";
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
  description: [
    "Подберём тренировку под твою жизнь.",
    "Объясню, поддержу и замечу",
    "даже маленькие победы.",
  ],
  speech: "Есть двадцать минут? Уже повод сделать что-то для себя!",
  benefits: [
    { Icon: Heart, title: "Мотивирует", detail: "Когда сложно — подбодрит" },
    { Icon: Dumbbell, title: "Подбирает тренировки", detail: "Под твой уровень и возможности" },
    { Icon: MessageCircle, title: "Объясняет просто", detail: "Без скучной теории" },
    {
      Icon: ChartNoAxesColumnIncreasing,
      title: "Помогает видеть прогресс",
      detail: "Замечает даже маленькие победы",
    },
  ],
  cta: "Круто, дальше",
} satisfies CoachIntroDefinition;

export function StoryMaxScreen(props: StoryCoachScreenProps) {
  return <StoryCoachScreen {...props} coach={maxIntro} />;
}
