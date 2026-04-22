/** Лут на земле: уникальный id, позиция (ноги), семантический предмет */

export type WorldPickupDef = {
  id: string;
  x: number;
  y: number;
  curatedId: string;
  qty: number;
};

export const WORLD_PICKUPS: readonly WorldPickupDef[] = [
  { id: "wp_center_apple", x: 620, y: 428, curatedId: "apple", qty: 2 },
  { id: "wp_cross_bread", x: 618, y: 458, curatedId: "bread", qty: 1 },
  { id: "wp_near_fire", x: 1004, y: 312, curatedId: "torch", qty: 1 },
  { id: "wp_elena_plaza", x: 300, y: 720, curatedId: "scroll_old", qty: 1 },
  { id: "wp_marcus_bench", x: 920, y: 318, curatedId: "coin_stack", qty: 1 },
];
