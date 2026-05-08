import {
  ENEMY_LEVEL_MAX,
  MOB_AGGRO_RADIUS_SCHEMA_MAX,
} from "@/src/game/data/balance";
import { z } from "zod";
import type { GameLocation, LocationId } from "@/src/game/locations/types";

const pathSegmentSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

const propColliderSchema = z.object({
  w: z.number(),
  h: z.number(),
  oy: z.number().optional(),
  /**
   * При `fit: "frame"` — рантайм берёт реальные размеры кадра текстуры
   * и ставит коллайдер по всей фигуре (нижняя кромка у «ног»). Поля w/h/oy
   * становятся подсказкой для UI и игнорируются в физике.
   */
  fit: z.literal("frame").optional(),
});

const floorTileSchema = z.object({
  x: z.number(),
  y: z.number(),
  texture: z.string(),
  frame: z.number().int().nonnegative(),
  size: z.number().int().positive().optional(),
});

const textureCropSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

const layoutImagePropSchema = z.object({
  x: z.number(),
  y: z.number(),
  texture: z.string(),
  displayScale: z.number().positive().optional(),
  flipX: z.boolean().optional(),
  depthBias: z.number().finite().optional(),
  /** Индекс кадра spritesheet (Phaser `image.setFrame`); только для `type: spritesheet` в манифесте. */
  frame: z.number().int().nonnegative().optional(),
  collider: propColliderSchema.optional(),
  /** Вырез из одного PNG (например станции в `public/assets/stations/`). */
  textureCrop: textureCropSchema.optional(),
  mineableRock: z.boolean().optional(),
  rockPlacementOffset: z
    .object({ x: z.number(), y: z.number() })
    .optional(),
});

const layoutAnimStationSchema = z.object({
  x: z.number(),
  y: z.number(),
  texture: z.string(),
  animKey: z.string(),
  collider: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }),
});

const locationExitSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  targetLocationId: z.enum(["town", "forest", "dungeon", "beyond"]),
  targetSpawnId: z.string(),
  label: z.string().optional(),
});

/** Число или строка #RRGGBB / RRGGBB (как в CSS). */
const hexOrIntSchema = z.union([
  z.number().int(),
  z.string().regex(/^#?[0-9a-fA-F]{6}$/),
]);

export function parseHexOrInt(v: z.infer<typeof hexOrIntSchema>): number {
  if (typeof v === "number") return v >>> 0;
  const s = v.startsWith("#") ? v.slice(1) : v;
  return parseInt(s, 16) >>> 0;
}

const spawnsSchema = z
  .record(z.string(), z.object({ x: z.number(), y: z.number() }))
  .refine(
    (rec) => rec.default !== undefined,
    { message: "spawns must include key `default`" }
  );

const npcSpawnOverridesSchema = z.record(
  z.string(),
  z.object({ x: z.number(), y: z.number() })
);

const mobRadiusSchema = z
  .number()
  .min(32)
  .max(MOB_AGGRO_RADIUS_SCHEMA_MAX)
  .optional();

const grassDecorItemSchema = z.object({
  x: z.number(),
  y: z.number(),
  variant: z.number().int().min(0),
  depthBias: z.number().finite().optional(),
});

const enemySpawnSchema = z.object({
  id: z.string(),
  zoneId: z.string(),
  x: z.number(),
  y: z.number(),
  lootTable: z.string(),
  mobVisualId: z.string(),
  level: z.number().int().min(1).max(ENEMY_LEVEL_MAX).optional(),
  aggroRadius: mobRadiusSchema,
  loseAggroRadius: mobRadiusSchema,
  leashRadius: mobRadiusSchema,
});

export const gameLocationJsonSchema = z.object({
  id: z.enum(["town", "forest", "dungeon", "beyond"]),
  world: z.object({ width: z.number(), height: z.number() }),
  backgroundFill: hexOrIntSchema,
  groundTextureKey: z.string(),
  pathSegments: z.array(pathSegmentSchema),
  imageProps: z.array(layoutImagePropSchema),
  animStations: z.array(layoutAnimStationSchema),
  pondCollider: z
    .object({
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
    })
    .optional(),
  npcIdleTexture: z.record(z.string(), z.string()),
  npcSpawnOverrides: npcSpawnOverridesSchema.optional(),
  enemySpawns: z.array(enemySpawnSchema).optional(),
  spawns: spawnsSchema,
  exits: z.array(locationExitSchema),
  floorTiles: z.array(floorTileSchema).optional(),
  grassDecorSeed: hexOrIntSchema,
  grassDecorCount: z.number().int().nonnegative(),
  grassDecorItems: z.array(grassDecorItemSchema).optional(),
});

export type GameLocationJson = z.infer<typeof gameLocationJsonSchema>;

export function parseLocationJson(data: unknown): GameLocation {
  const j = gameLocationJsonSchema.parse(data);
  return {
    id: j.id as LocationId,
    world: { ...j.world },
    backgroundFill: parseHexOrInt(j.backgroundFill),
    groundTextureKey: j.groundTextureKey,
    pathSegments: j.pathSegments.map((p) => ({ ...p })),
    imageProps: j.imageProps.map((p) => ({
      ...p,
      collider: p.collider ? { ...p.collider } : undefined,
    })),
    animStations: j.animStations.map((s) => ({
      ...s,
      collider: { ...s.collider },
    })),
    pondCollider: j.pondCollider ? { ...j.pondCollider } : undefined,
    npcIdleTexture: { ...j.npcIdleTexture },
    npcSpawnOverrides: j.npcSpawnOverrides
      ? { ...j.npcSpawnOverrides }
      : undefined,
    enemySpawns: j.enemySpawns?.map((e) => ({ ...e })),
    spawns: { ...j.spawns } as GameLocation["spawns"],
    exits: j.exits.map((e) => ({ ...e, targetLocationId: e.targetLocationId })),
    ...(j.floorTiles ? { floorTiles: j.floorTiles.map((t) => ({ ...t })) } : {}),
    grassDecorSeed: parseHexOrInt(j.grassDecorSeed),
    grassDecorCount: j.grassDecorCount,
    ...(j.grassDecorItems
      ? { grassDecorItems: j.grassDecorItems.map((g) => ({ ...g })) }
      : {}),
  };
}

/** Плоский объект для JSON.stringify (числа — десятичные, fill/seed — hex-строки #RRGGBB). */
export function serializeLocationToJsonObject(loc: GameLocation): GameLocationJson {
  const toHex = (n: number) =>
    `#${(n >>> 0).toString(16).padStart(6, "0")}`;

  return {
    id: loc.id,
    world: { ...loc.world },
    backgroundFill: toHex(loc.backgroundFill),
    groundTextureKey: loc.groundTextureKey,
    pathSegments: loc.pathSegments.map((p) => ({ ...p })),
    imageProps: loc.imageProps.map((p) => ({
      ...p,
      collider: p.collider ? { ...p.collider } : undefined,
    })),
    animStations: loc.animStations.map((s) => ({
      ...s,
      collider: { ...s.collider },
    })),
    pondCollider: loc.pondCollider ? { ...loc.pondCollider } : undefined,
    npcIdleTexture: { ...loc.npcIdleTexture },
    ...(loc.npcSpawnOverrides
      ? { npcSpawnOverrides: { ...loc.npcSpawnOverrides } }
      : {}),
    ...(loc.enemySpawns ? { enemySpawns: loc.enemySpawns.map((e) => ({ ...e })) } : {}),
    spawns: { ...loc.spawns },
    exits: loc.exits.map((e) => ({ ...e })),
    ...(loc.floorTiles ? { floorTiles: loc.floorTiles.map((t) => ({ ...t })) } : {}),
    grassDecorSeed: toHex(loc.grassDecorSeed),
    grassDecorCount: loc.grassDecorCount,
    ...(loc.grassDecorItems
      ? { grassDecorItems: loc.grassDecorItems.map((g) => ({ ...g })) }
      : {}),
  };
}
