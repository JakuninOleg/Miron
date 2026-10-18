export const MIRON_EXPANSION = "Movement Intelligence & Routine Optimization Network";
export const MIRON_RUSSIAN_MEANING =
  "Интеллектуальная система движения, тренировок и восстановления";

export const STORY_INTERESTS = [
  { id: "strength", label: "Зал", image: "/visuals/soft-3d/gym.webp" },
  { id: "yoga", label: "Йога", image: "/visuals/soft-3d/yoga.webp" },
  { id: "calisthenics", label: "Калистеника", image: "/visuals/soft-3d/park.webp" },
  { id: "mobility", label: "Растяжка", image: "/visuals/soft-3d/mobility.webp" },
  { id: "home", label: "Силовые дома", image: "/visuals/soft-3d/home.webp" },
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
    title: "Привет! Мы Макс и Лика.",
    kicker: "Твой путь. На твоих условиях.",
    image: "/visuals/soft-3d/scenes/welcome-v2.webp",
    speaker: "both",
    lines: ["Твои напарники в тренировках.", "Поможем начать и найти свой ритм."],
  },
  {
    id: "max",
    title: "Макс.",
    kicker: "Твой напарник",
    image: "/visuals/soft-3d/scenes/max-v2.webp",
    speaker: "max",
    lines: ["Прямой. Энергичный. На твоей стороне."],
    quote: "Есть двадцать минут? Уже повод сделать что-то для себя!",
    traits: ["Говорит по делу", "Помогает двигаться вперёд", "Без геройства и гонки за весом"],
  },
  {
    id: "lika",
    title: "Лика.",
    kicker: "Твой напарник",
    image: "/visuals/soft-3d/scenes/lika-v2.webp",
    speaker: "lika",
    lines: ["Внимательная. Спокойная. С характером."],
    quote: "Расскажи, что любишь. Найдём движение в удовольствие ♡",
    traits: [
      "Слушает и помогает разобраться",
      "Следит за техникой и восстановлением",
      "Поддерживает без давления",
    ],
  },
  {
    id: "interests",
    title: "Что тебе ближе?",
    kicker: "Твои интересы",
    image: "/visuals/soft-3d/scenes/interests-v2.webp",
    speaker: "both",
    kind: "interests",
    lines: ["Можно выбрать несколько.", "Или пока просто познакомиться."],
  },
  {
    id: "choose",
    title: "С кем начнём?",
    kicker: "Одна команда. Два характера.",
    image: "/visuals/soft-3d/scenes/choose-v2.webp",
    speaker: "both",
    kind: "choose",
    lines: ["Выбери, с кем хочешь продолжить.", "Сменить напарника можно между тренировками."],
  },
  {
    id: "prepare",
    title: "Готовим твоё пространство",
    kicker: "Почти на месте",
    image: "/visuals/soft-3d/scenes/prepare-v2.webp",
    speaker: "both",
    kind: "prepare",
    lines: ["Пара штрихов — и можно знакомиться ближе."],
  },
  {
    id: "finish",
    title: "Готово, напарник!",
    kicker: "Мы в команде",
    image: "/visuals/soft-3d/scenes/finish-v2.webp",
    speaker: "both",
    kind: "finish",
    lines: ["Давай сделаем этот день лучше.", "В твоём ритме. Мы рядом."],
  },
];
