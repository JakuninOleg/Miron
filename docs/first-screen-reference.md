# Первый экран — текущая редакция по двум новым референсам

7 октября 2026. Меняется только первое знакомство `/story` и его прямая ссылка `/story/first`.

## Что изменено

- На desktop и телефонах единый посыл: «Привет! Мы Макс и Лика», «Будем рядом в тренировках. А дальше разберёмся по ходу», «Давай знакомиться».
- Макс — коралловый, Лика — розовая; на широких и портретных экранах имена подчёркиваются коротким рисованным штрихом. Reduced motion отключает анимацию.
- Извлечены новые иллюстрации из референсов пользователя. Макс протягивает руку, Лика опирается щекой на ладонь. Выражение Макса мягче, свет менее резкий.
- Карточка видео, текстовый диалог вместо видео и дополнительная цитата удалены. На desktop остаются четыре блока функций.
- Обе реплики находятся в области арта и видны на телефонах, планшетах и desktop. У реплики Лики хвост направлен влево вниз к персонажу; текст — «Здорово, что ты с нами!». На портретных экранах её бабл без наклона, с закруглёнными углами, текстом Manrope и запасом до правого края.
- В шапке только фирменный wordmark MIRON, без отдельного знака M. Нижний блок четырёх функций ограничен шириной 1250px и центрирован; иконки выровнены по вертикальному центру текста.
- На desktop группа знакомства выровнена по вертикальному центру области над нижними блоками, поэтому находится ниже прежнего фиксированного отступа. Коралловые и розовые мазки объединены в прозрачную фактуру, которая обрамляет имена слева и пространство под кнопкой. На портретных экранах отдельная фактура скрыта: краска остаётся внутри арта с персонажами, у заголовка отдельного мазка нет.
- Портретная композиция выбирается по пропорциям viewport, включая iPad Pro 13. Заголовок/кнопка/индикатор занимают свои строки, арт — оставшееся пространство. Высота страницы равна текущему viewport (`dvh` с `svh` fallback), учтены safe-area. Альбомная ориентация использует широкую сцену, короткая альбомная — компактные размеры.
- Один адаптивный `picture` с `getImageProps`: браузер выбирает нужный файл вместо одновременной загрузки двух больших иллюстраций.

Типографика: Roboto Condensed 900, Manrope, Neucha; существующий фирменный wordmark MIRON. Контракты аккаунта, БД и остальные сцены не менялись.

## Контуры реплик и логотип

Каждая реплика рисуется одним замкнутым SVG-контуром: тело и хвост имеют общую заливку и непрерывную чёрную обводку. На портретных экранах Макс использует округлый контур, Лика — контур с закруглёнными углами. На широких оба используют закруглённые углы. `vector-effect="non-scaling-stroke"` сохраняет толщину обводки при адаптации; текст остаётся HTML. Отдельные треугольники через CSS `:after` удалены.

Шапка использует `/brand/wordmark.webp` с открытой R и прорезной O вместо набранного текста. Wordmark сохраняет исходную геометрию v2. Изолированная область композитинга на фоне шапки убирает белую подложку надписи. Это обработка отображения в первом экране, а не новый прозрачный экспорт файла логотипа.

## Файлы

- `src/components/story-first-screen.tsx`
- `src/components/story-first-screen.module.css`
- `public/story-first/paint-frame-v1.webp` — фактура краски с alpha, 1448×1086, 390116 байт.
- `assets/onboarding/paint-frame-v1.prompt.json` — запрос, референс и источник фактуры.
- `public/story-first/desktop-v2.webp` (1672×941)
- `public/story-first/mobile-v2.webp` (1086×1448)
- `tests/e2e/first-screen.spec.ts`

Старые изображения оставлены для сравнения; новый экран использует v2.

Старая маска `intro-brush.svg` сохранена для сравнения, текущий экран её не использует. Фактура краски не содержит персонажей, текста или логотипа, не перехватывает указатель и не влияет на размер документа.

## Медиа и промпты

Встроенный imagegen, редактирование пользовательских референсов. WebP — перекодирование sharp без изменения рисунка. Исходные PNG находятся в `C:/Users/olegk/.codex/generated_images/01a10cc7-5f5f-76e2-b036-8dc1dd07fab3/`.

Desktop: `exec-2c8a01a1-78a2-42da-9354-9e5f0cc8fcf4.png`. Первый референс — `codex-clipboard-7d8a85e2-623e-478d-8af6-490d387157c8.png`, второй — `codex-clipboard-4c540420-d3f4-401d-81e2-bf5e798134b1.png`.

> Create the clean background illustration for implementing the FIRST reference desktop screen in HTML. Edit target FIRST image: preserve this exact wide 16:9 industrial gym composition, Max seated at center with towel on his shoulder extending his open hand toward viewer, Lika seated at right resting cheek in hand, pink jacket/black top, shaker, bag, windows. SECOND reference is the identity/expression reference for Max: give Max that same kinder open friendly face, gently smiling with relaxed symmetric brows, no smug smirk, no fashion-model pout. Keep Lika's existing face. Preserve comic art style, black/coral/pink colors. Reduce harsh orange rim highlights, pale blown window glow and shiny streaks; softer moderate warm daylight and natural skin color. REMOVE ALL UI: header logo/progress, headings, body copy, buttons, feature icons/text, both speech balloons and labels, all readable graffiti. Reconstruct matching gym underneath. Preserve small M clothing logos. Keep left 29% dark environmental negative space for live HTML text. Maintain character placements faithfully, heads fully visible. Artwork only, no UI or text. Wide landscape.

Mobile: `exec-12e71390-ca15-4ffa-85eb-9d6a35fadd8a.png`. Референс — `codex-clipboard-4c540420-d3f4-401d-81e2-bf5e798134b1.png`.

> Edit this reference to extract only its comic illustration for a responsive mobile web screen. Preserve exact character identities and poses: Max left seated with white towel over shoulder, black T-shirt, extending welcoming open hand to viewer, kind relaxed friendly face with soft natural smile and symmetric relaxed brows, no smug smirk; Lika right seated resting cheek in hand, loose brunette bun, pink jacket and black sports top, same friendly face. Dark industrial gym, coral and pink brush paint diagonals around them, subtle drawn texture, soft warm light. Remove all UI, phone borders, status bar, brand header, titles, body text, button, progress, speech balloon and all readable graffiti. Crop only the illustrated region: full top of Max's hair with generous ~15% headroom above, down to laps/thighs, both shoulders and reaching hand fully visible. Portrait 3:4 artwork, characters next to each other as reference. Preserve appearance precisely, soften sharp orange rimlights and harsh shiny streaks. Artwork only, NO text. Keep small M on clothing.

## Проверка

Фактура краски сгенерирована встроенным imagegen с `transparent_background=true`. Исходник: `exec-2edca4b9-ab72-4cae-84b6-08e71740c3fe.png` в той же папке generated_images. Alpha проверен: диапазон 0–255. WebP — перекодирование sharp без кадрирования, удаления фона или изменения рисунка. Прозрачные края и плотность проверены уже на тёмном фоне экрана.

Матрица первого экрана: 320×568, 375×667, 375×548 (уменьшенная высота браузера), 390×844, 412×915, 768×1024, 1032×1376, 1376×1032, 1280×800, 1672×941, 1920×1080, 667×375. Проверяется высота/ширина документа, полный viewport кнопки, доступность её центра через `elementFromPoint`, минимальная высота 44px, переход к Максу и отсутствие видео-кнопки. Отдельный сценарий проверяет динамическую смену ориентации и клавиатуру. Визуальные снимки: `.local/previews/first-v2-*.png`.

Это браузерные проверки Chromium. Физические iOS/Android, Safari и настройки увеличенного системного текста требуют отдельного прохода; результат не означает проверку всех существующих устройств.

Финальный прогон на production-сборке: `npm run build`, `npm run typecheck`, `npm run lint` — успешно, без предупреждений линтера. `npm test` — 94 passed / 12 skipped (БД-интеграции не запускались, миграций нет). Playwright: 17 passed — 12 размеров, смена ориентации/клавиатура и 4 прежних сценария знакомства. Прямой preview: `http://127.0.0.1:3073/story/first`.

После точечной правки контуров и брендинга повторены build, typecheck, lint и оба Playwright-файла (`first-screen.spec.ts`, `story.spec.ts`): 17 passed. Визуально проверены обновлённые снимки SE, desktop и iPad Pro; высота страницы остаётся равна viewport. В этом проходе доменные/БД-тесты не повторялись.

Последующая правка добавляет мобильную реплику Лики, убирает отдельный M из шапки, включает desktop-подчёркивания, центрирует блок функций и заменяет край мазка SVG-маской. После корректировки наклона/отступов Лики повторены build, typecheck, lint и те же 17 браузерных сценариев. Актуальные снимки — `.local/previews/first-v2-*.png`, деталь мобильной реплики — `.local/previews/lika-bubble-final.png`.

Для текущей редакции краски и desktop-позиционирования повторены build, typecheck, lint и 17 Playwright-сценариев: успешно. Дополнительные визуальные/геометрические снимки — 440×956 (размер из скриншота пользователя) и 2560×1440. На них документ равен viewport, кнопка полностью доступна. На SE верхний декоративный мазок отсутствует, размер текстовой группы и кнопки сохранён. Доменные/БД-тесты в этом UI-проходе не запускались.
