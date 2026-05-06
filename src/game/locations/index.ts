import {
  buildGrassDecorList,
  type GameLocation,
  type GrassDecorDef,
  type LocationId,
} from "@/src/game/locations/types";
import { getDungeonLocationForFloor } from "@/src/game/locations/dungeon";
import { getRuntimeDungeonFloor } from "@/src/game/locations/dungeonFloorContext";
import { FOREST_GRASS_DECOR, FOREST_LOCATION } from "@/src/game/locations/forest";
import { getForestInfiniteTemplateLocation } from "@/src/game/locations/forestInfinite";
import { loadStoredEditorDraftLocation } from "@/src/game/mapEditor/mapEditorDraftStorage";
import { GRASS_DECOR, TOWN_LOCATION } from "@/src/game/locations/town";

export type { GameLocation, LocationExit, LocationId } from "@/src/game/locations/types";
export {
  buildGrassDecorList,
  CAMERA_ZOOM_PLAY,
  pointInExitZone,
  pointInSegment,
  type GrassDecorDef,
  type LayoutAnimStation,
  type LayoutImageProp,
  type PathSegment,
  type PropCollider,
} from "@/src/game/locations/types";

export {
  DUNGEON_GRASS_DECOR,
  DUNGEON_LOCATION,
  getDungeonLocationForFloor,
} from "@/src/game/locations/dungeon";
export { FOREST_GRASS_DECOR, FOREST_LOCATION } from "@/src/game/locations/forest";
export {
  parseLocationJson,
  serializeLocationToJsonObject,
  gameLocationJsonSchema,
  type GameLocationJson,
} from "@/src/game/locations/locationSchema";
export {
  ANIM_STATIONS,
  BACKGROUND_FILL,
  GRASS_DECOR,
  HERO_SPAWN,
  IMAGE_PROPS,
  NPC_IDLE_TEXTURE,
  PATH_CROSS,
  PATH_SEGMENTS,
  TOWN_LOCATION,
  WORLD,
} from "@/src/game/locations/town";

const REGISTRY: Record<LocationId, GameLocation> = {
  town: TOWN_LOCATION,
  forest: FOREST_LOCATION,
  dungeon: getDungeonLocationForFloor(1),
};

/**
 * Базовая локация из кода/JSON; в браузере поверх подмешивается черновик редактора
 * карты из `localStorage` (если есть), чтобы правки мобов/пропов были видны в игре
 * без ручной подмены JSON. Исключение: `forest` — бесконечный лес с чанками,
 * черновик редактора для него не подмешивается.
 */
export function getLocation(id: LocationId): GameLocation {
  if (id === "dungeon") {
    return getDungeonLocationForFloor(getRuntimeDungeonFloor());
  }
  if (id === "forest") {
    return getForestInfiniteTemplateLocation();
  }
  const base = REGISTRY[id] ?? TOWN_LOCATION;
  const draft = loadStoredEditorDraftLocation(id);
  if (draft) {
    if (id === "town") {
      const merged = structuredClone(draft);
      merged.world = { ...TOWN_LOCATION.world };
      merged.enemySpawns = [];
      merged.pondCollider = undefined;
      return merged;
    }
    return structuredClone(draft);
  }
  return base;
}

export function isLocationId(x: string): x is LocationId {
  return x === "town" || x === "forest" || x === "dungeon";
}

/**
 * Явный список кустов из локации (`grassDecorItems`) приоритетнее процедурной
 * генерации — нужен редактору и сохранённым правкам.
 */
export function getGrassDecor(id: LocationId): GrassDecorDef[] {
  const loc = getLocation(id);
  if (loc.grassDecorItems !== undefined) {
    return loc.grassDecorItems.map((g) => ({ ...g }));
  }
  if (id === "forest") return [];
  if (id === "dungeon") {
    const dl = getDungeonLocationForFloor(getRuntimeDungeonFloor());
    return buildGrassDecorList(
      dl.world,
      dl.pathSegments,
      dl.imageProps,
      dl.animStations,
      dl.spawns.default,
      dl.grassDecorSeed,
      dl.grassDecorCount
    );
  }
  return GRASS_DECOR;
}
