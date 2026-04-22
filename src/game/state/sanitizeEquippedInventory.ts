import { MAX_STACK } from "@/src/game/constants/gameplay";
import { getCuratedItem } from "@/src/game/data/itemRegistry";
import type { EquipSlot } from "@/src/game/data/items.curated";

export type InventorySlotLike = { curatedId: string; qty: number } | null;

const BODY_EQUIP_KINDS = new Set<string>([
  "weapon",
  "offhand",
  "helmet",
  "chest",
  "pants",
  "boots",
  "backpack",
  "pickaxe",
  "axe",
  "fishing_rod",
]);

/** Пытается положить `qty` предметов в ячейки; возвращает остаток, который не влез. */
export function tryMergeItemIntoSlots(
  slots: InventorySlotLike[],
  curatedId: string,
  qty: number
): number {
  let remaining = qty;
  while (remaining > 0) {
    let merged = false;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s || s.curatedId !== curatedId) continue;
      const space = MAX_STACK - s.qty;
      if (space <= 0) continue;
      const add = Math.min(space, remaining);
      slots[i] = { curatedId, qty: s.qty + add };
      remaining -= add;
      merged = true;
      break;
    }
    if (remaining <= 0) break;
    if (merged) continue;
    const emptyIdx = slots.findIndex((x) => x === null);
    if (emptyIdx === -1) break;
    const put = Math.min(remaining, MAX_STACK);
    slots[emptyIdx] = { curatedId, qty: put };
    remaining -= put;
  }
  return remaining;
}

/**
 * Убирает из экипа записи без каталога, с несовпадением слота предмета и ячейки,
 * а также предметы не из допустимых слотов экипировки.
 * Снятое возвращается в инвентарь по возможности.
 */
export function sanitizeEquippedVsCatalog(
  equipped: Partial<Record<EquipSlot, string>>,
  inventorySlots: InventorySlotLike[]
): Partial<Record<EquipSlot, string>> {
  const eq: Partial<Record<EquipSlot, string>> = { ...equipped };
  for (const key of Object.keys(eq) as EquipSlot[]) {
    const id = eq[key];
    if (!id) {
      delete eq[key];
      continue;
    }
    const def = getCuratedItem(id);
    const ok =
      !!def &&
      def.slot === key &&
      BODY_EQUIP_KINDS.has(def.slot);
    if (!ok) {
      delete eq[key];
      if (def) tryMergeItemIntoSlots(inventorySlots, id, 1);
    }
  }
  return eq;
}
