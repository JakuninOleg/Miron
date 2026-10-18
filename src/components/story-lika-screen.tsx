"use client";

import { ChartNoAxesColumnIncreasing, Heart, MessageCircle, Sprout } from "lucide-react";
import {
  StoryCoachScreen,
  type CoachIntroDefinition,
  type StoryCoachScreenProps,
} from "./story-coach-screen";

const likaIntro = {
  id: "lika",
  name: "ЛИКА",
  step: 3,
  character: ["ВНИМАТЕЛЬНАЯ. СПОКОЙНАЯ.", "ПОМОГАЕТ РАЗОБРАТЬСЯ."],
  description: [
    "Найдём баланс между движением и отдыхом.",
    "Без спешки и давления —",
    "в твоём темпе.",
  ],
  speech: "Расскажи, что любишь. Найдём движение в удовольствие ♡",
  benefits: [
    { Icon: Heart, title: "Поддерживает", detail: "Когда сложно — рядом" },
    { Icon: Sprout, title: "Помогает найти баланс", detail: "Движение и отдых" },
    { Icon: MessageCircle, title: "Объясняет понятно", detail: "Без сложных слов" },
    {
      Icon: ChartNoAxesColumnIncreasing,
      title: "Замечает твой прогресс",
      detail: "И всегда верит в тебя",
    },
  ],
  cta: "Давай дальше",
} satisfies CoachIntroDefinition;

export function StoryLikaScreen(props: StoryCoachScreenProps) {
  return <StoryCoachScreen {...props} coach={likaIntro} />;
}
