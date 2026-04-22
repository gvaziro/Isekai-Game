import {
  buildGrassDecorList,
  type GameLocation,
  type GrassDecorDef,
} from "@/src/game/locations/types";
import { clampDungeonFloor } from "@/src/game/data/dungeonFloorScaling";
import { parseLocationJson } from "@/src/game/locations/locationSchema";
import { generateCatacombsForFloor } from "@/src/game/locations/dungeonGen";

const dungeonLocCache = new Map<number, GameLocation>();

/**
 * Процедурная локация подземелья для этажа (кэшируется; сид и размеры зависят от F).
 */
export function getDungeonLocationForFloor(floor: number): GameLocation {
  const f = clampDungeonFloor(floor);
  let loc = dungeonLocCache.get(f);
  if (!loc) {
    loc = parseLocationJson(generateCatacombsForFloor(f));
    dungeonLocCache.set(f, loc);
  }
  return loc;
}

/** Этаж 1 — для превью, манифеста и обратной совместимости. */
export const DUNGEON_LOCATION = getDungeonLocationForFloor(1);

export const DUNGEON_GRASS_DECOR: GrassDecorDef[] = buildGrassDecorList(
  DUNGEON_LOCATION.world,
  DUNGEON_LOCATION.pathSegments,
  DUNGEON_LOCATION.imageProps,
  DUNGEON_LOCATION.animStations,
  DUNGEON_LOCATION.spawns.default,
  DUNGEON_LOCATION.grassDecorSeed,
  DUNGEON_LOCATION.grassDecorCount
);
