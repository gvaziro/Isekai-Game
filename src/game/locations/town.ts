import {
  CRAFT_ALCHEMY_PROP,
  CRAFT_ANVIL_PROP,
  CRAFT_COOKING_PROP,
  CRAFT_SAWMILL_PROP,
  CRAFT_WB_HOUSE_PROP,
  CRAFT_WB_WORKSHOP_PROP,
} from "@/src/game/data/craftStationLayout";
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

// Эти коллайдеры были подобраны под исходные экспортные размеры prop-ассетов.
// Если dev-вырез из тайлсета уменьшает кадр, `getEffectivePropCollider()` ниже
// масштабирует их пропорционально от source-slice, сохраняя "посадку" базы.
const TREE_COLL: PropCollider = { w: 18, h: 10, oy: 6 };
const ROCK_COLL: PropCollider = { w: 22, h: 12, oy: 7 };
const BENCH_COLL: PropCollider = { w: 40, h: 14, oy: 8 };
const CHEST_COLL: PropCollider = { w: 26, h: 14, oy: 8 };
const HOUSE_COLL: PropCollider = { w: 80, h: 24, oy: 14 };

/** Должен совпадать с `manifest.world` из gen-assets (1280×960). */
export const WORLD = { width: 1280, height: 960 } as const;

export const BACKGROUND_FILL = 0x3d6b2e;

/** Прямоугольники дороги: левый верх (x,y), размеры w×h в пикселях мира. */
export const PATH_SEGMENTS: PathSegment[] = [
  { x: 0, y: 458, w: 1280, h: 44 },
  { x: 618, y: 0, w: 44, h: 960 },
  { x: 222, y: 260, w: 44, h: 260 },
  { x: 978, y: 260, w: 44, h: 260 },
  { x: 298, y: 500, w: 44, h: 430 },
  { x: 662, y: 588, w: 520, h: 44 },
];

/** Размеры центрального креста дорог (совместимость со старым кодом). */
export const PATH_CROSS = {
  verticalWidth: 44,
  horizontalHeight: 44,
} as const;

export const IMAGE_PROPS: LayoutImageProp[] = [
  { x: 236, y: 248, texture: "house", collider: HOUSE_COLL },
  CRAFT_WB_HOUSE_PROP,
  CRAFT_COOKING_PROP,
  CRAFT_ALCHEMY_PROP,
  { x: 132, y: 348, texture: "chest", collider: CHEST_COLL },
  { x: 278, y: 392, texture: "bench", collider: BENCH_COLL },

  { x: 916, y: 332, texture: "bench", collider: BENCH_COLL },
  { x: 1048, y: 332, texture: "bench", collider: BENCH_COLL },
  { x: 1142, y: 292, texture: "chest", collider: CHEST_COLL },
  CRAFT_ANVIL_PROP,

  CRAFT_SAWMILL_PROP,
  CRAFT_WB_WORKSHOP_PROP,
  { x: 228, y: 796, texture: "chest", collider: CHEST_COLL },

  { x: 1060, y: 704, texture: "pond" },
  { x: 948, y: 632, texture: "bench", collider: BENCH_COLL },

  { x: 52, y: 210, texture: "tree1", collider: TREE_COLL },
  { x: 98, y: 230, texture: "tree2", collider: TREE_COLL },
  { x: 120, y: 540, texture: "tree3_red", collider: TREE_COLL },
  { x: 72, y: 680, texture: "tree1_autumn", collider: TREE_COLL },
  { x: 88, y: 880, texture: "tree3", collider: TREE_COLL },

  { x: 380, y: 118, texture: "tree2", collider: TREE_COLL },
  { x: 520, y: 94, texture: "tree3_red", collider: TREE_COLL },
  { x: 680, y: 96, texture: "tree2", collider: TREE_COLL },
  { x: 880, y: 122, texture: "tree1_autumn", collider: TREE_COLL },

  { x: 1196, y: 196, texture: "tree1", collider: TREE_COLL },
  { x: 1212, y: 380, texture: "tree3_red", collider: TREE_COLL },
  { x: 1194, y: 560, texture: "tree2", collider: TREE_COLL },
  { x: 1188, y: 792, texture: "tree1", collider: TREE_COLL },

  { x: 520, y: 914, texture: "tree3_red", collider: TREE_COLL },
  { x: 740, y: 928, texture: "tree2", collider: TREE_COLL },
  { x: 940, y: 908, texture: "tree1_autumn", collider: TREE_COLL },

  { x: 178, y: 508, texture: "bush1" },
  { x: 468, y: 228, texture: "bush2" },
  { x: 812, y: 236, texture: "bush1" },
  { x: 420, y: 608, texture: "bush2" },
  { x: 760, y: 560, texture: "bush1" },
  { x: 612, y: 812, texture: "bush2" },
  { x: 1040, y: 848, texture: "bush1" },

  { x: 780, y: 468, texture: "rock1", collider: ROCK_COLL },
  { x: 1160, y: 448, texture: "rock2", collider: ROCK_COLL },
  { x: 158, y: 632, texture: "rock2", collider: ROCK_COLL },
  { x: 560, y: 312, texture: "rock1", collider: ROCK_COLL },
];

export const POND_COLLIDER = { x: 1060, y: 676, w: 72, h: 44 } as const;

export const ANIM_STATIONS: LayoutAnimStation[] = [];

export const HERO_SPAWN = { x: 640, y: 432 } as const;

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
  pondCollider: POND_COLLIDER,
  npcIdleTexture: NPC_IDLE_TEXTURE,
  /** Совпадает с `npcs/<id>/route.json` spawn — редактор и игра сдвигают весь маршрут. */
  npcSpawnOverrides: {
    elena: { x: 320, y: 760 },
    marcus: { x: 1000, y: 310 },
    igor: { x: 300, y: 340 },
  },
  spawns: {
    default: { x: HERO_SPAWN.x, y: HERO_SPAWN.y },
    from_forest: { x: 640, y: 118 },
    from_dungeon: { x: 640, y: 900 },
  },
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
      /** Низ центральной вертикальной дороги (PATH_SEGMENTS[1]: x 618, w 44, h 960). */
      x: 560,
      y: 880,
      w: 160,
      h: 80,
      targetLocationId: "dungeon",
      targetSpawnId: "from_town",
      label: "В подземелье (этаж)",
    },
  ],
  grassDecorSeed: 0x4e4147,
  grassDecorCount: 42,
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
