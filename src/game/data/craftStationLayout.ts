import type { LayoutImageProp, PropCollider } from "@/src/game/locations/types";

/**
 * Кропы из `public/assets/stations/*.txt` (PRO / medium по месту).
 */
export const CRAFT_STATION_PROP_COLLIDER: PropCollider = {
  w: 1,
  h: 1,
  fit: "frame",
};

/** Ключи манифеста: не показывать в палитре редактора карт. */
export const CRAFT_STATION_MANIFEST_KEYS = [
  "craft_wb_house",
  "craft_wb_workshop",
  "craft_sawmill",
  "craft_cooking",
  "craft_alchemy",
  "craft_anvil",
] as const;

export const CRAFT_WB_HOUSE_PROP: LayoutImageProp = {
  x: 340,
  y: 360,
  texture: "craft_wb_house",
  textureCrop: { x: 0, y: 29, w: 73, h: 48 },
  collider: CRAFT_STATION_PROP_COLLIDER,
};

export const CRAFT_WB_WORKSHOP_PROP: LayoutImageProp = {
  x: 372,
  y: 788,
  texture: "craft_wb_workshop",
  textureCrop: { x: 0, y: 78, w: 48, h: 40 },
  collider: CRAFT_STATION_PROP_COLLIDER,
};

export const CRAFT_SAWMILL_PROP: LayoutImageProp = {
  x: 318,
  y: 728,
  texture: "craft_sawmill",
  textureCrop: { x: 0, y: 0, w: 112, h: 75 },
  collider: CRAFT_STATION_PROP_COLLIDER,
};

export const CRAFT_COOKING_PROP: LayoutImageProp = {
  x: 430,
  y: 382,
  texture: "craft_cooking",
  textureCrop: { x: 0, y: 16, w: 64, h: 48 },
  collider: CRAFT_STATION_PROP_COLLIDER,
};

export const CRAFT_ALCHEMY_PROP: LayoutImageProp = {
  x: 168,
  y: 365,
  texture: "craft_alchemy",
  textureCrop: { x: 33, y: 0, w: 48, h: 48 },
  collider: CRAFT_STATION_PROP_COLLIDER,
};

export const CRAFT_ANVIL_PROP: LayoutImageProp = {
  x: 1012,
  y: 312,
  texture: "craft_anvil",
  textureCrop: { x: 80, y: 0, w: 96, h: 96 },
  collider: CRAFT_STATION_PROP_COLLIDER,
};
