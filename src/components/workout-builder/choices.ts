import type { CatalogContext, CatalogDirection } from "@/shared/catalog-taxonomy";
import type { BuilderEquipmentFilter } from "@/shared/workout-builder";

export const places: { id: CatalogContext; name: string; detail: string; image: string }[] = [
  { id: "gym", name: "В зале", detail: "Тренажёры и железо", image: "/story-v2/gym.webp" },
  { id: "home", name: "Дома", detail: "Всё, что под рукой", image: "/story-v2/home.webp" },
  {
    id: "outdoor",
    name: "На улице",
    detail: "Движение на воздухе",
    image: "/story-v2/fitness.webp",
  },
  {
    id: "workout_park",
    name: "На площадке",
    detail: "Турники и брусья",
    image: "/story-v2/park.webp",
  },
];

export const directions: { id: CatalogDirection; name: string; image: string }[] = [
  { id: "strength", name: "Силовая", image: "/story-interests/strength-v1.webp" },
  { id: "calisthenics", name: "Свой вес", image: "/story-interests/calisthenics-v2.webp" },
  { id: "yoga", name: "Йога", image: "/story-interests/yoga-v1.webp" },
  { id: "stretch", name: "Растяжка", image: "/story-interests/mobility-v1.webp" },
  { id: "mobility", name: "Мобильность", image: "/story-v2/mobility.webp" },
];

export const trainingChoices: {
  id: string;
  name: string;
  detail: string;
  image: string;
  place: CatalogContext;
  direction: CatalogDirection;
}[] = [
  {
    id: "gym",
    name: "Зал",
    detail: "Силовая · тренажёры и веса",
    image: "/story-v2/gym.webp",
    place: "gym",
    direction: "strength",
  },
  {
    id: "home",
    name: "Силовая дома",
    detail: "С твоим инвентарём",
    image: "/story-v2/home.webp",
    place: "home",
    direction: "strength",
  },
  {
    id: "calisthenics",
    name: "Калистеника",
    detail: "На площадке · турники и брусья",
    image: "/story-v2/park.webp",
    place: "workout_park",
    direction: "calisthenics",
  },
  {
    id: "home-bodyweight",
    name: "Свой вес дома",
    detail: "Движение без тренажёров",
    image: "/story-interests/home-v1.webp",
    place: "home",
    direction: "calisthenics",
  },
  {
    id: "yoga",
    name: "Йога",
    detail: "Дома · баланс и спокойствие",
    image: "/story-interests/yoga-v1.webp",
    place: "home",
    direction: "yoga",
  },
  {
    id: "stretch",
    name: "Растяжка",
    detail: "Дома · гибкость и расслабление",
    image: "/story-interests/mobility-v1.webp",
    place: "home",
    direction: "stretch",
  },
  {
    id: "mobility",
    name: "Мобильность",
    detail: "Дома · свобода движения",
    image: "/story-v2/mobility.webp",
    place: "home",
    direction: "mobility",
  },
  {
    id: "outdoor",
    name: "На улице",
    detail: "Свой вес · на свежем воздухе",
    image: "/story-v2/fitness.webp",
    place: "outdoor",
    direction: "strength",
  },
];

export const equipmentFilters: { id: BuilderEquipmentFilter; name: string }[] = [
  { id: "all", name: "Всё" },
  { id: "machines", name: "Тренажёры" },
  { id: "free_weights", name: "Свободные веса" },
  { id: "bodyweight", name: "Свой вес" },
  { id: "bands", name: "Резинки" },
  { id: "cables", name: "Блоки / тросы" },
];
