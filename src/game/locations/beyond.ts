import type { GameLocation } from "@/src/game/locations/types";

/**
 * Заглушка «за пределами деревни» после рассеяния тумана (глава 1).
 * Позже заменится полноценной локацией / картой.
 */
export const BEYOND_LOCATION: GameLocation = {
  id: "beyond",
  world: { width: 960, height: 720 },
  backgroundFill: 0x2d4a3e,
  groundTextureKey: "world_ground",
  pathSegments: [],
  imageProps: [],
  animStations: [],
  npcIdleTexture: {
    elena: "npc_wizzard_idle",
    marcus: "npc_knight_idle",
    igor: "npc_rogue_idle",
  },
  enemySpawns: [],
  spawns: {
    default: { x: 480, y: 360 },
    /** После прохода сквозь туман (западная сторона карты). */
    from_village_gate: { x: 140, y: 360 },
  },
  exits: [
    {
      id: "return_to_village",
      x: 0,
      y: 240,
      w: 88,
      h: 280,
      targetLocationId: "town",
      targetSpawnId: "from_beyond",
      label: "В деревню",
    },
  ],
  grassDecorSeed: 0x51c2a9,
  grassDecorCount: 48,
};
