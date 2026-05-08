import { forestTreePatchDensity01 } from "@/src/game/locations/forestChunkGen";
import type { GameLocation, LayoutImageProp } from "@/src/game/locations/types";
import { TREE_TEXTURE_KEYS } from "@/src/game/locations/forestChunkGen";
import { SpatialMinDistIndex } from "@/src/game/locations/spatialMinDistIndex";
import {
  mulberry32,
  pointInExitZone,
  pointInSegment,
} from "@/src/game/locations/types";

/** Коллайдер как у ручных деревьев в `town.ts` / старом `forest.json`. */
const TREE_COLLIDER = { w: 18, h: 10, oy: 6 } as const;

const TREE_TEXTURES = TREE_TEXTURE_KEYS;

/** Жёсткий верхний предел — новые деревья не добавляются после достижения. */
export const FOREST_PROCEDURAL_TREE_MAX = 16;

/** Минимальное расстояние между центрами «ног» соседних деревьев. */
export const FOREST_PROCEDURAL_TREE_MIN_DIST = 72;

const TREE_PATH_MARGIN = 56;
const MARGIN_STATIC_PROP = 38;
const MARGIN_SPAWN = 56;
const MARGIN_EXIT = 56;
const MARGIN_ENEMY_SPAWN = 52;
const MAX_ATTEMPTS = 28000;

const SEED_MIX = 0x7e35e9c1;

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function forestTreeLayoutSeed(loc: GameLocation): number {
  return (loc.grassDecorSeed ^ SEED_MIX) >>> 0;
}

export type ForestTreeGenOptions = {
  maxTrees?: number;
  minDistance?: number;
  seed?: number;
};

/**
 * Процедурные деревья для леса: детерминированно от seed, не больше maxTrees,
 * с минимальным расстоянием между позициями и отступами от дороги, выходов и статики.
 */
export function generateForestTreeProps(
  loc: GameLocation,
  options?: ForestTreeGenOptions
): LayoutImageProp[] {
  const maxTrees = options?.maxTrees ?? FOREST_PROCEDURAL_TREE_MAX;
  const minDistance = options?.minDistance ?? FOREST_PROCEDURAL_TREE_MIN_DIST;
  const seed = options?.seed ?? forestTreeLayoutSeed(loc);
  const rand = mulberry32(seed);
  const { world, pathSegments, imageProps, animStations, exits, spawns } = loc;
  const enemySpawns = loc.enemySpawns ?? [];

  const spatial = new SpatialMinDistIndex(56);
  const out: LayoutImageProp[] = [];
  let attempts = 0;

  while (out.length < maxTrees && attempts < MAX_ATTEMPTS) {
    attempts++;
    const x = 32 + rand() * (world.width - 64);
    const y = 32 + rand() * (world.height - 64);

    if (pathSegments.some((s) => pointInSegment(x, y, s, TREE_PATH_MARGIN))) {
      continue;
    }
    if (imageProps.some((p) => dist(p.x, p.y, x, y) < MARGIN_STATIC_PROP)) {
      continue;
    }
    if (animStations.some((s) => dist(s.x, s.y, x, y) < MARGIN_STATIC_PROP)) {
      continue;
    }
    if (exits.some((e) => pointInExitZone(x, y, e, MARGIN_EXIT))) {
      continue;
    }
    const spawnPts = Object.values(spawns);
    if (spawnPts.some((s) => dist(s.x, s.y, x, y) < MARGIN_SPAWN)) {
      continue;
    }
    if (enemySpawns.some((e) => dist(e.x, e.y, x, y) < MARGIN_ENEMY_SPAWN)) {
      continue;
    }

    const density = forestTreePatchDensity01(x, y, seed ^ 0x51edc7ab);
    const acceptProb = 0.2 + 0.8 * density;
    if (rand() > acceptProb) {
      continue;
    }
    const localMin = Math.max(
      42,
      Math.min(86, minDistance * (0.58 + 0.52 * density))
    );
    const localMinSq = localMin * localMin;
    if (spatial.minDistSqToNearest(x, y) < localMinSq) {
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
    spatial.add(x, y);
  }

  return out;
}
