import { getCuratedItem } from "@/src/game/data/itemRegistry";
import type { RecipeDef } from "@/src/game/data/recipesSchema";
import {
  type InventorySlotLike,
  tryMergeItemIntoSlots,
} from "@/src/game/state/sanitizeEquippedInventory";

export function cloneInventorySlots(
  slots: readonly (InventorySlotLike | null)[]
): (InventorySlotLike | null)[] {
  return slots.map((s) => (s ? { ...s } : null));
}

export function inventoryCountCurated(
  slots: readonly (InventorySlotLike | null)[],
  curatedId: string
): number {
  let n = 0;
  for (const s of slots) {
    if (s?.curatedId === curatedId) n += s.qty;
  }
  return n;
}

/**
 * Снимает `qty` единиц `curatedId` со стаков по порядку слотов. Возвращает null, если не хватило.
 */
export function removeCuratedQtyFromSlots(
  slots: (InventorySlotLike | null)[],
  curatedId: string,
  qty: number
): (InventorySlotLike | null)[] | null {
  if (qty <= 0) return slots;
  let need = qty;
  const out = [...slots];
  for (let i = 0; i < out.length && need > 0; i++) {
    const s = out[i];
    if (!s || s.curatedId !== curatedId) continue;
    const take = Math.min(s.qty, need);
    const left = s.qty - take;
    out[i] = left <= 0 ? null : { curatedId, qty: left };
    need -= take;
  }
  if (need > 0) return null;
  return out;
}

/** Проверка: хватает ли материалов (только рюкзак). */
export function hasRecipeInputs(
  slots: readonly (InventorySlotLike | null)[],
  recipe: RecipeDef
): boolean {
  for (const line of recipe.inputs) {
    if (inventoryCountCurated(slots, line.curatedId) < line.qty) {
      return false;
    }
  }
  return true;
}

/**
 * Клон инвентаря после списания инпутов и добавления аутпутов. null — не хватило материалов или места.
 */
/** Только списание ингредиентов (для провала крафта без выхода). */
export function simulateCraftConsumeInputsOnly(
  slots: (InventorySlotLike | null)[],
  recipe: RecipeDef
): (InventorySlotLike | null)[] | null {
  let work = cloneInventorySlots(slots);
  for (const line of recipe.inputs) {
    const next = removeCuratedQtyFromSlots(work, line.curatedId, line.qty);
    if (!next) return null;
    work = next;
  }
  return work;
}

export function simulateCraftOutputs(
  slots: (InventorySlotLike | null)[],
  recipe: RecipeDef
): (InventorySlotLike | null)[] | null {
  let work = cloneInventorySlots(slots);
  for (const line of recipe.inputs) {
    const next = removeCuratedQtyFromSlots(work, line.curatedId, line.qty);
    if (!next) return null;
    work = next;
  }
  for (const line of recipe.outputs) {
    if (!getCuratedItem(line.curatedId)) return null;
    const rem = tryMergeItemIntoSlots(work, line.curatedId, line.qty);
    if (rem > 0) return null;
  }
  return work;
}
