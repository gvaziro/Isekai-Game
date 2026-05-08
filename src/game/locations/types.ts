/**
 * Общий формат локации: сегменты путей, пропсы, аним-станции, спавны, выходы.
 * Координаты — «ноги» у нижней кромки спрайтов (origin 0.5, 1).
 */

export type LocationId = "town" | "forest" | "dungeon" | "beyond";

export type PathSegment = { x: number; y: number; w: number; h: number };

/**
 * Прямоугольный статический коллайдер пропа.
 *
 * Позиция пропа `(x, y)` — это «ноги» (origin спрайта `0.5, 1`).
 * Центр коллайдера ставится в `(x, y - oy)` с размером `(w, h)`. То есть
 * `oy` — это сдвиг центра коллайдера ВВЕРХ от точки «ног».
 *
 * При `fit: "frame"` поля `w/h/oy` игнорируются и в рантайме берутся
 * по фактическому размеру кадра текстуры: `w = frame.width`,
 * `h = frame.height`, `oy = h / 2` (коллайдер по всей видимой фигуре,
 * нижняя кромка ровно у «ног»). Это правильный выбор для стен/глыб и
 * вообще любых «полностью твёрдых» спрайтов, особенно вырезанных вручную
 * из тайлсета — там автор не знает заранее размеры кадра, и важно, чтобы
 * коллизия совпадала с картинкой пиксель-в-пиксель по верху.
 */
export type PropCollider = {
  w: number;
  h: number;
  oy?: number;
  fit?: "frame";
};

export type LayoutImageProp = {
  x: number;
  y: number;
  texture: string;
  /**
   * Масштаб спрайта. Для деревьев коллайдер масштабируется вместе с ним в рантайме
   * (`MainScene.placeChunkLayoutProp`); для прочих пропов — только визуал.
   */
  displayScale?: number;
  /** Отразить спрайт по X (коллайдер симметричный). */
  flipX?: boolean;
  /** Сдвиг sort-depth относительно `y` (тонкая перестановка порядка). */
  depthBias?: number;
  /** Кадр многостраничной текстуры (spritesheet), если задан. */
  frame?: number;
  collider?: PropCollider;
  /** Крупный валун в процедурном лесу — добывается киркой (мелкие `rock*` без флага не добываются). */
  mineableRock?: boolean;
  /**
   * Вырез из листа (например `nature_rocks`), пиксели в исходном PNG.
   * Задаётся вместе с `texture: "nature_rocks"`.
   */
  textureCrop?: { x: number; y: number; w: number; h: number };
  /** Сдвиг якоря ног от (x,y) layout для валунов с `textureCrop`. */
  rockPlacementOffset?: { x: number; y: number };
};

export type LayoutAnimStation = {
  x: number;
  y: number;
  texture: string;
  animKey: string;
  collider: { x: number; y: number; w: number; h: number };
};

export type GrassDecorDef = {
  x: number;
  y: number;
  variant: number;
  /** Сдвиг sort-depth от базового `y` (процедурный лес). */
  depthBias?: number;
};

/**
 * Тайл пола 16×16 (origin top-left). Используется для процедурных локаций
 * (подземелье), где пол собирается из множества кадров spritesheet.
 */
export type FloorTile = {
  x: number;
  y: number;
  texture: string;
  frame: number;
  /** Размер тайла в пикселях; по умолчанию 16. */
  size?: number;
};

/** Зона выхода: прямоугольник активации (левый верх x,y; размеры в пикселях мира). */
export type LocationExit = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  targetLocationId: LocationId;
  targetSpawnId: string;
  /** Текст подсказки при наведении */
  label?: string;
};

/** Спавн врага (как в `ENEMY_SPAWNS`); при `enemySpawns` в локации — из JSON. */
export type LocationEnemySpawn = {
  id: string;
  zoneId: string;
  x: number;
  y: number;
  lootTable: string;
  mobVisualId: string;
  /** Уровень моба (статы из `getEnemyStatsForVisual(mobVisualId, level)`). По умолчанию 1. */
  level?: number;
  /** Переопределение радиуса агро; иначе `MOB_AGGRO_RADIUS` из balance. */
  aggroRadius?: number;
  /** Переопределение сброса агро; иначе `MOB_LOSE_AGGRO_RADIUS`. */
  loseAggroRadius?: number;
  /** Переопределение лиза от спавна; иначе `MOB_LEASH_RADIUS`. */
  leashRadius?: number;
};

export type GameLocation = {
  id: LocationId;
  world: { width: number; height: number };
  backgroundFill: number;
  /** Ключ текстуры из manifest (Phaser `this.add.image(..., key)`). */
  groundTextureKey: string;
  pathSegments: PathSegment[];
  imageProps: LayoutImageProp[];
  animStations: LayoutAnimStation[];
  pondCollider?: Readonly<{ x: number; y: number; w: number; h: number }>;
  npcIdleTexture: Record<string, string>;
  /**
   * Позиции NPC (ноги); применяются к маршруту из `/api/npcs` со сдвигом waypoints.
   * Ключи — id NPC (как в `npcIdleTexture`).
   */
  npcSpawnOverrides?: Record<string, { x: number; y: number }>;
  /**
   * Спавны мобов. Если не задано — в игре подставляются константы `ENEMY_SPAWNS`.
   * Пустой массив — без врагов (только если задан явно в JSON).
   */
  enemySpawns?: LocationEnemySpawn[];
  /** Обязателен ключ `default` — респавн после смерти и базовая точка. */
  spawns: Record<string, { x: number; y: number }> & {
    default: { x: number; y: number };
  };
  exits: LocationExit[];
  /**
   * Опциональные тайлы пола (16×16) для процедурных локаций. Рисуются
   * поверх `groundTextureKey` и под `pathSegments`/`imageProps`.
   */
  floorTiles?: FloorTile[];
  grassDecorSeed: number;
  grassDecorCount: number;
  /**
   * Явный список кустов травы. Если задан (не `undefined`) — используется вместо
   * процедурной генерации по seed/count. Пустой массив — явно «без травы».
   * Нужен редактору карт (перемещение/добавление/удаление конкретных кустов).
   */
  grassDecorItems?: GrassDecorDef[];
};

export const CAMERA_ZOOM_PLAY = 2;

export function pointInSegment(
  px: number,
  py: number,
  seg: PathSegment,
  margin = 0
): boolean {
  return (
    px >= seg.x - margin &&
    px <= seg.x + seg.w + margin &&
    py >= seg.y - margin &&
    py <= seg.y + seg.h + margin
  );
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Вариант куста: преимущественно по «ячейке» сетки (пятна), иногда случайный. */
function grassVariantForPosition(
  x: number,
  y: number,
  seed: number,
  rand: () => number
): number {
  const cell = 56;
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  let h = (seed ^ Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  const coherent = (h >>> 0) % 4;
  if (rand() < 0.3) return Math.floor(rand() * 4);
  return coherent;
}

/** Детерминированный PRNG (0..1) для декора/процедурки. */
export function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildGrassDecorList(
  world: { width: number; height: number },
  segments: PathSegment[],
  props: LayoutImageProp[],
  stations: LayoutAnimStation[],
  hero: { x: number; y: number },
  seed: number,
  targetCount = 88
): GrassDecorDef[] {
  const rand = mulberry32(seed);
  const out: GrassDecorDef[] = [];
  const marginPath = 36;
  const marginProp = 38;
  /** Минимальное расстояние между центрами кустов (кадр ~32px). */
  const minDist = 32;
  const minDistSq = minDist * minDist;
  let attempts = 0;
  while (out.length < targetCount && attempts < 28000) {
    attempts++;
    const x = 32 + rand() * (world.width - 64);
    const y = 32 + rand() * (world.height - 64);
    if (segments.some((s) => pointInSegment(x, y, s, marginPath))) continue;
    if (props.some((p) => dist(p.x, p.y, x, y) < marginProp)) continue;
    if (stations.some((s) => dist(s.x, s.y, x, y) < marginProp)) continue;
    if (dist(hero.x, hero.y, x, y) < 48) continue;
    if (out.some((p) => distSq(p.x, p.y, x, y) < minDistSq)) continue;
    out.push({
      x,
      y,
      variant: grassVariantForPosition(x, y, seed, rand),
    });
  }
  return out;
}

export function pointInExitZone(
  px: number,
  py: number,
  e: Pick<LocationExit, "x" | "y" | "w" | "h">,
  margin = 0
): boolean {
  return (
    px >= e.x - margin &&
    px <= e.x + e.w + margin &&
    py >= e.y - margin &&
    py <= e.y + e.h + margin
  );
}
