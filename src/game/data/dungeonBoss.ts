/**
 * Босс подземелья и сундук (координаты — ноги, origin 0.5,1).
 * Комнаты для спавна «бродячих» мобов — задаются генератором катакомб по этажу.
 */

import { clampDungeonFloor } from "@/src/game/data/dungeonFloorScaling";

export const DUNGEON_BOSS_INSTANCE_ID = "dungeon_boss";

/** Префикс id сундука босса; для каждого этажа — отдельный ключ `…_fN`. */
export const DUNGEON_BOSS_CHEST_ID = "chest_dungeon_boss";

export function dungeonBossChestIdForFloor(floor: number): string {
  return `${DUNGEON_BOSS_CHEST_ID}_f${clampDungeonFloor(floor)}`;
}

/** Сундук босса (любой этаж или старый глобальный id до фикса). */
export function isDungeonBossChestId(id: string): boolean {
  return (
    id === DUNGEON_BOSS_CHEST_ID ||
    /^chest_dungeon_boss_f\d+$/.test(id)
  );
}

/** Старые сейвы: один id на все этажи — переносим на этаж 1. */
export function migrateLegacyDungeonBossChestOpened(
  opened: Record<string, boolean>
): Record<string, boolean> {
  const out = { ...opened };
  if (out[DUNGEON_BOSS_CHEST_ID] && !out[dungeonBossChestIdForFloor(1)]) {
    out[dungeonBossChestIdForFloor(1)] = true;
  }
  return out;
}

export const DUNGEON_GRUNT_VISUAL_IDS = [
  "orc_warrior",
  "skeleton_rogue",
  "orc_shaman",
  "skeleton_warrior",
  "skeleton_mage",
] as const;

export {
  DUNGEON_SPAWN_INTERVAL_MS,
  DUNGEON_SPAWN_MAX_ALIVE,
} from "@/src/game/data/dungeonSpawnParams";
export const DUNGEON_SPAWN_MIN_DIST_FROM_PLAYER = 260;

export type DungeonBossSpawn = {
  x: number;
  y: number;
  mobVisualId: string;
  lootTable: string;
};

type FloorLayout = {
  gruntRoomCenters: { x: number; y: number }[];
  bossSpawn: DungeonBossSpawn;
  bossChest: { id: string; x: number; y: number };
};

const DEFAULT_GRUNT_CENTERS: { x: number; y: number }[] = [
  { x: 220, y: 500 },
  { x: 380, y: 500 },
];

const DEFAULT_BOSS_SPAWN: DungeonBossSpawn = {
  x: 1140,
  y: 500,
  mobVisualId: "orc_shaman",
  lootTable: "boss",
};

const DEFAULT_BOSS_CHEST = {
  id: dungeonBossChestIdForFloor(1),
  x: 1060,
  y: 500,
};

const layoutByFloor = new Map<number, FloorLayout>();

/** Регистрирует координаты босса и комнат после процедурной генерации этажа. */
export function registerDungeonLayoutForFloor(
  floor: number,
  opts: FloorLayout
): void {
  layoutByFloor.set(clampDungeonFloor(floor), {
    gruntRoomCenters: opts.gruntRoomCenters.map((c) => ({ ...c })),
    bossSpawn: { ...opts.bossSpawn },
    bossChest: { ...opts.bossChest },
  });
}

export function getDungeonGruntRoomCentersForFloor(
  floor: number
): readonly { x: number; y: number }[] {
  const f = clampDungeonFloor(floor);
  return layoutByFloor.get(f)?.gruntRoomCenters ?? DEFAULT_GRUNT_CENTERS;
}

export function getDungeonBossSpawnForFloor(floor: number): DungeonBossSpawn {
  const f = clampDungeonFloor(floor);
  return layoutByFloor.get(f)?.bossSpawn ?? DEFAULT_BOSS_SPAWN;
}

export function getDungeonBossChestForFloor(floor: number): {
  id: string;
  x: number;
  y: number;
} {
  const f = clampDungeonFloor(floor);
  return layoutByFloor.get(f)?.bossChest ?? DEFAULT_BOSS_CHEST;
}

/** @deprecated Используйте getDungeonGruntRoomCentersForFloor(getRuntimeDungeonFloor()). */
export const DUNGEON_GRUNT_ROOM_CENTERS: { x: number; y: number }[] =
  DEFAULT_GRUNT_CENTERS;

/** @deprecated Используйте getDungeonBossSpawnForFloor. */
export let DUNGEON_BOSS_SPAWN: DungeonBossSpawn = { ...DEFAULT_BOSS_SPAWN };

/** @deprecated Используйте getDungeonBossChestForFloor. */
export let DUNGEON_BOSS_CHEST = { ...DEFAULT_BOSS_CHEST };

export const DUNGEON_BOSS_HP_MULT = 1.6;
export const DUNGEON_BOSS_ATK_MULT = 1.3;

/** Совместимость: обновляет устаревшие глобалы и регистр этажа. */
export function setDungeonBossLayout(opts: FloorLayout): void {
  DUNGEON_GRUNT_ROOM_CENTERS.length = 0;
  for (const c of opts.gruntRoomCenters) {
    DUNGEON_GRUNT_ROOM_CENTERS.push({ ...c });
  }
  DUNGEON_BOSS_SPAWN = { ...opts.bossSpawn };
  DUNGEON_BOSS_CHEST = { ...opts.bossChest };
  registerDungeonLayoutForFloor(1, opts);
}
