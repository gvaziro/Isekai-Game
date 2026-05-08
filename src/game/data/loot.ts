import { getDungeonBossChestForFloor } from "@/src/game/data/dungeonBoss";
import { DUNGEON_MAX_FLOOR } from "@/src/game/data/dungeonFloorScaling";
import { getRuntimeDungeonFloor } from "@/src/game/locations/dungeonFloorContext";
import type { CuratedItemDef } from "@/src/game/data/items.curated";
import { getCuratedItem } from "@/src/game/data/itemRegistry";
import type { GameLocation } from "@/src/game/locations/types";

/** Сундуки: id и координаты как у декора chest в layout */
export type ChestDef = {
  id: string;
  x: number;
  y: number;
};

/** Сундуки на текущем layout. В городе — позже из TMJ; в лесу нет. */
export function getChestsForLocation(loc: GameLocation): readonly ChestDef[] {
  if (loc.id === "dungeon") {
    const c = getDungeonBossChestForFloor(getRuntimeDungeonFloor());
    return [{ id: c.id, x: c.x, y: c.y }];
  }
  return [];
}

type LootEntry = { curatedId: CuratedItemDef["id"]; weight: number; qty: number };

const TABLES: Record<string, LootEntry[]> = {
  starter: [
    { curatedId: "rope_coil", weight: 2, qty: 1 },
    { curatedId: "iron_ore", weight: 2, qty: 2 },
    { curatedId: "hp_small", weight: 1, qty: 1 },
  ],
  plaza: [
    { curatedId: "coin_stack", weight: 1, qty: 1 },
    { curatedId: "gem_red", weight: 1, qty: 1 },
    { curatedId: "hp_medium", weight: 1, qty: 1 },
  ],
  workshop: [
    { curatedId: "hammer_tool", weight: 2, qty: 1 },
    { curatedId: "nails", weight: 2, qty: 3 },
    { curatedId: "pickaxe", weight: 1, qty: 1 },
  ],
};

const CHEST_TABLE: Record<string, string> = {
  chest_nw_house: "starter",
  chest_ne_plaza: "plaza",
  chest_sw_workshop: "workshop",
};

/** Городской сундук с таблицей первичного лута (не сундук босса). */
export function chestIdHasLootTable(chestId: string): boolean {
  return Object.prototype.hasOwnProperty.call(CHEST_TABLE, chestId);
}

function rollWeighted(entries: LootEntry[]): LootEntry | null {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  if (total <= 0) return null;
  const r = Math.random() * total;
  let acc = 0;
  for (const e of entries) {
    acc += e.weight;
    if (r < acc) return e;
  }
  return entries[entries.length - 1] ?? null;
}

/** Один выпавший предмет при первом открытии сундука */
export function rollChestLoot(chestId: string): { curatedId: string; qty: number } | null {
  const tableId = CHEST_TABLE[chestId];
  if (!tableId) return null;
  const entries = TABLES[tableId];
  if (!entries?.length) return null;
  const pick = rollWeighted(entries);
  if (!pick) return null;
  if (!getCuratedItem(pick.curatedId)) return null;
  return { curatedId: pick.curatedId, qty: pick.qty };
}

const DUNGEON_BOSS_EQUIP_CANDIDATES: CuratedItemDef["id"][] = [
  "mace",
  "coat_travel",
  "ring_gem",
  "shield_round",
  "spear_short",
];

const DUNGEON_BOSS_POTION_CANDIDATES: CuratedItemDef["id"][] = [
  "potion_blue",
  "hp_medium",
  "potion_green",
];

function pickFirstValid(ids: CuratedItemDef["id"][]): CuratedItemDef["id"] | null {
  const valid = ids.filter((id) => getCuratedItem(id));
  if (!valid.length) return null;
  return valid[Math.floor(Math.random() * valid.length)]!;
}

/**
 * Гарантированно: 1 экип + 1 расходник (если id есть в атласе/маппинге).
 * На финальном этаже — дополнительная награда.
 */
export function rollDungeonBossChestDrops(floor?: number): {
  curatedId: string;
  qty: number;
}[] {
  const equip = pickFirstValid(DUNGEON_BOSS_EQUIP_CANDIDATES);
  const potion = pickFirstValid(DUNGEON_BOSS_POTION_CANDIDATES);
  const out: { curatedId: string; qty: number }[] = [];
  if (equip) out.push({ curatedId: equip, qty: 1 });
  if (potion) out.push({ curatedId: potion, qty: 1 });
  if (
    typeof floor === "number" &&
    Number.isFinite(floor) &&
    Math.floor(floor) === DUNGEON_MAX_FLOOR
  ) {
    const gem = pickFirstValid(["gem_red", "ring_gem"] as CuratedItemDef["id"][]);
    if (gem) out.push({ curatedId: gem, qty: 2 });
  }
  if (out.length === 0) {
    const fallback = pickFirstValid([
      "hp_small",
      "bread",
      "apple",
      "coin_stack",
    ] as CuratedItemDef["id"][]);
    if (fallback) out.push({ curatedId: fallback, qty: 1 });
  }
  return out;
}

/** Золото с трупа (по таблице лута моба) */
const ENEMY_GOLD: Record<string, { min: number; max: number }> = {
  grunt: { min: 2, max: 14 },
  boss: { min: 35, max: 95 },
  boss_final: { min: 80, max: 180 },
};

export function rollEnemyGold(tableId: string): number {
  const g = ENEMY_GOLD[tableId];
  if (!g) return 0;
  const min = Math.min(g.min, g.max);
  const max = Math.max(g.min, g.max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Лут с поверженного врага (таблица из combatWorld / тип моба). */
const ENEMY_TABLES: Record<string, LootEntry[]> = {
  grunt: [
    { curatedId: "coin_stack", weight: 3, qty: 1 },
    { curatedId: "hp_small", weight: 3, qty: 1 },
    { curatedId: "rope_coil", weight: 2, qty: 1 },
    { curatedId: "iron_ore", weight: 2, qty: 2 },
    { curatedId: "bread", weight: 2, qty: 1 },
    { curatedId: "apple", weight: 2, qty: 2 },
  ],
  boss: [
    { curatedId: "gem_red", weight: 2, qty: 1 },
    { curatedId: "coin_stack", weight: 3, qty: 2 },
    { curatedId: "hp_medium", weight: 2, qty: 1 },
    { curatedId: "potion_blue", weight: 2, qty: 1 },
    { curatedId: "iron_ore", weight: 1, qty: 4 },
    { curatedId: "ring_gem", weight: 1, qty: 1 },
  ],
  boss_final: [
    { curatedId: "gem_red", weight: 3, qty: 2 },
    { curatedId: "ring_gem", weight: 2, qty: 1 },
    { curatedId: "coin_stack", weight: 2, qty: 3 },
    { curatedId: "potion_blue", weight: 2, qty: 2 },
    { curatedId: "hp_medium", weight: 2, qty: 2 },
    { curatedId: "mace", weight: 1, qty: 1 },
    { curatedId: "spear_short", weight: 1, qty: 1 },
  ],
};

export function rollEnemyLoot(
  tableId: string
): { curatedId: string; qty: number } | null {
  const entries = ENEMY_TABLES[tableId];
  if (!entries?.length) return null;
  const pick = rollWeighted(entries);
  if (!pick) return null;
  if (!getCuratedItem(pick.curatedId)) return null;
  return { curatedId: pick.curatedId, qty: pick.qty };
}
