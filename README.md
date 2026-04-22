# Nagibatop — пиксельная локация с AI‑NPC

Прототип браузерной 2D‑сцены на **Next.js (App Router)** и **Phaser**: игрок ходит по миру **1280×960** (тайл 16px, zoom камеры ×2), NPC патрулируют по `npcs/<id>/route.json`, диалоги через серверный OpenAI API.

Визуально используется **только один пак** — **[Pixel Crawler — Free Pack](https://five-birds.itch.io/pixel-crawler)** (герой `Body_A`, NPC Knight/Rogue/Wizzard из папки `Entities/Npc's`, локация из тайлов и станций окружения). Положите распакованный архив в `public/assets/Pixel Crawler - Free Pack/`, затем выполните:

```bash
npm run gen-assets
```

Без этого шага игра не загрузит `/assets/world/manifest.json`.

## Иконки предметов (атлас)

Исходные PNG лежат в **`public/assets/items/`** (по одному файлу на иконку, например `item1.png`). После добавления или смены файлов соберите атлас и регенерируйте типы:

```bash
npm run gen-items
```

На выходе: `public/assets/world/items_atlas.png`, `items_atlas.json`, файл [`src/game/data/items.generated.ts`](src/game/data/items.generated.ts). Логический словарь (названия, слоты, связь «семантический id → кадр в атласе») редактируется в [`src/game/data/items.curated.ts`](src/game/data/items.curated.ts). Обычный порядок: **`npm run gen-assets`**, при необходимости **`npm run gen-items`**, затем **`npm run dev`**.

## Самопроверка карты

Раскладка объектов задаётся в **`src/game/layout.ts`** и должна совпадать с размерами мира в манифесте (**1280×960**).

1. После правок локации снова сгенерируйте ассеты: `npm run gen-assets`.
2. Статическое PNG-превью (sharp, композиция спрайтов из манифеста):  
   `npm run preview:static` → **`preview/map.png`** и **`preview/map_small.png`** (масштаб 0.5).
3. Живой снимок канваса Phaser в браузере (опционально): установите браузер Chromium для Playwright один раз — `npx playwright install chromium`, затем `npm run preview:live` → **`preview/live.png`** (поднимает временный `next dev`, открывает `/game?preview=1`, скриншот без следования камеры за героем).  
   **Важно:** Next.js 16 не запускает второй `next dev` в том же каталоге — перед скриптом закройте другой дев-сервер этого проекта или укажите уже работающий URL:  
   `NAGIBATOP_PREVIEW_URL=http://127.0.0.1:3000 npm run preview:live` (тогда отдельный сервер не поднимается).

Страница **`/game?preview=1`** задаёт размер канваса по размеру мира и `zoom = 1`, чтобы на снимке была видна вся карта.

Архив **Tiny Swords** в репозитории может лежать как неиспользуемый легаси — клиент его не подгружает.

## Требования

- Node.js 20+
- npm

## Установка

```bash
npm install
```

Создайте `.env.local` по образцу [`.env.example`](./.env.example) и укажите `OPENAI_API_KEY`.

## Запуск разработки

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000), затем страницу **«Играть»** (`/game`).

Управление: **WASD** или стрелки; **E** — действие рядом (NPC, сундук, станция, предмет на земле); у NPC с лавкой — выбор «Поговорить» или «Торговля»; **I** — инвентарь; **F9** — компактная dev-панель с координатами и версией сохранения (не показывается при `?preview=1`). Состояние (позиция, инвентарь, золото, склады торговцев, сундуки) в `localStorage` (ключ `nagibatop-save-v1`).

## Структура данных NPC

Каждый персонаж — папка `npcs/<id>/`:

| Файл | Назначение |
|------|------------|
| `character.md` | Личность, голос, табу (длинный системный контекст) |
| `traits.json` | Структурированные черты (поле `name` попадает в заголовок диалога через API) |
| `events.jsonl` | Журнал событий (append‑only, одна JSON‑строка на событие) |
| `route.json` | Спавн, скорость, паузы, waypoints патруля |

После каждого успешного ответа в чате сервер дописывает строку в `events.jsonl` (тип `dialogue`).

## API

- `GET /api/npcs` — список NPC: `id`, `route`, опционально `displayName` (из `traits.json`).
- `POST /api/chat/[npcId]` — потоковый текстовый ответ (`text/plain`), тело: `{ message, history }`.
- `POST /api/npc/[npcId]/event` — либо `mode: "append"` и поля `type`/`summary`, либо `mode: "summarize_dialogue"` с `transcript` для отдельной саммаризации (опционально).

## Продакшен на своём сервере

```bash
npm run build
npm run start
```

Убедитесь, что переменные окружения заданы на хосте и каталог `npcs/` доступен процессу на запись (для `events.jsonl`).

## Лицензии ассетов

- **Pixel Crawler — Free Pack** — автор и условия см. на itch.io и файл `public/assets/Pixel Crawler - Free Pack/Terms.txt`.
- Файлы в `public/assets/world/` генерируются локально скриптом (`grass.png`, `dirt.png`, сборки пруда и домика из тайлов пака).
