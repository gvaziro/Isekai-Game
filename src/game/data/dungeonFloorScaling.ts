import { ENEMY_LEVEL_MAX } from "@/src/game/data/balance";
import {
  DUNGEON_SPAWN_INTERVAL_MS,
  DUNGEON_SPAWN_MAX_ALIVE,
} from "@/src/game/data/dungeonSpawnParams";

/** Всего этажей подземелья (включительно). Стартовая арка — 10 этажей. */
export const DUNGEON_MAX_FLOOR = 10;

export function clampDungeonFloor(f: number): number {
  return Math.max(1, Math.min(DUNGEON_MAX_FLOOR, Math.floor(f)));
}

/** Следующий этаж, на который можно зайти «в лоб» без fast travel. */
export function getMaxEnterableFloor(maxClearedFloor: number): number {
  const m = Math.max(0, Math.min(DUNGEON_MAX_FLOOR, Math.floor(maxClearedFloor)));
  return Math.min(DUNGEON_MAX_FLOOR, m + 1);
}

/**
 * Можно войти на этаж `floor`, если это следующий непройденный диапазон
 * или якорь кратности 10 уже полностью пройден (fast travel).
 */
export function canEnterDungeonFloor(
  floor: number,
  maxClearedFloor: number
): boolean {
  const f = clampDungeonFloor(floor);
  const max = Math.max(0, Math.min(DUNGEON_MAX_FLOOR, Math.floor(maxClearedFloor)));
  if (f <= getMaxEnterableFloor(max)) return true;
  if (f % 10 === 0 && max >= f) return true;
  return false;
}

/** Открытые якоря быстрого перехода: 10, 20, …, пока maxCleared >= K. */
export function fastTravelAnchorsAvailable(maxClearedFloor: number): number[] {
  const max = Math.max(0, Math.min(DUNGEON_MAX_FLOOR, Math.floor(maxClearedFloor)));
  const out: number[] = [];
  for (let k = 10; k <= DUNGEON_MAX_FLOOR; k += 10) {
    if (max >= k) out.push(k);
  }
  return out;
}

/** Диапазон уровня гринта для Phaser.Between(min, max). */
export function getGruntLevelRange(
  floor: number,
  playerLevel: number
): { min: number; max: number } {
  const F = clampDungeonFloor(floor);
  const P = Math.max(1, Math.min(ENEMY_LEVEL_MAX, Math.floor(playerLevel)));
  const center = Math.min(
    ENEMY_LEVEL_MAX,
    Math.max(1, Math.round(F * 0.75 + P * 0.25))
  );
  const spread = 1 + Math.floor(F / 28);
  return {
    min: Math.max(1, center - spread),
    max: Math.min(ENEMY_LEVEL_MAX, center + spread),
  };
}

export function getBossLevel(floor: number, playerLevel: number): number {
  const F = clampDungeonFloor(floor);
  const P = Math.max(1, Math.min(ENEMY_LEVEL_MAX, Math.floor(playerLevel)));
  return Math.min(
    ENEMY_LEVEL_MAX,
    Math.max(F + 1, Math.ceil(P * 0.4 + F * 0.65) + 1)
  );
}

export function getDungeonSpawnMaxAlive(floor: number): number {
  const F = clampDungeonFloor(floor);
  const t = (F - 1) / (DUNGEON_MAX_FLOOR - 1 || 1);
  return Math.round(DUNGEON_SPAWN_MAX_ALIVE + (16 - DUNGEON_SPAWN_MAX_ALIVE) * t);
}

export function getDungeonSpawnIntervalMs(floor: number): number {
  const F = clampDungeonFloor(floor);
  const t = (F - 1) / (DUNGEON_MAX_FLOOR - 1 || 1);
  return Math.round(DUNGEON_SPAWN_INTERVAL_MS - (6000 - 3200) * t);
}
