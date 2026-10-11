"use client";

import { ChartNoAxesColumnIncreasing, Heart, Sparkles, Sprout } from "lucide-react";
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
  description:
    "Лика помогает понять, что действительно подходит тебе: тренировки, питание и отдых. Без спешки, в твоём темпе.",
  speech: "Посмотрим, что действительно подходит тебе. ♡",
  benefits: [
    { Icon: Heart, title: "Поддерживает на каждом этапе", detail: "Когда сложно — рядом" },
    { Icon: Sprout, title: "Помогает найти баланс", detail: "Тренировки, питание, отдых" },
    { Icon: Sparkles, title: "Объясняет без сложных слов", detail: "Всё по делу и понятно" },
    {
      Icon: ChartNoAxesColumnIncreasing,
      title: "Замечает твой прогресс",
      detail: "И всегда верит в тебя",
    },
  ],
  art: {
    description:
      "Лика сидит в спортзале в розовом костюме, улыбается, опираясь щекой на ладонь, и держит шейкер.",
    desktop: "/story-lika/desktop-v1.webp",
    portrait: "/story-lika/portrait-v1.webp",
  },
  panels: [
    { src: "/story-lika/relax-v1.webp", alt: "Лика отдыхает на скамье среди тёмных стоек" },
    { src: "/story-lika/window-v1.webp", alt: "Лика оборачивается у светлых окон после занятия" },
    { src: "/story-lika/peace-v1.webp", alt: "Лика приветствует тебя у кирпичной стены с гирями" },
  ],
  wallNote: ["ЗАБОТА", "ТОЖЕ", "ПРОГРЕСС"],
  kneeNote: ["СВОЙ ТЕМП.", "СВОЯ ИСТОРИЯ."],
  quote: ["Не идеальность делает тебя сильнее,", "а постоянство."],
  cta: "Давай дальше",
} satisfies CoachIntroDefinition;

export function StoryLikaScreen(props: StoryCoachScreenProps) {
  return <StoryCoachScreen {...props} coach={likaIntro} />;
}
