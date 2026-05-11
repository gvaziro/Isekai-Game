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
} from "@/src/game/locations/types";
import { SpatialMinDistIndex } from "@/src/game/locations/spatialMinDistIndex";

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

/** Мировая сетка якорных деревьев — одинаковая на границах чанков. */
const TREE_WORLD_CELL = 52;
const TREE_SPATIAL_CELL = 56;

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

/** Средняя линия «прямой» тропы (без синуса) — для шаблонов и подсказок. */
export const FOREST_MAIN_TRAIL_CENTER_X =
  FOREST_MAIN_TRAIL_LEFT + FOREST_MAIN_TRAIL_W * 0.5;

function forestTrailPhase(worldSeed: number): number {
  let h = (worldSeed ^ 0x243f6a88) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h >>> 0) / 4294967296) * Math.PI * 2;
}

/**
 * Центр главной тропы по мировой Y: лёгкий синус + нарастание амплитуды от входа.
 */
export function forestMainTrailCenterXAtY(worldY: number, worldSeed: number): number {
  const amp = 50;
  const ramp = Math.min(1, Math.max(0, (worldY - 64) / 560));
  const wlen = 780;
  return (
    FOREST_MAIN_TRAIL_CENTER_X +
    amp * ramp * Math.sin(worldY * ((Math.PI * 2) / wlen) + forestTrailPhase(worldSeed))
  );
}

/** Точка в коридоре тропы (учитывает изгиб). */
export function pointIsInForestMainTrail(
  px: number,
  py: number,
  margin: number,
  worldSeed: number
): boolean {
  const cx = forestMainTrailCenterXAtY(py, worldSeed);
  const half = FOREST_MAIN_TRAIL_W * 0.5 + margin;
  return Math.abs(px - cx) <= half;
}

/**
 * Полосы грязи под тропу: ступенчато по Y, центр смещён как у коллизии тропы.
 */
export function getMainTrailSegmentsForChunk(
  cx: number,
  cy: number,
  worldSeed: number
): PathSegment[] {
  if (!isForestChunkAllowed(cx, cy)) return [];
  const oy = cy * FOREST_CHUNK_H;
  const step = 40;
  const segs: PathSegment[] = [];
  for (let y = oy; y < oy + FOREST_CHUNK_H; y += step) {
    const ymid = y + Math.min(step, oy + FOREST_CHUNK_H - y) * 0.5;
    const cxm = forestMainTrailCenterXAtY(ymid, worldSeed);
    const x = cxm - FOREST_MAIN_TRAIL_W * 0.5;
    const h = Math.min(step, oy + FOREST_CHUNK_H - y);
    segs.push({ x, y, w: FOREST_MAIN_TRAIL_W, h });
  }
  return segs;
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
    id: "grunt_slime_cross",
    zoneId: "crossroads",
    x: 380,
    y: 340,
    lootTable: "grunt",
    mobVisualId: "slime_basic",
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

type ForestPoi = { kind: "none" | "clearing" | "boulder_ring"; treeDensityMul: number };

function forestPoiForChunk(worldSeed: number, cx: number, cy: number): ForestPoi {
  if (cx === 0 && cy === 0) return { kind: "none", treeDensityMul: 1 };
  const h = mixForestChunkSeed(worldSeed ^ 0xc0dec5e5, cx, cy);
  const u = (h >>> 0) / 4294967296;
  if (u > 0.03) return { kind: "none", treeDensityMul: 1 };
  if (((h >>> 9) & 1) === 0) return { kind: "clearing", treeDensityMul: 0.24 };
  return { kind: "boulder_ring", treeDensityMul: 1.02 };
}

/** 0 у входа, 1 далеко — как `forestThreatGradient01` в `forestMobGradient.ts` (те же d0/d1). */
function forestThreat01ForTextures(worldX: number, worldY: number): number {
  const ax = FOREST_HUB_SPAWNS.from_town.x;
  const ay = FOREST_HUB_SPAWNS.from_town.y;
  const dist = Math.hypot(worldX - ax, worldY - ay);
  const d0 = 300;
  const d1 = 2680;
  if (dist <= d0) return 0;
  if (dist >= d1) return 1;
  return (dist - d0) / (d1 - d0);
}

function pickTreeTextureWeighted(
  worldX: number,
  worldY: number,
  rand: () => number
): (typeof TREE_TEXTURES)[number] {
  const t = forestThreat01ForTextures(worldX, worldY);
  const w0 = 1.15 - t * 0.35;
  const w1 = 1.12 - t * 0.32;
  const w2 = 1.08 - t * 0.28;
  const w3 = 0.45 + t * 2.4;
  const w4 = 0.38 + t * 2.55;
  const weights = [w0, w1, w2, w3, w4];
  let s = 0;
  for (const x of weights) s += Math.max(0, x);
  let r = rand() * s;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i]!);
    if (r <= 0) return TREE_TEXTURES[i]!;
  }
  return TREE_TEXTURES[TREE_TEXTURES.length - 1]!;
}

function treeVisualExtras(worldSeed: number, x: number, y: number): Pick<
  LayoutImageProp,
  "displayScale" | "flipX" | "depthBias"
> {
  let h = (worldSeed ^ Math.imul(Math.floor(x), 0x9e3779b1) ^ Math.imul(Math.floor(y), 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  const rand = mulberry32(h);
  return {
    displayScale: 0.92 + rand() * 0.16,
    flipX: rand() < 0.5,
    depthBias: (rand() - 0.5) * 0.42,
  };
}

function generateTreesInChunkRect(
  ox: number,
  oy: number,
  chunkW: number,
  chunkH: number,
  _pathSegments: PathSegment[],
  staticProps: LayoutImageProp[],
  exits: LocationExit[],
  spawnPts: { x: number; y: number }[],
  enemySpawns: LocationEnemySpawn[],
  seed: number,
  maxTrees: number,
  minDistance: number,
  pathMarginForTrees: number,
  densitySeed: number,
  worldSeed: number,
  poiDensityMul: number
): LayoutImageProp[] {
  const spatial = new SpatialMinDistIndex(TREE_SPATIAL_CELL);
  const out: LayoutImageProp[] = [];
  const cell = TREE_WORLD_CELL;
  const gx0 = Math.floor((ox + 26) / cell);
  const gx1 = Math.floor((ox + chunkW - 26) / cell);
  const gy0 = Math.floor((oy + 26) / cell);
  const gy1 = Math.floor((oy + chunkH - 26) / cell);

  const pushTree = (x: number, y: number, density: number, cellRand: () => number): boolean => {
    if (out.length >= maxTrees) return false;
    if (pointIsInForestMainTrail(x, y, pathMarginForTrees, worldSeed)) return false;
    if (staticProps.some((p) => dist(p.x, p.y, x, y) < MARGIN_STATIC_PROP)) return false;
    if (exits.some((e) => pointInExitZone(x, y, e, MARGIN_EXIT))) return false;
    if (spawnPts.some((s) => dist(s.x, s.y, x, y) < MARGIN_SPAWN)) return false;
    if (enemySpawns.some((e) => dist(e.x, e.y, x, y) < MARGIN_ENEMY_SPAWN)) return false;

    const localMin = Math.max(38, Math.min(88, minDistance * (0.52 + 0.5 * density)));
    const localMinSq = localMin * localMin;
    if (spatial.minDistSqToNearest(x, y) < localMinSq) return false;

    const texture = pickTreeTextureWeighted(x, y, cellRand);
    const vis = treeVisualExtras(worldSeed, x, y);
    out.push({
      x,
      y,
      texture,
      collider: { ...TREE_COLLIDER },
      ...vis,
    });
    spatial.add(x, y);
    return true;
  };

  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gy = gy0; gy <= gy1; gy++) {
      if (out.length >= maxTrees) break;
      const cellRand = mulberry32(
        (mixForestChunkSeed(worldSeed, gx, gy) ^ seed ^ 0x51edc001) >>> 0
      );
      const cx = gx * cell + cell * 0.5 + (cellRand() - 0.5) * (cell - 22);
      const cyy = gy * cell + cell * 0.5 + (cellRand() - 0.5) * (cell - 22);
      if (cx < ox + 28 || cx > ox + chunkW - 28 || cyy < oy + 28 || cyy > oy + chunkH - 28) {
        continue;
      }

      const density = forestTreePatchDensity01(cx, cyy, densitySeed);
      const acceptProb = (0.065 + 0.5 * density) * poiDensityMul;
      if (cellRand() > acceptProb) continue;

      if (!pushTree(cx, cyy, density, cellRand)) continue;

      if (out.length >= maxTrees) break;
      if (cellRand() > 0.33) continue;

      for (let s = 0; s < 2; s++) {
        if (out.length >= maxTrees) break;
        if (cellRand() > 0.58) break;
        const sx = cx + (cellRand() - 0.5) * 52;
        const sy = cyy + (cellRand() - 0.5) * 44;
        if (sx < ox + 26 || sx > ox + chunkW - 26 || sy < oy + 26 || sy > oy + chunkH - 26) {
          continue;
        }
        if (dist(sx, sy, cx, cyy) < 14) continue;
        const dSat = forestTreePatchDensity01(sx, sy, densitySeed);
        if (!pushTree(sx, sy, dSat, cellRand)) continue;
      }
    }
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
  existingProps: LayoutImageProp[],
  exits: LocationExit[],
  spawnPts: { x: number; y: number }[],
  enemySpawns: LocationEnemySpawn[],
  seed: number,
  maxBoulders: number,
  pathMargin: number,
  worldSeed: number
): LayoutImageProp[] {
  const rand = mulberry32(seed ^ 0xb011d365);
  const out: LayoutImageProp[] = [];
  const boulderSpatial = new SpatialMinDistIndex(48);
  let attempts = 0;
  const minBetweenBouldersSq =
    BOULDER_MIN_DIST_BETWEEN * BOULDER_MIN_DIST_BETWEEN;

  while (out.length < maxBoulders && attempts < BOULDER_MAX_ATTEMPTS) {
    attempts++;
    const x = ox + 40 + rand() * (chunkW - 80);
    const y = oy + 40 + rand() * (chunkH - 80);

    if (pointIsInForestMainTrail(x, y, pathMargin, worldSeed)) {
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
    if (boulderSpatial.minDistSqToNearest(x, y) < minBetweenBouldersSq) {
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
    boulderSpatial.add(x, y);
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
  props: LayoutImageProp[],
  seed: number,
  worldSeed: number,
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
    if (pointIsInForestMainTrail(x, y, marginPath, worldSeed)) {
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
      depthBias: (rand() - 0.5) * 0.34,
    });
  }
  return out;
}

function generatePoiBoulderRing(
  ox: number,
  oy: number,
  chunkW: number,
  chunkH: number,
  worldSeed: number
): LayoutImageProp[] {
  const midX = ox + chunkW * 0.5;
  const midY = oy + chunkH * 0.5;
  if (pointIsInForestMainTrail(midX, midY, TREE_PATH_MARGIN_WILD + 38, worldSeed)) {
    return [];
  }
  const rand = mulberry32(mixForestChunkSeed(worldSeed, ox, oy) ^ 0x81d0b001);
  const n = 5 + Math.floor(rand() * 4);
  const r0 = 74 + rand() * 38;
  const out: LayoutImageProp[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + rand() * 0.22;
    const x = midX + Math.cos(ang) * r0;
    const y = midY + Math.sin(ang) * r0 * 0.52;
    if (x < ox + 34 || x > ox + chunkW - 34 || y < oy + 34 || y > oy + chunkH - 34) {
      continue;
    }
    if (pointIsInForestMainTrail(x, y, TREE_PATH_MARGIN_WILD, worldSeed)) continue;
    out.push({
      x,
      y,
      texture: rand() < 0.55 ? "rock1" : "rock2",
      collider: { ...ROCK_COLL },
    });
  }
  return out;
}

function densityBasedWildProps(
  ox: number,
  oy: number,
  chunkW: number,
  chunkH: number,
  seed: number,
  densitySeed: number,
  worldSeed: number,
  poi: ForestPoi
): LayoutImageProp[] {
  const rand = mulberry32(seed ^ 0x61c88647);
  let target = 3 + Math.floor(rand() * 4);
  if (poi.kind === "clearing") target = 1 + Math.floor(rand() * 2);
  if (poi.kind === "boulder_ring") target = 2 + Math.floor(rand() * 2);
  const out: LayoutImageProp[] = [];
  let attempts = 0;
  while (out.length < target && attempts < 9000) {
    attempts++;
    const x = ox + 40 + rand() * (chunkW - 80);
    const y = oy + 40 + rand() * (chunkH - 80);
    if (pointIsInForestMainTrail(x, y, 44, worldSeed)) continue;
    const dens = forestTreePatchDensity01(x, y, densitySeed);
    const rockLean = 0.32 + dens * 0.55;
    const r = rand();
    if (r < rockLean) {
      out.push({
        x,
        y,
        texture: rand() < 0.55 ? "rock1" : "rock2",
        collider: { ...ROCK_COLL },
      });
    } else {
      out.push({ x, y, texture: rand() < 0.55 ? "bush1" : "bush2" });
    }
  }
  return out;
}

/** Лежачий гриб у дерева (подбор как у дропа на земле). */
export type ForestForagePickup = {
  id: string;
  x: number;
  y: number;
  curatedId: string;
  qty: 1;
};

const MUSHROOM_IDS = [
  "item327",
  "item471",
  "item379",
  "item412",
  "item389",
] as const;

const MUSHROOM_WEIGHTS_NEAR = [10, 1.2, 0.35, 0, 0] as const;
const MUSHROOM_WEIGHTS_MID = [4, 3, 2, 2, 0.2] as const;
const MUSHROOM_WEIGHTS_FAR = [1, 2, 3, 4, 4] as const;

/**
 * 0 — у входа из города, 1 — далеко в лесу.
 * Держать в синхроне с `forestThreatGradient01` в `forestMobGradient.ts`
 * (те же точка входа и d0/d1).
 */
function forestMushroomDepth01(worldX: number, worldY: number): number {
  const ax = FOREST_HUB_SPAWNS.from_town.x;
  const ay = FOREST_HUB_SPAWNS.from_town.y;
  const dist = Math.hypot(worldX - ax, worldY - ay);
  const d0 = 300;
  const d1 = 2680;
  if (dist <= d0) return 0;
  if (dist >= d1) return 1;
  return (dist - d0) / (d1 - d0);
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function mushroomWeightsAtDepth(t: number): number[] {
  const u = Math.max(0, Math.min(1, t));
  if (u <= 0.5) {
    const k = u / 0.5;
    return MUSHROOM_IDS.map((_, i) =>
      lerp(MUSHROOM_WEIGHTS_NEAR[i]!, MUSHROOM_WEIGHTS_MID[i]!, k)
    );
  }
  const k = (u - 0.5) / 0.5;
  return MUSHROOM_IDS.map((_, i) =>
    lerp(MUSHROOM_WEIGHTS_MID[i]!, MUSHROOM_WEIGHTS_FAR[i]!, k)
  );
}

function pickMushroomCuratedId(t: number, rand: () => number): string {
  const w = mushroomWeightsAtDepth(t);
  let sum = 0;
  for (const x of w) sum += Math.max(0, x);
  if (sum <= 0) return MUSHROOM_IDS[0]!;
  let r = rand() * sum;
  for (let i = 0; i < MUSHROOM_IDS.length; i++) {
    r -= Math.max(0, w[i]!);
    if (r <= 0) return MUSHROOM_IDS[i]!;
  }
  return MUSHROOM_IDS[MUSHROOM_IDS.length - 1]!;
}

const MUSHROOM_GEN_SALT = 0xf00d5eed;
const MUSHROOM_TREE_TRY_PROB = 0.165;
const MUSHROOM_SECOND_SLOT_PROB = 0.26;

/**
 * Детерминированные грибы у подножия деревьев (1 иногда 2 на дерево).
 */
export function generateForestMushroomsNearTrees(
  trees: LayoutImageProp[],
  worldSeed: number,
  cx: number,
  cy: number
): ForestForagePickup[] {
  if (trees.length === 0 || worldSeed === 0) return [];
  const chunkSeed = mixForestChunkSeed(worldSeed, cx, cy);
  const rand = mulberry32(chunkSeed ^ MUSHROOM_GEN_SALT);
  const out: ForestForagePickup[] = [];

  for (let i = 0; i < trees.length; i++) {
    const tree = trees[i]!;
    if (rand() > MUSHROOM_TREE_TRY_PROB) continue;

    const ox = (rand() * 2 - 1) * 15;
    const x0 = tree.x + ox;
    const y0 = tree.y + rand() * 2.5;
    const t0 = forestMushroomDepth01(x0, y0);
    const id0 = `forest_forage_${worldSeed}_${cx}_${cy}_${i}_0`;
    out.push({
      id: id0,
      x: x0,
      y: y0,
      curatedId: pickMushroomCuratedId(t0, rand),
      qty: 1,
    });

    if (rand() > MUSHROOM_SECOND_SLOT_PROB) continue;
    const x1 = x0 + 10 + rand() * 12;
    const y1 = tree.y + rand() * 2.5;
    const t1 = forestMushroomDepth01(x1, y1);
    const id1 = `forest_forage_${worldSeed}_${cx}_${cy}_${i}_1`;
    out.push({
      id: id1,
      x: x1,
      y: y1,
      curatedId: pickMushroomCuratedId(Math.max(t0, t1), rand),
      qty: 1,
    });
  }

  return out;
}

export type ForestChunkPayload = {
  imageProps: LayoutImageProp[];
  grassDecor: GrassDecorDef[];
  pathSegments: PathSegment[];
  forestForage: ForestForagePickup[];
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
    return {
      imageProps: [],
      grassDecor: [],
      pathSegments: [],
      forestForage: [],
    };
  }
  const ox = cx * FOREST_CHUNK_W;
  const oy = cy * FOREST_CHUNK_H;
  const chunkSeed = mixForestChunkSeed(worldSeed, cx, cy);

  if (cx === 0 && cy === 0) {
    const staticProps = HUB_STATIC_PROPS.map((p) => ({ ...p }));
    const pathSegments = getMainTrailSegmentsForChunk(0, 0, worldSeed);
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
      chunkSeed ^ 0x4f1bbcdc,
      worldSeed,
      1
    );
    const baseBeforeBoulders = [...staticProps, ...trees];
    const boulders = generateForestBouldersInChunkRect(
      ox,
      oy,
      FOREST_CHUNK_W,
      FOREST_CHUNK_H,
      baseBeforeBoulders,
      exits,
      spawnPts,
      FOREST_HUB_ENEMY_SPAWNS,
      chunkSeed ^ 0x51ab1e,
      5,
      TREE_PATH_MARGIN_HUB,
      worldSeed
    );
    const imageProps = [...staticProps, ...trees, ...boulders];
    const grassDecor = generateChunkGrass(
      ox,
      oy,
      FOREST_CHUNK_W,
      FOREST_CHUNK_H,
      imageProps,
      chunkSeed,
      worldSeed,
      40
    );
    const forestForageMushrooms = generateForestMushroomsNearTrees(
      trees,
      worldSeed,
      cx,
      cy
    );
    /** Фиксированная записка у стандартного спавна хаба (см. FOREST_HUB_SPAWNS.default). */
    const hubSpawnNote: ForestForagePickup = {
      id: "forest_hub_spawn_note_v1",
      x: FOREST_HUB_SPAWNS.default.x,
      y: FOREST_HUB_SPAWNS.default.y + 22,
      curatedId: "item629",
      qty: 1,
    };
    const forestForage = [hubSpawnNote, ...forestForageMushrooms];
    return { imageProps, grassDecor, pathSegments, forestForage };
  }

  const pathSegments = getMainTrailSegmentsForChunk(cx, cy, worldSeed);
  const poi = forestPoiForChunk(worldSeed, cx, cy);
  let wild = densityBasedWildProps(
    ox,
    oy,
    FOREST_CHUNK_W,
    FOREST_CHUNK_H,
    chunkSeed,
    chunkSeed ^ 0x9b1d1357,
    worldSeed,
    poi
  );
  if (poi.kind === "boulder_ring") {
    wild = [...wild, ...generatePoiBoulderRing(ox, oy, FOREST_CHUNK_W, FOREST_CHUNK_H, worldSeed)];
  }
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
    chunkSeed ^ 0x2c1b3c5d,
    worldSeed,
    poi.treeDensityMul
  );
  const wildAndTrees = [...wild, ...trees];
  const boulders = generateForestBouldersInChunkRect(
    ox,
    oy,
    FOREST_CHUNK_W,
    FOREST_CHUNK_H,
    wildAndTrees,
    [],
    [],
    [],
    chunkSeed ^ 0x61a51ab1,
    6,
    TREE_PATH_MARGIN_WILD,
    worldSeed
  );
  const imageProps = [...wild, ...trees, ...boulders];
  const grassDecor = generateChunkGrass(
    ox,
    oy,
    FOREST_CHUNK_W,
    FOREST_CHUNK_H,
    imageProps,
    chunkSeed,
    worldSeed,
    36
  );
  const forestForage = generateForestMushroomsNearTrees(
    trees,
    worldSeed,
    cx,
    cy
  );
  return { imageProps, grassDecor, pathSegments, forestForage };
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
