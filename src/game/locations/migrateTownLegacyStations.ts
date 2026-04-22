import {
  CRAFT_ALCHEMY_PROP,
  CRAFT_ANVIL_PROP,
  CRAFT_COOKING_PROP,
  CRAFT_SAWMILL_PROP,
  CRAFT_WB_HOUSE_PROP,
  CRAFT_WB_WORKSHOP_PROP,
} from "@/src/game/data/craftStationLayout";
import type {
  GameLocation,
  LayoutAnimStation,
  LayoutImageProp,
} from "@/src/game/locations/types";

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function migrateWorkbenchProp(p: LayoutImageProp): LayoutImageProp {
  if (p.texture !== "workbench") return p;
  const dHouse = distSq(p.x, p.y, CRAFT_WB_HOUSE_PROP.x, CRAFT_WB_HOUSE_PROP.y);
  const dShop = distSq(p.x, p.y, CRAFT_WB_WORKSHOP_PROP.x, CRAFT_WB_WORKSHOP_PROP.y);
  if (dHouse <= dShop) {
    return {
      ...p,
      texture: CRAFT_WB_HOUSE_PROP.texture,
      textureCrop: { ...CRAFT_WB_HOUSE_PROP.textureCrop! },
    };
  }
  return {
    ...p,
    texture: CRAFT_WB_WORKSHOP_PROP.texture,
    textureCrop: { ...CRAFT_WB_WORKSHOP_PROP.textureCrop! },
  };
}

function migrateSawmillProp(p: LayoutImageProp): LayoutImageProp {
  if (p.texture !== "sawmill") return p;
  return {
    ...p,
    texture: CRAFT_SAWMILL_PROP.texture,
    textureCrop: { ...CRAFT_SAWMILL_PROP.textureCrop! },
  };
}

/** Подставить кропы для ключей craft_* без textureCrop (битые/частичные сейвы). */
function ensureCraftStationCrops(p: LayoutImageProp): LayoutImageProp {
  if (p.textureCrop) return p;
  const ref: Record<string, LayoutImageProp | undefined> = {
    [CRAFT_WB_HOUSE_PROP.texture]: CRAFT_WB_HOUSE_PROP,
    [CRAFT_WB_WORKSHOP_PROP.texture]: CRAFT_WB_WORKSHOP_PROP,
    [CRAFT_SAWMILL_PROP.texture]: CRAFT_SAWMILL_PROP,
    [CRAFT_COOKING_PROP.texture]: CRAFT_COOKING_PROP,
    [CRAFT_ALCHEMY_PROP.texture]: CRAFT_ALCHEMY_PROP,
    [CRAFT_ANVIL_PROP.texture]: CRAFT_ANVIL_PROP,
  };
  const def = ref[p.texture];
  if (!def?.textureCrop) return p;
  return {
    ...p,
    textureCrop: { ...def.textureCrop },
    collider: p.collider ?? def.collider,
  };
}

/**
 * Черновики редактора до смены ассетов ссылались на `workbench` / `sawmill` и
 * `animStations` с `anvil_row` — этих ключей больше нет в манифесте.
 */
export function migrateTownLegacyStationTextures(loc: GameLocation): GameLocation {
  if (loc.id !== "town") return loc;

  let imageProps = loc.imageProps.map((p) =>
    ensureCraftStationCrops(migrateSawmillProp(migrateWorkbenchProp(p)))
  );

  const animOut: LayoutAnimStation[] = [];
  const anvilFromAnim: LayoutImageProp[] = [];

  for (const s of loc.animStations) {
    if (s.texture === "anvil_row" || s.animKey === "a-anvil") {
      anvilFromAnim.push({
        ...CRAFT_ANVIL_PROP,
        x: s.x,
        y: s.y,
        collider: CRAFT_ANVIL_PROP.collider,
      });
      continue;
    }
    animOut.push(s);
  }

  if (anvilFromAnim.length > 0) {
    const hasAnvilProp = imageProps.some(
      (p) => p.texture === CRAFT_ANVIL_PROP.texture
    );
    imageProps = hasAnvilProp ? imageProps : [...imageProps, ...anvilFromAnim];
  }

  return { ...loc, imageProps, animStations: animOut };
}
