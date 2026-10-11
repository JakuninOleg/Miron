# MIRON — favicon и графика для установки PWA

Комплект использует новый растровый знак M из `assets/brand/miron/v2/`. Он включает иконки и manifest для будущего приложения. В репозитории пока нет приложения Next.js и его runtime: эти файлы ещё не подключены к работающему интерфейсу. Комплект сам по себе не реализует офлайн-тренировки, синхронизацию данных, push-уведомления или service worker.

## Файлы

| Файл относительно корня проекта                                     | Назначение                                                           |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `public/favicon.ico`                                                | Браузерная иконка с размерами 16, 32 и 48 px                         |
| `public/favicon-16.png`                                             | PNG для отображения в 16 px                                          |
| `public/favicon-32.png`                                             | PNG для отображения в 32 px                                          |
| `public/favicon-48.png`                                             | PNG для отображения в 48 px                                          |
| `public/apple-touch-icon.png`                                       | Иконка 180 × 180 px для добавления на домашний экран iPhone/iPad     |
| `public/icons/apple-touch-icon-152.png`, `apple-touch-icon-167.png` | Дополнительные размеры Apple; основное подключение использует 180 px |
| `public/icons/icon-192.png`                                         | Обычная иконка PWA 192 × 192 px, `purpose: any`                      |
| `public/icons/icon-512.png`                                         | Обычная иконка PWA 512 × 512 px, `purpose: any`                      |
| `public/icons/icon-1024.png`                                        | Дополнительный крупный экспорт; в manifest не требуется              |
| `public/icons/icon-maskable-192.png`                                | Иконка с запасом под системную маску, 192 × 192 px                   |
| `public/icons/icon-maskable-512.png`                                | Иконка с запасом под системную маску, 512 × 512 px                   |
| `public/site.webmanifest`                                           | Название MIRON, русская локаль, иконки, режим отдельного окна        |
| `docs/pwa-metadata.ts`                                              | Пример metadata/viewport для будущего Next.js App Router             |
| `assets/brand/miron/pwa/icons-preview.png`                          | Проверка маленьких размеров и системных масок                        |
| `assets/brand/miron/pwa/miron-pwa-kit.zip`                          | Комплект public, инструкция, metadata и превью                       |

## Экспорт и выполненная проверка

Квадратная основа `assets/brand/miron/pwa/icon-master.png` создана встроенным image_gen по новому знаку v2. Запрос сохранён в `prompt.json` рядом. Размеры экспортируются из одного изображения без перерисовки и без удаления фона: `scripts/build-pwa-icons.cjs` использует Node.js и sharp. Если sharp установлен локально, повторить командой `node scripts/build-pwa-icons.cjs`; для внешнего модуля можно задать `SHARP_MODULE` с путём к нему.

Проверены размеры и непрозрачность всех 11 PNG, декодирование трёх ICO-кадров отдельным декодером, существование всех ссылок manifest и metadata, JSON manifest. В maskable важные пиксели знака находятся не далее 35,8% стороны от центра, внутри круга 40%; геометрическая проверка включает запас вокруг полного прямоугольника знака. Отчёт экспорта — `assets/brand/miron/pwa/export-report.json`. Превью проверено визуально, в том числе favicon 16 px. Установка на реальные устройства пока не проверялась: работающего приложения ещё нет.

Иконки для домашнего экрана экспортируются на непрозрачном фоне `#141416`. Для maskable-версий знак занимает меньшую площадь: важные части должны помещаться в центральный круг радиуса 40% от стороны картинки. Система сама обрезает квадрат в круг, скруглённый квадрат или другую форму, поэтому углы в исходнике не скругляем. Обычные и maskable-иконки объявлены отдельно. [Официальное руководство web.dev по иконкам manifest](https://web.dev/learn/pwa/web-app-manifest).

## Подключение к будущему приложению

1. Сохранить каталог `public` в корне Next.js-проекта: его содержимое должно открываться по URL от `/`.
2. Перенести exports `metadata` и `viewport` из `docs/pwa-metadata.ts` в корневой `app/layout.tsx` или `src/app/layout.tsx`, объединив с metadata приложения. HTML приложения должен иметь `lang="ru"`.
3. Оставить один manifest: пример подключает `/site.webmanifest`. Одновременно создавать `app/manifest.ts` или `app/manifest.json` не нужно.
4. Если будущий scaffold добавит `app/favicon.ico`, `app/icon.png` или `app/apple-icon.png`, заменить стандартные иконки MIRON и выбрать один способ подключения: файловые conventions Next.js либо `metadata.icons` из примера. Файловые metadata имеют приоритет; не оставлять стандартную иконку Next.js рядом с нашим подключением.
5. Выполнить браузерную проверку на HTTPS или localhost: URL иконок и manifest должны отвечать без редиректа на авторизацию. В DevTools → Application → Manifest проверить размеры, maskable-маску и запуск приложения. Отдельно проверить добавление на домашний экран iOS и Android.

`themeColor` задаётся через отдельный export `viewport`, как требует текущий Next.js. В manifest `theme_color` и `background_color` совпадают с тёмным фоном иконок. Тема интерфейса с Максом или Ликой сможет позже задавать цвет браузера отдельно. [Next.js: viewport](https://nextjs.org/docs/app/api-reference/functions/generate-viewport), [Next.js: metadata и appleWebApp](https://nextjs.org/docs/app/api-reference/functions/generate-metadata).

`id` и `scope` равны `/`, `start_url` — `/dashboard`, чтобы собранная PWA открывала сохранённую оболочку без сети. Service worker также перенаправляет старый стартовый `/` в кабинет. После выбора домена нужно проверить фактическое размещение. `id` сохранять стабильным: это идентичность установленного приложения. `start_url` должен оставаться внутри `scope`. Для размещения под префиксом, например `/miron/`, потребуется поправить абсолютные пути. [W3C: Web Application Manifest](https://www.w3.org/TR/appmanifest/).

Safari получает `apple-touch-icon` 180 × 180 px через metadata; отдельные старые Microsoft tile-файлы в этот комплект не входят. [Apple: Web Clip icons](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html), [Next.js: favicon, icon, apple-icon](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons).

## Граница готовности

Графические файлы и их декларация готовы. Проверка реальной установки, поведения окна приложения и офлайн-сценариев выполняется после появления работающего приложения. Для офлайн-тренировок потребуется выбранная стратегия кеширования оболочки и упражнений, локальное хранение состояния и сверка с сервером. Service worker для этого в данном комплекте не создаётся и не регистрируется. [Next.js: руководство по PWA](https://nextjs.org/docs/app/guides/progressive-web-apps).
