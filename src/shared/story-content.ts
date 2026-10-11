export const MIRON_EXPANSION = "Movement Intelligence & Routine Optimization Network";
export const MIRON_RUSSIAN_MEANING =
  "Интеллектуальная система движения, тренировок и восстановления";

export const STORY_INTERESTS = [
  { id: "strength", label: "Силовые", image: "/story-v2/gym.webp" },
  { id: "home", label: "Дома", image: "/story-v2/home.webp" },
  { id: "calisthenics", label: "Турник / свой вес", image: "/story-v2/park.webp" },
  { id: "yoga", label: "Йога", image: "/story-v2/yoga.webp" },
  { id: "mobility", label: "Растяжка", image: "/story-v2/mobility.webp" },
  { id: "fitness", label: "Общая форма", image: "/story-v2/fitness.webp" },
] as const;
export const STORY_LOCATIONS = [
  { id: "gym", label: "Зал", image: "/story-v2/gym.webp" },
  { id: "home", label: "Дома", image: "/story-v2/home.webp" },
  { id: "outdoor", label: "Улица / площадка", image: "/story-v2/park.webp" },
  { id: "flexible", label: "По-разному", image: "/story-v2/fitness.webp" },
] as const;
export type StoryPanel = {
  id: string;
  title: string;
  kicker: string;
  image: string;
  speaker: "max" | "lika" | "both";
  lines: string[];
  quote?: string;
  traits?: string[];
  kind?: "interests" | "choose" | "prepare" | "finish";
};
export const STORY_PANELS: ReadonlyArray<StoryPanel> = [
  {
    id: "welcome",
    title: "ПРИВЕТ! МЫ МАКС И ЛИКА.",
    kicker: "Твой путь. На твоих условиях.",
    image: "/story-v2/welcome.webp",
    speaker: "both",
    lines: ["Твои напарники в тренировках.", "Поможем начать и найти свой ритм."],
  },
  {
    id: "max",
    title: "МАКС",
    kicker: "Твой напарник",
    image: "/story-v2/max.webp",
    speaker: "max",
    lines: ["Прямой. Энергичный. На твоей стороне."],
    quote: "Есть желание? Начало уже положено.",
    traits: ["Говорит по делу", "Помогает двигаться вперёд", "Без геройства и гонки за весом"],
  },
  {
    id: "lika",
    title: "ЛИКА",
    kicker: "Твой напарник",
    image: "/story-v2/lika.webp",
    speaker: "lika",
    lines: ["Внимательная. Спокойная. С характером."],
    quote: "Посмотрим, что подходит именно тебе.",
    traits: [
      "Слушает и помогает разобраться",
      "Следит за техникой и восстановлением",
      "Поддерживает без давления",
    ],
  },
  {
    id: "interests",
    title: "ЧТО ТЕБЕ БЛИЖЕ?",
    kicker: "Твои интересы",
    image: "",
    speaker: "both",
    kind: "interests",
    lines: ["Можно выбрать несколько.", "Или пока просто познакомиться."],
  },
  {
    id: "choose",
    title: "С КЕМ НАЧНЁМ?",
    kicker: "Одна команда. Два характера.",
    image: "",
    speaker: "both",
    kind: "choose",
    lines: ["Выбери, с кем хочешь продолжить.", "Переключаться можно в любой момент."],
  },
  {
    id: "prepare",
    title: "ГОТОВИМ ТВОЁ ПРОСТРАНСТВО",
    kicker: "Почти на месте",
    image: "/story-finale/preparation-v1.webp",
    speaker: "both",
    kind: "prepare",
    lines: ["Пара штрихов — и можно знакомиться ближе."],
  },
  {
    id: "finish",
    title: "ГОТОВО, НАПАРНИК!",
    kicker: "Мы в команде",
    image: "/story-finale/finish-v1.webp",
    speaker: "both",
    kind: "finish",
    lines: ["Давай сделаем этот день лучше.", "В твоём ритме. Мы рядом."],
  },
];
