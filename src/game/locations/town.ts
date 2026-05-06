import {
  buildGrassDecorList,
  CAMERA_ZOOM_PLAY,
  type GameLocation,
  type GrassDecorDef,
  type LayoutAnimStation,
  type LayoutImageProp,
  type PathSegment,
  pointInSegment,
  type PropCollider,
} from "@/src/game/locations/types";

export {
  CAMERA_ZOOM_PLAY,
  pointInSegment,
  type GrassDecorDef,
  type LayoutAnimStation,
  type LayoutImageProp,
  type PathSegment,
  type PropCollider,
};

/** Мир города — совпадает с `town.tmj` (50×16px тайла). */
export const WORLD = { width: 800, height: 800 } as const;

export const BACKGROUND_FILL = 0x3d6b2e;

/** Дорога MVP больше не рисуется отдельным слоем — карта в TMJ. */
export const PATH_SEGMENTS: PathSegment[] = [];

export const PATH_CROSS = {
  verticalWidth: 44,
  horizontalHeight: 44,
} as const;

/** Визуал зданий/декора теперь в Tiled; пропсы оставлены пустыми. */
export const IMAGE_PROPS: LayoutImageProp[] = [];

export const ANIM_STATIONS: LayoutAnimStation[] = [];

/** Базовый спавн (масштаб от старого 1280×960). */
export const HERO_SPAWN = { x: 400, y: 400 } as const;

export const NPC_IDLE_TEXTURE: Record<string, string> = {
  elena: "npc_wizzard_idle",
  marcus: "npc_knight_idle",
  igor: "npc_rogue_idle",
};

export const TOWN_LOCATION: GameLocation = {
  id: "town",
  world: WORLD,
  backgroundFill: BACKGROUND_FILL,
  groundTextureKey: "world_ground",
  pathSegments: PATH_SEGMENTS,
  imageProps: IMAGE_PROPS,
  animStations: ANIM_STATIONS,
  /** Враги — из TMJ/object-слоёв позже; константы `ENEMY_SPAWNS` были под старый размер карты. */
  enemySpawns: [],
  npcIdleTexture: NPC_IDLE_TEXTURE,
  npcSpawnOverrides: {
    elena: { x: 200, y: 633 },
    marcus: { x: 625, y: 258 },
    igor: { x: 188, y: 283 },
  },
  spawns: {
    default: { x: HERO_SPAWN.x, y: HERO_SPAWN.y },
    from_forest: { x: 400, y: 72 },
    from_dungeon: { x: 400, y: 740 },
  },
  /** Fallback, если TMJ не загрузился; нормальные зоны — object-слой Travel в `town.tmj`. */
  exits: [
    {
      id: "to_forest",
      x: 560,
      y: 0,
      w: 160,
      h: 72,
      targetLocationId: "forest",
      targetSpawnId: "from_town",
      label: "В лес",
    },
    {
      id: "to_dungeon",
      x: 560,
      y: 680,
      w: 160,
      h: 120,
      targetLocationId: "dungeon",
      targetSpawnId: "from_town",
      label: "В подземелье (этаж)",
    },
  ],
  grassDecorSeed: 0x4e4147,
  grassDecorCount: 0,
  grassDecorItems: [],
};

export const GRASS_DECOR: GrassDecorDef[] = buildGrassDecorList(
  TOWN_LOCATION.world,
  TOWN_LOCATION.pathSegments,
  TOWN_LOCATION.imageProps,
  TOWN_LOCATION.animStations,
  TOWN_LOCATION.spawns.default,
  TOWN_LOCATION.grassDecorSeed,
  TOWN_LOCATION.grassDecorCount
);
