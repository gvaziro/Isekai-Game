import {
  TOWN_DEFAULT_SPAWN,
  TOWN_WORLD_PIXEL,
} from "@/src/game/maps/townWorld.gen";
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

/** Пиксели мира города — из `town.tmj` (см. `npm run gen:town-map` → `townWorld.gen.ts`). */
export const WORLD = {
  width: TOWN_WORLD_PIXEL.width,
  height: TOWN_WORLD_PIXEL.height,
} as const;

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

/** Базовый спавн — object-слой «Спавн» в `town.tmj` (или центр карты после flatten). */
export const HERO_SPAWN = TOWN_DEFAULT_SPAWN;

export const NPC_IDLE_TEXTURE: Record<string, string> = {
  elena: "npc_elena_idle",
  marcus: "npc_marcus_idle",
  igor: "npc_igor_idle",
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
    from_forest: {
      x: Math.round(WORLD.width / 2),
      y: Math.round(WORLD.height * 0.06),
    },
    from_dungeon: {
      x: Math.round(WORLD.width / 2),
      y: Math.round(WORLD.height * 0.92),
    },
    /** Возврат из локации «beyond» у западной границы (туман рассеян). */
    from_beyond: {
      x: Math.round(WORLD.width * 0.04),
      y: Math.round(WORLD.height / 2),
    },
  },
  /** Fallback, если TMJ не загрузился; нормальные зоны — object-слой Travel в `town.tmj`. */
  exits: [
    {
      id: "to_forest",
      x: Math.round(WORLD.width * 0.65),
      y: 0,
      w: Math.round(WORLD.width * 0.22),
      h: Math.min(96, Math.round(WORLD.height * 0.08)),
      targetLocationId: "forest",
      targetSpawnId: "from_town",
      label: "В лес",
    },
    {
      id: "to_dungeon",
      x: Math.round(WORLD.width * 0.65),
      y: Math.round(WORLD.height * 0.82),
      w: Math.round(WORLD.width * 0.22),
      h: Math.min(160, Math.round(WORLD.height * 0.12)),
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
