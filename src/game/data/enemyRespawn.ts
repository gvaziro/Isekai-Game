import {
  DUNGEON_BOSS_INSTANCE_ID,
  getDungeonBossSpawnForFloor,
} from "@/src/game/data/dungeonBoss";
import { getRuntimeDungeonFloor } from "@/src/game/locations/dungeonFloorContext";
import { ENEMY_SPAWNS } from "@/src/game/data/combatWorld";
import { getLocation } from "@/src/game/locations";
import type { LocationEnemySpawn } from "@/src/game/locations/types";

/** Задержка респавна по `mobVisualId` (мс). Сильные/редкие — дольше. */
export const MOB_RESPAWN_MS_BY_VISUAL: Partial<Record<string, number>> = {
  skeleton_rogue: 42_000,
  orc_warrior: 55_000,
  orc_shaman: 72_000,
  skeleton_warrior: 60_000,
  skeleton_mage: 88_000,
  orc_base: 48_000,
  orc_rogue: 50_000,
  skeleton_base: 45_000,
};

const DEFAULT_RESPAWN_MS = 75_000;

export function getEnemyRespawnDelayMs(mobVisualId: string): number {
  return MOB_RESPAWN_MS_BY_VISUAL[mobVisualId] ?? DEFAULT_RESPAWN_MS;
}

/** Найти `mobVisualId` по `instanceId` среди дефолтных и спавнов локаций. */
export function mobVisualIdForInstanceId(instanceId: string): string | undefined {
  for (const sp of ENEMY_SPAWNS) {
    if (sp.id === instanceId) return sp.mobVisualId;
  }
  for (const locId of ["forest", "town", "dungeon"] as const) {
    const loc = getLocation(locId);
    const list: LocationEnemySpawn[] | undefined = loc.enemySpawns;
    if (!list) continue;
    for (const sp of list) {
      if (sp.id === instanceId) return sp.mobVisualId;
    }
  }
  if (instanceId === DUNGEON_BOSS_INSTANCE_ID) {
    return getDungeonBossSpawnForFloor(getRuntimeDungeonFloor()).mobVisualId;
  }
  return undefined;
}

/** Миграция сейва: старые «убит навсегда» → время, после которого можно респавн. */
export function migrateDefeatedEnemyIdsToRespawnNotBefore(
  defeated: Record<string, boolean> | undefined
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!defeated) return out;
  const now = Date.now();
  for (const [id, dead] of Object.entries(defeated)) {
    if (!dead) continue;
    const vid = mobVisualIdForInstanceId(id) ?? "orc_warrior";
    out[id] = now + getEnemyRespawnDelayMs(vid);
  }
  return out;
}
