import {
  NATURE_ROCK_GRAY_BIG,
  NATURE_ROCK_GRAY_MEDIUM,
  NATURE_ROCKS_TEXTURE_KEY,
} from "@/src/game/data/natureRocksSlices";
import type {
  GrassDecorDef,
  LayoutImageProp,
  LocationEnemySpawn,
  LocationExit,
  PathSegment,
} from "@/src/game/locations/types";
import {
  mulberry32,
  pointInExitZone,
  pointInSegment,
} from "@/src/game/locations/types";

export const FOREST_CHUNK_W = 640;
export const FOREST_CHUNK_H = 640;

const TREE_COLLIDER = { w: 18, h: 10, oy: 6 } as const;
const ROCK_COLL = { w: 22, h: 12, oy: 7 } as const;

const BOULDER_COLL = { ...ROCK_COLL } as const;

const BOULDER_MAX_ATTEMPTS = 24000;
/** Минимум между центрами двух добываемых валунов в одном чанке. */
const BOULDER_MIN_DIST_BETWEEN = 48;

/** Текстуры деревьев (рубка, спавн чанков). */
export const TREE_TEXTURE_KEYS = [
  "tree1",
  "tree2",
  "tree3",
  "tree3_red",
  "tree1_autumn",
] as const;

const TREE_TEXTURES = TREE_TEXTURE_KEYS;

/** Дорога/тропа: отступ для деревьев (шире, чем для травы/мобов). */
const TREE_PATH_MARGIN_HUB = 56;
const TREE_PATH_MARGIN_WILD = 64;
const MARGIN_STATIC_PROP = 38;
const MARGIN_SPAWN = 56;
const MARGIN_EXIT = 56;
const MARGIN_ENEMY_SPAWN = 52;
const TREE_MAX_ATTEMPTS = 24000;

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

/**
 * 0.22…1.0 — «поляна» vs «густой подлесок»; детерминированно от мира и сида.
 * Два масштаба дают крупные пятна и мелкую неровность.
 */
export function forestTreePatchDensity01(
  worldX: number,
  worldY: number,
  densitySeed: number
): number {
  const ax = Math.floor(worldX / 92);
  const ay = Math.floor(worldY / 92);
  let h =
    (densitySeed ^ Math.imul(ax, 0x27d4eb2f) ^ Math.imul(ay, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  const u = (h >>> 0) / 4294967296;

  const bx = Math.floor(worldX / 38);
  const by = Math.floor(worldY / 38);
  let g =
    (densitySeed ^ 0x85ebca6b ^ Math.imul(bx, 0x4b9453f1) ^ Math.imul(by, 0x51ed280f)) >>>
    0;
  g = Math.imul(g ^ (g >>> 16), 2246822519);
  g = Math.imul(g ^ (g >>> 13), 3266489917);
  const v = (g >>> 0) / 4294967296;

  const t = 0.55 * u + 0.45 * v;
  const shaped = t * t;
  return 0.22 + 0.78 * shaped;
}

export function mixForestChunkSeed(worldSeed: number, cx: number, cy: number): number {
  let h = (worldSeed ^ Math.imul(cx, 0x9e3779b1) ^ Math.imul(cy, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Главная вертикальная тропа (мир. X совпадает с хабом) — продолжается во все чанки cy≥0. */
export const FOREST_MAIN_TRAIL_LEFT = 260;
export const FOREST_MAIN_TRAIL_W = 120;
export const FOREST_MAIN_TRAIL_RIGHT = FOREST_MAIN_TRAIL_LEFT + FOREST_MAIN_TRAIL_W;

/**
 * Участок главной тропы внутри чанка (мировые координаты).
 */
export function getMainTrailSegmentsForChunk(cx: number, cy: number): PathSegment[] {
  if (!isForestChunkAllowed(cx, cy)) return [];
  const ox = cx * FOREST_CHUNK_W;
  const oy = cy * FOREST_CHUNK_H;
  const ix0 = Math.max(ox, FOREST_MAIN_TRAIL_LEFT);
  const ix1 = Math.min(ox + FOREST_CHUNK_W, FOREST_MAIN_TRAIL_RIGHT);
  if (ix1 <= ix0) return [];
  return [{ x: ix0, y: oy, w: ix1 - ix0, h: FOREST_CHUNK_H }];
}

/** Хаб: дорога, выход в город, спавны — мировые координаты чанка (0,0). */
export const FOREST_HUB_PATH: PathSegment[] = [
  {
    x: FOREST_MAIN_TRAIL_LEFT,
    y: 0,
    w: FOREST_MAIN_TRAIL_W,
    h: FOREST_CHUNK_H,
  },
];

export const FOREST_HUB_EXITS: LocationExit[] = [
  {
    id: "to_town",
    x: 200,
    y: 568,
    w: 240,
    h: 72,
    targetLocationId: "town",
    targetSpawnId: "from_forest",
    label: "В поселение",
  },
];

export const FOREST_HUB_SPAWNS = {
  default: { x: 320, y: 420 },
  from_town: { x: 320, y: 130 },
} as const;

export const FOREST_HUB_ENEMY_SPAWNS: LocationEnemySpawn[] = [
  {
    id: "grunt_crossroads",
    zoneId: "crossroads",
    x: 300,
    y: 360,
    lootTable: "grunt",
    mobVisualId: "orc_warrior",
  },
  {
    id: "grunt_se_1",
    zoneId: "se_woods",
    x: 480,
    y: 420,
    lootTable: "grunt",
    mobVisualId: "skeleton_rogue",
  },
  {
    id: "grunt_se_2",
    zoneId: "se_woods",
    x: 520,
    y: 480,
    lootTable: "grunt",
    mobVisualId: "orc_shaman",
    level: 3,
  },
  {
    id: "grunt_se_3",
    zoneId: "se_woods",
    x: 440,
    y: 520,
    lootTable: "grunt",
    mobVisualId: "skeleton_warrior",
  },
];

const HUB_STATIC_PROPS: LayoutImageProp[] = [
  { x: 180, y: 480, texture: "rock1", collider: { ...ROCK_COLL } },
  { x: 520, y: 440, texture: "rock2", collider: { ...ROCK_COLL } },
  { x: 380, y: 560, texture: "bush1" },
  { x: 120, y: 320, texture: "bush2" },
];

function generateTreesInChunkRect(
  ox: number,
  oy: number,
  chunkW: number,
  chunkH: number,
  pathSegments: PathSegment[],
  staticProps: LayoutImageProp[],
  exits: LocationExit[],
  spawnPts: { x: number; y: number }[],
  enemySpawns: LocationEnemySpawn[],
  seed: number,
  maxTrees: number,
  minDistance: number,
  pathMarginForTrees: number,
  densitySeed: number
): LayoutImageProp[] {
  const rand = mulberry32(seed);
  const out: LayoutImageProp[] = [];
  let attempts = 0;

  while (out.length < maxTrees && attempts < TREE_MAX_ATTEMPTS) {
    attempts++;
    const x = ox + 32 + rand() * (chunkW - 64);
    const y = oy + 32 + rand() * (chunkH - 64);

    if (pathSegments.some((s) => pointInSegment(x, y, s, pathMarginForTrees))) {
      continue;
    }
    if (staticProps.some((p) => dist(p.x, p.y, x, y) < MARGIN_STATIC_PROP)) {
      continue;
    }
    if (exits.some((e) => pointInExitZone(x, y, e, MARGIN_EXIT))) {
      continue;
    }
    if (spawnPts.some((s) => dist(s.x, s.y, x, y) < MARGIN_SPAWN)) {
      continue;
    }
    if (enemySpawns.some((e) => dist(e.x, e.y, x, y) < MARGIN_ENEMY_SPAWN)) {
      continue;
    }

    const density = forestTreePatchDensity01(x, y, densitySeed);
    const acceptProb = 0.2 + 0.8 * density;
    if (rand() > acceptProb) {
      continue;
    }

    const localMin = Math.max(
      42,
      Math.min(86, minDistance * (0.58 + 0.52 * density))
    );
    const localMinSq = localMin * localMin;
    if (out.some((t) => distSq(t.x, t.y, x, y) < localMinSq)) {
      continue;
    }

    const texIndex = Math.floor(rand() * TREE_TEXTURES.length);
    const texture = TREE_TEXTURES[texIndex] ?? TREE_TEXTURES[0];
    out.push({
      x,
      y,
      texture,
      collider: { ...TREE_COLLIDER },
    });
  }
  return out;
}

/**
 * Крупные добываемые валуны: реже деревьев, дальше от любых пропов и тропы.
 */
function generateForestBouldersInChunkRect(
  ox: number,
  oy: number,
  chunkW: number,
  chunkH: number,
  pathSegments: PathSegment[],
  existingProps: LayoutImageProp[],
  exits: LocationExit[],
  spawnPts: { x: number; y: number }[],
  enemySpawns: LocationEnemySpawn[],
  seed: number,
  maxBoulders: number,
  pathMargin: number
): LayoutImageProp[] {
  const rand = mulberry32(seed ^ 0xb011d365);
  const out: LayoutImageProp[] = [];
  let attempts = 0;
  const minBetweenBouldersSq =
    BOULDER_MIN_DIST_BETWEEN * BOULDER_MIN_DIST_BETWEEN;

  while (out.length < maxBoulders && attempts < BOULDER_MAX_ATTEMPTS) {
    attempts++;
    const x = ox + 40 + rand() * (chunkW - 80);
    const y = oy + 40 + rand() * (chunkH - 80);

    if (pathSegments.some((s) => pointInSegment(x, y, s, pathMargin))) {
      continue;
    }
    /** Как у прочих пропов — не 52px от всего подряд (иначе при 14+ деревьях мест не остаётся). */
    if (existingProps.some((p) => dist(p.x, p.y, x, y) < MARGIN_STATIC_PROP)) {
      continue;
    }
    if (exits.some((e) => pointInExitZone(x, y, e, MARGIN_EXIT))) {
      continue;
    }
    if (spawnPts.some((s) => dist(s.x, s.y, x, y) < MARGIN_SPAWN)) {
      continue;
    }
    if (enemySpawns.some((e) => dist(e.x, e.y, x, y) < MARGIN_ENEMY_SPAWN)) {
      continue;
    }
    if (out.some((b) => distSq(b.x, b.y, x, y) < minBetweenBouldersSq)) {
      continue;
    }

    const gray =
      rand() < 0.55 ? NATURE_ROCK_GRAY_BIG : NATURE_ROCK_GRAY_MEDIUM;
    const { crop, placementOffset } = gray;
    out.push({
      x,
      y,
      texture: NATURE_ROCKS_TEXTURE_KEY,
      textureCrop: { x: crop.x, y: crop.y, w: crop.w, h: crop.h },
      rockPlacementOffset: { ...placementOffset },
      mineableRock: true,
      collider: { ...BOULDER_COLL },
    });
  }
  return out;
}

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

function generateChunkGrass(
  ox: number,
  oy: number,
  chunkW: number,
  chunkH: number,
  pathSegments: PathSegment[],
  props: LayoutImageProp[],
  seed: number,
  targetCount: number
): GrassDecorDef[] {
  const rand = mulberry32(seed ^ 0x2b2b2b2b);
  const out: GrassDecorDef[] = [];
  const marginPath = 36;
  const marginProp = 38;
  const minDist = 28;
  const minDistSq = minDist * minDist;
  let attempts = 0;
  while (out.length < targetCount && attempts < 12000) {
    attempts++;
    const x = ox + 24 + rand() * (chunkW - 48);
    const y = oy + 24 + rand() * (chunkH - 48);
    if (pathSegments.some((s) => pointInSegment(x, y, s, marginPath))) {
      continue;
    }
    if (props.some((p) => dist(p.x, p.y, x, y) < marginProp)) {
      continue;
    }
    if (out.some((p) => distSq(p.x, p.y, x, y) < minDistSq)) {
      continue;
    }
    out.push({
      x,
      y,
      variant: grassVariantForPosition(x, y, seed, rand),
    });
  }
  return out;
}

function randomWildProps(
  ox: number,
  oy: number,
  chunkW: number,
  chunkH: number,
  seed: number
): LayoutImageProp[] {
  const rand = mulberry32(seed ^ 0x61c88647);
  const out: LayoutImageProp[] = [];
  const n = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const x = ox + 40 + rand() * (chunkW - 80);
    const y = oy + 40 + rand() * (chunkH - 80);
    const kind = rand();
    if (kind < 0.45) {
      out.push({ x, y, texture: "rock1", collider: { ...ROCK_COLL } });
    } else if (kind < 0.78) {
      out.push({ x, y, texture: "rock2", collider: { ...ROCK_COLL } });
    } else {
      out.push({ x, y, texture: rand() < 0.5 ? "bush1" : "bush2" });
    }
  }
  return out;
}

export type ForestChunkPayload = {
  imageProps: LayoutImageProp[];
  grassDecor: GrassDecorDef[];
  pathSegments: PathSegment[];
};

/**
 * Контент одного чанка леса в мировых координатах (левый верх чанка = cx*W, cy*H).
 */
export function generateForestChunkPayload(
  cx: number,
  cy: number,
  worldSeed: number
): ForestChunkPayload {
  if (!isForestChunkAllowed(cx, cy)) {
    return { imageProps: [], grassDecor: [], pathSegments: [] };
  }
  const ox = cx * FOREST_CHUNK_W;
  const oy = cy * FOREST_CHUNK_H;
  const chunkSeed = mixForestChunkSeed(worldSeed, cx, cy);

  if (cx === 0 && cy === 0) {
    const staticProps = HUB_STATIC_PROPS.map((p) => ({ ...p }));
    const pathSegments = getMainTrailSegmentsForChunk(0, 0);
    const exits = FOREST_HUB_EXITS.map((e) => ({ ...e }));
    const spawnPts = Object.values(FOREST_HUB_SPAWNS);
    const trees = generateTreesInChunkRect(
      ox,
      oy,
      FOREST_CHUNK_W,
      FOREST_CHUNK_H,
      pathSegments,
      staticProps,
      exits,
      spawnPts,
      FOREST_HUB_ENEMY_SPAWNS,
      chunkSeed ^ 0x11111111,
      10,
      72,
      TREE_PATH_MARGIN_HUB,
      chunkSeed ^ 0x4f1bbcdc
    );
    const baseBeforeBoulders = [...staticProps, ...trees];
    const boulders = generateForestBouldersInChunkRect(
      ox,
      oy,
      FOREST_CHUNK_W,
      FOREST_CHUNK_H,
      pathSegments,
      baseBeforeBoulders,
      exits,
      spawnPts,
      FOREST_HUB_ENEMY_SPAWNS,
      chunkSeed ^ 0x51ab1e,
      5,
      TREE_PATH_MARGIN_HUB
    );
    const imageProps = [...staticProps, ...trees, ...boulders];
    const grassDecor = generateChunkGrass(
      ox,
      oy,
      FOREST_CHUNK_W,
      FOREST_CHUNK_H,
      pathSegments,
      imageProps,
      chunkSeed,
      40
    );
    return { imageProps, grassDecor, pathSegments };
  }

  const pathSegments = getMainTrailSegmentsForChunk(cx, cy);
  const wild = randomWildProps(ox, oy, FOREST_CHUNK_W, FOREST_CHUNK_H, chunkSeed);
  const trees = generateTreesInChunkRect(
    ox,
    oy,
    FOREST_CHUNK_W,
    FOREST_CHUNK_H,
    pathSegments,
    wild,
    [],
    [],
    [],
    chunkSeed ^ 0x22222222,
    14,
    64,
    TREE_PATH_MARGIN_WILD,
    chunkSeed ^ 0x2c1b3c5d
  );
  const wildAndTrees = [...wild, ...trees];
  const boulders = generateForestBouldersInChunkRect(
    ox,
    oy,
    FOREST_CHUNK_W,
    FOREST_CHUNK_H,
    pathSegments,
    wildAndTrees,
    [],
    [],
    [],
    chunkSeed ^ 0x61a51ab1,
    6,
    TREE_PATH_MARGIN_WILD
  );
  const imageProps = [...wild, ...trees, ...boulders];
  const grassDecor = generateChunkGrass(
    ox,
    oy,
    FOREST_CHUNK_W,
    FOREST_CHUNK_H,
    pathSegments,
    imageProps,
    chunkSeed,
    36
  );
  return { imageProps, grassDecor, pathSegments };
}

export function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

export function worldToForestChunk(
  worldX: number,
  worldY: number
): { cx: number; cy: number } {
  return {
    cx: Math.floor(worldX / FOREST_CHUNK_W),
    cy: Math.floor(worldY / FOREST_CHUNK_H),
  };
}

/**
 * Лес расширяется только «вглубь» от хаба: севернее ряда cy=0 (за спиной у входа)
 * чанки не генерируются.
 */
export function isForestChunkAllowed(cx: number, cy: number): boolean {
  return cy >= 0;
}
