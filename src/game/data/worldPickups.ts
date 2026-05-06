/** Лут на земле: уникальный id, позиция (ноги), семантический предмет */

export type WorldPickupDef = {
  id: string;
  x: number;
  y: number;
  curatedId: string;
  qty: number;
};

export const WORLD_PICKUPS: readonly WorldPickupDef[] = [
  { id: "wp_center_apple", x: 388, y: 357, curatedId: "apple", qty: 2 },
  { id: "wp_cross_bread", x: 386, y: 382, curatedId: "bread", qty: 1 },
  { id: "wp_near_fire", x: 628, y: 260, curatedId: "wooden_torch", qty: 1 },
  { id: "wp_elena_plaza", x: 188, y: 600, curatedId: "scroll_old", qty: 1 },
  { id: "wp_marcus_bench", x: 575, y: 265, curatedId: "coin_stack", qty: 1 },
];
