import { parseLocationJson } from "@/src/game/locations/locationSchema";
import forestJson from "@/src/game/locations/data/forest.json";
import type { GameLocation } from "@/src/game/locations/types";
import {
  FOREST_CHUNK_H,
  FOREST_CHUNK_W,
  FOREST_HUB_ENEMY_SPAWNS,
  FOREST_HUB_EXITS,
  FOREST_HUB_PATH,
  FOREST_HUB_SPAWNS,
} from "@/src/game/locations/forestChunkGen";

const baseForest = parseLocationJson(forestJson);

/**
 * Шаблон локации «бесконечный лес»: хаб 640×640, контент чанков в рантайме.
 * Не подмешивается черновик редактора — иначе конфликт с чанками.
 */
export function getForestInfiniteTemplateLocation(): GameLocation {
  return {
    ...baseForest,
    world: { width: FOREST_CHUNK_W, height: FOREST_CHUNK_H },
    pathSegments: FOREST_HUB_PATH.map((p) => ({ ...p })),
    imageProps: [],
    animStations: [],
    exits: FOREST_HUB_EXITS.map((e) => ({ ...e })),
    spawns: {
      default: { ...FOREST_HUB_SPAWNS.default },
      from_town: { ...FOREST_HUB_SPAWNS.from_town },
    },
    enemySpawns: FOREST_HUB_ENEMY_SPAWNS.map((e) => ({ ...e })),
    grassDecorCount: 0,
    grassDecorItems: [],
  };
}
