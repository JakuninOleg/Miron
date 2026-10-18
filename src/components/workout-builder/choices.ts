import type { CatalogContext, CatalogDirection } from "@/shared/catalog-taxonomy";
import type { BuilderEquipmentFilter } from "@/shared/workout-builder";

export const places: { id: CatalogContext; name: string; detail: string; image: string }[] = [
  { id: "gym", name: "В зале", detail: "Тренажёры и железо", image: "/visuals/soft-3d/gym.webp" },
  { id: "home", name: "Дома", detail: "Всё, что под рукой", image: "/visuals/soft-3d/home.webp" },
  {
    id: "outdoor",
    name: "На улице",
    detail: "Движение на воздухе",
    image: "/visuals/soft-3d/fitness.webp",
  },
  {
    id: "workout_park",
    name: "На площадке",
    detail: "Турники и брусья",
    image: "/visuals/soft-3d/park.webp",
  },
];

export const directions: { id: CatalogDirection; name: string; image: string }[] = [
  { id: "strength", name: "Силовая", image: "/visuals/soft-3d/gym.webp" },
  { id: "calisthenics", name: "Свой вес", image: "/visuals/soft-3d/park.webp" },
  { id: "yoga", name: "Йога", image: "/visuals/soft-3d/yoga.webp" },
  { id: "stretch", name: "Растяжка", image: "/visuals/soft-3d/mobility.webp" },
  { id: "mobility", name: "Мобильность", image: "/visuals/soft-3d/mobility.webp" },
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
    image: "/visuals/soft-3d/gym.webp",
    place: "gym",
    direction: "strength",
  },
  {
    id: "home",
    name: "Силовая дома",
    detail: "С твоим инвентарём",
    image: "/visuals/soft-3d/home.webp",
    place: "home",
    direction: "strength",
  },
  {
    id: "calisthenics",
    name: "Калистеника",
    detail: "На площадке · турники и брусья",
    image: "/visuals/soft-3d/park.webp",
    place: "workout_park",
    direction: "calisthenics",
  },
  {
    id: "home-bodyweight",
    name: "Свой вес дома",
    detail: "Движение без тренажёров",
    image: "/visuals/soft-3d/home.webp",
    place: "home",
    direction: "calisthenics",
  },
  {
    id: "yoga",
    name: "Йога",
    detail: "Дома · баланс и спокойствие",
    image: "/visuals/soft-3d/yoga.webp",
    place: "home",
    direction: "yoga",
  },
  {
    id: "stretch",
    name: "Растяжка",
    detail: "Дома · гибкость и расслабление",
    image: "/visuals/soft-3d/mobility.webp",
    place: "home",
    direction: "stretch",
  },
  {
    id: "mobility",
    name: "Мобильность",
    detail: "Дома · свобода движения",
    image: "/visuals/soft-3d/mobility.webp",
    place: "home",
    direction: "mobility",
  },
  {
    id: "outdoor",
    name: "На улице",
    detail: "Свой вес · на свежем воздухе",
    image: "/visuals/soft-3d/fitness.webp",
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
