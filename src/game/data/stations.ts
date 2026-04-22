import type { GameLocation, LayoutImageProp } from "@/src/game/locations/types";

/** Результат привязки к пропу станции на карте. */
export type ResolvedCraftStation = {
  id: string;
  label: string;
  x: number;
  y: number;
};

type CraftStationBlueprint = {
  id: string;
  label: string;
  /** Ключ текстуры манифеста (`public/assets/stations/…`). */
  texture: string;
  anchorX: number;
  anchorY: number;
};

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function nearestImageProp(
  props: readonly LayoutImageProp[],
  texture: string,
  anchorX: number,
  anchorY: number
): { x: number; y: number } {
  const cand = props.filter((p) => p.texture === texture);
  if (cand.length === 0) return { x: anchorX, y: anchorY };
  let best = cand[0]!;
  let bestD = distSq(best.x, best.y, anchorX, anchorY);
  for (let i = 1; i < cand.length; i++) {
    const p = cand[i]!;
    const d = distSq(p.x, p.y, anchorX, anchorY);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return { x: best.x, y: best.y };
}

/**
 * Якоря — исходные координаты из шиппинга; после правок карты к каждой станции
 * подбирается ближайший проп с тем же `texture`.
 */
const CRAFT_STATION_BLUEPRINTS: readonly CraftStationBlueprint[] = [
  {
    id: "wb_house",
    label: "Верстак",
    texture: "craft_wb_house",
    anchorX: 340,
    anchorY: 360,
  },
  {
    id: "wb_workshop",
    label: "Верстак",
    texture: "craft_wb_workshop",
    anchorX: 372,
    anchorY: 788,
  },
  {
    id: "sawmill_sw",
    label: "Лесопилка",
    texture: "craft_sawmill",
    anchorX: 318,
    anchorY: 728,
  },
  {
    id: "cooking_town",
    label: "Кулинария",
    texture: "craft_cooking",
    anchorX: 430,
    anchorY: 382,
  },
  {
    id: "alchemy_town",
    label: "Алхимия",
    texture: "craft_alchemy",
    anchorX: 168,
    anchorY: 365,
  },
  {
    id: "anvil_ne",
    label: "Наковальня",
    texture: "craft_anvil",
    anchorX: 1012,
    anchorY: 312,
  },
];

/** id станций крафта (рецепты, админка). */
export const CRAFT_STATION_IDS: readonly string[] =
  CRAFT_STATION_BLUEPRINTS.map((b) => b.id);

/** Подписи станций для UI (вкладки редактора рецептов и т.п.). */
export const CRAFT_STATION_META: readonly {
  readonly id: string;
  readonly label: string;
}[] = CRAFT_STATION_BLUEPRINTS.map((b) => ({ id: b.id, label: b.label }));

/**
 * Координаты подсказки [E] для станций крафта по текущему layout города.
 * В других локациях — пусто.
 */
export function resolveCraftStations(loc: GameLocation): ResolvedCraftStation[] {
  if (loc.id !== "town") return [];
  return CRAFT_STATION_BLUEPRINTS.map((def) => {
    const { x, y } = nearestImageProp(
      loc.imageProps,
      def.texture,
      def.anchorX,
      def.anchorY
    );
    return { id: def.id, label: def.label, x, y };
  });
}
