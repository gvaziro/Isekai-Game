import { getDungeonLocationForFloor } from "@/src/game/locations/dungeon";
import { clampDungeonFloor, DUNGEON_MAX_FLOOR } from "@/src/game/data/dungeonFloorScaling";

/** Совпадает с генератором катакомб (см. dungeonGen CELL). */
export const DUNGEON_MAP_CELL = 16;

/** Радиус открытия клеток вокруг игрока (в клетках сетки; диск по r²). */
export const DUNGEON_REVEAL_RADIUS_CELLS = 6;

/** Сетка миникарты для этажа (размер мира у каждого этажа свой). */
export function getDungeonMapGridForFloor(floor: number): {
  gw: number;
  gh: number;
} {
  const loc = getDungeonLocationForFloor(clampDungeonFloor(floor));
  return {
    gw: Math.ceil(loc.world.width / DUNGEON_MAP_CELL),
    gh: Math.ceil(loc.world.height / DUNGEON_MAP_CELL),
  };
}

/** Совместимость: этаж 1 (фиксированный размер для старых вызовов). */
export const DUNGEON_MAP_GRID = getDungeonMapGridForFloor(1);

export function dungeonCellKey(floor: number, gx: number, gy: number): string {
  return `${floor}:${gx},${gy}`;
}

export function worldToDungeonCell(
  worldX: number,
  worldY: number
): { gx: number; gy: number } {
  return {
    gx: Math.floor(worldX / DUNGEON_MAP_CELL),
    gy: Math.floor(worldY / DUNGEON_MAP_CELL),
  };
}

export function clampDungeonCellForFloor(
  floor: number,
  gx: number,
  gy: number
): { gx: number; gy: number } {
  const { gw, gh } = getDungeonMapGridForFloor(floor);
  return {
    gx: Math.max(0, Math.min(gw - 1, gx)),
    gy: Math.max(0, Math.min(gh - 1, gy)),
  };
}

/** @deprecated Используйте clampDungeonCellForFloor. */
export function clampDungeonCell(
  gx: number,
  gy: number
): { gx: number; gy: number } {
  return clampDungeonCellForFloor(1, gx, gy);
}

/** Ключи клеток в диске (окружность) вокруг центра. */
export function revealCellKeysForFloor(
  floor: number,
  centerGx: number,
  centerGy: number,
  radiusCells: number
): string[] {
  const F = clampDungeonFloor(floor);
  const { gw, gh } = getDungeonMapGridForFloor(F);
  const r2 = radiusCells * radiusCells;
  const keys: string[] = [];
  for (let dy = -radiusCells; dy <= radiusCells; dy++) {
    for (let dx = -radiusCells; dx <= radiusCells; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const c = clampDungeonCellForFloor(F, centerGx + dx, centerGy + dy);
      keys.push(dungeonCellKey(F, c.gx, c.gy));
    }
  }
  return keys;
}

export function parseFloorFromCellKey(key: string): number | null {
  const i = key.indexOf(":");
  if (i <= 0) return null;
  const n = Number(key.slice(0, i));
  if (!Number.isFinite(n)) return null;
  const f = Math.floor(n);
  if (f < 1 || f > DUNGEON_MAX_FLOOR) return null;
  return f;
}

export function parseCellCoordsFromKey(key: string): {
  gx: number;
  gy: number;
} | null {
  const i = key.indexOf(":");
  if (i <= 0) return null;
  const rest = key.slice(i + 1);
  const j = rest.indexOf(",");
  if (j <= 0) return null;
  const gx = Number(rest.slice(0, j));
  const gy = Number(rest.slice(j + 1));
  if (!Number.isFinite(gx) || !Number.isFinite(gy)) return null;
  return { gx: Math.floor(gx), gy: Math.floor(gy) };
}

const MAX_PERSISTED_MAP_KEYS = 40_000;

/** Восстановление из сейва: только `true`, валидные ключи, лимит размера. */
export function sanitizeDungeonRevealedCellsPersist(
  raw: unknown
): Record<string, boolean> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, boolean> = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_PERSISTED_MAP_KEYS) break;
    if (v !== true) continue;
    const floor = parseFloorFromCellKey(k);
    if (floor === null) continue;
    const coords = parseCellCoordsFromKey(k);
    if (!coords) continue;
    const c = clampDungeonCellForFloor(floor, coords.gx, coords.gy);
    out[dungeonCellKey(floor, c.gx, c.gy)] = true;
    n++;
  }
  return out;
}

function localGridCellKey(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

export function parseLocalGridCellKey(key: string): {
  gx: number;
  gy: number;
} | null {
  const j = key.indexOf(",");
  if (j <= 0) return null;
  const gx = Number(key.slice(0, j));
  const gy = Number(key.slice(j + 1));
  if (!Number.isFinite(gx) || !Number.isFinite(gy)) return null;
  return { gx: Math.floor(gx), gy: Math.floor(gy) };
}

const floorCellKeysCache = new Map<number, ReadonlySet<string>>();
const wallCellKeysCache = new Map<number, ReadonlySet<string>>();

/**
 * Клетки пола по floorTiles этажа.
 */
export function getDungeonFloorCellKeySetForFloor(
  floor: number
): ReadonlySet<string> {
  const f = clampDungeonFloor(floor);
  let cached = floorCellKeysCache.get(f);
  if (cached) return cached;
  const loc = getDungeonLocationForFloor(f);
  const tiles = loc.floorTiles;
  const { gw, gh } = getDungeonMapGridForFloor(f);
  const s = new Set<string>();
  if (tiles) {
    for (const t of tiles) {
      const gx = Math.floor(t.x / DUNGEON_MAP_CELL);
      const gy = Math.floor(t.y / DUNGEON_MAP_CELL);
      if (gx >= 0 && gx < gw && gy >= 0 && gy < gh) {
        s.add(localGridCellKey(gx, gy));
      }
    }
  }
  floorCellKeysCache.set(f, s);
  return s;
}

/** @deprecated Используйте getDungeonFloorCellKeySetForFloor(getRuntimeDungeonFloor()). */
export function getDungeonFloorCellKeySet(): ReadonlySet<string> {
  return getDungeonFloorCellKeySetForFloor(1);
}

function hasDungeonFloorAt(
  floorKeys: ReadonlySet<string>,
  gx: number,
  gy: number
): boolean {
  return floorKeys.has(localGridCellKey(gx, gy));
}

export function getDungeonWallCellKeySetForFloor(
  floor: number
): ReadonlySet<string> {
  const f = clampDungeonFloor(floor);
  let cached = wallCellKeysCache.get(f);
  if (cached) return cached;
  const floorKeys = getDungeonFloorCellKeySetForFloor(f);
  const { gw, gh } = getDungeonMapGridForFloor(f);
  const walls = new Set<string>();
  for (let gx = 0; gx < gw; gx++) {
    for (let gy = 0; gy < gh; gy++) {
      if (hasDungeonFloorAt(floorKeys, gx, gy)) continue;
      const neigh =
        (gx > 0 && hasDungeonFloorAt(floorKeys, gx - 1, gy)) ||
        (gx + 1 < gw && hasDungeonFloorAt(floorKeys, gx + 1, gy)) ||
        (gy > 0 && hasDungeonFloorAt(floorKeys, gx, gy - 1)) ||
        (gy + 1 < gh && hasDungeonFloorAt(floorKeys, gx, gy + 1)) ||
        (gx > 0 && gy > 0 && hasDungeonFloorAt(floorKeys, gx - 1, gy - 1)) ||
        (gx + 1 < gw && gy > 0 && hasDungeonFloorAt(floorKeys, gx + 1, gy - 1)) ||
        (gx > 0 && gy + 1 < gh && hasDungeonFloorAt(floorKeys, gx - 1, gy + 1)) ||
        (gx + 1 < gw && gy + 1 < gh && hasDungeonFloorAt(floorKeys, gx + 1, gy + 1));
      if (!neigh) walls.add(localGridCellKey(gx, gy));
    }
  }
  wallCellKeysCache.set(f, walls);
  return walls;
}

export function getDungeonWallCellKeySet(): ReadonlySet<string> {
  return getDungeonWallCellKeySetForFloor(1);
}
