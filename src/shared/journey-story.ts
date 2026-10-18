export const JOURNEY_CHAPTERS = [
  {
    id: "meeting",
    title: "Знакомство",
    days: 0,
    image: "/visuals/soft-3d/scenes/welcome-v2.webp",
    alt: "Макс и Лика на скамье в тёплом солнечном зале",
    teaser: "У любой большой истории есть маленькое начало.",
    setting:
      "В старом шкафчике зала нашлась карта. На ней — город, который каждый день остаётся где-то за привычным маршрутом.",
    lines: [
      { speaker: "max", text: "Смотри, сколько всего рядом. А мы всё время идём одной дорогой." },
      { speaker: "lika", text: "Тогда в следующий раз свернём. Куда-нибудь, где ещё не были." },
      { speaker: "max", text: "Договорились. Карту берём. За идеальным планом не возвращаемся." },
    ],
    ending: "Так появился первый маршрут. Пока только на бумаге.",
  },
  {
    id: "first-route",
    title: "Первый маршрут",
    days: 1,
    image: "/visuals/soft-3d/journey/first-route-v1.webp",
    alt: "Макс рассматривает карту, Лика показывает на неё у солнечной набережной",
    teaser: "Кажется, мы держали карту вверх ногами.",
    setting:
      "До набережной дошли быстро. А вот обещанный на карте мост почему-то оказался за спиной.",
    lines: [
      { speaker: "lika", text: "Макс. У тебя река течёт в небо." },
      { speaker: "max", text: "Это не ошибка. Это авторское прочтение карты." },
      { speaker: "lika", text: "Перевернём? Тут, кстати, хорошая дорожка вдоль воды." },
      { speaker: "max", text: "Вот по ней и пойдём. Первый маршрут может быть неидеальным." },
    ],
    ending: "Мост нашёлся. А вместе с ним — повод пройти чуть дальше привычного.",
  },
  {
    id: "own-trail",
    title: "Своя тропа",
    days: 4,
    image: "/visuals/soft-3d/journey/own-trail-v1.webp",
    alt: "Макс и Лика рассматривают карту за столом в зелёном городском парке",
    teaser: "Не самый короткий путь. Зато твой.",
    setting:
      "В парке обнаружилась тропинка, которой на карте не было. Она петляла между деревьями и явно никуда не торопилась.",
    lines: [
      { speaker: "lika", text: "Мне сюда. Здесь тихо." },
      { speaker: "max", text: "Навигатор говорит: маршрута нет." },
      { speaker: "lika", text: "Значит, будет наш." },
      {
        speaker: "max",
        text: "Рисую. Только название придумай ты, а то получится «Тропа номер один».",
      },
    ],
    ending: "На карте появилась новая линия. Не прямая — зато своя.",
  },
  {
    id: "further-together",
    title: "Дальше вместе",
    days: 8,
    image: "/visuals/soft-3d/journey/further-together-v1.webp",
    alt: "Макс и Лика смотрят на вечерний город с безопасной смотровой площадки",
    teaser: "Город тот же. А знакомых мест стало больше.",
    setting:
      "Со смотровой видно набережную, парк и длинную петлю их маршрута. Карта заметно помялась, но стала гораздо интереснее.",
    lines: [
      { speaker: "max", text: "Сверху наш путь вообще не похож на прямую." },
      { speaker: "lika", text: "А он и не обязан. Мы ведь не на время." },
      { speaker: "max", text: "Зато теперь я знаю, где лучший вид. И где мы заблудились." },
      { speaker: "lika", text: "Это оставим в семейном архиве карты." },
    ],
    ending: "Первое маленькое приключение закончилось. Пройденный путь остаётся с тобой.",
  },
] as const;

export type JourneyChapter = (typeof JOURNEY_CHAPTERS)[number];

export function journeyState(activityDays?: number) {
  const days =
    typeof activityDays === "number" && Number.isSafeInteger(activityDays) && activityDays >= 0
      ? activityDays
      : null;
  const available = JOURNEY_CHAPTERS.filter((chapter) => chapter.days <= (days ?? 0));
  return {
    days,
    available,
    current: available[available.length - 1],
    next: days === null ? undefined : JOURNEY_CHAPTERS.find((chapter) => chapter.days > days),
  };
}
