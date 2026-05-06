import type { GameLocation } from "@/src/game/locations/types";

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

/**
 * Якоря — исходные координаты из шиппинга; после правок карты к каждой станции
 * подбирается ближайший проп с тем же `texture`.
 */
/** Якоря под 800×800 (масштаб от прежнего города). */
const CRAFT_STATION_BLUEPRINTS: readonly CraftStationBlueprint[] = [
  {
    id: "wb_house",
    label: "Верстак",
    texture: "craft_wb_house",
    anchorX: 212,
    anchorY: 300,
  },
  {
    id: "wb_workshop",
    label: "Верстак",
    texture: "craft_wb_workshop",
    anchorX: 232,
    anchorY: 657,
  },
  {
    id: "sawmill_sw",
    label: "Лесопилка",
    texture: "craft_sawmill",
    anchorX: 199,
    anchorY: 607,
  },
  {
    id: "cooking_town",
    label: "Кулинария",
    texture: "craft_cooking",
    anchorX: 269,
    anchorY: 318,
  },
  {
    id: "alchemy_town",
    label: "Алхимия",
    texture: "craft_alchemy",
    anchorX: 105,
    anchorY: 304,
  },
  {
    id: "anvil_ne",
    label: "Наковальня",
    texture: "craft_anvil",
    anchorX: 632,
    anchorY: 260,
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
 * Координаты подсказки [E] для станций крафта: город из TMJ — позже из object-слоёв.
 */
export function resolveCraftStations(_loc: GameLocation): ResolvedCraftStation[] {
  return [];
}
